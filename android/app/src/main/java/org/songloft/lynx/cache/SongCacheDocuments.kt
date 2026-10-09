package org.songloft.lynx.cache

import java.io.InputStream

/** The platform boundary; the scheduler and private indexes also run in JVM tests. */
interface SongCacheDocuments {
    fun validate(tree: String)
    fun status(uri: String, tree: String, expected: Long): String
    fun open(uri: String): InputStream
    fun copy(input: InputStream, tree: String, name: String, format: String, expected: Long, cancelled: () -> Boolean): String
    fun delete(uri: String, tree: String)
}
