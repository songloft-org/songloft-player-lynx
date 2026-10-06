# Web deployment

Two outputs: **standalone** (users enter a backend URL) and **embedded** (same origin, embedded in the Go server).

```bash
pnpm run build:web
pnpm run build:web-embedded # parent repository: clients/player-build/web-embedded
```

The deployMode global prop controls the API-address UI. Embedded uses self.location.origin as the backend origin.

## Before deployment

web-core requires SharedArrayBuffer without a fallback. Use a secure context (HTTPS, except localhost) and return `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Both modes need them; the Go backend's default Flutter deployment does not automatically satisfy this Lynx host contract. Configure proxy headers and backend CORP support for cross-origin covers/audio. web/serve.mjs supplies local validation headers.

Example root-path Nginx static serving (provide TLS separately; embedded also needs an /api/v1/ proxy location):

```nginx
location / {
    root /var/www/songloft-lynx;
    try_files $uri $uri/ /index.html;
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cache-Control no-cache always;
}
```

**Open the actual output in a browser.** web:dev serves assets through web/serve.mjs without building. First run web:sync, which is the same command as build:web: rspeedy build --environment web followed by the copy script. Both use the production ESM engine.

Vitest checks local index.html references and a type=module entry. Those checks cannot prove rendering. Historical development and production engine-entry differences caused black screens; the paths are now aligned.

## Subpath deployment

**Subpath deployment is currently unverified.** Resource and API URLs still include root-relative paths; setting the backend's -base-path or BASE_PATH alone cannot establish Lynx compatibility. Use a domain's root path first. Embedded gets its API origin from the Worker; the copy script strips the standalone deployMode prop.

Workers also have self.location, so location availability cannot distinguish deployment modes.

## Playlist JSON import and export

Settings → Data accepts a previously exported Songloft version 1 JSON backup or exports all server playlists. Web enables this entry only when the host supplies `pickTextFile/saveTextFile/cancelTextFile`; older hosts hide the entry and explain the limitation on the data page.

File selection and Blob downloads run on the main thread; the business Worker receives file text only. Import files are limited to 20 MiB. If a cross-thread call or network delay loses transient user activation, the main thread displays an actual file/download control and a cancel button. Click that control to continue. Object URLs are revoked after downloads; cancellation or leaving the data page removes temporary file controls. Cancellation uploads nothing. Empty files, invalid JSON and backups other than version 1 are rejected locally.

Web requests use the shared authenticated client: multipart `file` to `/playlists/import` and an authenticated GET to `/playlists/export`. Tokens appear only in Authorization headers. A 401 uses the existing refresh and request replay; failed refresh returns to login, and HTTP errors end the busy state. Both actions are disabled during transfer. Successful imports invalidate `['playlist']` and `['library']`, covering details, song lists and home statistics. Native clients retain their existing upload/browser-export flows.

Docker Chrome 153 with real Workers has verified standalone cross-origin CORS and root-path same-origin embedded hosting: actual file selection, playlist/song database changes, Chinese/emoji JSON downloads, empty/invalid file rejection, cancellation, 401 refresh/replay and recovery after server failures. Activation expiry was exercised by delaying the real host call and then clicking its main-thread control. Firefox 134 in an isolated Playwright environment also passes both root-path hosting modes for selection, database changes, downloads, errors and authentication. Its activation-loss cancellation uses an explicit fixture: a 5.5-second delay did not trigger fallback controls. One startup produced a Blob-script loading error; subsequent runs passed both hosting modes. That compatibility observation remains open and does not establish stability across all Firefox versions. Safari has not run; subpath deployment retains the limitations above.

References: [File input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file), [Activation and pickers](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/showPicker), [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob), [Revoking object URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static).

Additional evidence on 2026-10-07: Linux Playwright WebKit 18.2 passes those data flows under both root-path hosting modes, with observable backend changes/JSON downloads and zero final page errors. Activation loss uses an explicit fixture. Temporary Mesa/dependency configuration and logs are in [progress (Chinese)](../../project/progress.md). [Playwright WebKit](https://playwright.dev/docs/browsers#webkit) is not branded Safari; actual Safari acceptance remains open.

## Copy to clipboard

Copying prompts or song paths uses `setClipboardWithResult` and announces success only after `navigator.clipboard.writeText` completes. In insecure contexts, after activation loss or on API rejection, the legacy path confirms success only when `execCommand('copy')` returns true; otherwise the UI shows failure. Temporary textareas are removed and focus is restored. Chrome pasted matching text from both real buttons and exercised failure/retry; other browsers remain open. See [Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

## Playback keyboard shortcuts

Playback settings include a locally persisted switch, enabled by default. When the app owns interaction focus and has a playable queue, Space toggles playback, Ctrl/⌘ + ←/→ goes to the previous/next track, and Ctrl/⌘ + ↑/↓ changes volume by five percentage points within 0–100%. Actions reuse the existing player; the main thread recognizes keys and sends Worker events. It also reports actual media volume so the first adjustment does not jump to a default value.

Inputs, editable content, buttons/links/sliders, plugin iframes, composition and previously handled events retain their own controls. A back-stack overlay, selection/edit mode or wide-screen settings subpage pauses shortcuts. Playback and track changes ignore key repeat; volume accepts it. Lost focus or a disabled switch leaves keys unconsumed. Reinitialization removes old listeners; mobile hosts do not install this listener.

Chrome 153 exercised real playback, pause, track changes, volume, persisted settings and player-menu blocking. Shadow DOM inputs/iframes were injected browser fixtures and composition used protocol-event fixtures; this does not establish operating-system IME or installed-plugin acceptance. Firefox 134 also completes those shortcut flows with a temporary PulseAudio null sink, with zero media/page errors in the final run. It uses the existing 128 kbps setting and real backend streams with decoding/progress; speaker output is not tested. Firefox logs locate the earlier `MEDIA_ERR_DECODE` at output initialization (`NS_ERROR_DOM_MEDIA_MEDIASINK_ERR`), rather than establishing unsupported codecs; the blank-page audio probe also recovers with the sink. Only that browser receives `PULSE_SERVER`; host audio settings are unchanged. See [PulseAudio module-null-sink](https://wiki.freedesktop.org/www/Software/PulseAudio/Documentation/User/Modules/#module-null-sink) for the output behavior. The intermittent Blob-script error remains an open observation, and Safari remains open. Event references: [composedPath](https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath), [isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing), [repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat).

Linux WebKit 18.2 also passes the actual shortcut control flows, with empty final audioErrors/errors, the same delivery package, 128 kbps streams and a temporary PulseAudio null sink. A blank-page probe located the initial media-process exit at missing GStreamer appsink/appsrc/autoaudiosink; temporary plugins restored playback. The third blank-page sample was rejected by activation policy and is not counted as a media pass. Configuration, logs, Chinese 375px and input/IME fixture limits are in [progress (Chinese)](../../project/progress.md); client code and application validation were not changed. Linux WebKit does not replace actual Safari, operating-system IME or speaker acceptance.

## Known Web limitations

| Limitation                     | Behavior                                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No secure enclave              | The secure storage namespace has the same security as other same-origin scripts                                                                                                                                |
| IndexedDB persistence          | Workers lack actual Window localStorage; storage probes native → IndexedDB → localStorage → memory. IndexedDB must win over the injected scope binding                                                         |
| No longpress                   | web-core does not synthesize it; long-press actions need a button alternative                                                                                                                                  |
| Placeholder color patched      | Fixed on 2026-08-26: web-core default grey is patched to var(--content-muted,grey) by scripts/patch-web-core-client.mjs. Theme behavior was browser-tested. Shadow-root part defaults can require host patches |
| Playlist file activation | JSON import/export supplies main-thread controls when Worker calls lose activation. Data flows pass in Chrome, Firefox 134 and Linux WebKit 18.2 under both root-path hosting modes; the latter two use activation-loss fixtures. Safari remains open. Other legacy `pickAndUploadFile` callers retain the old bridge. |
| No clear-browser-cache action  | This client registers no Service Worker and uses no Cache Storage. Controlled host serving uses no-cache/ETag; normal refresh loads updates. Flutter's PWA cache flow differs                                  |
| Some Lynx elements unavailable | Unmapped tags such as refresh/webview become HTMLUnknownElement; their attributes have no effect. Check LYNX_TAG_TO_HTML_TAG_MAP before using them                                                             |

See [AGENTS.en.md](../../../AGENTS.en.md) for Web constraints.

## Web host modules

Main-thread APIs such as Audio, AudioContext, mediaSession, window.open and document.createElement are unavailable in the business Worker. Register host modules via nativeModulesMap to expose them through NativeModules.

Seven registrations live in three host scripts: audio-host.js registers SongloftAudio, SongloftPlatform, SongloftNavigation, SongloftVideo; webview-host.js registers SongloftWebview; lynx-frame-host.js registers SongloftPluginBridge and SongloftLynxFrame. Worker proxies are songloft-\*-module.js; lynx-plugin-bridge-shim.js exposes pluginBridge to plugins.

nativeModulesMap values **must be ESM URL strings**, not objects. The engine imports each URL; an object becomes [object Object], rejects the import, and can prevent all custom modules from loading. web-host-page.test.ts checks URLs, files, copy-script inclusion and default-export factories.

SongloftStorage is intentionally not registered. Worker idb-storage already persists to the songloft database; the host's separate database would lose existing sessions.

## Web plugins use iframes

Native hosts use webview; Web uses an iframe **inside lynxView.shadowRoot**. The lynx-view contain:strict creates a stacking context; body-level iframes would cover overlays. The mount point and z-index 50 are checked by contract tests.

`renderEngine: "lynx"` uses a nested `<lynx-view>`. In P6c the main thread sends `lifecycle` / `{"state":"resumed"}` through `SongloftPluginBridge.push` when the browser becomes visible again or a kept-alive plugin is re-entered. Only the active, ready plugin is notified; its worker/state is preserved. Rebuild child plugins with the updated Lynx SDK: event subscriptions register the child independently and send `lifecycle.ready`, without requiring a prior RPC. SDK source is updated but has not been published to npm; older plugins without readiness do not receive this new push.

## Related

- [Build and run](build-and-run.md)
- [Debugging (Chinese)](../../guides/debugging.md)
- [Platform differences (Chinese)](../../architecture/platform-differences.md)
- [中文版](../../guides/web-deployment.md)
