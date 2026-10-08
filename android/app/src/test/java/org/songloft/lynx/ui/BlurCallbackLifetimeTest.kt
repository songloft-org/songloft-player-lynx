package org.songloft.lynx.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class BlurCallbackLifetimeTest {
    @Test
    fun queuedCaptureUpdateDoesNotRunAfterDestroy() {
        val lifetime = BlurCallbackLifetime()
        var updates = 0
        val queued = lifetime.wrap { updates++ }
        queued.run()
        assertEquals(1, updates)

        lifetime.dispose()
        queued.run()
        lifetime.wrap { updates++ }.run()
        assertEquals(1, updates)
    }
}
