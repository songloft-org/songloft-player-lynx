/** Flutter GlassTabBar.bottom uses a 350ms snappy spring (bounce .15).
 * Coordinates are tab slots, so geometry stays valid across viewport widths.
 * Sample the same spring for translation and velocity-driven jelly deformation.
 */
export const TAB_SPRING_DURATION_MS = 350
export const TAB_SETTLE_MS = 560

export interface TabSpring {
  from: number
  target: number
  velocity: number
  startedAt: number
}

export function sampleTabSpring(spring: TabSpring, elapsedMs: number) {
  'main thread'
  const t = Math.max(0, elapsedMs) / 1000
  if (elapsedMs >= TAB_SETTLE_MS) return { position: spring.target, velocity: 0 }
  const omega = 2 * Math.PI / (TAB_SPRING_DURATION_MS / 1000)
  const decay = omega * 0.85
  const frequency = omega * Math.sqrt(1 - 0.85 ** 2)
  const a = spring.from - spring.target
  const b = (spring.velocity + decay * a) / frequency
  const cos = Math.cos(frequency * t)
  const sin = Math.sin(frequency * t)
  const envelope = Math.exp(-decay * t)
  return {
    position: spring.target + envelope * (a * cos + b * sin),
    velocity: envelope * ((b * frequency - decay * a) * cos - (a * frequency + decay * b) * sin),
  }
}

export function tabJellyScale(velocity: number, slotCount: number) {
  'main thread'
  // Flutter measures velocity in Alignment coordinates (-1…1), then caps
  // standard-quality distortion at .35: squashX=1-d*.5, stretchY=1+d*.3.
  const alignmentVelocity = Math.abs(velocity) * 2 / Math.max(1, slotCount - 1)
  const distortion = Math.min(alignmentVelocity / 10, 1) * 0.35
  return { x: 1 - distortion * 0.5, y: 1 + distortion * 0.3 }
}

export function tabSpringFrames(spring: TabSpring, slotCount: number, refracts = false) {
  'main thread'
  const travel: Record<string, string | number>[] = []
  const jelly: Record<string, string | number>[] = []
  const optics: number[][] = []
  // Equal frame spacing works with Element.animate() on native and Web;
  // interpolation stays on the UI thread, with no per-frame React updates.
  for (let i = 0; i <= 36; i++) {
    const pose = sampleTabSpring(spring, TAB_SETTLE_MS * i / 36)
    const scale = tabJellyScale(pose.velocity, slotCount)
    travel.push({ transform: `translateX(${pose.position * 100}%)` })
    // Clear moving lens, fading back to the resting tint as the spring settles.
    const strength = Math.min(1, Math.abs(pose.velocity) / 2 + Math.abs(pose.position - spring.target) * 2)
    jelly.push({ transform: `scaleX(${scale.x}) scaleY(${scale.y})`, ...(refracts ? { opacity: 1 - strength } : {}) })
    optics.push([pose.position, scale.x, scale.y, strength])
  }
  return { travel, jelly, optics }
}
