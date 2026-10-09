package org.songloft.lynx.cache

import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import java.net.InetAddress
import java.net.URI
import java.nio.file.Files
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class SongCacheStoreTest {
    private class Documents(val folder: File) : SongCacheDocuments {
        val files = LinkedHashMap<String, File>()
        var unavailable = false
        var copies = 0
        var failCopy: Int? = null
        var deletions = 0
        var failDelete: Int? = null
        var afterCopy: (() -> Unit)? = null
        var afterDelete: (() -> Unit)? = null
        override fun validate(tree: String) { check(!unavailable) { "cache_storage_unavailable" } }
        override fun status(uri: String, tree: String, expected: Long): String = if (unavailable) "unavailable"
            else if (files[uri]?.isFile != true) "missing" else if (files[uri]!!.length() != expected) "unavailable" else "available"
        override fun open(uri: String): java.io.InputStream { validate(""); return files[uri]!!.inputStream() }
        override fun copy(input: java.io.InputStream, tree: String, name: String, format: String, expected: Long, cancelled: () -> Boolean): String {
            validate(tree); copies++
            check(copies != failCopy) { "cache_storage_unavailable" }
            val file = File(folder, "$copies-$name")
            val uri = "$tree/document/" + java.net.URLEncoder.encode("primary:Music/${file.name}", "UTF-8")
            try {
                file.outputStream().use { output ->
                    val buffer = ByteArray(16); var copied = 0L
                    while (true) {
                        if (cancelled()) error("cancelled")
                        val count = input.read(buffer); if (count < 0) break
                        output.write(buffer, 0, count); copied += count
                    }
                    check(copied == expected) { "cache_storage_unavailable" }
                }
                files[uri] = file; afterCopy?.invoke(); return uri
            } catch (error: Exception) { file.delete(); files.remove(uri); throw error }
        }
        override fun delete(uri: String, tree: String) {
            validate(tree); deletions++
            check(deletions != failDelete) { "cache_storage_unavailable" }
            files.remove(uri)?.delete()
            afterDelete?.invoke()
        }
    }
    private class Fixture : AutoCloseable {
        val root = Files.createTempDirectory("song-cache-音乐-").toFile()
        val documents = Documents(Files.createTempDirectory("song-cache-public-").toFile())
        val closed = CountDownLatch(1)
        val slowStarted = CountDownLatch(1)
        val requests = AtomicInteger()
        val server = ServerSocket(0, 40, InetAddress.getByName("127.0.0.1"))
        var store = SongCacheStore(root, documents) { OkHttpClient() }
        val url: String get() = "http://127.0.0.1:${server.localPort}"
        init {
            Thread {
                while (!server.isClosed) {
                    val socket = try { server.accept() } catch (_: Exception) { break }
                    Thread {
                        socket.use {
                            val reader = it.getInputStream().bufferedReader()
                            val path = reader.readLine()
                            while (!reader.readLine().isNullOrEmpty()) { /* Read complete GET headers. */ }
                            requests.incrementAndGet()
                            val output = it.getOutputStream()
                            val mediaType = if (path.contains("/playlist")) "application/vnd.apple.mpegurl" else "audio/mpeg"
                            if (path.contains("/slow")) {
                                output.write("HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".toByteArray())
                                slowStarted.countDown()
                                try {
                                    repeat(500) {
                                        output.write("800\r\n".toByteArray()); output.write(ByteArray(2048))
                                        output.write("\r\n".toByteArray()); output.flush(); Thread.sleep(10)
                                    }
                                    output.write("0\r\n\r\n".toByteArray())
                                } catch (_: Exception) { closed.countDown() }
                            } else {
                                output.write("HTTP/1.1 200 OK\r\nContent-Type: $mediaType\r\nContent-Length: 40\r\nConnection: close\r\n\r\n".toByteArray())
                                output.write(ByteArray(40) { it.toByte() })
                            }
                        }
                    }.apply { isDaemon = true; start() }
                }
            }.apply { isDaemon = true; start() }
        }
        fun namespace(server: String = "http://one", username: String = "用户"): String = JSONArray(listOf("default", server, username)).toString()
        fun request(id: String, ns: String = namespace(), track: String = "default", maximum: Long = 10000, slow: Boolean = false): JSONObject {
            val key = JSONArray(listOf(ns, "7", track, "original", "0", "2026-10-07", "flac")).toString()
            return JSONObject().put("task_id", id).put("namespace", ns).put("key", key).put("url", url + if (slow) "/slow?access_token=secret" else "/body?access_token=secret")
                .put("max_bytes", maximum).put("snapshot", JSONObject().put("id", 7).put("type", "local").put("title", "音乐")
                    .put("duration", 123).put("url", "https://private?token=secret").put("extra", "secret"))
        }
        fun start(request: JSONObject): CompletableFuture<JSONObject> {
            val future = CompletableFuture<JSONObject>()
            store.cacheEntry(request.toString(), {}, { future.complete(it) })
            return future
        }
        fun cache(request: JSONObject): JSONObject = start(request).get(6, TimeUnit.SECONDS)
        fun list(ns: String = namespace()): JSONObject = store.listEntries(JSONObject().put("namespace", ns).toString())
        fun publicList(ns: String = namespace()): JSONObject = store.listEntries(JSONObject().put("namespace", ns).put("storage_version", 1).toString())
        fun setDirectory(tree: String? = "content://com.android.externalstorage.documents/tree/primary%3AMusic"): JSONObject = await { store.setDirectory(tree, tree, it) }
        fun migrate(ns: String = namespace(), id: String = "move"): JSONObject = await {
            store.migrate(JSONObject().put("namespace", ns).put("task_id", id).toString(), {}, it)
        }
        fun restart() { store.close(); store = SongCacheStore(root, documents) { OkHttpClient() } }
        fun await(run: ((JSONObject) -> Unit) -> Unit): JSONObject {
            val future = CompletableFuture<JSONObject>(); run { future.complete(it) }; return future.get(6, TimeUnit.SECONDS)
        }
        override fun close() { store.close(); server.close(); root.deleteRecursively(); documents.folder.deleteRecursively() }
    }
    @Test fun namespaceVariantAndActualFormatAreIsolatedAndSnapshotHasNoSecrets() {
        Fixture().use { f ->
            val first = f.request("first")
            val result = f.cache(first)
            assertTrue(result.getBoolean("cached"))
            assertTrue(result.getString("url").startsWith("file:///"))
            assertTrue(File(URI(result.getString("url"))).name.endsWith(".mp3"))
            assertEquals("mp3", JSONArray(result.getString("key")).getString(6))
            assertEquals("音乐", result.getJSONObject("snapshot").getString("title"))
            assertEquals(40, File(URI(result.getString("url"))).length())
            f.cache(f.request("second", f.namespace("http://two")))
            f.cache(f.request("third", f.namespace(username = "另一用户")))
            f.cache(f.request("track", track = "2"))
            assertEquals(2, f.list().getInt("total"))
            assertEquals(1, f.list(f.namespace("http://two")).getInt("total"))
            assertEquals(160, f.store.size())
            val hits = f.requests.get()
            f.cache(f.request("repeat"))
            assertEquals(hits, f.requests.get())
            val persisted = f.root.walkTopDown().filter { it.extension == "json" }.joinToString { it.readText() }
            assertFalse(persisted.contains("secret"))
            assertFalse(persisted.contains("access_token"))
        }
    }
    @Test fun legacyAndIndexedDownloadsShareTheTotalByteCap() {
        Fixture().use { f ->
            val legacy = f.await { callback -> f.store.legacyDownload("12", f.url + "/body", "mp3", 70.0, callback) }
            assertFalse(legacy.has("error"))
            assertEquals(40, f.store.size())
            assertEquals("limit_exceeded", f.cache(f.request("limited", maximum = 70)).getString("error"))
            assertEquals(0, f.list().getInt("total"))
            assertEquals(40, f.list().getLong("legacy_bytes"))
            assertEquals(0, File(f.root, "staging").listFiles()!!.size)
            assertTrue(f.store.legacyInfo("12").getBoolean("cached"))
            assertFalse(f.store.legacyInfo("1").getBoolean("cached"))
        }
    }
    @Test fun cancellationStopsRealSocketAndCleansPartialWithoutCommit() {
        Fixture().use { f ->
            val current = f.start(f.request("slow", maximum = 2000000, slow = true))
            assertTrue(f.slowStarted.await(3, TimeUnit.SECONDS))
            f.store.cancel("slow")
            assertEquals("cancelled", current.get(3, TimeUnit.SECONDS).getString("error"))
            assertTrue(f.closed.await(3, TimeUnit.SECONDS))
            assertEquals(0, f.store.size())
            assertEquals(0, File(f.root, "staging").listFiles()!!.size)
            val task = f.store.getTasks().getJSONArray("tasks").getJSONObject(0)
            assertEquals("cancelled", task.getString("status"))
            f.store.cancel("queued")
            val count = f.requests.get()
            assertEquals("cancelled", f.cache(f.request("queued")).getString("error"))
            assertEquals(count, f.requests.get())
        }
    }
    @Test fun restartMarksInterruptedJobsAndRejectsMissingMedia() {
        Fixture().use { f ->
            val entry = f.cache(f.request("completed"))
            f.store.close()
            File(URI(entry.getString("url"))).delete()
            File(f.root, "tasks/interrupted.json").writeText(JSONObject().put("task_id", "interrupted").put("status", "downloading").toString())
            File(f.root, "staging/interrupted").mkdir()
            File(f.root, "staging/interrupted/media.part").writeBytes(ByteArray(9))
            File(f.root, "7.mp3.part").writeBytes(ByteArray(9))
            f.store = SongCacheStore(f.root) { OkHttpClient() }
            assertEquals(0, f.list().getInt("total"))
            assertEquals(0, File(f.root, "staging").listFiles()!!.size)
            assertFalse(File(f.root, "7.mp3.part").exists())
            val interrupted = f.store.getTasks().getJSONArray("tasks").let { values ->
                (0 until values.length()).map { values.getJSONObject(it) }.first { it.getString("task_id") == "interrupted" }
            }
            assertEquals("interrupted", interrupted.getString("status"))
        }
    }
    @Test fun identityClearPreservesOtherServersAndLegacyClearPreservesIndexed() {
        Fixture().use { f ->
            val other = f.namespace("http://two")
            f.cache(f.request("one")); f.cache(f.request("two", other))
            File(f.root, "88.mp3").writeBytes(ByteArray(40))
            f.await { f.store.clearNamespace(f.namespace(), it) }
            assertEquals(0, f.list().getInt("total"))
            assertEquals(1, f.list(other).getInt("total"))
            assertEquals(80, f.store.size())
            f.await { f.store.clearLegacy(it) }
            assertEquals(40, f.store.size())
            assertEquals(1, f.list(other).getInt("total"))
        }
    }
    @Test fun malformedIdentityAndSnapshotNeverCreatePathsOrNetworkCalls() {
        Fixture().use { f ->
            val traversal = f.request("../escape")
            assertEquals("invalid_cache_request", f.cache(traversal).getString("error"))
            val malformed = f.request("bad").put("namespace", f.namespace("https://user:pass@one"))
            assertTrue(f.cache(malformed).has("error"))
            val radio = f.request("radio"); radio.getJSONObject("snapshot").put("type", "radio")
            assertEquals("invalid_cache_request", f.cache(radio).getString("error"))
            assertEquals(0, f.requests.get())
        }
    }
    @Test fun boundedQueueCancelsWaitingJobsWithoutOpeningTheirConnections() {
        Fixture().use { f ->
            val running = f.start(f.request("q0", slow = true, maximum = 2000000))
            assertTrue(f.slowStarted.await(3, TimeUnit.SECONDS))
            val waiting = (1..31).map { index -> f.start(f.request("q$index", track = index.toString())) }
            assertEquals("cache_queue_full", f.cache(f.request("overflow", track = "99")).getString("error"))
            (1..31).forEach { f.store.cancel("q$it") }
            f.store.cancel("q0")
            assertEquals("cancelled", running.get(3, TimeUnit.SECONDS).getString("error"))
            waiting.forEach { assertEquals("cancelled", it.get(3, TimeUnit.SECONDS).getString("error")) }
            assertEquals(1, f.requests.get())
            assertEquals(0, f.store.size())
        }
    }
    @Test fun hlsPlaylistIsNotCommittedAsProgressiveAudio() {
        Fixture().use { f ->
            val request = f.request("playlist").put("url", f.url + "/playlist")
            assertEquals("unsupported_media", f.cache(request).getString("error"))
            assertEquals(0, f.store.size())
            assertEquals(0, f.list().getInt("total"))
            assertEquals(0, File(f.root, "staging").listFiles()!!.size)
        }
    }
    @Test fun directorySelectionChangesOnlyNewOptedInCachesAndKeepsMetadataPrivate() {
        Fixture().use { f ->
            val original = f.cache(f.request("private"))
            assertTrue(f.setDirectory().getBoolean("saved"))
            assertEquals(original.getString("url"), f.list().getJSONArray("entries").getJSONObject(0).getString("url"))
            val request = f.request("public", track = "1").put("storage_version", 1)
            request.getJSONObject("snapshot").put("title", "音乐 / <标题>").put("artist", "歌手")
            val cached = f.cache(request)
            assertTrue(cached.getString("url").startsWith("content://"))
            assertArrayEquals(ByteArray(40) { it.toByte() }, f.documents.files[cached.getString("url")]!!.readBytes())
            assertTrue(f.documents.files.values.single().name.contains("音乐 _ _标题_"))
            assertEquals(1, f.list().getInt("total"))
            assertEquals(2, f.publicList().getInt("total"))
            assertEquals(80, f.store.size())
            val metadata = File(f.root, "public-v1").walkTopDown().filter { it.isFile }.single().readText()
            assertFalse(metadata.contains("access_token")); assertFalse(metadata.contains("secret"))
            assertEquals(0, File(f.root, "staging").listFiles()!!.size)
            f.cache(f.request("old-bundle", track = "2"))
            assertEquals(2, f.list().getInt("total")) // An old bundle still writes private media.
            f.restart()
            assertEquals(3, f.publicList().getInt("total"))
        }
    }
    @Test fun migrationAndRestorePreserveExactVariantsAndOtherAccounts() {
        Fixture().use { f ->
            val old = f.cache(f.request("one"))
            f.cache(f.request("two", track = "1"))
            val other = f.namespace(username = "other")
            f.cache(f.request("other", ns = other))
            f.setDirectory()
            assertEquals(2, f.migrate().getInt("done"))
            assertFalse(File(URI(old.getString("url"))).exists())
            assertEquals(0, f.list().getInt("total"))
            assertEquals(2, f.publicList().getInt("total"))
            assertEquals(1, f.list(other).getInt("total"))
            f.restart()
            assertEquals(2, f.publicList().getInt("total"))
            f.setDirectory(null)
            assertEquals(2, f.migrate(id = "restore").getInt("done"))
            assertEquals(0, f.documents.files.size)
            assertEquals(2, f.list().getInt("total"))
            f.restart()
            assertTrue(f.store.directoryInfo().isNull("tree"))
            assertEquals(120, f.store.size())
        }
    }
    @Test fun storageAwareDeletionAlsoRemovesTheDuplicateWrittenByAnOldBundle() {
        Fixture().use { f ->
            f.setDirectory()
            f.cache(f.request("public").put("storage_version", 1))
            f.cache(f.request("private"))
            assertEquals(80, f.store.size())
            assertEquals(1, f.publicList().getInt("total"))
            assertFalse(f.await { f.store.clearNamespace(f.namespace(), it, true) }.has("error"))
            f.restart()
            assertEquals(0, f.store.size()); assertEquals(0, f.publicList().getInt("total"))
            assertEquals(0, f.documents.files.size)
        }
    }
    @Test fun failedOriginalDeletionRemainsTrackedAcrossRestartAndRetry() {
        Fixture().use { f ->
            f.setDirectory(); val original = f.cache(f.request("public").put("storage_version", 1))
            val originalFile = f.documents.files[original.getString("url")]!!
            f.setDirectory("content://com.android.externalstorage.documents/tree/SD%3AMusic")
            f.documents.failDelete = 1
            assertEquals("cache_storage_unavailable", f.migrate().getString("error"))
            assertTrue(originalFile.isFile)
            f.restart()
            assertEquals(80, f.store.size())
            val current = f.publicList().getJSONArray("entries").getJSONObject(0)
            assertNotEquals(original.getString("url"), current.getString("url"))
            assertFalse(current.has("pending_cleanup"))
            assertEquals("limit_exceeded", f.cache(f.request("limited", track = "3", maximum = 100).put("storage_version", 1)).getString("error"))
            f.documents.failDelete = null
            assertEquals(1, f.migrate(id = "retry").getInt("done"))
            assertFalse(originalFile.exists()); assertEquals(1, f.documents.files.size)
            assertEquals(2, f.documents.copies); assertEquals(40, f.store.size())
        }
    }
    @Test fun failedOriginalDeletionDuringRestoreKeepsPrivatePlaybackAndCanResume() {
        Fixture().use { f ->
            f.setDirectory(); f.cache(f.request("public").put("storage_version", 1))
            f.setDirectory(null); f.documents.failDelete = 1
            assertEquals("cache_storage_unavailable", f.migrate().getString("error"))
            f.documents.unavailable = true; f.restart()
            val current = f.publicList().getJSONArray("entries").getJSONObject(0)
            assertTrue(current.getString("url").startsWith("file:///")); assertTrue(current.getBoolean("available"))
            assertEquals(80, f.store.size())
            assertTrue(f.await { f.store.clearNamespace(f.namespace(), it, true) }.has("error"))
            assertTrue(File(URI(current.getString("url"))).isFile)
            f.documents.unavailable = false; f.documents.failDelete = null
            assertEquals(1, f.migrate(id = "retry").getInt("done"))
            assertEquals(0, f.documents.files.size); assertEquals(40, f.store.size())
            f.restart(); assertEquals(1, f.list().getInt("total"))
        }
    }
    @Test fun restoringDefaultReplacesAnOldBundlePrivateDuplicateWithTheCompleteSelectedSource() {
        Fixture().use { f ->
            f.setDirectory(); f.cache(f.request("public").put("storage_version", 1))
            val oldPrivate = f.cache(f.request("old-bundle"))
            File(URI(oldPrivate.getString("url"))).writeBytes(ByteArray(40) { 99 })
            f.setDirectory(null)
            assertEquals(1, f.migrate().getInt("done"))
            assertArrayEquals(ByteArray(40) { it.toByte() }, File(URI(oldPrivate.getString("url"))).readBytes())
            assertEquals(0, f.documents.files.size); assertEquals(40, f.store.size())
            f.restart(); assertEquals(1, f.publicList().getInt("total"))
        }
    }
    @Test fun cleanupMetadataFailureRetriesWithoutRecopyingOrRemovingTheCommittedMedia() {
        Fixture().use { f ->
            f.setDirectory(); val original = f.cache(f.request("public").put("storage_version", 1))
            f.setDirectory("content://com.android.externalstorage.documents/tree/SD%3AMusic")
            val record = File(f.root, "public-v1").walkTopDown().first { it.isFile && it.extension == "json" }
            val blocker = File(record.parentFile, record.name + ".part")
            f.documents.afterDelete = { blocker.mkdirs(); File(blocker, "deny").writeText("block") }
            assertTrue(f.migrate().has("error"))
            assertFalse(f.documents.files.containsKey(original.getString("url")))
            f.documents.afterDelete = null; blocker.deleteRecursively(); f.restart()
            val current = f.publicList().getJSONArray("entries").getJSONObject(0)
            assertTrue(current.getBoolean("available"))
            assertEquals(1, f.migrate(id = "retry").getInt("done"))
            assertEquals(2, f.documents.copies); assertEquals(1, f.documents.files.size)
            assertEquals(40, f.store.size()); assertFalse(JSONObject(record.readText()).has("pending_cleanup"))
        }
    }
    @Test fun missingReplacementCannotDeleteTheOriginalAndStillAllowsLocalPlaybackOrExplicitClearing() {
        Fixture().use { f ->
            f.setDirectory(); val original = f.cache(f.request("public").put("storage_version", 1))
            f.setDirectory("content://com.android.externalstorage.documents/tree/SD%3AMusic")
            f.documents.failDelete = 1
            assertTrue(f.migrate().has("error"))
            val moved = f.publicList().getJSONArray("entries").getJSONObject(0)
            f.documents.files.remove(moved.getString("url"))!!.delete()
            f.documents.failDelete = null; f.restart()
            assertEquals("cache_storage_unavailable", f.migrate(id = "retry").getString("error"))
            val current = f.publicList().getJSONArray("entries").getJSONObject(0)
            assertTrue(current.getBoolean("available")); assertEquals(original.getString("url"), current.getString("url"))
            assertTrue(f.documents.files[original.getString("url")]!!.isFile)
            assertFalse(f.await { f.store.clearNamespace(f.namespace(), it, true) }.has("error"))
            assertEquals(0, f.documents.files.size); assertEquals(0, f.store.size())
        }
    }
    @Test fun partialMigrationFailureKeepsRemainingOriginalsAndCompletedIndex() {
        Fixture().use { f ->
            val one = f.cache(f.request("one")); val two = f.cache(f.request("two", track = "1"))
            f.setDirectory(); f.documents.failCopy = 2
            val result = f.migrate()
            assertEquals("cache_storage_unavailable", result.getString("error"))
            assertEquals(1, result.getInt("done"))
            assertFalse(File(URI(one.getString("url"))).exists())
            assertTrue(File(URI(two.getString("url"))).exists())
            f.restart()
            assertEquals(1, f.list().getInt("total"))
            assertEquals(2, f.publicList().getInt("total"))
        }
    }
    @Test fun cancelAfterCopyBeforeIndexCommitRollsBackOnlyTheNewDocument() {
        Fixture().use { f ->
            val original = f.cache(f.request("one")); f.setDirectory()
            f.documents.afterCopy = { f.store.cancel("move") }
            assertEquals("cancelled", f.migrate().getString("error"))
            assertTrue(File(URI(original.getString("url"))).exists())
            assertEquals(0, f.documents.files.size)
            f.restart()
            assertEquals(1, f.list().getInt("total"))
            assertEquals(1, f.publicList().getInt("total"))
        }
    }
    @Test fun failedPublicIndexWriteDoesNotDeleteTheOriginal() {
        Fixture().use { f ->
            val original = f.cache(f.request("one")); f.setDirectory()
            fun hash(value: String) = java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }
            val record = File(File(File(f.root, "public-v1"), hash(f.namespace())), hash(original.getString("key")) + ".json.part")
            assertTrue(record.mkdirs())
            assertTrue(f.migrate().has("error"))
            assertTrue(File(URI(original.getString("url"))).exists())
            assertEquals(0, f.documents.files.size)
            assertEquals(1, f.list().getInt("total"))
        }
    }
    @Test fun revokedOrUnmountedDirectoryRetainsRecordsAcrossRestartAndFailedClear() {
        Fixture().use { f ->
            f.setDirectory(); val cached = f.cache(f.request("one").put("storage_version", 1))
            f.documents.unavailable = true; f.restart()
            val entries = f.publicList().getJSONArray("entries")
            assertEquals(1, entries.length()); assertFalse(entries.getJSONObject(0).getBoolean("available"))
            assertEquals(40, f.store.size())
            assertEquals("cache_storage_unavailable", f.await { f.store.clearNamespace(f.namespace(), it, true) }.getString("error"))
            assertEquals(1, f.documents.files.size)
            f.documents.unavailable = false
            assertTrue(f.store.getEntry(JSONObject().put("namespace", f.namespace()).put("key", cached.getString("key")).put("storage_version", 1).toString()).getBoolean("cached"))
        }
    }
    @Test fun clearingAnAccountOnlyDeletesIndexedDocumentsAndCommitsPartialSuccess() {
        Fixture().use { f ->
            f.setDirectory(); f.cache(f.request("one").put("storage_version", 1)); f.cache(f.request("two", track = "1").put("storage_version", 1))
            val other = f.namespace(username = "other"); f.cache(f.request("other", ns = other).put("storage_version", 1))
            val unrelated = File(f.documents.folder, "personal.mp3").apply { writeText("keep") }
            f.documents.failDelete = 2
            assertTrue(f.await { f.store.clearNamespace(f.namespace(), it, true) }.has("error"))
            f.restart()
            assertEquals(1, f.publicList().getInt("total")); assertEquals(1, f.publicList(other).getInt("total"))
            assertTrue(unrelated.exists())
            f.await { f.store.clearAll(it) } // Old ABI cannot recursively erase public metadata/media.
            assertEquals(2, f.documents.files.size); assertEquals(1, f.publicList().getInt("total"))
        }
    }
    @Test fun activeDownloadBlocksDirectoryChangeAndMigration() {
        Fixture().use { f ->
            val task = f.start(f.request("slow", slow = true, maximum = 2000000))
            assertTrue(f.slowStarted.await(3, TimeUnit.SECONDS))
            assertEquals("cache_busy", f.setDirectory().getString("error"))
            assertEquals("cache_busy", f.migrate().getString("error"))
            f.store.cancel("slow"); assertEquals("cancelled", task.get(3, TimeUnit.SECONDS).getString("error"))
            assertTrue(f.store.directoryInfo().isNull("tree"))
        }
    }
    @Test fun invalidDirectoryOrDamagedSourceNeverReplacesPreferenceOrDeletesMedia() {
        Fixture().use { f ->
            val original = f.cache(f.request("one")); f.setDirectory()
            val tree = f.store.directoryInfo().getString("tree")
            f.documents.unavailable = true
            assertTrue(f.setDirectory("content://com.android.externalstorage.documents/tree/SD%3AMusic").has("error"))
            assertEquals(tree, f.store.directoryInfo().getString("tree"))
            f.documents.unavailable = false
            val file = File(URI(original.getString("url"))).apply { writeBytes(byteArrayOf(1)) }
            assertTrue(f.migrate().has("error")); assertTrue(file.exists())
            assertEquals(0, f.documents.files.size)
        }
    }
}
