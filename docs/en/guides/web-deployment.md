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

## Known Web limitations

| Limitation                     | Behavior                                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No secure enclave              | The secure storage namespace has the same security as other same-origin scripts                                                                                                                                |
| IndexedDB persistence          | Workers lack actual Window localStorage; storage probes native → IndexedDB → localStorage → memory. IndexedDB must win over the injected scope binding                                                         |
| No longpress                   | web-core does not synthesize it; long-press actions need a button alternative                                                                                                                                  |
| Placeholder color patched      | Fixed on 2026-08-26: web-core default grey is patched to var(--content-muted,grey) by scripts/patch-web-core-client.mjs. Theme behavior was browser-tested. Shadow-root part defaults can require host patches |
| File picker may not open       | Worker-to-host calls may lose user activation; verify in a real browser                                                                                                                                        |
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

## Related

- [Build and run](build-and-run.md)
- [Debugging (Chinese)](../../guides/debugging.md)
- [Platform differences (Chinese)](../../architecture/platform-differences.md)
- [中文版](../../guides/web-deployment.md)
