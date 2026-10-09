import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

import type * as Motion from '../liquid-tab-motion.js'
import type { TabSpring } from '../liquid-tab-motion.js'

// ReactLynx removes worklet exports from the background test realm. Execute
// the real pure math source without its realm transform; native/Web cover MTS.
const source = readFileSync(resolve(__dirname, '../liquid-tab-motion.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports: Record<string, unknown> = {}
runInNewContext(js, { exports })
const { sampleTabEngagement, sampleTabSpring, TAB_SETTLE_MS, tabJellyScale, tabSpringFrames } = exports as typeof Motion

const spring: TabSpring = { from: 0, target: 1, velocity: 0, startedAt: 0 }

describe('the liquid tab spring', () => {
  test('starts at the current pose and settles precisely on the destination', () => {
    expect(sampleTabSpring(spring, 0)).toEqual({ position: 0, velocity: 0 })
    expect(sampleTabSpring(spring, TAB_SETTLE_MS)).toEqual({ position: 1, velocity: 0 })
    expect(sampleTabSpring(spring, 2000)).toEqual({ position: 1, velocity: 0 })
  })

  test('moves and deforms together, with a small Flutter-style rebound', () => {
    const poses = Array.from({ length: 56 }, (_, i) => sampleTabSpring(spring, i * 10))
    expect(poses[10]!.position).toBeGreaterThan(0.5)
    expect(Math.max(...poses.map(p => p.position))).toBeGreaterThan(1)
    expect(Math.max(...poses.map(p => p.position))).toBeLessThan(1.01)
    const scale = tabJellyScale(poses[10]!.velocity, 3)
    expect(scale.x).toBeLessThan(1)
    expect(scale.y).toBeGreaterThan(1)
    expect(tabJellyScale(0, 3)).toEqual({ x: 1, y: 1 })
  })

  test('rapid reversal retains the visible position and velocity instead of teleporting', () => {
    const interrupted = sampleTabSpring(spring, 90)
    const reverse = { ...spring, from: interrupted.position, velocity: interrupted.velocity, target: 0 }
    expect(sampleTabSpring(reverse, 0).position).toBeCloseTo(interrupted.position)
    expect(sampleTabSpring(reverse, 0).velocity).toBeCloseTo(interrupted.velocity)
    expect(sampleTabSpring(reverse, TAB_SETTLE_MS)).toEqual({ position: 0, velocity: 0 })
  })

  test('leftward and multi-slot jumps keep bounded distortion', () => {
    expect(tabJellyScale(-100, 5)).toEqual(tabJellyScale(100, 5))
    expect(tabJellyScale(100, 5)).toEqual({ x: 0.825, y: 1.105 })
    const reverse = { ...spring, from: 4, target: 0 }
    expect(sampleTabSpring(reverse, 100).velocity).toBeLessThan(0)
    expect(sampleTabSpring(reverse, TAB_SETTLE_MS)).toEqual({ position: 0, velocity: 0 })
  })

  test('UI-thread keyframes begin at the interrupted pose and end at rest', () => {
    const frames = tabSpringFrames({ ...spring, from: 0.4, target: 2, velocity: 3 }, 5)
    expect(frames.travel.length).toBe(frames.jelly.length)
    expect(parseFloat(String(frames.travel[0]!.transform).slice('translateX('.length))).toBeCloseTo(40)
    expect(frames.jelly[0]!.transform).not.toBe('scaleX(1) scaleY(1)')
    expect(frames.travel.at(-1)).toEqual({ transform: 'translateX(200%)' })
    expect(frames.jelly.at(-1)).toEqual({ transform: 'scaleX(1) scaleY(1)' })
  })

  test('selection stays visible while the edge engages continuously on the shared trajectory', () => {
    const frames = tabSpringFrames(spring, 3)
    expect(frames.optics).toHaveLength(frames.travel.length)
    for (let i = 0; i < frames.optics.length; i++) {
      const [position, sx, sy, strength] = frames.optics[i]!
      expect(frames.travel[i]!.transform).toBe(`translateX(${position! * 100}%)`)
      expect(frames.jelly[i]!.transform).toBe(`scaleX(${sx}) scaleY(${sy})`)
      expect(frames.jelly[i]!.opacity).toBeUndefined()
      expect(Number(frames.light[i]!.opacity)).toBe(strength)
      expect(strength).toBeGreaterThanOrEqual(0)
      expect(strength).toBeLessThanOrEqual(1)
    }
    expect(frames.optics.at(-1)).toEqual([1, 1, 1, 0])
    expect(frames.optics[0]).toEqual([0, 1, 1, 0])
    expect(frames.optics[1]![3]).toBeLessThan(0.1)
    expect(Math.max(...frames.optics.map(p => p[2]! * 52))).toBeLessThan(64)
  })

  test('rapid reversal preserves the visible lens geometry and engagement', () => {
    const elapsed = 85
    const pose = sampleTabSpring(spring, elapsed)
    const engagement = sampleTabEngagement(spring, elapsed)
    const reverse = { ...spring, from: pose.position, velocity: pose.velocity, engagement, target: 0 }
    expect(sampleTabEngagement(reverse, 0)).toBe(engagement)
    const [position, sx, sy, strength] = tabSpringFrames(reverse, 3).optics[0]!
    expect(position).toBeCloseTo(pose.position)
    const squash = tabJellyScale(pose.velocity, 3)
    expect(sx).toBeCloseTo(squash.x * (1 + 0.10 * engagement))
    expect(sy).toBeCloseTo(squash.y * (1 + 0.08 * engagement))
    expect(strength).toBeCloseTo(engagement)
  })
})
