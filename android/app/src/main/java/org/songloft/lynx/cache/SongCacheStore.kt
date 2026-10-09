package org.songloft.lynx.cache

import okhttp3.Call
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

/** One process-wide scheduler for legacy and indexed caches; only this class writes media. */
class SongCacheStore(private val root: File, private val documents: SongCacheDocuments? = null, private val client: () -> OkHttpClient) {
    private val lock = Any()
    private val worker = Executors.newSingleThreadExecutor()
    private val entries = LinkedHashMap<String, JSONObject>()
    // Old shells only scan v2/. They must never mistake SAF metadata for broken private media.
    private val publicEntries = LinkedHashMap<String, JSONObject>()
    private val publicIndex = File(root, "public-v1")
    private val directoryFile = File(root, "storage.json")
    private var directory: String? = null
    private var directoryLabel: String? = null
    private var publicIndexHealthy = true
    private var storageOperation: String? = null
    @Volatile private var migrationCancelled = false
    private val jobs = LinkedHashMap<String, Job>()
    private val cancelled = LinkedHashSet<String>()
    private val indexed = File(root, "v2")
    private val tasks = File(root, "tasks")
    private val staging = File(root, "staging")
    private class Job(val id: String, val namespace: String, val key: String) {
        @Volatile var cancelled = false
        @Volatile var call: Call? = null
        var status = "waiting"
        var bytes = 0L
        var total = 0L
        var error: String? = null
        fun json(): JSONObject = JSONObject().put("task_id", id).put("namespace", namespace).put("key", key)
            .put("status", status).put("bytes", bytes).put("total", total).put("error", error ?: JSONObject.NULL)
    }
    init {
        check(root.mkdirs() || root.isDirectory) { "cache_storage_unavailable" }
        listOf(indexed, tasks, staging).forEach { check(it.mkdirs() || it.isDirectory) { "cache_storage_unavailable" } }
        staging.listFiles()?.forEach { it.deleteRecursively() }
        tasks.listFiles()?.filter { it.isFile && it.name.endsWith(".part") }?.forEach { it.delete() }
        root.listFiles()?.filter { it.isFile && it.name.endsWith(".part") }?.forEach { it.delete() }
        indexed.listFiles()?.filter { it.isDirectory && it.name.matches(Regex("[a-f0-9]{64}")) }?.forEach { namespace ->
            namespace.listFiles()?.filter { it.isDirectory }?.forEach { directory ->
                try {
                    val entry = JSONObject(File(directory, "entry.json").readText())
                    validateIdentity(entry.getString("namespace"), entry.getString("key"))
                    check(directory == entryDirectory(entry.getString("namespace"), entry.getString("key")))
                    check(media(entry).isFile && media(entry).length() == entry.getLong("sizeBytes") && entry.getLong("sizeBytes") > 0)
                    entries[entry.getString("key")] = entry
                } catch (_: Exception) { directory.deleteRecursively() }
            }
        }
        if (directoryFile.isFile) {
            try {
                val value = JSONObject(directoryFile.readText())
                directory = if (value.isNull("tree")) null else value.getString("tree").takeIf { it.isNotEmpty() }
                directoryLabel = if (value.isNull("label")) null else value.getString("label").takeIf { it.isNotEmpty() }
            } catch (_: Exception) { publicIndexHealthy = false }
        }
        publicIndex.listFiles()?.filter { it.isDirectory && it.name.matches(Regex("[a-f0-9]{64}")) }?.forEach { namespace ->
            namespace.listFiles()?.filter { it.extension == "json" }?.forEach { file ->
                try {
                    val entry = JSONObject(file.readText())
                    validateIdentity(entry.getString("namespace"), entry.getString("key"))
                    check(file == publicRecord(entry) && entry.getLong("sizeBytes") > 0)
                    check(entry.getString("document_uri").startsWith("content://com.android.externalstorage.documents/tree/"))
                    check(entry.getString("storage_directory").startsWith("content://com.android.externalstorage.documents/tree/"))
                    publicEntries[entry.getString("key")] = entry
                } catch (_: Exception) { publicIndexHealthy = false } // Preserve damaged metadata for recovery.
            }
        }
        (entries.values + publicEntries.values).forEach { entry ->
            try { validatePendingCleanup(entry) } catch (_: Exception) { publicIndexHealthy = false }
        }
        tasks.listFiles()?.filter { it.isFile && it.extension == "json" }?.forEach { file ->
            try {
                val value = JSONObject(file.readText())
                if (value.optString("status") in setOf("waiting", "downloading")) {
                    value.put("status", "interrupted").put("error", "interrupted")
                    atomic(file, value.toString())
                }
            } catch (_: Exception) { file.delete() }
        }
        pruneTasks()
    }
    private fun hash(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun namespace(raw: String): JSONArray {
        require(raw.toByteArray(Charsets.UTF_8).size <= 4096) { "invalid_cache_request" }
        val parts = JSONArray(raw)
        require(parts.length() == 3 && (0..2).all { parts.get(it) is String } &&
            parts.getString(0).length in 1..128 && parts.getString(2).length in 1..256) { "invalid_cache_request" }
        val server = parts.getString(1).toHttpUrlOrNull()
        require(server != null && server.username.isEmpty() && server.password.isEmpty() && server.query == null && server.fragment == null &&
            parts.getString(1).none { it <= ' ' || it == '\\' }) { "invalid_cache_request" }
        return parts
    }
    private fun validateIdentity(ns: String, key: String): JSONArray {
        namespace(ns)
        val value = JSONArray(key)
        require(key.toByteArray(Charsets.UTF_8).size <= 8192 && value.length() == 7 &&
            (0..6).all { value.get(it) is String } && value.getString(0) == ns &&
            value.getString(1).matches(Regex("[1-9][0-9]{0,14}")) &&
            value.getString(2).matches(Regex("default|[0-9]{1,6}")) &&
            value.getString(3) in setOf("original", "320", "192", "128") &&
            value.getString(4) in setOf("0", "1") && value.getString(5).length in 1..128 &&
            value.getString(6).matches(Regex("[a-z0-9]{1,12}"))) { "invalid_cache_request" }
        return value
    }
    private fun entryDirectory(ns: String, key: String): File = File(File(indexed, hash(ns)), hash(key))
    private fun publicRecord(entry: JSONObject): File = File(File(publicIndex, hash(entry.getString("namespace"))), hash(entry.getString("key")) + ".json")
    private fun savePublic(entry: JSONObject) {
        val file = publicRecord(entry)
        check(file.parentFile!!.mkdirs() || file.parentFile!!.isDirectory) { "cache_storage_unavailable" }
        atomic(file, entry.toString())
        publicEntries[entry.getString("key")] = entry
    }
    private fun storageAware(request: JSONObject): Boolean {
        val aware = request.optInt("storage_version", 0) == 1 && documents != null
        if (aware) check(publicIndexHealthy) { "cache_storage_unavailable" }
        return aware
    }
    private fun candidates(aware: Boolean): List<JSONObject> {
        if (!aware) return entries.values.toList()
        val merged = LinkedHashMap(entries + publicEntries)
        // A restored private entry is already committed even if its original
        // public document is waiting for deletion. Prefer the usable new copy.
        entries.values.filter { it.has("pending_cleanup") }.forEach { entry ->
            val previous = entry.getJSONObject("pending_cleanup")
            if (previous.optString("document_uri") == publicEntries[entry.getString("key")]?.optString("document_uri")) {
                merged[entry.getString("key")] = entry
            }
        }
        return merged.values.toList()
    }
    private fun deletionCandidates(aware: Boolean): List<JSONObject> =
        if (aware) publicEntries.values.toList() + entries.values.toList() else entries.values.toList()
    private fun status(entry: JSONObject): String = if (entry.has("document_uri")) {
        documents?.status(entry.getString("document_uri"), entry.getString("storage_directory"), entry.getLong("sizeBytes")) ?: "unavailable"
    } else if (media(entry).isFile && media(entry).length() == entry.getLong("sizeBytes")) "available" else "missing"
    private fun media(entry: JSONObject): File = File(entryDirectory(entry.getString("namespace"), entry.getString("key")), "media.${JSONArray(entry.getString("key")).getString(6)}")
    private fun fileURL(file: File): String = java.net.URI("file", "", file.absolutePath, null).toASCIIString()
    private fun playableRecord(entry: JSONObject): JSONObject {
        val previous = entry.optJSONObject("pending_cleanup") ?: return entry
        return if (status(entry) != "available" && status(previous) == "available") previous else entry
    }
    private fun playable(entry: JSONObject): JSONObject {
        val visible = playableRecord(entry)
        val copy = JSONObject(visible.toString())
        // Internal locations never enter persisted song snapshots or task history.
        copy.remove("document_uri"); copy.remove("storage_directory"); copy.remove("pending_cleanup")
        return copy.put("cached", true).put("available", status(visible) == "available")
            .put("url", if (visible.has("document_uri")) visible.getString("document_uri") else fileURL(media(visible)))
    }
    private fun sameVariant(left: String, right: String): Boolean {
        val a = JSONArray(left); val b = JSONArray(right)
        return (0..5).all { a.getString(it) == b.getString(it) }
    }
    private fun availableEntry(ns: String, key: String, aware: Boolean = false): JSONObject? = candidates(aware).firstOrNull {
        if (it.getString("namespace") != ns || !sameVariant(it.getString("key"), key)) false
        else {
            val state = status(playableRecord(it))
            if (state == "unavailable") error("cache_storage_unavailable")
            state == "available"
        }
    }
    fun getEntry(raw: String): JSONObject = synchronized(lock) {
        val request = JSONObject(raw)
        val ns = request.getString("namespace"); namespace(ns)
        val aware = storageAware(request)
        val key = request.optString("key")
        val entry = if (key.isNotEmpty()) {
            validateIdentity(ns, key); availableEntry(ns, key, aware)
        } else {
            val id = request.getLong("song_id")
            candidates(aware).firstOrNull {
                if (it.getString("namespace") != ns || JSONArray(it.getString("key")).getString(1) != id.toString()) false
                else { val state = status(playableRecord(it)); if (state == "unavailable") error("cache_storage_unavailable"); state == "available" }
            }
        }
        if (entry == null) JSONObject().put("cached", false) else playable(entry)
    }
    fun listEntries(raw: String): JSONObject = synchronized(lock) {
        val request = JSONObject(raw); val ns = request.getString("namespace"); namespace(ns)
        val aware = storageAware(request)
        val offset = request.optInt("offset", 0); val limit = request.optInt("limit", 50)
        require(offset >= 0 && limit in 1..200) { "invalid_cache_request" }
        val all = candidates(aware).filter { it.getString("namespace") == ns && (it.has("document_uri") || media(it).isFile) }
            .sortedBy { it.getString("key") }
        JSONObject().put("entries", JSONArray(all.drop(offset).take(limit).map { playable(it) }))
            .put("total", all.size).put("bytes", size()).put("legacy_bytes", legacySize())
    }
    private fun legacyFiles(): List<File> = root.listFiles()?.filter { it.isFile && !it.name.endsWith(".part") && it.name.matches(Regex("[1-9][0-9]*(\\.[a-z0-9]{1,12})?")) } ?: emptyList()
    private fun legacySize(): Long = legacyFiles().sumOf { it.length() }
    fun size(): Long = synchronized(lock) {
        val locations = LinkedHashMap<String, JSONObject>()
        (entries.values + publicEntries.values).forEach { entry ->
            val copies = listOfNotNull(entry, entry.optJSONObject("pending_cleanup"))
            copies.forEach { copy -> locations[copy.optString("document_uri").takeIf { it.isNotEmpty() } ?: fileURL(media(copy))] = copy }
        }
        legacySize() + locations.values.sumOf { if (it.has("document_uri")) it.getLong("sizeBytes") else if (media(it).isFile) media(it).length() else 0 }
    }
    private fun validatePendingCleanup(entry: JSONObject) {
        if (!entry.has("pending_cleanup")) return
        val previous = entry.getJSONObject("pending_cleanup")
        validateIdentity(previous.getString("namespace"), previous.getString("key"))
        check(previous.getString("namespace") == entry.getString("namespace") && previous.getString("key") == entry.getString("key") &&
            previous.getLong("sizeBytes") == entry.getLong("sizeBytes") && !previous.has("pending_cleanup")) { "cache_storage_unavailable" }
        if (previous.has("document_uri")) {
            check(previous.getString("document_uri").startsWith("content://com.android.externalstorage.documents/tree/") &&
                previous.getString("storage_directory").startsWith("content://com.android.externalstorage.documents/tree/") &&
                previous.getString("document_uri") != entry.optString("document_uri")) { "cache_storage_unavailable" }
        } else check(entry.has("document_uri")) { "cache_storage_unavailable" }
    }
    /** Retain both locations until deletion and the updated index are durable. */
    private fun finishPendingCleanup(entry: JSONObject, deleting: Boolean = false): JSONObject {
        if (!entry.has("pending_cleanup")) return entry
        validatePendingCleanup(entry)
        // A committed replacement may since have been removed or unmounted.
        // Automatic migration must never delete the remaining usable original.
        if (!deleting) check(status(entry) == "available") { "cache_storage_unavailable" }
        val previous = entry.getJSONObject("pending_cleanup")
        val key = entry.getString("key")
        if (previous.has("document_uri")) {
            documents!!.delete(previous.getString("document_uri"), previous.getString("storage_directory"))
            if (!entry.has("document_uri")) {
                val record = publicRecord(previous)
                check(!record.exists() || record.delete()) { "cache_storage_unavailable" }
                publicEntries.remove(key)
            }
        } else {
            val directory = entryDirectory(previous.getString("namespace"), key)
            check(!directory.exists() || directory.deleteRecursively()) { "cache_storage_unavailable" }
            entries.remove(key)
        }
        if (deleting) return entry
        val updated = JSONObject(entry.toString()).apply { remove("pending_cleanup") }
        if (updated.has("document_uri")) savePublic(updated)
        else { atomic(File(entryDirectory(updated.getString("namespace"), key), "entry.json"), updated.toString()); entries[key] = updated }
        return updated
    }
    private fun atomic(file: File, value: String) {
        val temporary = File(file.parentFile, file.name + ".part")
        try {
            FileOutputStream(temporary).use { output -> output.write(value.toByteArray(Charsets.UTF_8)); output.fd.sync() }
            check(temporary.renameTo(file)) { "cache_storage_unavailable" }
        } finally { temporary.delete() }
    }
    private fun save(job: Job) = atomic(File(tasks, "${job.id}.json"), job.json().toString())
    private fun pruneTasks() {
        tasks.listFiles()?.filter { it.isFile && it.extension == "json" }?.sortedByDescending { it.lastModified() }
            ?.drop(128)?.filter { it.nameWithoutExtension !in jobs }?.forEach { it.delete() }
    }
    fun getTasks(): JSONObject = synchronized(lock) {
        val values = tasks.listFiles()?.filter { it.isFile && it.extension == "json" }?.mapNotNull {
                try { jobs[it.nameWithoutExtension]?.json() ?: JSONObject(it.readText()) } catch (_: Exception) { null }
        } ?: emptyList()
        JSONObject().put("tasks", JSONArray(values))
    }
    fun cancel(id: String) = synchronized(lock) {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,96}"))) { "invalid_cache_request" }
        jobs[id]?.let { it.cancelled = true; it.call?.cancel() }
        if (storageOperation == id) migrationCancelled = true
        cancelled.add(id)
        while (cancelled.size > 64) cancelled.remove(cancelled.first())
    }
    private fun snapshot(input: JSONObject, id: String): JSONObject {
        require(input.getLong("id").toString() == id && input.optString("type") in setOf("local", "remote") &&
            input.optString("title").length in 1..1024 && input.optDouble("duration", -1.0).isFinite() && input.optDouble("duration", -1.0) >= 0) { "invalid_cache_request" }
        val result = JSONObject().put("id", input.getLong("id")).put("type", input.getString("type"))
            .put("title", input.getString("title")).put("duration", input.getDouble("duration"))
            .put("artist", input.optString("artist").take(1024)).put("album", input.optString("album").take(1024))
            .put("isVideo", input.optBoolean("isVideo")).put("format", input.optString("format").take(12))
            .put("updatedAt", input.optString("updatedAt").take(128))
        return result // Explicit whitelist: URLs, tokens, filesystem paths and extra fields never reach disk.
    }
    fun cacheEntry(raw: String, progress: (JSONObject) -> Unit, callback: (JSONObject) -> Unit) {
        try {
            val request = JSONObject(raw); val ns = request.getString("namespace"); val key = request.getString("key")
            val identity = validateIdentity(ns, key)
            storageAware(request)
            val song = snapshot(request.getJSONObject("snapshot"), identity.getString(1))
            enqueue(request, ns, key, song, null, progress, callback)
        } catch (error: Exception) { callback(failure(error)) }
    }
    private fun enqueue(request: JSONObject, ns: String, key: String, song: JSONObject?, legacy: File?, progress: (JSONObject) -> Unit, callback: (JSONObject) -> Unit) {
        val id = request.getString("task_id")
        val maximum = request.getDouble("max_bytes")
        require(id.matches(Regex("[A-Za-z0-9_-]{1,96}")) && maximum.isFinite() && maximum > 0 && maximum <= 9007199254740991.0 && maximum == maximum.toLong().toDouble()) { "invalid_cache_request" }
        val url = request.getString("url")
        val parsed = url.toHttpUrlOrNull()
        require(parsed != null && parsed.scheme in setOf("http", "https") && parsed.username.isEmpty() && parsed.password.isEmpty()) { "invalid_cache_request" }
        val job = Job(id, ns, key)
        val aware = storageAware(request)
        synchronized(lock) {
            require(storageOperation == null) { "cache_busy" }
            require(jobs.size < 32) { "cache_queue_full" }
            require(!jobs.containsKey(id) && !File(tasks, "$id.json").exists()) { "invalid_cache_request" }
            require(jobs.values.none { key.isNotEmpty() && it.namespace == ns && sameVariant(it.key, key) }) { "cache_busy" }
            job.cancelled = id in cancelled
            save(job); jobs[id] = job
        }
        worker.execute {
            val temporary = File(staging, id)
            var committed = false
            var result = JSONObject()
            try {
                if (job.cancelled) error("cancelled")
                synchronized(lock) { if (legacy == null) availableEntry(ns, key, aware)?.let { result = playable(it); committed = true } }
                if (!committed) {
                    val remaining = maximum.toLong() - size()
                    if (remaining <= 0) error("limit_exceeded")
                    if (root.usableSpace < 524288) error("insufficient_space")
                    check(temporary.mkdir()) { "cache_storage_unavailable" }
                    val part = File(temporary, "media.part")
                    val call = client().newCall(Request.Builder().url(url).build()); job.call = call
                    if (job.cancelled) { call.cancel(); error("cancelled") }
                    job.status = "downloading"; synchronized(lock) { save(job) }; progress(job.json())
                    var actualFormat = if (legacy != null) legacy.extension else JSONArray(key).getString(6)
                    call.execute().use { response ->
                        if (!response.isSuccessful) error("download_failed")
                        if (legacy == null && response.header("Content-Range") != null) error("unsupported_media")
                        val body = response.body ?: error("download_failed")
                        job.total = body.contentLength().coerceAtLeast(0)
                        if (job.total > remaining) error("limit_exceeded")
                        if (job.total > 0 && job.total + 524288 > root.usableSpace) error("insufficient_space")
                        if (legacy == null) actualFormat = formatOf(response.header("Content-Type"), actualFormat)
                        body.byteStream().use { input -> FileOutputStream(part).use { output ->
                            val buffer = ByteArray(32768); var last = 0L
                            while (true) {
                                if (job.cancelled) error("cancelled")
                                val count = input.read(buffer); if (count < 0) break
                                if (job.bytes + count > remaining) error("limit_exceeded")
                                if (root.usableSpace < count + 524288L) error("insufficient_space")
                                output.write(buffer, 0, count); job.bytes += count
                                val now = System.nanoTime()
                                if (now - last > 100000000) { last = now; progress(job.json()) }
                            }
                            output.fd.sync()
                        } }
                    }
                    if (job.bytes == 0L || job.total > 0 && job.bytes != job.total) error("download_failed")
                    val actual = if (legacy != null) "" else JSONArray(key).put(6, actualFormat).toString()
                    val entry = JSONObject().put("namespace", ns).put("key", actual).put("snapshot", song)
                        .put("sizeBytes", job.bytes).put("createdAt", System.currentTimeMillis())
                    val target = synchronized(lock) { if (aware) directory else null }
                    val publicUri = if (target == null) null else part.inputStream().use {
                        documents!!.copy(it, target, documentName(entry), actualFormat, job.bytes) { job.cancelled }
                    }
                    try { synchronized(lock) {
                        if (job.cancelled) error("cancelled")
                        if (legacy != null) {
                            check(part.renameTo(legacy)) { "cache_storage_unavailable" }
                        } else {
                            if (publicUri != null) {
                                savePublic(entry.put("document_uri", publicUri).put("storage_directory", target))
                            } else {
                                check(part.renameTo(File(temporary, "media.$actualFormat"))) { "cache_storage_unavailable" }
                                atomic(File(temporary, "entry.json"), entry.toString())
                                val destination = entryDirectory(ns, actual)
                                check(destination.parentFile!!.mkdirs() || destination.parentFile!!.isDirectory)
                                check(!destination.exists() && temporary.renameTo(destination)) { "cache_storage_unavailable" }
                                entries[actual] = entry
                            }
                        }
                        committed = true
                    } } catch (error: Exception) {
                        if (publicUri != null && target != null) runCatching { documents!!.delete(publicUri, target) }
                        throw error
                    }
                    result = if (legacy != null) JSONObject().put("path", fileURL(legacy)) else getEntry(JSONObject().put("namespace", ns).put("key", key).put("storage_version", if (aware) 1 else 0).toString())
                }
                job.status = "completed"
            } catch (error: Exception) {
                job.error = if (job.cancelled) "cancelled" else failure(error).getString("error")
                job.status = if (job.cancelled) "cancelled" else "failed"
                result = JSONObject().put("error", job.error)
            } finally {
                temporary.deleteRecursively(); job.call = null
                synchronized(lock) {
                    jobs.remove(id)
                    try { save(job); pruneTasks() } catch (_: Exception) {
                        job.status = "failed"; job.error = "cache_storage_unavailable"
                        result = JSONObject().put("error", job.error)
                    }
                }
                try { progress(job.json()) } catch (_: Exception) {}
            }
            callback(result)
        }
    }
    private fun formatOf(contentType: String?, fallback: String): String = when (contentType?.substringBefore(';')?.trim()?.lowercase()) {
        "audio/mpeg", "audio/mp3" -> "mp3"
        "audio/flac", "audio/x-flac" -> "flac"
        "audio/mp4" -> "m4a"
        "video/mp4" -> "mp4"
        "audio/aac" -> "aac"
        "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
        "audio/ogg", "application/ogg" -> if (fallback == "opus") "opus" else "ogg"
        "text/html", "application/json", "application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl" -> error("unsupported_media")
        else -> fallback
    }
    private fun failure(error: Exception): JSONObject {
        val known = setOf("invalid_cache_request", "cache_queue_full", "cache_busy", "cache_storage_unavailable", "limit_exceeded", "insufficient_space", "cancelled", "download_failed", "unsupported_media")
        return JSONObject().put("error", if (error.message in known) error.message else "download_failed")
    }
    private fun documentName(entry: JSONObject): String {
        val snapshot = entry.getJSONObject("snapshot")
        val raw = listOf(snapshot.optString("artist"), snapshot.optString("title")).filter { it.isNotBlank() }.joinToString(" - ")
            .replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1f]"), "_").trim()
        val prefix = StringBuilder(); var bytes = 0
        var offset = 0
        while (offset < raw.length) {
            val rune = Character.codePointAt(raw, offset); offset += Character.charCount(rune)
            val text = String(Character.toChars(rune)); val size = text.toByteArray(Charsets.UTF_8).size
            if (bytes + size > 160) break
            prefix.append(text); bytes += size
        }
        val identity = JSONArray(entry.getString("key"))
        return "${prefix.ifEmpty { "Song" }} - ${identity.getString(1)} - ${hash(entry.getString("key")).take(12)}.${identity.getString(6)}"
    }
    fun directoryInfo(): JSONObject {
        val tree: String?; val label: String?; val busy: Boolean
        synchronized(lock) { tree = directory; label = directoryLabel; busy = storageOperation != null || jobs.isNotEmpty() }
        val available = publicIndexHealthy && (tree == null || runCatching { documents!!.validate(tree) }.isSuccess)
        return JSONObject().put("tree", tree ?: JSONObject.NULL).put("label", label ?: JSONObject.NULL).put("available", available).put("busy", busy)
    }
    fun setDirectory(tree: String?, label: String?, callback: (JSONObject) -> Unit) {
        try {
            synchronized(lock) {
                check(documents != null && publicIndexHealthy) { "cache_storage_unavailable" }
                check(storageOperation == null && jobs.isEmpty()) { "cache_busy" }
                storageOperation = "directory"
            }
        } catch (error: Exception) { callback(failure(error)); return }
        worker.execute {
            val result = try {
                if (tree != null) documents!!.validate(tree)
                synchronized(lock) {
                    atomic(directoryFile, JSONObject().put("tree", tree ?: JSONObject.NULL).put("label", label ?: JSONObject.NULL).toString())
                    directory = tree; directoryLabel = label
                }
                JSONObject().put("saved", true)
            } catch (error: Exception) { failure(error) }
            finally { synchronized(lock) { storageOperation = null } }
            callback(result)
        }
    }
    /** Current-namespace migration shares the download writer. Only commit permits deleting an original. */
    fun migrate(raw: String, progress: (JSONObject) -> Unit, callback: (JSONObject) -> Unit) {
        val id: String; val ns: String
        try {
            val request = JSONObject(raw); ns = request.getString("namespace"); namespace(ns); id = request.getString("task_id")
            require(id.matches(Regex("[A-Za-z0-9_-]{1,96}"))) { "invalid_cache_request" }
            synchronized(lock) {
                check(documents != null && publicIndexHealthy) { "cache_storage_unavailable" }
                check(storageOperation == null && jobs.isEmpty()) { "cache_busy" }
                storageOperation = id; migrationCancelled = id in cancelled
            }
        } catch (error: Exception) { callback(failure(error)); return }
        worker.execute {
            val target = synchronized(lock) { directory }
            val selected = synchronized(lock) { candidates(true).filter { it.getString("namespace") == ns &&
                (it.has("pending_cleanup") || it.optString("storage_directory").takeIf { value -> value.isNotEmpty() } != target) } }
            var done = 0
            fun report() { progress(JSONObject().put("task_id", id).put("namespace", ns).put("done", done).put("total", selected.size)) }
            val result = try {
                if (migrationCancelled) error("cancelled")
                if (target != null) documents!!.validate(target)
                report()
                for (selectedEntry in selected) {
                    if (migrationCancelled) error("cancelled")
                    val entry = synchronized(lock) { finishPendingCleanup(selectedEntry) }
                    if (entry.optString("storage_directory").takeIf { value -> value.isNotEmpty() } == target) { done++; report(); continue }
                    check(status(entry) == "available") { "cache_storage_unavailable" }
                    val replacement = JSONObject(entry.toString()).put("pending_cleanup", JSONObject(entry.toString()))
                    var createdUri: String? = null
                    val temporary = File(staging, id)
                    var committed = false
                    try {
                        val source = if (entry.has("document_uri")) documents!!.open(entry.getString("document_uri")) else media(entry).inputStream()
                        source.use { input ->
                            if (target != null) {
                                createdUri = documents!!.copy(input, target, documentName(entry), JSONArray(entry.getString("key")).getString(6), entry.getLong("sizeBytes")) { migrationCancelled }
                                replacement.put("document_uri", createdUri).put("storage_directory", target)
                            } else {
                                check(temporary.mkdir()) { "cache_storage_unavailable" }
                                val part = File(temporary, "media.${JSONArray(entry.getString("key")).getString(6)}")
                                FileOutputStream(part).use { output ->
                                    val buffer = ByteArray(65536); var copied = 0L
                                    while (true) {
                                        if (migrationCancelled) error("cancelled")
                                        val count = input.read(buffer); if (count < 0) break
                                        output.write(buffer, 0, count); copied += count
                                    }
                                    output.fd.sync(); check(copied == entry.getLong("sizeBytes")) { "cache_storage_unavailable" }
                                }
                                replacement.remove("document_uri"); replacement.remove("storage_directory")
                            }
                        }
                        synchronized(lock) {
                            if (migrationCancelled) error("cancelled")
                            if (target != null) savePublic(replacement)
                            else {
                                atomic(File(temporary, "entry.json"), replacement.toString())
                                val destination = entryDirectory(ns, entry.getString("key"))
                                check(destination.parentFile!!.mkdirs() || destination.parentFile!!.isDirectory) { "cache_storage_unavailable" }
                                val backup = File(staging, "$id-previous")
                                if (destination.exists()) check(destination.renameTo(backup)) { "cache_storage_unavailable" }
                                if (!temporary.renameTo(destination)) {
                                    if (backup.exists()) check(backup.renameTo(destination)) { "cache_storage_unavailable" }
                                    error("cache_storage_unavailable")
                                }
                                entries[entry.getString("key")] = replacement
                                backup.deleteRecursively()
                            }
                            committed = true
                        }
                        synchronized(lock) { finishPendingCleanup(replacement) }
                        done++; report()
                    } finally {
                        temporary.deleteRecursively()
                        if (!committed && createdUri != null && target != null) runCatching { documents!!.delete(createdUri!!, target) }
                    }
                }
                JSONObject().put("done", done).put("total", selected.size)
            } catch (error: Exception) { failure(error).put("done", done).put("total", selected.size) }
            finally { synchronized(lock) { storageOperation = null; cancelled.remove(id) } }
            callback(result)
        }
    }
    fun legacyDownload(id: String, url: String, ext: String, maximum: Double, callback: (JSONObject) -> Unit) {
        try {
            require(id.matches(Regex("[1-9][0-9]{0,14}")) && ext.matches(Regex("[a-z0-9]{0,12}"))) { "invalid_cache_request" }
            val destination = File(root, if (ext.isEmpty()) id else "$id.$ext")
            val request = JSONObject().put("task_id", "legacy-${java.util.UUID.randomUUID()}").put("url", url).put("max_bytes", maximum)
            enqueue(request, "", "", null, destination, {}, callback)
        } catch (error: Exception) { callback(failure(error)) }
    }
    fun legacyInfo(id: String): JSONObject = synchronized(lock) {
        val file = legacyFiles().firstOrNull { it.name == id || it.name.startsWith("$id.") }
        if (file == null) JSONObject().put("cached", false) else JSONObject().put("cached", true).put("url", fileURL(file)).put("sizeBytes", file.length())
    }
    fun remove(raw: String, callback: (JSONObject) -> Unit) = mutate(callback) {
        val request = JSONObject(raw); val ns = request.getString("namespace"); namespace(ns)
        val key = request.optString("key")
        if (key.isNotEmpty()) validateIdentity(ns, key)
        val id = request.optLong("song_id", -1)
        val selected = deletionCandidates(storageAware(request)).filter { it.getString("namespace") == ns &&
            (if (key.isNotEmpty()) sameVariant(it.getString("key"), key) else JSONArray(it.getString("key")).getString(1) == id.toString()) }
        selected.forEach { deleteEntry(it, storageAware(request)) }
    }
    fun clearNamespace(ns: String, callback: (JSONObject) -> Unit, aware: Boolean = false) {
        namespace(ns)
        synchronized(lock) { jobs.values.filter { it.namespace == ns }.forEach { cancel(it.id) } }
        mutate(callback) { if (aware) check(publicIndexHealthy) { "cache_storage_unavailable" }; deletionCandidates(aware).filter { it.getString("namespace") == ns }.forEach { deleteEntry(it, aware) } }
    }
    private fun deleteEntry(entry: JSONObject, aware: Boolean = false) {
        if (aware) finishPendingCleanup(entry, true)
        val key = entry.getString("key")
        if (entry.has("document_uri")) {
            documents!!.delete(entry.getString("document_uri"), entry.getString("storage_directory"))
            val record = publicRecord(entry)
            check(!record.exists() || record.delete()) { "cache_storage_unavailable" }; publicEntries.remove(key)
        } else {
            val directory = entryDirectory(entry.getString("namespace"), key)
            check(!directory.exists() || directory.deleteRecursively()) { "cache_storage_unavailable" }; entries.remove(key)
        }
    }
    fun clearLegacy(callback: (JSONObject) -> Unit) {
        synchronized(lock) { jobs.values.filter { it.namespace.isEmpty() }.forEach { cancel(it.id) } }
        mutate(callback) { legacyFiles().forEach { check(it.delete()) { "cache_storage_unavailable" } } }
    }
    fun legacyRemove(id: String, callback: (JSONObject) -> Unit) = mutate(callback) { legacyFiles().filter { it.name == id || it.name.startsWith("$id.") }.forEach { check(it.delete()) } }
    fun clearAll(callback: (JSONObject) -> Unit) {
        synchronized(lock) { jobs.keys.toList().forEach { cancel(it) } }
        mutate(callback) { legacyFiles().forEach { check(it.delete()) }; indexed.listFiles()?.forEach { check(it.deleteRecursively()) }; entries.clear() }
    }
    private fun mutate(callback: (JSONObject) -> Unit, run: () -> Unit) {
        worker.execute { try { synchronized(lock) { run() }; callback(JSONObject()) } catch (error: Exception) { callback(failure(error)) } }
    }
    fun close() { synchronized(lock) { migrationCancelled = true; jobs.keys.toList().forEach { cancel(it) } }; worker.shutdownNow() }
}
