package org.songloft.lynx.ui

import android.annotation.TargetApi
import android.graphics.Canvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.view.View

/** Clear moving lens over a fixed full-bar capture, including glyphs. The
 * sampling domain never moves or scales, so content cannot lag behind it. */
@TargetApi(33)
internal class TabGlassRefraction {
    private val shader = RuntimeShader(SOURCE)
    private val capture = RenderNode("songloft-tab-backdrop")

    fun draw(canvas: Canvas, source: View, width: Int, height: Int, density: Float, count: Int, pose: FloatArray, light: Float) {
        if (!canvas.isHardwareAccelerated) return
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
        val slot = width.toFloat() / count
        shader.setFloatUniform("size", width.toFloat(), height.toFloat())
        shader.setFloatUniform("center", slot * (pose[0] + 0.5f), height * 0.5f)
        shader.setFloatUniform("extent", (slot - 8f * density) * 0.5f, 26f * density)
        shader.setFloatUniform("scale", pose[1], pose[2])
        shader.setFloatUniform("bevel", 10f * density)
        shader.setFloatUniform("bend", 5f * density)
        shader.setFloatUniform("light", light)
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
            half4 main(float2 position) {
                float radius = min(extent.x, extent.y);
                float2 p = (position - center) / scale;
                float2 q = abs(p) - (extent - radius);
                float2 outside = max(q, float2(0));
                float d = length(outside) + min(max(q.x, q.y), 0.0) - radius;
                if (d >= 1.0) return half4(0);
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
                half coverage = half(1.0 - smoothstep(-0.5, 0.5, d / normalScale));
                return half4(rgb * coverage, coverage);
            }
        """
    }
}
