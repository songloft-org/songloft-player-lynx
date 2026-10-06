# Installation and server connections

[简体中文](../../guides/installation.md)

## Choose a release

Download a [stable release](https://github.com/songloft-org/songloft-player-lynx/releases/latest) or the rolling [dev release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev). Code pushes to `main` automatically build dev packages; documentation-only changes do not. All five packages must succeed before downloads are updated. Until the new workflow succeeds for the first time, existing downloads may still come from the old workflows.

| File                                  | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `songloft-lynx-android.apk`           | Release-signed Android APK                                     |
| `songloft-lynx-ios-nosign.ipa`        | Unsigned iOS IPA; re-sign before installation                  |
| `songloft-lynx-harmony.hap`           | Signed HarmonyOS HAP                                           |
| `songloft-lynx-web-standalone.tar.gz` | Independent static site with an API address field              |
| `songloft-lynx-web-embedded.tar.gz`   | Static resources for a same-origin server                      |
| `version.json` / `checksums.txt`      | Version, commit, build time, asset list, and SHA-256 checksums |

## Verify downloads

Keep packages and `checksums.txt` in the same directory. On Linux, use `sha256sum -c checksums.txt --ignore-missing`. On macOS, compare `shasum -a 256 <package>` with the listed hash. On Windows, use PowerShell `Get-FileHash <package> -Algorithm SHA256`.

## Android

Requires Android 5.0 (API 21) or newer. Allow your chosen browser/file manager to install apps and open the APK, or run:

```bash
adb install -r songloft-lynx-android.apk
```

The application ID is `org.songloft.lynx`. Development and stable packages use the same app ID and maintainer release key; a higher build number supports upgrading while retaining data. A locally debug-signed APK cannot replace a maintainer-signed APK. Preserve data before changing signing identities. Older builds cannot be installed as upgrades over newer ones.

Notifications/background playback need system permissions; floating lyrics also need overlay permission. Check manufacturer background restrictions through the app's keep-alive guidance.

## iOS

Requires iOS 15; Live Activity requires iOS 16.2+. The IPA is an **unsigned device build** and cannot be installed directly on an ordinary device. Re-sign with your developer identity and a provisioning profile that authorizes the target device, then follow your signing tool's installation process. This repository currently does not publish App Store/TestFlight releases.

## HarmonyOS

Requires HarmonyOS NEXT / API 13+. Install using DevEco Studio or:

```bash
hdc install songloft-lynx-harmony.hap
```

Installation also depends on whether the signing certificate/profile authorizes the target device. Successful CI signing does not imply a profile supports arbitrary devices. HarmonyOS support is experimental; fullscreen video is unavailable. See the [handoff](../project/handoff.md) for outstanding checks.

## Web

Extract the standalone archive into a static server root, open it, and enter the backend address. Serve JS modules, Worker, and WASM with appropriate MIME types. The host page requires HTTPS (localhost is exempt), `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` response headers; without them SharedArrayBuffer is unavailable and the page stays blank. Cross-origin backends must permit the site's requests and CORP resource loading. Validate in a current browser.

The embedded archive hides the API address field and uses the same-origin backend. It is a static asset package and does not automatically replace the backend's embedded Flutter assets. Configure the backend's embedding source or the reverse proxy's static directory explicitly. Host resources currently include root-relative URLs; **subpath deployment remains unverified**.

Embedded needs the same headers; replacing Go's embedded assets alone does not establish a working deployment. See [Web deployment](web-deployment.md).

## Connect to a server

All platforms need a separately running [Songloft backend](https://github.com/songloft-org/songloft). This client does not implement bundled local mode.

Enter the full server URL, username, and password. The backend defaults to port `58091`; fresh installations initially use `admin/admin`. On a phone, `localhost` means the phone itself. Use a reachable development-host address, or `adb reverse tcp:58091 tcp:58091` for Android development.

About shows client build metadata and the server version. “Backend update” updates the server; update the client by downloading and installing a newer package.
