# Installation and server connections

[简体中文](../../guides/installation.md)

## Choose a release

Download standard packages from the [Lynx stable Release](https://github.com/songloft-org/songloft-player-lynx/releases/latest) or rolling [Lynx dev Release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev). Download Bundle packages from the backend [stable Release](https://github.com/songloft-org/songloft/releases/latest) or [dev Release](https://github.com/songloft-org/songloft/releases/tag/dev).

| File                                  | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `songloft-lynx-android.apk`            | Standard release-signed Android APK without the local Go backend |
| `songloft-lynx-bundled-android.apk`    | Bundle release-signed Android APK with the embedded Go backend   |
| `songloft-lynx-ios-nosign.ipa`         | Standard unsigned iOS IPA; re-sign to install                   |
| `songloft-lynx-bundled-ios-nosign.ipa` | Bundle unsigned iOS IPA with the embedded Go backend; re-sign it |
| `songloft-lynx-harmony.hap`            | Standard signed HarmonyOS HAP without the local Go backend      |
| `songloft-lynx-web-standalone.tar.gz` | Independent static site with an API address field              |
| `songloft-lynx-web-embedded.tar.gz`   | Static resources for a same-origin server                      |
| `version.json` / `checksums.txt`      | Version, commit, build time, asset list, and SHA-256 checksums |

For Windows 10 22H2 or later, choose the standard NSIS installer `songloft-lynx-standard-win32-x64.exe` or the bundled installer `songloft-lynx-bundled-win32-x64.exe`. For macOS 13 or later, choose the matching standard or bundled `songloft-lynx-standard-darwin-arm64.dmg`/`songloft-lynx-bundled-darwin-arm64.dmg` file. Apple silicon uses arm64 and Intel uses x64. The matching macOS `.zip` is used for in-app updates. Bundled builds support local music from the login screen or Settings. Standard builds connect to a remote server.

The [package inventory](https://github.com/songloft-org/songloft/blob/main/docs/en/release-packages.md) lists Windows and both macOS DMG and ZIP filenames alongside the other packages.

## Verify downloads

Keep packages and `checksums.txt` in the same directory. On Linux, use `sha256sum -c checksums.txt --ignore-missing`. On macOS, compare `shasum -a 256 <package>` with the listed hash. On Windows, use PowerShell `Get-FileHash <package> -Algorithm SHA256`.

## Android

The Bundle APK requires Android 6.0 (API 23) or newer. The standard APK supports Android 5.0 (API 21). Allow your chosen browser/file manager to install apps and open the APK, or run:

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

Extract the standalone archive into a static server root, open it, and enter the backend address. Serve JS modules, Worker, and WASM with appropriate MIME types. Current core flows do not require SAB or isolation headers and work over ordinary HTTP. HTTPS enables secure-context features such as clipboard and wake lock. Cross-origin backends must permit API requests; hosts opting into COEP also require compatible CORP resource loading. Validate in a current browser.

The embedded archive hides the API address field and uses the same-origin backend. It is a static asset package and does not automatically replace the backend's embedded Flutter assets. Configure the backend's embedding source or the reverse proxy's static directory explicitly. Host resources currently include root-relative URLs; **subpath deployment remains unverified**.

Embedded needs the same headers; replacing Go's embedded assets alone does not establish a working deployment. See [Web deployment](web-deployment.md).

## Local and remote modes

The Android and iOS Bundle packages include a Go backend built by the backend Release workflow from the pinned backend commit. The same Bundle package supports local mode and remote servers. Standard packages connect to remote servers only. There is no extra mode-selection dialog on first launch.

- **Android Bundle**: the first time local mode is enabled, select a music directory with the system folder picker and grant read access. The backend chooses a port; after its health check, the client signs in using local credentials generated by the backend.
- **iOS Bundle**: local mode uses the app's Documents directory without an external folder picker. Add music through the system Files app.
- **HarmonyOS and Web**: these packages do not include the backend and need a remote server.

For remote mode, enter the full server URL, username, and password. The backend defaults to port `58091`; fresh server installations initially use `admin/admin`. On a phone, `localhost` means the phone itself. Use a reachable development-host address, or `adb reverse tcp:58091 tcp:58091` for Android development.

Switching to remote mode stops the local backend but keeps its library data. About shows client build metadata and the server version. “Backend update” updates a remote server; update the client by downloading and installing a newer package.
