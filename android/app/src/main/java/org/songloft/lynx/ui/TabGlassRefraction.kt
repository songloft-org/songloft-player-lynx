package org.songloft.lynx.ui

import android.annotation.TargetApi
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.view.View
import kotlin.math.hypot

/** Clear moving lens over a fixed material capture, excluding glyphs. The
 * sampling domain never moves or scales, so content cannot lag behind it. */
@TargetApi(33)
internal class TabGlassRefraction {
    private val shader = RuntimeShader(SOURCE)
    private val capture = RenderNode("songloft-tab-backdrop")
    private val selectionMatrix = Matrix()
    private val surfaceMatrix = Matrix()
    private val inverseSurfaceMatrix = Matrix()
    private val points = FloatArray(6)
    private val geometry = FloatArray(6)
    private var geometryReady = false

    fun updateGeometry(selection: View, surface: View): Boolean {
        if (selection.width <= 0 || selection.height <= 0) return clearGeometry()
        // Element.animate() and the invoked native animator can begin on
        // different frames. Read the painted selection's complete transform
        // instead of reconstructing a second geometry from its wall clock.
        selectionMatrix.reset()
        surfaceMatrix.reset()
        selection.transformMatrixToGlobal(selectionMatrix)
        surface.transformMatrixToGlobal(surfaceMatrix)
        if (!surfaceMatrix.invert(inverseSurfaceMatrix)) return clearGeometry()
        selectionMatrix.postConcat(inverseSurfaceMatrix)
        points[0] = selection.width * 0.5f
        points[1] = selection.height * 0.5f
        points[2] = points[0] + 1f
        points[3] = points[1]
        points[4] = points[0]
        points[5] = points[1] + 1f
        selectionMatrix.mapPoints(points)
        val scaleX = hypot(points[2] - points[0], points[3] - points[1])
        val scaleY = hypot(points[4] - points[0], points[5] - points[1])
        if (!scaleX.isFinite() || !scaleY.isFinite() || scaleX <= 0f || scaleY <= 0f) return clearGeometry()
        val changed = !geometryReady || geometry[0] != points[0] || geometry[1] != points[1] ||
            geometry[2] != selection.width * 0.5f || geometry[3] != selection.height * 0.5f ||
            geometry[4] != scaleX || geometry[5] != scaleY
        geometry[0] = points[0]
        geometry[1] = points[1]
        geometry[2] = selection.width * 0.5f
        geometry[3] = selection.height * 0.5f
        geometry[4] = scaleX
        geometry[5] = scaleY
        geometryReady = true
        return changed
    }

    private fun clearGeometry(): Boolean {
        val changed = geometryReady
        geometryReady = false
        return changed
    }

    fun draw(canvas: Canvas, source: View, width: Int, height: Int, density: Float, engagement: Float, light: Float) {
        if (!canvas.isHardwareAccelerated || !geometryReady) return
        capture.setPosition(0, 0, width, height)
        val recording = capture.beginRecording(width, height)
        try {
            // Hardware recording preserves the static bar's blur RenderNode
            // and glass effect. Software Canvas would copy its unblurred input;
            // SDK BlurViewCanvas excludes nested blur entirely.
            source.draw(recording)
        } finally {
            capture.endRecording()
        }
        shader.setFloatUniform("size", width.toFloat(), height.toFloat())
        shader.setFloatUniform("center", geometry[0], geometry[1])
        shader.setFloatUniform("extent", geometry[2], geometry[3])
        shader.setFloatUniform("scale", geometry[4], geometry[5])
        shader.setFloatUniform("bevel", 10f * density)
        shader.setFloatUniform("bend", 5f * density * engagement)
        shader.setFloatUniform("light", light * engagement)
        shader.setFloatUniform("engagement", engagement)
        capture.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "backdrop"))
        canvas.drawRenderNode(capture)
    }

    fun dispose() { capture.discardDisplayList(); capture.setRenderEffect(null) }

    companion object {
        private const val SOURCE = """
            uniform shader backdrop;
            uniform float2 size;
            uniform float2 center;
            uniform float2 extent;
            uniform float2 scale;
            uniform float bevel;
            uniform float bend;
            uniform float light;
            uniform float engagement;
            half4 main(float2 position) {
                float radius = min(extent.x, extent.y);
                float2 p = (position - center) / scale;
                float2 q = abs(p) - (extent - radius);
                float2 outside = max(q, float2(0));
                float d = length(outside) + min(max(q.x, q.y), 0.0) - radius;
                // Only the bevel contributes optical pixels. In particular,
                // do not normalize the capsule medial axis (zero gradient),
                // or sample/composite its transparent interior on mobile GPUs.
                if (d >= 1.0 || d <= -bevel || engagement <= 0.0) return half4(0);
                float2 n = outside * sign(p);
                if (length(n) < 0.001) n = q.x > q.y ? float2(sign(p.x), 0) : float2(0, sign(p.y));
                n /= max(length(n), 0.001);
                // Transform the normal as well as the shape: nonuniform jelly
                // scaling makes the capsule's end caps elliptical.
                float normalScale = max(length(n / scale), 0.001);
                n = (n / scale) / normalScale;
                float edge = 1.0 - smoothstep(0.0, bevel, -d);
                // A curved edge compresses the source locally; the interior
                // remains sharp. Sample the full source, not a cropped pill.
                float2 samplePosition = clamp(position - n * bend * sin(edge * 1.5707963), float2(0.5), size - 0.5);
                half4 color = backdrop.eval(samplePosition);
                if (color.a < 0.001) return half4(0);
                half3 rgb = color.rgb / max(color.a, 0.001);
                float rim = pow(edge, 4.0) * max(dot(n, float2(-0.6, -0.8)), 0.0) * light * 0.4;
                float shade = pow(edge, 3.0) * max(dot(n, float2(0.6, 0.8)), 0.0) * light * 0.12;
                rgb *= half(1.0 - shade);
                rgb = mix(rgb, half3(1), half(rim));
                half coverage = half((1.0 - smoothstep(-0.5, 0.5, d / normalScale)) * edge * engagement);
                return half4(rgb * coverage, coverage);
            }
        """
    }
}
