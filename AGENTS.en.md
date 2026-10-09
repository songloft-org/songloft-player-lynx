# AGENTS.md — Songloft Player (Lynx)

This entry contains constraints that affect code changes, validation, and exploration order. Historical incidents and measurements belong in [pitfalls](docs/project/pitfalls.md) and [progress](docs/project/progress.md). [Chinese counterpart](AGENTS.md).

## 1. What to read first

| Task | Authoritative entry |
|---|---|
| Overview | [README](README.en.md) |
| Architecture | [ARCHITECTURE](ARCHITECTURE.md), [overview](docs/architecture/overview.md) |
| Build/test/platform gates | [HARNESS](HARNESS.en.md), [build](docs/en/guides/build-and-run.md), [testing](docs/en/guides/testing.md) |
| Threads, elements, Web limits | [Lynx constraints](docs/architecture/lynx-constraints.md) |
| Store/API design | [API conventions](docs/reference/api-conventions.md) |
| Native methods/events/registration | [Native modules](docs/reference/native-modules.md) |
| HarmonyOS/ArkTS | [ArkTS index](docs/reference/arkts/README.md), [constraint reference](docs/reference/arkts/ArkTS约束速查.md) |
| Back navigation | [Back navigation](docs/reference/back-navigation.md) |
| Platform floors | [Platforms](docs/reference/platforms.md) |
| Design tokens | [DESIGN](DESIGN.md) |
| Current status/issues | [Handoff](docs/en/project/handoff.md), [bugs](docs/project/bugs.md) |

Backend API contracts live in the backend's docs/swagger.json or development Swagger UI. Do not maintain a copy here.

## 2. Boundaries and call chains

```text
router → feature pages/widgets → store or TanStack Query
       → core/network or native facade → backend/native/Web host
       → response/global event → state/query → rendering
```

- Features are auth/home/library/library-ops/player/playlist/settings/jsplugin; shared code belongs in core/models/native/shared/store.
- Zustand holds client state; TanStack Query owns backend data. Read API conventions before changing store signatures.
- Use positional arguments for one/two scalars, objects for three or more or optional parameters.
- Store volume is integer 0–100; native volume is float 0–1. Convert in store actions.
- An optional songloft-player checkout is read-only reference code.

## 3. Lynx and Web constraints

### 3.1 Realms and platform checks

- Lynx has no general DOM. Business code must not assume window/document/self/navigator/localStorage or HTML element classes.
- Web business code runs in a Worker. Checking document identifies DOM availability in that realm, not the platform.
- Use isWebPlatform for platform selection; isWebEnvironment only guards an immediate DOM call.
- Audio/AudioContext/window.open/document.createElement/MediaSession must be registered as main-thread host modules and called through NativeModules.
- Read bare Lynx globals behind typeof. Add missing globals through a build banner only when necessary; do not fabricate globalThis.self for business code.

### 3.2 Elements, CSS, resources

- Check web-core's tag mapping before using elements. Unsupported Web branches must omit unsupported elements entirely.
- Web no-ops include enable-nested-scroll, attribute scroll-into-view, and list px lower-threshold. Lyrics scrolling uses invoke.
- Remote SVG src is unavailable in this host; fetch text and use SVG content.
- web-elements ::part defaults can override host inheritance; styles cannot cross the lynx-view shadow boundary. Global fixes belong in patch-web-core-client with failing pattern checks.
- Web host scripts must load as modules. Changes require build:web and actually opening output.
- Import individual lynx-ui components; do not restore its barrel or popover package. Use AppSwitch.

### 3.3 Overlays, lists, dialogs

- Mount global overlays inside the root route ThemeProvider beside ToastHost, preserving CSS and Router context.
- Use PopoverMenu/Panel/Surface and anchored-overlay. Measure trigger/theme-root in one exec and set only one edge per axis.
- Virtual lists clip descendants and establish fixed containing blocks. Song row menus belong in root GlobalMenu/song-row-overlays and use buildSongMenuItems.
- DialogBackdrop needs all four fixed offsets in its style. Outside cancellation belongs on DialogContent; cards use catchtap.
- Keep card chrome/action height constants and CSS in sync with structural gates.
- Fixed dialog chrome uses flex-shrink: 0; the scrolling body absorbs height constraints.
- Absolute bottom sheets without explicit height must not use zero-basis flex: 1 bodies. Choose fixed-height or content-fit structure.

### 3.4 Navigation and system following

- Fixed bottom navigation z-index is 90, mini-player 91, sheets/popovers 100, dialogs 200/201. Do not insert another fixed layer between 90/91.
- Scroll pages consume --nav-inset; native lists use footer spacers.
- Selected rail items change color, not size. Bottom icons use activeAccentIconColor because SVG does not inherit CSS colors.
- Glass surfaces use BackdropBlur and --material-* tokens. Bottom navigation selection backgrounds use --tint-fill; --material-glow-faint is only decorative glow. Emphasized and neutral states on glass use --tint-fill and --quaternary-system-fill respectively, without replacing the material with an opaque surface.
- Sliding indicators use translateX and the spring-bounce timing curve. Wide rails only change color; duration tokens become zero under reduce-motion. Never animate the blur layer. Toast stays solid.
- System theme/language initial values arrive through globalProps before the first frame; live changes use global events. sendGlobalEvent's second argument is an array.
- Reduce-motion uses systemReduceMotion: iOS observes UIAccessibility notifications, Android observes ANIMATOR_DURATION_SCALE, and HarmonyOS API 23+ reads and observes the public API (older APIs remain unknown). Web reads media preferences on the main thread and pushes them to the Worker. The reduce-motion class zeroes motion tokens. Clean up listeners with the host lifecycle.
- The host reports backdrop capability before the first frame, gated by SDK, registration and OS. Unknown capability uses solid material; only iOS 26+ selects glass. surface-policy.ts combines OS accessibility and local preferences, so the app cannot override an enabled system setting. Reduce Transparency unmounts blur. Android capture targets need a stable id and flatten={false}, and must exclude the glass layers themselves.
- Android 13+ capsules gate AGSL edge refraction of the live blur input on `androidGlassSupported`. Explicitly clip transparent rounded corners: input alpha alone cannot mask RenderEffect's clamped samples. Ordinary menus and scrims do not enable this lens. Capsules have one effective tint layer without a full-surface gradient or timed shimmer. Increase Contrast disables the lens; Reduce Transparency unmounts blur.
- The root and blur leaves share useSurfaceAppearance to avoid repeated subscriptions to appearance sources. Full-screen scrims without className use themed blur; compact chrome uses regular glass, and decorative leaves keep glass-interactive off. Undimmed menus use --material-fill-menu and edge highlights without full-face sheen/ramp washes. Contrast checks must include the selected-row wash and unknown backgrounds.
- Back order is overlay LIFO → route parent → tab exit policy. Register useBackHandler initially inactive and add leaf routes to route-back.ts.
- Do not use router.history.back or duplicate parent routing in SubPageShell. See the navigation reference.

## 4. Native contracts

### 4.1 Calls and registration

- Native methods do not return Promises. Writes are fire-and-forget, reads use callbacks; only facades wrap Promises.
- Never cast NativeModules objects into Promise interfaces: native methods return undefined.
- Synchronize TS, Kotlin LynxMethod, Swift methodLookup, ArkTS, and Web fallback when methods change. Event names must match exactly.
- Register new modules in Android SongloftApplication, iOS ViewController/buildConfig and pbxproj, and Harmony pages/Index.ets per view. EntryAbility handles HTTP service only.
- The native module reference owns the platform matrix; do not duplicate module counts here.

### 4.2 High-risk shared capabilities

- Fullscreen video borrows the existing player. Android detaches video output on exit; iOS clears vc.player before dismissing and preserves Now Playing state.
- Manifest/pbxproj/Info.plist/module.json5 are structural contracts, not substring tests.
- Android module methods may run off-main; dispatch View mutations to the main thread and do not swallow failures broadly.
- Android/iOS custom HTTP services replace SDK defaults, rather than coexist. InsecureTls covers fetch/media/module outgoing paths; check reuse, streaming ranges, and thread behavior.
- SongCache uses persistent files, atomic .part writes, a shared limit_exceeded sentinel, and the TLS setting on every native host.

## 5. Validation

### 5.1 Shared JS gates

```bash
pnpm run build
pnpm exec tsc -b
pnpm test
```

The build must emit Lynx and Web. These commands do not compile native hosts or prove the Web product opens.

### 5.2 Additional platform gates

| Changed area | Required validation |
|---|---|
| android | Gradle assembleDebug and behavior tests as appropriate |
| ios | Xcode project parsing, plus ios:build on macOS |
| harmony | HarmonyOS build-and-release job or DevEco Build Hap, then device checks |
| web | build:web, resource references, actual browser opening |
| native contracts | native-module-contract tests plus host compilation |
| routes/overlays | route-back, root overlays, back stack, CSS contracts |

TestBridge uses TCP 9230. Install the fresh product before E2E. Published packages must disable TestBridge and JS devtools. Native bridges register only in Debug and bind loopback; test JS needs SONGLOFT_TEST_BRIDGE=true. Run test:release after production build. See [releasing](docs/en/guides/releasing.md).

### 5.3 Test principles

- Test semantics/structure, not only substrings.
- Mocks preserve preconditions, unknown states, and class/event mappings.
- Verify new assertions fail with the original defect.
- Ship a capability probe with its first consumer; unused declarations are not implemented features.
- Register dynamic i18n prefixes or test them independently.
- Encoding gates cover U+FFFD and invalid UTF-8; type/key tests cannot detect broken text.
- Do not place the literal Vitest environment annotation in test bodies.

## 6. Workflow, files, Git

- Read handoff/open issues/references before a batch; update progress and handoff after verification.
- Edit through apply_patch; preserve unrelated changes.
- Commit patches and lockfiles. Do not commit dependencies, dist, Flutter reference checkouts, or codegraph indexes.
- Use main/origin and Chinese Conventional Commits, without Co-Authored-By. Parent issues use songloft-org/songloft#NNN.
- Do not commit, push, or change Issues without explicit confirmation. Pause after each focused batch's acceptance.

## 7. Project skills

- dev-flow: staged analysis/implementation/verification/release with confirmations.
- lynx-api-docs: consult official element/layout APIs before UI/render work.
- lynx-ui: component selection and API validation.
- lynx-check-css-support: version/backend-specific CSS support.
- lynx-devtool: live tree/styles/logs/screenshots/CDP.
- reactlynx-best-practices: threads/worklets/lifecycles/component constraints.
