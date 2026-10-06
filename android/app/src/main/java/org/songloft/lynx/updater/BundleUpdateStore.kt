package org.songloft.lynx.updater

import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.ByteString.Companion.decodeBase64
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import java.security.spec.X509EncodedKeySpec
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/** File/network core is independent of Android so real disk/TLS failure paths can be tested on the JVM. */
class BundleUpdateStore(
    private val root: File,
    private val host: JSONObject,
    client: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(180, TimeUnit.SECONDS).build(),
) {
    companion object {
        const val MAX_BUNDLE_BYTES = 32L * 1024 * 1024
        const val MAX_MANIFEST_BYTES = 128 * 1024
        private const val SIGNATURE_ALGORITHM = "rsa-pkcs1v15-sha256"
        private val STORAGE_KEY = Regex("^[0-9a-f]{64}-[A-Za-z0-9._-]{1,96}$")
        private val VERSION = Regex("^(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})$")
    }

    private data class Record(val manifest: JSONObject, val key: String, val file: File)
    private class Download(val id: String) {
        @Volatile var cancelled = false
        @Volatile var call: Call? = null
        @Volatile var bytes = 0L
        @Volatile var total = 0L
    }

    private val bundles = File(root, "bundles")
    private val client = client.newBuilder().followSslRedirects(false).build()
    private val stateFile = File(root, "state.json")
    private val hostMarker = listOf("channel", "build_number", "git_commit", "native_version", "bridge_version", "local_schema", "engines", "trusted_keys")
        .joinToString("|") { host.get(it).toString() }
    private var state = JSONObject()
    private var persistedState = "{}"
    private var launchStarted = false
    private var selected: Record? = null
    private var trialStartedAt = 0L
    private var startupFailed = false
    @Volatile private var download: Download? = null
    private val cancelledTasks = LinkedHashSet<String>()

    init {
        check(root.mkdirs() || root.isDirectory) { "update_storage_unavailable" }
        check(bundles.mkdirs() || bundles.isDirectory) { "update_storage_unavailable" }
        state = try {
            require(stateFile.length() in 1..16_384)
            JSONObject(stateFile.readText())
        } catch (_: Exception) { JSONObject().put("host", hostMarker) }
        persistedState = state.toString()
        // Part directories are never considered candidates after an interrupted process.
        root.listFiles()?.filter { it.name.startsWith("download-") }?.forEach { it.deleteRecursively() }
    }

    @Synchronized fun hostInfo(): JSONObject {
        val result = JSONObject(host.toString())
        result.put("engine", host.getJSONObject("engines").getString(host.getString("platform")))
        val ids = JSONArray()
        val keys = host.getJSONArray("trusted_keys")
        for (index in 0 until keys.length()) ids.put(keys.getJSONObject(index).getString("key_id"))
        result.put("trusted_key_ids", ids)
        result.remove("trusted_keys")
        result.remove("engines")
        return result
    }

    private fun bytes(value: String): ByteArray = value.toByteArray(Charsets.UTF_8)
    private fun number(value: JSONObject, key: String): Long {
        val raw = value.get(key)
        require(raw is Number && raw.toDouble().isFinite() && raw.toDouble() == raw.toLong().toDouble()) { "invalid_manifest" }
        return raw.toLong()
    }

    fun inspect(raw: String, signatureJson: String): JSONObject {
        val content = bytes(raw)
        require(content.isNotEmpty() && content.size <= MAX_MANIFEST_BYTES && bytes(signatureJson).size <= 8192) { "invalid_manifest" }
        val envelope = JSONObject(signatureJson)
        require(number(envelope, "protocol") == 1L && envelope.getString("algorithm") == SIGNATURE_ALGORITHM) { "invalid_signature" }
        val keys = host.getJSONArray("trusted_keys")
        var key: JSONObject? = null
        for (index in 0 until keys.length()) {
            val candidate = keys.getJSONObject(index)
            if (candidate.getString("key_id") == envelope.getString("key_id")) key = candidate
        }
        val trusted = key ?: throw IllegalArgumentException("unknown_signing_key")
        require(trusted.getString("algorithm") == SIGNATURE_ALGORITHM) { "invalid_signature" }
        val publicKey = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(
            trusted.getString("spki_base64").decodeBase64()?.toByteArray() ?: error("invalid_signature"),
        )) as RSAPublicKey
        require(publicKey.modulus.bitLength() in listOf(2048, 3072, 4096) &&
            publicKey.modulus.bitLength() == number(trusted, "key_bits").toInt()) { "invalid_signature" }
        val encoded = envelope.getString("signature")
        val signature = encoded.decodeBase64() ?: error("invalid_signature")
        require(signature.base64() == encoded) { "invalid_signature" }
        val verifier = Signature.getInstance("SHA256withRSA")
        verifier.initVerify(publicKey)
        verifier.update(content)
        require(verifier.verify(signature.toByteArray())) { "invalid_signature" }
        val manifest = JSONObject(raw)
        compatible(manifest)
        return manifest
    }

    private fun compare(a: String, b: String): Int {
        val left = VERSION.matchEntire(a)?.groupValues?.drop(1)?.map { it.toInt() } ?: error("incompatible_host")
        val right = VERSION.matchEntire(b)?.groupValues?.drop(1)?.map { it.toInt() } ?: error("invalid_manifest")
        for (index in 0..2) if (left[index] != right[index]) return left[index].compareTo(right[index])
        return 0
    }

    private fun compatible(manifest: JSONObject) {
        val channel = host.getString("channel")
        require(channel in listOf("dev", "stable") && manifest.getString("channel") == channel) { "incompatible_channel" }
        val version = manifest.getString("version")
        require(number(manifest, "build_number") in 1..2_100_000_000 && VERSION.matches(manifest.getString("native_version"))) { "invalid_manifest" }
        require(if (channel == "dev") version == "dev" && manifest.getString("release_tag") == "dev"
            else VERSION.matches(version) && manifest.getString("release_tag") == "v$version") { "invalid_manifest" }
        val bundle = manifest.getJSONObject("bundle_update")
        require(number(bundle, "protocol") == 1L && number(host, "update_protocol") == 1L) { "incompatible_protocol" }
        require(number(bundle, "local_schema") == number(host, "local_schema")) { "incompatible_schema" }
        val id = bundle.getString("bundle_id")
        require(Regex("^[A-Za-z0-9._-]{1,96}$").matches(id) &&
            id == "$channel-${number(manifest, "build_number")}-${manifest.getString("git_commit")}") { "invalid_manifest" }
        require(bundle.getString("asset") == "songloft-lynx-main.lynx.bundle" &&
            number(bundle, "size") in 1..MAX_BUNDLE_BYTES && Regex("^[0-9a-f]{64}$").matches(bundle.getString("sha256"))) { "invalid_manifest" }
        val assets = manifest.getJSONArray("assets")
        require(assets.length() in 1..16) { "invalid_manifest" }
        val names = HashSet<String>()
        var listed = false
        for (index in 0 until assets.length()) {
            val asset = assets.getJSONObject(index)
            val name = asset.getString("name")
            require(Regex("^[A-Za-z0-9._-]+$").matches(name) && name !in listOf(".", "..") && names.add(name)) { "invalid_manifest" }
            require(number(asset, "size") > 0 && Regex("^[0-9a-f]{64}$").matches(asset.getString("sha256"))) { "invalid_manifest" }
            if (name == bundle.getString("asset")) {
                require(number(asset, "size") == number(bundle, "size") && asset.getString("sha256") == bundle.getString("sha256")) { "invalid_manifest" }
                listed = true
            }
        }
        require(listed) { "invalid_manifest" }
        val targets = bundle.getJSONArray("targets")
        require(targets.length() in 1..3) { "invalid_manifest" }
        val platforms = HashSet<String>()
        var target: JSONObject? = null
        for (index in 0 until targets.length()) {
            val entry = targets.getJSONObject(index)
            val platform = entry.getString("platform")
            require(platform in listOf("android", "ios", "harmony") && platforms.add(platform)) { "invalid_manifest" }
            require(VERSION.matches(entry.getString("engine")) && VERSION.matches(entry.getString("minimum_host_version")) &&
                number(entry, "minimum_bridge") >= 0 && number(entry, "maximum_bridge") >= number(entry, "minimum_bridge")) { "invalid_manifest" }
            val required = entry.getJSONArray("required_capabilities")
            require(required.length() <= 64) { "invalid_manifest" }
            val unique = HashSet<String>()
            for (item in 0 until required.length()) require(required.getString(item).let {
                it.isNotEmpty() && it.length <= 1024 && unique.add(it)
            }) { "invalid_manifest" }
            if (platform == host.getString("platform")) target = entry
        }
        val current = target ?: error("incompatible_platform")
        require(current.getString("engine") == host.getJSONObject("engines").getString(host.getString("platform"))) { "incompatible_engine" }
        require(compare(host.getString("native_version"), current.getString("minimum_host_version")) >= 0) { "incompatible_host" }
        require(number(host, "bridge_version") in number(current, "minimum_bridge")..number(current, "maximum_bridge")) { "incompatible_bridge" }
        val capabilities = host.getJSONArray("capabilities")
        val available = (0 until capabilities.length()).map { capabilities.getString(it) }.toSet()
        val required = current.getJSONArray("required_capabilities")
        require(required.length() <= 64) { "invalid_manifest" }
        for (index in 0 until required.length()) require(required.getString(index) in available) { "incompatible_capability" }
    }

    private fun keyOf(manifest: JSONObject): String {
        val bundle = manifest.getJSONObject("bundle_update")
        return "${bundle.getString("sha256")}-${bundle.getString("bundle_id")}".also { require(STORAGE_KEY.matches(it)) }
    }

    private fun readRecord(key: String?): Record? {
        if (key.isNullOrEmpty() || !STORAGE_KEY.matches(key)) return null
        return try {
            val directory = File(bundles, key)
            val manifestFile = File(directory, "version.json")
            val signatureFile = File(directory, "version.json.sig")
            if (manifestFile.length() !in 1..MAX_MANIFEST_BYTES.toLong() || signatureFile.length() !in 1..8192) return null
            val manifest = inspect(manifestFile.readText(), signatureFile.readText())
            val file = File(directory, "main.lynx.bundle")
            val bundle = manifest.getJSONObject("bundle_update")
            if (keyOf(manifest) != key || !file.isFile || file.length() != number(bundle, "size") ||
                file.sha256() != bundle.getString("sha256")) return null
            Record(manifest, key, file)
        } catch (_: Exception) { null }
    }

    private fun File.sha256(): String {
        val hash = MessageDigest.getInstance("SHA-256")
        inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val count = input.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) }
        }
        return hash.digest().toByteString().hex()
    }

    private fun time(value: String): Long? = try {
        require(Regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$").matches(value))
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC"); isLenient = false
        }.parse(value)?.time
    } catch (_: Exception) { null }

    private fun newerThanInstalled(record: Record): Boolean = if (host.getString("channel") == "stable") {
        compare(record.manifest.getString("version"), host.getString("version")) > 0
    } else {
        val candidate = time(record.manifest.getString("build_time"))
        val installed = time(host.getString("build_time"))
        candidate != null && installed != null && candidate > installed
    }

    @Synchronized private fun checkNewUpdate(manifest: JSONObject) {
        val current = selected?.manifest ?: host
        if (host.getString("channel") == "stable") {
            require(compare(manifest.getString("version"), current.getString("version")) > 0 &&
                compare(manifest.getString("version"), host.getString("version")) > 0) { "update_not_newer" }
        } else {
            val next = manifest.optString("git_commit")
            val previous = current.optString("git_commit")
            val known = Regex("^[0-9a-f]{7,40}$")
            val newer = if (known.matches(next) && known.matches(previous)) next != previous else {
                val nextTime = time(manifest.optString("build_time"))
                val previousTime = time(current.optString("build_time"))
                nextTime != null && previousTime != null && nextTime - previousTime >= 600_000
            }
            require(newer) { "update_not_newer" }
        }
    }

    /** Once per process: a previous unconfirmed trial is never tried again. */
    @Synchronized fun beginLaunch(): ByteArray? {
        if (launchStarted) return selected?.file?.readBytes()
        launchStarted = true
        val hostChanged = state.optString("host") != hostMarker
        if (state.has("trial")) {
            state.remove("trial"); state.remove("pending")
            state.put("last_error", "rollback_unconfirmed")
        }
        for (field in listOf("active", "previous", "pending")) {
            val record = readRecord(state.optString(field))
            if (record == null || (hostChanged && !newerThanInstalled(record))) state.remove(field)
        }
        state.put("host", hostMarker)
        val pending = readRecord(state.optString("pending"))
        if (pending != null) {
            selected = pending
            state.put("trial", pending.key); state.remove("pending")
            trialStartedAt = System.currentTimeMillis()
        } else {
            selected = readRecord(state.optString("active")) ?: readRecord(state.optString("previous"))
            if (selected != null) state.put("active", selected!!.key)
        }
        return try {
            saveState()
            val data = selected?.file?.readBytes()
            prune()
            data
        } catch (error: Exception) {
            selected = null
            startupFailed = true
            runCatching { failStartup() }
            throw error
        }
    }

    @Synchronized fun confirmStartup(id: String) {
        val current = selected ?: return
        if (startupFailed || state.optString("trial") != current.key ||
            current.manifest.getJSONObject("bundle_update").getString("bundle_id") != id) return
        if (System.currentTimeMillis() - trialStartedAt > 120_000) { failStartup(); return }
        val active = state.optString("active")
        if (active.isNotEmpty() && active != current.key) state.put("previous", active)
        state.put("active", current.key); state.remove("trial"); state.remove("last_error")
        saveState()
    }

    @Synchronized fun failStartup() {
        if (state.has("trial")) { startupFailed = true; state.put("last_error", "startup_failed"); saveState() }
    }

    @Synchronized fun restoreBuiltin() {
        cancel(download?.id ?: "")
        for (field in listOf("active", "previous", "pending", "trial")) state.remove(field)
        state.put("last_error", "restore_builtin")
        saveState()
    }

    @Synchronized fun info(): JSONObject {
        val result = JSONObject(state.toString())
        result.put("host", hostInfo())
        result.put("running", selected?.let { running -> JSONObject(running.manifest.toString())
            .put("kind", if (state.optString("trial") == running.key) "trial" else "active") }
            ?: JSONObject(host.toString()).put("kind", "builtin"))
        for (field in listOf("active", "previous", "pending")) {
            val record = readRecord(state.optString(field))
            result.put(field, record?.manifest ?: JSONObject.NULL)
        }
        download?.let { task -> result.put("download", JSONObject().put("task_id", task.id)
            .put("bytes", task.bytes).put("total", task.total)) }
        return result
    }

    private fun saveState() {
        val part = File(root, "state.json.part")
        try {
            FileOutputStream(part).use { it.write(bytes(state.toString())); it.fd.sync() }
            check(part.renameTo(stateFile)) { "update_storage_unavailable" }
            persistedState = state.toString()
        } catch (error: Exception) {
            state = JSONObject(persistedState)
            throw error
        }
    }

    private fun prune() {
        val keep = listOf("active", "previous", "pending", "trial").map { state.optString(it) }.toMutableSet()
        selected?.let { keep.add(it.key) }
        bundles.listFiles()?.filter { STORAGE_KEY.matches(it.name) && it.name !in keep }?.forEach { it.deleteRecursively() }
    }

    private fun writeDurable(file: File, content: String) {
        FileOutputStream(file).use { it.write(bytes(content)); it.fd.sync() }
    }

    @Synchronized fun cancel(taskId: String) {
        if (taskId.isEmpty()) return
        val task = download
        if (task == null || task.id != taskId) {
            cancelledTasks.add(taskId)
            if (cancelledTasks.size > 64) cancelledTasks.remove(cancelledTasks.first())
            return
        }
        task.cancelled = true
        task.call?.cancel()
    }

    /** Called on an executor, never the view thread. Callbacks contain no remote URL or token. */
    fun prepare(raw: String, signatureJson: String, url: String, taskId: String,
        progress: (Long, Long) -> Unit): JSONObject {
        require(Regex("^[A-Za-z0-9-]{1,96}$").matches(taskId)) { "invalid_task" }
        val manifest = inspect(raw, signatureJson)
        checkNewUpdate(manifest)
        val bundle = manifest.getJSONObject("bundle_update")
        val request = Request.Builder().url(url).get().build()
        require(request.url.isHttps && request.url.username.isEmpty() && request.url.password.isEmpty() &&
            request.url.queryParameterNames.none { it.lowercase() in listOf("access_token", "token") }) { "invalid_update_url" }
        val task = Download(taskId)
        synchronized(this) {
            check(!cancelledTasks.remove(taskId)) { "cancelled" }
            check(download == null) { "update_busy" }; download = task
        }
        val temporary = File(root, "download-$taskId")
        try {
            task.total = number(bundle, "size")
            require(root.usableSpace >= task.total + 512 * 1024) { "insufficient_space" }
            check(temporary.mkdir()) { "update_storage_unavailable" }
            val file = File(temporary, "main.lynx.bundle")
            val call = client.newCall(request)
            task.call = call
            if (task.cancelled) error("cancelled")
            val response = try { call.execute() } catch (_: IOException) { error("download_failed") }
            response.use {
                require(response.request.url.isHttps && response.request.url.username.isEmpty() &&
                    response.request.url.password.isEmpty()) { "invalid_update_url" }
                check(response.isSuccessful) { "download_failed" }
                val body = response.body ?: error("download_failed")
                require(body.contentLength() < 0 || body.contentLength() == task.total) { "checksum_mismatch" }
                FileOutputStream(file).use { output -> body.byteStream().use { input ->
                    val buffer = ByteArray(64 * 1024)
                    progress(0, task.total)
                    while (true) {
                        if (task.cancelled) error("cancelled")
                        val count = try { input.read(buffer) } catch (_: IOException) { error("download_failed") }
                        if (count < 0) break
                        task.bytes += count
                        require(task.bytes <= task.total && task.bytes <= MAX_BUNDLE_BYTES) { "checksum_mismatch" }
                        output.write(buffer, 0, count)
                        progress(task.bytes, task.total)
                    }
                    output.fd.sync()
                } }
            }
            require(task.bytes == task.total && file.sha256() == bundle.getString("sha256")) { "checksum_mismatch" }
            writeDurable(File(temporary, "version.json"), raw)
            writeDurable(File(temporary, "version.json.sig"), signatureJson)
            synchronized(this) {
                if (task.cancelled) error("cancelled")
                val key = keyOf(manifest)
                val destination = File(bundles, key)
                if (readRecord(key) == null) {
                    if (destination.exists()) check(destination.deleteRecursively()) { "update_storage_unavailable" }
                    check(temporary.renameTo(destination)) { "update_storage_unavailable" }
                }
                state.put("pending", key)
                saveState()
                prune()
            }
            return JSONObject().put("prepared", true).put("bundle_id", bundle.getString("bundle_id"))
        } catch (error: Exception) {
            if (task.cancelled) throw IllegalStateException("cancelled")
            throw error
        } finally {
            temporary.deleteRecursively()
            synchronized(this) { if (download === task) download = null }
        }
    }
}
