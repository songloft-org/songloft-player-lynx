package org.songloft.lynx.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BlurCaptureGeometryTest {
    @Test
    fun emptyLayoutDoesNotConsumeTheInitialCapture() {
        val geometry = BlurCaptureGeometry()
        assertFalse(geometry.update(0, 200))
        assertFalse(geometry.update(300, 0))
        assertTrue(geometry.update(300, 200))
    }

    @Test
    fun stableLayoutDoesNotCreateAnIdleCaptureLoop() {
        val geometry = BlurCaptureGeometry()
        assertTrue(geometry.update(300, 200))
        repeat(100) { assertFalse(geometry.update(300, 200)) }
        assertTrue(geometry.update(400, 200))
        assertFalse(geometry.update(400, 200))
    }

    @Test
    fun changingSourceRefreshesEvenWithTheSameBounds() {
        val geometry = BlurCaptureGeometry()
        assertTrue(geometry.update(300, 200))
        geometry.reset()
        assertTrue(geometry.update(300, 200))
    }

    @Test
    fun slidingIntoViewRefreshesUntilTheSurfaceStops() {
        val geometry = BlurCaptureGeometry()
        assertTrue(geometry.update(300, 200, 0, 900))
        assertTrue(geometry.update(300, 200, 0, 600))
        assertTrue(geometry.update(300, 200, 0, 300))
        repeat(100) { assertFalse(geometry.update(300, 200, 0, 300)) }
    }
}
