# Lyrics Settings Feature Plan

## Context

Flutter 版有 3 个歌词设置 Lynx 版缺失：自动进入全屏歌词、通知栏歌词置顶、悬浮歌词子设置（字号/锁定/透明度）。用户要求全部加入。

## Files to Create/Modify

### 1. Settings Persistence — `src/features/settings/data/settings-prefs.ts`

Add 5 new pref keys + read/write functions (follow `readAutoResume`/`writeAutoResume` pattern):

| Key | Type | Default |
|-----|------|---------|
| `auto_enter_lyrics` | boolean | `false` |
| `notification_lyric_in_title` | boolean | `true` |
| `floating_lyric_font_size` | `'small'\|'medium'\|'large'` | `'medium'` |
| `floating_lyric_locked` | boolean | `false` |
| `floating_lyric_opacity` | `0.2\|0.4\|0.6\|0.8` | `0.4` |

### 2. i18n — `src/i18n/resources.ts`

Add new keys under `settings.*` (en + zh):

| Key | en | zh |
|-----|-----|-----|
| `settings.lyricsSection` | `Lyrics` | `歌词` |
| `settings.autoEnterLyrics` | `Auto-enter full-screen lyrics` | `启动时自动进入全屏歌词` |
| `settings.autoEnterLyricsSubtitle` | `Open lyrics view when playback starts` | `播放开始时自动切换到歌词界面` |
| `settings.notificationLyricInTitle` | `Show lyrics in notification title` | `通知栏歌词置顶` |
| `settings.notificationLyricInTitleSubtitle` | `Display current lyric as the notification title` | `将当前歌词显示为通知标题` |
| `settings.floatingLyricFontSize` | `Font size` | `字号` |
| `settings.floatingLyricLock` | `Lock position` | `锁定位置` |
| `settings.floatingLyricOpacity` | `Background opacity` | `背景透明度` |
| `settings.floatingLyricFontSmall` | `Small` | `小` |
| `settings.floatingLyricFontMedium` | `Medium` | `中` |
| `settings.floatingLyricFontLarge` | `Large` | `大` |

### 3. Settings Page UI — `src/features/settings/pages/SettingsPage.tsx`

Add a new **"Lyrics" section** between Playback and Library:

```
Lyrics
  ├── Auto-enter full-screen lyrics  [SwitchRow]
  ├── Notification lyrics in title   [SwitchRow]
  ├── Floating lyrics                [SettingsRow → requestPermission + show]  (conditional)
  ├── Font size                      [small/medium/large radio]  (conditional)
  ├── Lock position                  [SwitchRow]  (conditional)
  └── Background opacity             [20%/40%/60%/80% radio]  (conditional)
```

The floating lyrics sub-settings (font size, lock, opacity) are conditional on `getPlatformCapabilities().floatingLyric`.

### 4. Auto-Enter Lyrics Behavior — `src/features/player/pages/FullPlayerPage.tsx`

- On mount, read `readAutoEnterLyrics()` preference
- If enabled, set the Swiper's initial page to 1 (lyrics) instead of 0 (cover art)
- Add `current` state + prop to Swiper for programmatic control
- Only applies to narrow (single-column) layout; wide layout already shows both

### 5. Native Module: Floating Lyrics — `android/.../FloatingLyricModule.kt` + `FloatingLyricService.kt`

Add 3 new `@LynxMethod`s:

| Method | Args | Behavior |
|--------|------|----------|
| `setFontSize` | `{ size: "small"\|"medium"\|"large" }` | Update TextView textSize (14/16/20sp) |
| `setLocked` | `{ locked: boolean }` | Toggle FLAG_NOT_TOUCHABLE + FLAG_NOT_FOCUSABLE |
| `setOpacity` | `{ opacity: 0.2\|0.4\|0.6\|0.8 }` | Update background alpha |

### 6. TS Adapter — `src/native/floating-lyric.ts`

Add 3 new methods to `FloatingLyricModule` interface + adapter:
- `setFontSize(size: 'small' | 'medium' | 'large'): Promise<void>`
- `setLocked(locked: boolean): Promise<void>`
- `setOpacity(opacity: number): Promise<void>`

### 7. Native Module Contract Test — `src/__tests__/native-module-contract.test.ts`

Extend the `FloatingLyricModule` contract section to verify the 3 new methods exist on Android.

### 8. Settings Page Test — `src/features/settings/__tests__/settings-page.test.tsx`

Add assertion for new `Lyrics` section header.

## What Stays Unchanged

- All existing settings rows, sections, CSS
- `LyricsView`, `LyricStore`, `LyricEditPage`, `LyricCalibratePage`
- iOS native modules (no floating lyric on iOS)
- `notificationLyricInTitle` setting is added to UI but the actual notification behavior needs native audio module extension (separate follow-up)

## Verification

1. `pnpm exec tsc -b` — type check
2. `pnpm test` — all tests pass
3. `pnpm run build` — both bundles
4. `pnpm run ios:run` — iOS build + install
5. Manual: settings page shows new Lyrics section with all rows