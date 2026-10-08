# Lynx blur-view Element

This guide covers the open-source Lynx 4.0 `<blur-view>` on Android, iOS, HarmonyOS, and Web. Checked against the [official API source](https://github.com/lynx-family/lynx-website/blob/main/docs/en/api/elements/built-in/blur-view-API.mdx) and [platform compatibility data](https://github.com/lynx-family/lynx-website/blob/main/packages/lynx-compat-data/elements/blur-view.json) on 2026-10-08. Development documentation may include later APIs; check their SDK gates separately.

## Host Integration

The element must be installed and registered in the host; TypeScript props and an SDK version alone do not establish runtime availability. For Songloft, reuse `src/shared/ui/BackdropBlur.tsx`: Android registers XElement behaviors, iOS includes `XElement/BlurView`, and Web aliases the older `x-blur-view` implementation. HarmonyOS Lynx 4.0.1 registers `blur-view` in its core C++ `XElementRegistry::Initialize()`; it does not need an ArkTS Behavior or a separate blur package. Its backdrop implementation requires API 15+. Songloft gates rendering through host-reported capabilities; actual HarmonyOS optics still need device verification.

## When to Use `<blur-view>`

### Use `<blur-view>` when:

- you need a child-hosting visual container with a blur treatment
- you want one portable blur control through `blur-radius`
- you need iOS material-style blur selection such as `light`, `dark`, or `extra-light`
- you need native iOS 26+ Liquid Glass, including style, tint, interactive behavior, or grouped glass surfaces
- you need Android to blur only the overlap with a specific Lynx view id
- you need Android runtime blur auto-update control

### Do not use `<blur-view>` when:

- you need a leaf content host like `<webview>`
- you need to assume iOS material presets are portable to Android or Harmony
- you need element-specific load, change, or message events

## Portability Guardrails

- treat `<blur-view>` as a container that accepts Lynx children
- use `blur-radius` as the main portable blur prop
- prefer string length values such as `"16px"` for `blur-radius` when Android or Harmony is in scope
- keep `blur-effect`, `glass-style`, `glass-tint-color`, `glass-interactive`, and `spacing` in the iOS-only lane
- keep `android-capture-target`, `blur-sampling`, `enable-auto-blur`, `experimental-update-blur-radius`, and `enableAutoBlur(...)` in the Android-only lane
- pass a raw Lynx `id` such as `"backdrop"` to Android `android-capture-target`; do not include `#`
- when Android version requirements matter, separate the declared build floor from the practical runtime floor
- Harmony currently only proves `blur-radius`, and the native path is gated by the platform API level
- Web supports `blur-radius` through browser CSS `backdrop-filter`; native presets, glass effects, and Android capture controls are not supported

## Quick Start

### Cross-platform blur container

```tsx
<blur-view
  id="blur"
  blur-radius="16px"
  style={{
    width: '100%',
    height: '180px',
    borderRadius: '24px',
    overflow: 'hidden',
  }}
>
  <view style={{ width: '100%', height: '100%', backgroundColor: '#0f172a' }} />
  <text style={{ position: 'absolute', left: '16px', top: '16px', color: '#ffffff' }}>
    Frosted card
  </text>
</blur-view>
```

### Android `android-capture-target`

Use `android-capture-target` on Android when the blur source should be a specific view instead of the default parent-walk source. The prop value is the target view's raw `id`, and Android only blurs the part where that target view intersects the `<blur-view>`.

```tsx
<view id="backdrop" flatten={false} style={{ width: '100%', height: '260px' }}>
  <image src={heroImage} style={{ width: '100%', height: '100%' }} />
</view>

<blur-view
  android-capture-target="backdrop"
  blur-radius="18px"
  style={{
    position: 'absolute',
    left: '24px',
    top: '120px',
    width: '220px',
    height: '96px',
    borderRadius: '20px',
    overflow: 'hidden',
  }}
/>
```

### Android runtime auto-update toggle

```tsx
this.getNodeRef('#blur').invoke({
  method: 'enableAutoBlur',
  params: { enable: false },
});
```

### iOS material-style blur

```tsx
<blur-view
  blur-radius="20px"
  blur-effect="dark"
  style={{ width: '100%', height: '140px' }}
>
  <view style={{ width: '100%', height: '100%' }} />
</blur-view>
```

### iOS Liquid Glass

With a registered Lynx 4.0+ blur element and iOS 26+, `blur-effect="glass"` selects `UIGlassEffect`. `glass-container` selects `UIGlassContainerEffect` for grouping child glass surfaces; `spacing` controls when those surfaces merge. A container does not turn ordinary child views into glass surfaces.

```tsx
<blur-view
  blur-effect="glass-container"
  spacing={16}
  style={{ display: 'flex', flexDirection: 'row', width: '240px', height: '56px' }}
>
  <blur-view
    blur-effect="glass"
    glass-style="regular"
    glass-tint-color="#1479ff"
    glass-interactive={true}
    style={{ width: '112px', height: '56px', borderRadius: '28px' }}
  >
    <text>Play</text>
  </blur-view>
</blur-view>
```

Use a normal blur/material fallback on older iOS versions and other platforms; verify the installed implementation's downgrade behavior. Do not assume a translucent CSS fill reproduces native Liquid Glass. Keep opaque decoration from covering the effect and verify actual UI rendering.

## Android Version Requirements

Answer Android version questions in two layers:

- declared Android integration floor: inspect the consuming app's Gradle configuration and the installed XElement dependency, rather than copying SDK values from an upstream example
- practical runtime guidance:
  - treat Android `23+` as the practical floor for the intended auto-updating backdrop blur path, because the implementation forcibly disables blur auto-update below `23`
  - Android `29+` adds `RenderNode` replay for the blurred bitmap
  - Android `31+` is the first bucket where the `RenderEffect` path can be used
  - auto-updating blur also expects a hardware-accelerated window

If you need the blur effect to behave as designed, use `23+` as practical Android guidance in addition to the consuming app's own minimum SDK.

## Properties

### Core cross-platform prop

| Prop | Type | What It Does |
| --- | --- | --- |
| `blur-radius` | `string` | Controls blur strength; use a positive length like `"16px"` for portable behavior |

### Partial and platform-specific props

| Prop | Platforms | What It Does |
| --- | --- | --- |
| `blur-sampling` | Android | Downsamples the blurred bitmap for better performance with slightly softer results |
| `android-capture-target` | Android | Uses the Lynx view with the matching raw `id` as the blur source and clips capture to the overlap with `<blur-view>`; empty or unresolved ids fall back to the default parent source |
| `enable-auto-blur` | Android | Enables or disables automatic blur refresh during pre-draw |
| `experimental-update-blur-radius` | Android | Switches the Android internal blur-buffer refresh path |
| `blur-effect` | iOS | Selects the iOS blur material such as `light`, `dark`, or `extra-light`; supported iOS `26+` paths may also honor `glass` and `glass-container` |
| `glass-style` | iOS 26+ | `'regular'` (default) or `'clear'` for `UIGlassEffect` |
| `glass-tint-color` | iOS 26+ | Tint color for the glass effect; default `'transparent'` |
| `glass-interactive` | iOS 26+ | Enables interactive glass behavior; boolean, default `false` |
| `spacing` | iOS | Sets the glass-container merge spacing |

## UI Methods

### `enableAutoBlur`

Parameters:

- `enable: boolean`

Platforms:

- Android

Use it to toggle Android backdrop auto-update at runtime:

```tsx
ref.current?.invoke({
  method: 'enableAutoBlur',
  params: {
    enable: true,
  },
});
```

## Events

The current native Android, iOS, and Harmony implementations do not prove any element-specific events for `<blur-view>`.

## Child Notes

### Container behavior

`<blur-view>` accepts Lynx children and behaves like a visual container rather than a leaf host.

### Platform-specific rendering notes

- Android captures and blurs backdrop content behind the view; `android-capture-target` can switch the source to another Lynx view id and clips the blur source to the intersection with `<blur-view>`; its auto-update path is disabled below Android `23`, `29+` can replay the blurred bitmap through `RenderNode`, `31+` can use `RenderEffect`, and the intended auto-update path expects a hardware-accelerated window
- iOS uses a `UIVisualEffectView` container and keeps child content inside the effect view's `contentView`
- Harmony currently only proves `blur-radius`, with backdrop blur gated by the platform API level

## Platform Availability Matrix

This matrix describes element support, subject to host integration; it does not certify Songloft device behavior.

| Feature | Android | iOS | HarmonyOS | Web |
| --- | --- | --- | --- | --- |
| Child-hosting container | Yes | Yes | Yes | Yes |
| `blur-radius` | Yes | Yes | `API 15+` | Browser backdrop-filter |
| `blur-effect` | No | Yes | No | No |
| `spacing` | No | Yes | No | No |
| `android-capture-target` | Yes | No | No | No |
| `blur-sampling` | Yes | No | No | No |
| `enable-auto-blur` prop | Yes | No | No | No |
| `enableAutoBlur(...)` method | Yes | No | No | No |
| `glass` / `glass-container` material values | No | iOS 26+ | No | No |
| `glass-style`, `glass-tint-color`, `glass-interactive` | No | iOS 26+ | No | No |

Web updates the backdrop automatically; `enable-auto-blur` does not disable browser updates. Older web-core releases need the `x-blur-view` tag or a host alias. Do not apply mobile support claims to Clay desktop backends.

## What Not to Assume

Do not teach these as portable `<blur-view>` facts:

- `android-capture-target` on iOS or Harmony
- `blur-effect` or `spacing` on Android or Harmony
- `blur-sampling`, `enable-auto-blur`, `experimental-update-blur-radius`, or `enableAutoBlur(...)` on iOS or Harmony
- element-specific load, change, or message events
- iOS background-style props on the blur view itself as if they were part of the proven blur surface
- Android version requirements as if `minSdkVersion` alone described the real runtime behavior
