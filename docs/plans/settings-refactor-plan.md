# Settings Page Refactoring Plan

## Context

The settings page (`src/features/settings/pages/SettingsPage.tsx`) has 11 sections in an illogical order. The current ordering mixes unrelated concerns (Library Scan at top, Diagnostics in the middle, Audio Quality separated from Playback, About in the middle) and the "Advanced" section is a catch-all dumping ground for 7 heterogeneous rows. The goal is to reorder and regroup sections following best practices: frequency of use, logical grouping, and the "danger zone at bottom" convention.

## Current Section Order (problems noted)

| # | Section | Problem |
|---|---------|---------|
| 1 | Music Library Scan | Maintenance operation, shouldn't be first |
| 2 | Language | Should be under Appearance |
| 3 | Connection | Fine, but should be near top |
| 4 | Appearance | Should include Language |
| 5 | Diagnostics | Developer setting, should be lower |
| 6 | About | Informational, should be at bottom |
| 7 | Audio Quality | Should be merged into Playback |
| 8 | Playback | Should include Audio Quality, EQ, Floating Lyrics |
| 9 | Advanced | Catch-all: Browse Views, EQ, Cache, Plugins, Tab Config, Proxy, Upgrade |
| 10 | Data | Conditional (only when dataTransfer cap is available) |
| 11 | Account | Correctly at bottom |

## New Section Order

| # | Section | Rows | Rationale |
|---|---------|------|-----------|
| 1 | **Appearance** | Theme options + Language options + Theme Packs | Most frequently changed; Language merged in |
| 2 | **Connection** | Server list | Fundamental setting (standalone only) |
| 3 | **Playback** | Audio Quality + Auto Resume + Normalize + EQ + Floating Lyrics | All playback-related settings together; Audio Quality, EQ, Floating Lyrics merged in |
| 4 | **Library** | Library Scan + Browse Views | Library maintenance operations; Browse Views moved from Advanced |
| 5 | **Advanced** | Cache + Plugins + Tab Config + Proxy + Log Level + Export Logs | Infrequent settings; Diagnostics (log level, export logs) merged in |
| 6 | **Data** | Export/Import | Conditional section |
| 7 | **About** | Version + Backend Version + Server + Songloft + Licenses + Upgrade | Informational, at bottom; Upgrade moved from Advanced |
| 8 | **Account** | Logout | Danger zone at very bottom |

## Files to Modify

### 1. `src/features/settings/pages/SettingsPage.tsx`
- **Reorder `<SettingsSection>` blocks** in the JSX to match the new order
- **Merge Language section into Appearance**: move the 3 language radio rows into the Appearance section (after theme options, before theme packs)
- **Merge Audio Quality section into Playback**: move the 4 audio quality radio rows to the top of the Playback section
- **Move EQ row** from Advanced to Playback section
- **Move Floating Lyrics row** — keep it in Playback (already there)
- **Create new "Library" section**: combine Library Scan + Browse Views (moved from Advanced)
- **Move Upgrade row** from Advanced to About section
- **Merge Diagnostics into Advanced**: move log level rows + export logs row into Advanced section
- **Remove the standalone Diagnostics section**
- **Remove the standalone Language section** (merged into Appearance)
- **Remove the standalone Audio Quality section** (merged into Playback)
- **Remove the standalone Music Library Scan section** (now part of Library)
- Add new i18n key `settings.librarySection` for the new Library section header
- Update `SettingsDetailPane` switch cases if needed

### 2. `src/i18n/resources.ts` (both `en` and `zh`)
- Add new key `settings.librarySection`: `"Library"` / `"曲库管理"` for the new Library section header

### 3. `src/features/settings/__tests__/settings-page.test.tsx`
- Update section header assertions to match new section order and names
- Replace `queryByText('Language')` / `queryByText('Diagnostics')` / `queryByText('Audio quality')` with new section assertions
- Add assertion for new `'Library'` section header
- The test already uses `queryByTestId` for rows, so row-level assertions should still pass

## What Stays the Same

- **All widgets**: `SettingsSection`, `SettingsRow`, `SwitchRow` — no changes
- **All i18n keys** (except the one new key added): row titles, subtitles, etc. unchanged
- **State management**: all `useState`, `useEffect`, handlers unchanged
- **Dual-column layout**: `SettingsDetailPane` and `goToSubPage` logic unchanged
- **CSS**: `SettingsPage.css` and `Settings.css` unchanged
- **DataSection component**: no changes
- **Imports**: only minor changes (remove unused section imports if any)

## Verification

1. **`pnpm exec tsc -b`** — type check passes
2. **`pnpm test`** — all vitest tests pass, especially `settings-page.test.tsx`
3. **`pnpm run build`** — both Lynx and Web bundles produce
4. Visual: settings page renders with sections in the new logical order, all rows functional