export const SHORTCUT_ACTIONS = [
  'toggle',
  'previous',
  'next',
  'seekBackward',
  'seekForward',
  'volumeUp',
  'volumeDown',
  'mute',
] as const
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export const SEEK_STEP_MS = 10_000
export interface ShortcutBinding {
  code: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  primary?: boolean
}
export type ShortcutBindings = Record<ShortcutAction, ShortcutBinding>

const key = (code: string, primary = false): ShortcutBinding => ({
  code,
  primary,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
})
export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  toggle: key('Space'),
  previous: key('ArrowLeft', true),
  next: key('ArrowRight', true),
  seekBackward: key('ArrowLeft'),
  seekForward: key('ArrowRight'),
  volumeUp: key('ArrowUp', true),
  volumeDown: key('ArrowDown', true),
  mute: key('KeyM'),
}

export function parseShortcutBinding(raw: unknown): ShortcutBinding | null {
  const b = raw as ShortcutBinding | null
  if (
    !b ||
    typeof b.code !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(b.code) ||
    /^(Control|Shift|Alt|Meta)|^(Escape|Tab|F5|BrowserBack|BrowserForward)$/.test(b.code) ||
    ['ctrl', 'meta', 'alt', 'shift'].some(
      (key) => typeof b[key as keyof ShortcutBinding] !== 'boolean',
    )
  )
    return null
  if (
    (b.ctrl || b.meta || b.primary) &&
    ['KeyL', 'KeyR', 'KeyT', 'KeyW', 'KeyN', 'KeyQ'].includes(b.code)
  )
    return null
  return {
    code: b.code,
    ctrl: b.ctrl,
    meta: b.meta,
    alt: b.alt,
    shift: b.shift,
    primary: b.primary === true,
  }
}

export function bindingsOverlap(a: ShortcutBinding, b: ShortcutBinding): boolean {
  if (a.code !== b.code || a.alt !== b.alt || a.shift !== b.shift) return false
  const variants = (binding: ShortcutBinding) =>
    binding.primary ? ['10', '01', '11'] : [`${Number(binding.ctrl)}${Number(binding.meta)}`]
  return variants(a).some((value) => variants(b).includes(value))
}

export function parseShortcutBindings(raw: unknown): ShortcutBindings {
  const result = structuredDefaults()
  if (!raw || typeof raw !== 'object') return result
  const input = raw as Record<string, unknown>
  for (const action of SHORTCUT_ACTIONS) {
    const binding = parseShortcutBinding(input[action])
    if (binding) result[action] = binding
  }
  // Corrupt/conflicting saved maps fall back together, keeping every action accessible.
  for (let i = 0; i < SHORTCUT_ACTIONS.length; i++) {
    for (let j = i + 1; j < SHORTCUT_ACTIONS.length; j++) {
      if (bindingsOverlap(result[SHORTCUT_ACTIONS[i]], result[SHORTCUT_ACTIONS[j]]))
        return structuredDefaults()
    }
  }
  return result
}

export function structuredDefaults(): ShortcutBindings {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.map((action) => [action, { ...DEFAULT_SHORTCUT_BINDINGS[action] }]),
  ) as ShortcutBindings
}

export function shortcutLabel(binding: ShortcutBinding): string {
  const code = binding.code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Arrow', '')
  return [
    binding.primary ? 'Ctrl / ⌘' : null,
    binding.ctrl ? 'Ctrl' : null,
    binding.meta ? '⌘' : null,
    binding.alt ? 'Alt' : null,
    binding.shift ? 'Shift' : null,
    code,
  ]
    .filter(Boolean)
    .join(' + ')
}
