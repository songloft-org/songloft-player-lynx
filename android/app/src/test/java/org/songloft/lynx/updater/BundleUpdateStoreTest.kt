package org.songloft.lynx.updater

import okhttp3.OkHttpClient
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import javax.net.ssl.SSLServerSocket

class BundleUpdateStoreTest {
    private class Fixture : AutoCloseable {
        val root = Files.createTempDirectory("songloft-updater-test-").toFile()
        val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val host = JSONObject(File("../../updates/fixtures/signature-v1.json").readText()).getJSONObject("native_host")
            .put("platform", "android").put("build_time", "2026-10-01T00:00:00.000Z").put("git_commit", "1234567")
        val data = ByteArray(256 * 1024) { (it % 253).toByte() }
        val manifest = JSONObject(File("../../updates/fixtures/signature-v1.json").readText().let { JSONObject(it).getString("raw_manifest") })
        init {
            host.put("trusted_keys", JSONArray().put(JSONObject()
                .put("key_id", "test-key").put("key_bits", 2048).put("algorithm", "rsa-pkcs1v15-sha256")
                .put("spki_base64", pair.public.encoded.toByteString().base64())))
            manifest.put("build_time", "2026-10-06T00:00:00.000Z")
            val bundle = manifest.getJSONObject("bundle_update")
            bundle.put("size", data.size).put("sha256", MessageDigest.getInstance("SHA-256").digest(data).toByteString().hex())
            manifest.put("assets", JSONArray().put(JSONObject().put("name", bundle.getString("asset"))
                .put("size", data.size).put("sha256", bundle.getString("sha256"))))
        }
        fun envelope(raw: String = manifest.toString()): String {
            val signer = Signature.getInstance("SHA256withRSA")
            signer.initSign(pair.private); signer.update(raw.toByteArray(Charsets.UTF_8))
            return JSONObject().put("protocol", 1).put("key_id", "test-key")
                .put("algorithm", "rsa-pkcs1v15-sha256").put("signature", signer.sign().toByteString().base64()).toString()
        }
        fun store(client: OkHttpClient = OkHttpClient()) = BundleUpdateStore(root, host, client)
        override fun close() { root.deleteRecursively() }
    }

    /** A real local TLS endpoint; only the injected test client trusts its certificate. */
    private class Server(private val directory: File, private val data: ByteArray, private val slow: Boolean = false,
        private val status: Int = 200, private val location: String? = null,
        private val observe: (List<String>) -> Unit = {}) : AutoCloseable {
        private val executor = Executors.newCachedThreadPool()
        private val server: SSLServerSocket
        val client: OkHttpClient
        val url: String
        init {
            val keyFile = File(directory, "tls-test.p12")
            val command = listOf(File(System.getProperty("java.home"), "bin/keytool").path,
                "-genkeypair", "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-validity", "1",
                "-dname", "CN=localhost", "-ext", "SAN=ip:127.0.0.1", "-storetype", "PKCS12",
                "-keystore", keyFile.path, "-storepass", "test-only", "-keypass", "test-only", "-noprompt")
            val process = ProcessBuilder(command).redirectErrorStream(true).start()
            process.inputStream.readBytes()
            check(process.waitFor() == 0)
            val keys = KeyStore.getInstance("PKCS12").apply { keyFile.inputStream().use { load(it, "test-only".toCharArray()) } }
            val managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(keys, "test-only".toCharArray()) }
            val trusts = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keys) }
            val ssl = SSLContext.getInstance("TLS").apply { init(managers.keyManagers, trusts.trustManagers, null) }
            server = ssl.serverSocketFactory.createServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1")) as SSLServerSocket
            executor.execute {
                while (!server.isClosed) {
                    val socket = try { server.accept() } catch (_: Exception) { break }
                    executor.execute {
                        socket.use {
                            try {
                                val input = socket.getInputStream().bufferedReader()
                                val headers = mutableListOf<String>()
                                while (true) { val line = input.readLine() ?: break; if (line.isEmpty()) break; headers.add(line) }
                                observe(headers)
                                val output = socket.getOutputStream()
                                val redirect = location?.let { "Location: $it\r\n" } ?: ""
                                output.write("HTTP/1.1 $status OK\r\n${redirect}Content-Length: ${data.size}\r\nConnection: close\r\n\r\n".toByteArray())
                                for (offset in data.indices step 4096) {
                                    output.write(data, offset, minOf(4096, data.size - offset)); output.flush()
                                    if (slow) Thread.sleep(25)
                                }
                            } catch (_: Exception) { /* TLS refusal/cancel closes the socket. */ }
                        }
                    }
                }
            }
            url = "https://127.0.0.1:${server.localPort}/bundle"
            client = OkHttpClient.Builder().sslSocketFactory(ssl.socketFactory, trusts.trustManagers[0] as X509TrustManager).build()
        }
        override fun close() { server.close(); executor.shutdownNow(); client.connectionPool.evictAll(); client.dispatcher.executorService.shutdownNow() }
    }

    private fun fails(message: String, action: () -> Unit) {
        try { action(); fail("Expected $message") } catch (error: Exception) { assertEquals(message, error.message) }
    }

    @Test fun metadataUsesSystemTLSBoundedUTF8AndNoCredentials() {
        Fixture().use { fixture ->
            val text = "{\"说明\":\"开发版\"}"
            var observed: List<String> = emptyList()
            Server(fixture.root, text.toByteArray(), observe = { observed = it }).use { server ->
                val request = JSONObject().put("url", server.url).put("max_bytes", 1024)
                try { UpdateMetadata().fetch(request); fail("Self-signed certificate must fail") } catch (_: javax.net.ssl.SSLException) {}
                val result = UpdateMetadata(server.client).fetch(request)
                assertEquals(text, result.getString("body"))
                assertEquals(200, result.getInt("status"))
                assertTrue(observed.none { it.startsWith("Authorization:", true) || it.startsWith("Cookie:", true) })
                fails("metadata_too_large") { UpdateMetadata(server.client).fetch(JSONObject(request.toString()).put("max_bytes", 1)) }
                fails("invalid_metadata_request") { UpdateMetadata(server.client).fetch(JSONObject(request.toString()).put("max_bytes", 1.5)) }
                fails("invalid_update_url") { UpdateMetadata(server.client).fetch(JSONObject(request.toString()).put("url", "https://user:pass@example.com")) }
            }
        }
    }

    @Test fun metadataReportsHTTPStatusAndRejectsDowngradeRedirect() {
        Fixture().use { fixture ->
            Server(fixture.root, "missing".toByteArray(), status = 404).use { server ->
                val result = UpdateMetadata(server.client).fetch(JSONObject().put("url", server.url).put("max_bytes", 1024))
                assertEquals(404, result.getInt("status")); assertEquals("missing", result.getString("body"))
            }
            File(fixture.root, "tls-test.p12").delete()
            Server(fixture.root, ByteArray(0), status = 302, location = "http://127.0.0.1/bundle").use { server ->
                fails("invalid_update_url") { UpdateMetadata(server.client).fetch(JSONObject().put("url", server.url).put("max_bytes", 1024)) }
            }
        }
    }

    @Test fun sharedSignatureVectorIsAcceptedAndByteTamperingRejected() {
        val vector = JSONObject(File("../../updates/fixtures/signature-v1.json").readText())
        val root = Files.createTempDirectory("updater-vector-").toFile()
        try {
            val store = BundleUpdateStore(root, vector.getJSONObject("native_host").put("platform", "android"))
            val raw = vector.getString("raw_manifest")
            val signature = vector.getJSONObject("envelope").toString()
            assertEquals("dev", store.inspect(raw, signature).getString("channel"))
            fails("invalid_signature") { store.inspect(raw + " ", signature) }
            fails("unknown_signing_key") { store.inspect(raw, JSONObject(signature).put("key_id", "other").toString()) }
        } finally { root.deleteRecursively() }
    }

    @Test fun incompatibleTargetsAndChannelsAreRejectedEvenWithValidSignatures() {
        Fixture().use { fixture ->
            val store = fixture.store()
            fun changed(error: String, mutate: (JSONObject) -> Unit) {
                val manifest = JSONObject(fixture.manifest.toString()); mutate(manifest)
                val raw = manifest.toString()
                fails(error) { store.inspect(raw, fixture.envelope(raw)) }
            }
            changed("incompatible_channel") { it.put("channel", "stable") }
            changed("incompatible_engine") { it.getJSONObject("bundle_update").getJSONArray("targets").getJSONObject(0).put("engine", "9.0.0") }
            changed("incompatible_bridge") { it.getJSONObject("bundle_update").getJSONArray("targets").getJSONObject(0).put("minimum_bridge", 2).put("maximum_bridge", 2) }
            changed("incompatible_schema") { it.getJSONObject("bundle_update").put("local_schema", 9) }
            changed("incompatible_capability") { it.getJSONObject("bundle_update").getJSONArray("targets").getJSONObject(0).put("required_capabilities", JSONArray().put("unknown")) }
            changed("invalid_manifest") { it.put("build_number", -1) }
            changed("invalid_manifest") { it.getJSONArray("assets").getJSONObject(0).put("name", "../bundle") }
        }
    }

    @Test fun pluginTemplateCapabilityRequiresANewShellWithoutChangingBridgeOrSchema() {
        Fixture().use { fixture ->
            fixture.host.put("bridge_version", 3).put("local_schema", 2)
            fixture.manifest.getJSONObject("bundle_update").put("local_schema", 2)
            val legacyTargets = fixture.manifest.getJSONObject("bundle_update").getJSONArray("targets")
            for (index in 0 until legacyTargets.length()) {
                legacyTargets.getJSONObject(index).put("minimum_bridge", 3).put("maximum_bridge", 3)
            }
            val oldHost = JSONObject(fixture.host.toString())
            val oldStore = BundleUpdateStore(fixture.root, oldHost)
            val legacyRaw = fixture.manifest.toString()
            assertEquals("dev", oldStore.inspect(legacyRaw, fixture.envelope(legacyRaw)).getString("channel"))

            val next = JSONObject(legacyRaw)
            val targets = next.getJSONObject("bundle_update").getJSONArray("targets")
            for (index in 0 until targets.length()) {
                targets.getJSONObject(index).getJSONArray("required_capabilities").put("pluginFrame.templates.v1")
            }
            val raw = next.toString()
            val signature = fixture.envelope(raw)
            fails("incompatible_capability") { oldStore.inspect(raw, signature) }
            assertNull(oldStore.info().optJSONObject("pending"))

            val newHost = JSONObject(oldHost.toString())
            newHost.getJSONArray("capabilities").put("pluginFrame.templates.v1")
            val newStore = BundleUpdateStore(fixture.root, newHost)
            assertEquals(oldHost.getInt("bridge_version"), newHost.getInt("bridge_version"))
            assertEquals(oldHost.getInt("local_schema"), newHost.getInt("local_schema"))
            assertEquals(3, newHost.getInt("bridge_version"))
            assertEquals(2, newHost.getInt("local_schema"))
            assertEquals("dev", newStore.inspect(raw, signature).getString("channel"))
            assertEquals("dev", newStore.inspect(legacyRaw, fixture.envelope(legacyRaw)).getString("channel"))
            fails("incompatible_capability") { oldStore.inspect(raw, signature) }
        }
    }

    @Test fun realDownloadActivatesOnlyOnColdStartAndConfirmationPersists() {
        Fixture().use { fixture -> Server(fixture.root, fixture.data).use { server ->
            val first = fixture.store(server.client)
            assertNull(first.beginLaunch())
            var bytes = 0L
            val result = first.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "download-1") { count, total ->
                assertTrue(count >= bytes && count <= total); bytes = count
            }
            assertTrue(result.getBoolean("prepared")); assertEquals(fixture.data.size.toLong(), bytes)
            assertEquals("builtin", first.info().getJSONObject("running").getString("kind"))
            assertNotNull(first.info().optJSONObject("pending"))
            val second = fixture.store(server.client)
            assertArrayEquals(fixture.data, second.beginLaunch())
            assertEquals("trial", second.info().getJSONObject("running").getString("kind"))
            second.confirmStartup("wrong-id")
            assertEquals("trial", second.info().getJSONObject("running").getString("kind"))
            second.confirmStartup(result.getString("bundle_id"))
            val third = fixture.store(server.client)
            assertArrayEquals(fixture.data, third.beginLaunch())
            assertEquals("active", third.info().getJSONObject("running").getString("kind"))
            third.restoreBuiltin()
            assertArrayEquals(fixture.data, third.beginLaunch()) // No live replacement.
            assertNull(fixture.store(server.client).beginLaunch())
        } }
    }

    @Test fun missingOrFailedStartupConfirmationRollsBackNextColdStart() {
        Fixture().use { fixture -> Server(fixture.root, fixture.data).use { server ->
            val first = fixture.store(server.client)
            first.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "trial-1") { _, _ -> }
            val trial = fixture.store(server.client)
            assertNotNull(trial.beginLaunch()); trial.failStartup()
            trial.confirmStartup(fixture.manifest.getJSONObject("bundle_update").getString("bundle_id"))
            val restored = fixture.store(server.client)
            assertNull(restored.beginLaunch())
            assertEquals("rollback_unconfirmed", restored.info().getString("last_error"))
            assertTrue(File(fixture.root, "bundles").listFiles()!!.isEmpty())
        } }
    }

    @Test fun corruptDownloadNeverBecomesPendingAndDeletesPartialFile() {
        Fixture().use { fixture -> Server(fixture.root, ByteArray(fixture.data.size)).use { server ->
            val store = fixture.store(server.client)
            fails("checksum_mismatch") { store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "bad-1") { _, _ -> } }
            assertNull(store.info().optJSONObject("pending"))
            assertFalse(fixture.root.listFiles()!!.any { it.name.startsWith("download-") })
            assertTrue(File(fixture.root, "bundles").listFiles()!!.isEmpty())
        } }
    }

    @Test fun cancellationStopsActualTransferAndCleansUp() {
        Fixture().use { fixture -> Server(fixture.root, fixture.data, true).use { server ->
            val store = fixture.store(server.client)
            val started = CountDownLatch(1)
            val executor = Executors.newSingleThreadExecutor()
            try {
                val result = executor.submit<String> {
                    try { store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "cancel-1") { bytes, _ -> if (bytes > 0) started.countDown() }; "unexpected" }
                    catch (error: Exception) { error.message ?: "unknown" }
                }
                assertTrue(started.await(10, TimeUnit.SECONDS))
                store.cancel("another-task") // Wrong task cannot cancel the live transfer.
                assertNotNull(store.info().optJSONObject("download"))
                store.cancel("cancel-1")
                assertEquals("cancelled", result.get(10, TimeUnit.SECONDS))
                assertNull(store.info().optJSONObject("pending"))
                assertNull(store.info().optJSONObject("download"))
                assertFalse(fixture.root.listFiles()!!.any { it.name.startsWith("download-") })
            } finally { executor.shutdownNow() }
        } }
    }

    @Test fun defaultClientRejectsUntrustedTLSAndPlainHttp() {
        Fixture().use { fixture -> Server(fixture.root, fixture.data).use { server ->
            val store = fixture.store()
            fails("download_failed") {
                store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "tls-1") { _, _ -> }
            }
            fails("invalid_update_url") { store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url.replace("https:", "http:"), "tls-2") { _, _ -> } }
            fails("invalid_update_url") { store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url + "?access_token=ignored", "tls-3") { _, _ -> } }
            assertNull(store.info().optJSONObject("pending"))
        } }
    }

    @Test fun interruptedAndTamperedDiskCandidatesAreNeverLoaded() {
        Fixture().use { fixture -> Server(fixture.root, fixture.data).use { server ->
            val store = fixture.store(server.client)
            store.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "disk-1") { _, _ -> }
            val directory = File(fixture.root, "bundles").listFiles()!!.single()
            File(directory, "main.lynx.bundle").writeBytes(ByteArray(fixture.data.size))
            File(fixture.root, "download-interrupted").mkdir()
            val next = fixture.store(server.client)
            assertNull(next.beginLaunch())
            assertFalse(File(fixture.root, "download-interrupted").exists())
            assertTrue(File(fixture.root, "bundles").listFiles()!!.isEmpty())
        } }
    }

    @Test fun cancelBeforeWorkerStartsCannotLaterPrepareAnUpdate() {
        Fixture().use { fixture ->
            val store = fixture.store()
            store.cancel("queued-1")
            fails("cancelled") { store.prepare(fixture.manifest.toString(), fixture.envelope(), "https://example.com/bundle", "queued-1") { _, _ -> } }
            assertNull(store.info().optJSONObject("download"))
            assertNull(store.info().optJSONObject("pending"))
        }
    }

    @Test fun nativeDownloadEnforcesChannelVersionRulesBeforeNetworking() {
        Fixture().use { fixture ->
            fixture.host.put("git_commit", fixture.manifest.getString("git_commit"))
            fails("update_not_newer") { fixture.store().prepare(fixture.manifest.toString(), fixture.envelope(), "https://example.com/bundle", "same-1") { _, _ -> } }
            fixture.host.put("git_commit", "unknown").put("build_time", "2026-10-05T23:50:01.000Z")
            fails("update_not_newer") { fixture.store().prepare(fixture.manifest.toString(), fixture.envelope(), "https://example.com/bundle", "time-1") { _, _ -> } }
            fixture.host.put("channel", "stable").put("version", "1.10.0").put("release_tag", "v1.10.0")
            fixture.manifest.put("channel", "stable").put("version", "1.9.0").put("release_tag", "v1.9.0")
            fixture.manifest.getJSONObject("bundle_update").put("bundle_id", "stable-${fixture.manifest.getLong("build_number")}-${fixture.manifest.getString("git_commit")}")
            fails("update_not_newer") { fixture.store().prepare(fixture.manifest.toString(), fixture.envelope(), "https://example.com/bundle", "old-1") { _, _ -> } }
        }
    }

    @Test fun unconfirmedSecondUpdateRestoresLastConfirmedBundleAndNewShellDropsOldUpdates() {
        Fixture().use { fixture ->
            Server(fixture.root, fixture.data).use { server ->
                val first = fixture.store(server.client)
                first.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "first-1") { _, _ -> }
                val active = fixture.store(server.client)
                assertArrayEquals(fixture.data, active.beginLaunch())
                active.confirmStartup(fixture.manifest.getJSONObject("bundle_update").getString("bundle_id"))
                fixture.manifest.put("git_commit", "fedcba0").put("build_number", fixture.manifest.getLong("build_number") + 1)
                fixture.manifest.getJSONObject("bundle_update").put("bundle_id", "dev-${fixture.manifest.getLong("build_number")}-fedcba0")
                active.prepare(fixture.manifest.toString(), fixture.envelope(), server.url, "second-1") { _, _ -> }
                val trial = fixture.store(server.client)
                assertArrayEquals(fixture.data, trial.beginLaunch())
                assertEquals("fedcba0", trial.info().getJSONObject("running").getString("git_commit"))
                val restored = fixture.store(server.client)
                assertArrayEquals(fixture.data, restored.beginLaunch())
                assertEquals("abcdef0", restored.info().getJSONObject("running").getString("git_commit"))
                assertEquals("rollback_unconfirmed", restored.info().getString("last_error"))
                fixture.host.put("git_commit", "9999999").put("build_time", "2026-10-07T00:00:00.000Z")
                val newShell = fixture.store(server.client)
                assertNull(newShell.beginLaunch())
                assertEquals("builtin", newShell.info().getJSONObject("running").getString("kind"))
            }
        }
    }
}
