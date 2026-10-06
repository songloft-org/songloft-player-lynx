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
    private class Fixture : AutoCloseable {
        val root = Files.createTempDirectory("song-cache-音乐-").toFile()
        val closed = CountDownLatch(1)
        val slowStarted = CountDownLatch(1)
        val requests = AtomicInteger()
        val server = ServerSocket(0, 40, InetAddress.getByName("127.0.0.1"))
        var store = SongCacheStore(root) { OkHttpClient() }
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
        fun await(run: ((JSONObject) -> Unit) -> Unit): JSONObject {
            val future = CompletableFuture<JSONObject>(); run { future.complete(it) }; return future.get(6, TimeUnit.SECONDS)
        }
        override fun close() { store.close(); server.close(); root.deleteRecursively() }
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
}
