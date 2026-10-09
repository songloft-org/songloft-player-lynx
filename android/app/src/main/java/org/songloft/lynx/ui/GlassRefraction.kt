package org.songloft.lynx.ui

import android.annotation.TargetApi
import android.graphics.RenderEffect
import android.graphics.RuntimeShader

/** A lens on the decorative BlurView only. Foreground controls are siblings,
 * so neither their glyphs nor their hit targets are distorted. The SDK's live
 * capture remains the input: motion comes from content, not a timed shimmer.
 * API 21–32 never instantiate this class and keep the ordinary blur fallback. */
@TargetApi(33)
internal class GlassRefraction {
    private val shader = RuntimeShader(SOURCE)

    fun effect(width: Int, height: Int, density: Float, light: Float): RenderEffect {
        shader.setFloatUniform("size", width.toFloat(), height.toFloat())
        shader.setFloatUniform("bevel", minOf(12f * density, height * 0.22f))
        shader.setFloatUniform("displacement", 6f * density)
        shader.setFloatUniform("light", light)
        return RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
    }

    companion object {
        // Rounded-rectangle signed distance gives the lens its curved perimeter.
        // Sampling bends inward to stay within the captured bitmap. Use the
        // original coverage as the mask, keeping antialiased corners stable.
        private const val SOURCE = """
            uniform shader backdrop;
            uniform float2 size;
            uniform float bevel;
            uniform float displacement;
            uniform float light;

            half4 main(float2 position) {
                float radius = min(size.x, size.y) * 0.5;
                float2 p = position - size * 0.5;
                float2 q = abs(p) - (size * 0.5 - radius);
                float2 outside = max(q, float2(0));
                float distance = length(outside) + min(max(q.x, q.y), 0.0) - radius;
                // RenderEffect inputs clamp outside their content bounds. Using
                // input alpha alone therefore fills the offscreen layer beyond
                // the capsule. Explicitly mask the optical surface itself.
                if (distance >= 0.5) return half4(0);
                float2 n = outside * sign(p);
                if (length(n) < 0.001) {
                    n = q.x > q.y ? float2(sign(p.x), 0) : float2(0, sign(p.y));
                }
                n /= max(length(n), 0.001);
                float edge = 1.0 - smoothstep(0.0, bevel, -distance);
                float bend = displacement * sin(edge * 1.5707963);
                float2 samplePosition = clamp(position - n * bend, float2(0.5), size - 0.5);
                half4 original = backdrop.eval(position);
                half4 color = backdrop.eval(samplePosition);
                float highlight = pow(edge, 4.0) * max(dot(n, float2(-0.6, -0.8)), 0.0) * light * 0.3;
                half3 rgb = color.rgb / max(color.a, 0.001);
                rgb = mix(rgb, half3(1), half(highlight));
                half coverage = half(1.0 - smoothstep(-0.5, 0.5, distance));
                half alpha = original.a * coverage;
                return half4(rgb * alpha, alpha);
            }
        """
    }
}
