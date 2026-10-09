package org.songloft.lynx.cache

import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream

/** Local SAF documents only. Cloud folders cannot guarantee offline access. */
class AndroidSongCacheDocuments(private val context: Context) : SongCacheDocuments {
    private val resolver = context.contentResolver
    private fun tree(raw: String): Uri {
        val uri = Uri.parse(raw)
        require(uri.scheme == "content" && uri.authority == "com.android.externalstorage.documents" && DocumentsContract.isTreeUri(uri)) { "cache_storage_unavailable" }
        return uri
    }
    private fun document(raw: String): Uri = tree(raw).also {
        require(DocumentsContract.isDocumentUri(context, it)) { "cache_storage_unavailable" }
    }
    private fun root(raw: String): Uri {
        val tree = tree(raw)
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    }
    private fun exists(uri: Uri): Boolean = resolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID), null, null, null).use {
        it != null && it.moveToFirst()
    }
    override fun validate(tree: String) {
        val root = root(tree)
        resolver.query(root, arrayOf(DocumentsContract.Document.COLUMN_MIME_TYPE), null, null, null).use {
            check(it != null && it.moveToFirst() && it.getString(0) == DocumentsContract.Document.MIME_TYPE_DIR) { "cache_storage_unavailable" }
        }
        val probe = DocumentsContract.createDocument(resolver, root, "application/octet-stream", ".songloft-probe-${System.nanoTime()}") ?: error("cache_storage_unavailable")
        try { resolver.openOutputStream(probe, "w").use { requireNotNull(it).write(0) } }
        finally { check(DocumentsContract.deleteDocument(resolver, probe)) { "cache_storage_unavailable" } }
    }
    override fun status(uri: String, tree: String, expected: Long): String = try {
        if (!exists(root(tree))) "unavailable" else {
            try {
                val document = document(uri)
                resolver.query(document, arrayOf(DocumentsContract.Document.COLUMN_SIZE), null, null, null).use {
                    if (it == null || !it.moveToFirst()) "missing"
                    else if (!it.isNull(0) && it.getLong(0) != expected) "unavailable"
                    else { resolver.openFileDescriptor(document, "r").use { fd -> requireNotNull(fd) }; "available" }
                }
            } catch (_: FileNotFoundException) { "missing" }
        }
    } catch (_: Exception) { "unavailable" }
    override fun open(uri: String): InputStream = resolver.openInputStream(document(uri)) ?: error("cache_storage_unavailable")
    override fun copy(input: InputStream, tree: String, name: String, format: String, expected: Long, cancelled: () -> Boolean): String {
        require(!name.contains('/') && !name.contains('\\') && name.isNotBlank()) { "invalid_cache_request" }
        val mime = when (format) {
            "mp3" -> "audio/mpeg"; "m4a" -> "audio/mp4"; "flac" -> "audio/flac"; "aac" -> "audio/aac"
            "ogg", "opus" -> "audio/ogg"; "wav" -> "audio/wav"; "mp4" -> "video/mp4"; "webm" -> "video/webm"
            else -> "application/octet-stream"
        }
        val uri = DocumentsContract.createDocument(resolver, root(tree), mime, name) ?: error("cache_storage_unavailable")
        try {
            resolver.openOutputStream(uri, "w").use { output ->
                requireNotNull(output)
                val buffer = ByteArray(65536); var bytes = 0L
                while (true) {
                    if (cancelled()) error("cancelled")
                    val count = input.read(buffer); if (count < 0) break
                    output.write(buffer, 0, count); bytes += count
                }
                output.flush()
                check(bytes == expected) { "cache_storage_unavailable" }
                if (cancelled()) error("cancelled")
            }
            scan(uri, mime)
            return uri.toString()
        } catch (error: Exception) {
            runCatching { DocumentsContract.deleteDocument(resolver, uri) }
            throw error
        }
    }
    override fun delete(uri: String, tree: String) {
        check(exists(root(tree))) { "cache_storage_unavailable" }
        val document = document(uri)
        if (exists(document)) check(DocumentsContract.deleteDocument(resolver, document)) { "cache_storage_unavailable" }
    }
    private fun scan(uri: Uri, mime: String) {
        // Paths are used only for media discovery. All access uses SAF grants.
        runCatching {
            val parts = DocumentsContract.getDocumentId(uri).split(':', limit = 2)
            if (parts.size != 2) return
            val base = if (parts[0] == "primary") Environment.getExternalStorageDirectory()
            else if (Build.VERSION.SDK_INT >= 30) context.getSystemService(StorageManager::class.java).storageVolumes.firstOrNull { it.uuid.equals(parts[0], true) }?.directory
            else context.getExternalFilesDirs(null).filterNotNull().map { File(it.path.substringBefore("/Android/")) }.firstOrNull { it.name.equals(parts[0], true) }
            if (base != null) MediaScannerConnection.scanFile(context, arrayOf(File(base, parts[1]).path), arrayOf(mime), null)
        }
    }
}
