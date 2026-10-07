# Client update protocol

[简体中文](../../reference/client-updates.md) · [Releasing](../guides/releasing.md)

**P2a publishing, P2b native updaters, and the P2c About entry are integrated in source.** A local signed fixture verifies Android UI download/cancel, uninterrupted playback, cold activation, and builtin restore; Web deployment links are also verified. HarmonyOS passes a clean release HAP build; production signing, iOS compilation and device acceptance on both hosts remain open. Desktop and bundled local backends remain outside this work.

## Identity and release assets

Versions still originate from `package.json` and shared `.build/version.json`. `prepare-build.mjs` generates `.build/native-host.json` with shell identity, protocol, bridge/schema, engines, capabilities, and public keys. The compiler writes `.build/bundle-host.json` for the same compiled identity; copy scripts copy it as `native-host.json`. Explicit release builds reject snapshots differing from prepare. Android reads APK assets, iOS reads app Resources, and HarmonyOS reads rawfile; hot bundles must never replace this resource. CI shares both snapshots; package inspection requires embedded identity, public keys, and capabilities to exactly match preparation.

`updates/native-contract.json` defines Android engine `4.0.0`, iOS/HarmonyOS `4.0.1`, bridge `3`, local schema `2`, and minimum shell `0.1.0`. A complete shell provides `audio.sourceLoad.v1`, `updater.v1`, `updater.metadata.v1`, `songCache.v2`, and `pluginFrame.templates.v1`. Bridge 2 added independent system-TLS metadata reads. Bridge 3 / schema 2 adds identity-aware cache indexes and task interfaces, preserving legacy files and isolating new directories from the old ABI. Older shells checking this bundle must install a new shell from their own channel. Native capabilities, SDK changes, and incompatible local data changes require updating the contract and installing a new package.

`pluginFrame.templates.v1` marks the native plugin-template download/wiring fixes on all three platforms without changing the method ABI or local schema. Older immutable shell snapshots lacking this marker reject subsequent bundles as capability-incompatible and offer installation packages from their own channel. A previous test APK's snapshot is not rewritten even if its loader code is present. Install a new shell carrying the marker before using compatible bundle updates. iOS source is integrated but compilation/device acceptance remains open; capability declarations and passing release tools do not establish success on every platform.

The five full installation/deployment packages remain. With valid signing configuration, releases additionally provide:

| File | Meaning |
|---|---|
| `songloft-lynx-main.lynx.bundle` | Shared native template; maximum 32 MiB |
| `version.json` | One identity, sizes/SHA-256 for six assets, and `bundle_update` compatibility declarations; maximum 128 KiB |
| `version.json.sig` | Independent signature of the original manifest bytes; JSON envelope |
| `checksums.txt` | SHA-256 for full packages, bundle, manifest, and signature |

Without a private signing key, publishing produces only full packages, sets `bundle_update` to `null`, and removes stale bundle/signature files. A configured private key with a missing/mismatched public key, or a public key differing from the prepare-stage shell snapshot, fails publishing. Downloaded manifests cannot introduce trusted keys.

## Signature and encoding

The algorithm is **RSA PKCS#1 v1.5 with SHA-256**, using 2048/3072/4096-bit keys. Configure the public key as SPKI PEM. Builds derive Base64 SPKI DER for Java/ArkTS and PKCS#1 DER for iOS SecKey, preserving `key_bits`. `key_id` is the first 16 hexadecimal characters of SHA-256 over SPKI DER. Verify original UTF-8 bytes, never parsed/reserialized JSON.

The envelope is `{protocol: 1, key_id, algorithm: "rsa-pkcs1v15-sha256", signature}` with standard Base64 signature bytes. Unknown protocol/algorithm/key IDs, byte tampering, and invalid signatures reject hot updates. Checksums do not authenticate the publisher.

`updates/fixtures/signature-v1.json` is a shared public verification vector with original manifest bytes, signature, public key, and a Chinese test payload. Its ephemeral private key was discarded and cannot sign real releases. Node/Java verification passes; iOS/HarmonyOS host compilation and vector verification remain P2b checks.

Algorithm mappings follow [Java Signature](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/security/Signature.html), [Apple SecKeyAlgorithm](https://developer.apple.com/documentation/security/seckeyalgorithm/rsasignaturemessagepkcs1v15sha256), and [HarmonyOS RSA PKCS1 verification](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/crypto-rsa-sign-sig-verify-pkcs1-by-segment-V13).

## Compatibility and resources

`bundle_update` contains protocol, bundle identity, asset name/size/hash, local schema, and targets. Identity is `<channel>-<build_number>-<git_commit>`. Each target specifies platform, exact engine version, minimum shell version, bridge range, and required capabilities. Incompatible clients use a full package from their own channel.

TS `bundleCompatibility()` is a presentation check and **cannot authorize loading**. Native prepare must independently verify signatures, compatibility, and downloaded hashes using immutable shell identity/channel/trust. P2c will limit dev to `/releases/tags/dev` and stable to `/releases/latest`; preview cannot cross either channel.

Native build output currently consists of `main.lynx.bundle`, with Web output in a separate `web/` directory and inline SVG icons. Extra native chunks/resources fail publishing until included in a signed resource protocol. Server artwork/plugin data is separate from client build assets. This first protocol downloads no archives; asset paths cannot contain separators and the bundle filename is fixed.

## Three native cold-start loaders and rollback (P2b)

`SongloftUpdate` reads use Callbacks: `getInfo/getState/inspectManifest/fetchMetadata`. `download(requestJson, callback)` and `restoreBuiltin(callback)` respond after persistence. Cancel, startup confirmation, and failure reporting are void commands. TS detects every required method, times out reads after 15 seconds and downloads after 240 seconds, cancels the exact timed-out task, and ignores late callbacks. Older eight-method shells may still read state/confirm startup; without the ninth `fetchMetadata` method, native checks are disabled and the same-channel release page remains available. Web uses browser trust and full deployment packages instead of this native module.

Android stores signed manifests and bundles in `filesDir/bundle_updates`. Streaming writes an isolated temporary directory; signature, compatibility, full size, and hash must pass before atomically committing `pending`. Cancellation stops the actual HTTP Call and cleans partial files. Downloads use independent system TLS, prohibit HTTP/downgrade redirects and initial token-bearing URLs, and never inherit music-server certificate bypass settings. Available storage is checked before downloading, with a 32 MiB cap. Subsequent preparation/startup prunes unreferenced candidates.

iOS stores equivalent state in Application Support `bundle_updates`, excluded from iCloud backups. SecKey verifies original bytes and CryptoKit streams file SHA-256. An independent ephemeral URLSession uses system TLS, enforces HTTPS on every redirect, streams bounded writes, and cancels the actual task. Files are synchronized before atomic state replacement. The root template provider and fatal Lynx lifecycle callback implement trial loading/failure reporting; the 120-second confirmation window uses monotonic time. Source and resource entries are present in Xcode. Apple CI is configured to compile and execute `scripts/verify-ios-updater.swift`; configuring this check does not establish a successful execution.

HarmonyOS stores signed files and equivalent pointers in `filesDir/bundle_updates`, using CryptoFramework RSA PKCS1/SHA256 verification and streaming file hashes. An independent Remote Communication Kit session explicitly uses system CAs, disables automatic redirects, and manually follows each HTTPS-validated hop. Streaming writes, actual request cancellation, storage checks, and a 180-second overall transfer deadline are implemented. The Index root loader selects candidates and checks TemplateBundle parsing errors, allowing immediate builtin fallback while preserving the unconfirmed trial for the next cold start. LynxViewClient reports fatal errors; confirmation uses a 120-second system-uptime deadline. APIs follow [RCP API 12 documentation](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V5/remote-communication-rcp-V5) and [Lynx 4.0.1 lifecycle source](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_harmony/src/main/ets/tasm/LynxViewClient.ets).

Prepared updates affect the next cold start, preserving current playback and the root view. Only the app root template uses this loader, leaving plugin frames separate. Each cold start revalidates disk manifests, signatures, compatibility, and hashes, retaining a confirmed bundle and its predecessor, with the APK bundle always available. Installing a new shell rechecks compatibility and newness so older downloaded code cannot override the new package.

The trial pointer is persisted before loading. Once the real route mounts and the auth/redirect splash settles, TS waits 1.5 seconds before confirming the bundleId; native confirmation expires after 120 seconds. Render-boundary errors, fatal native load errors, or crashes leave the trial unconfirmed, so the next cold start restores the previous confirmed or builtin bundle. Auth business errors are not JS startup failures. Restoring builtin code also takes effect on the next cold start.

The native downloader independently enforces channel/newness: stable versions strictly increase; known dev commits must differ, with a build-time fallback of at least ten minutes when commit identity is missing. Signature/hash, storage, cancellation, and download failures never commit `pending`.

## Channel checks and interaction

About separates client updates from backend upgrades and displays immutable shell and running bundle identities. Checks are manual, downloads never replace the running root, and prepared code applies on the next cold start. Task state survives navigation, progress is scoped to taskId, and cancellation waits for native termination. Builtin restore requires a second tap and also applies on the next cold start.

- Dev queries only `releases/tags/dev`; stable queries only `releases/latest`. Drafts, cross-channel manifests, stable prereleases, and unexpected asset URLs are rejected. No history or alternate channel is consulted; bundle and package links share one candidate.
- Matching valid dev commits mean no update; different commits mean an update. Missing commits fall back to build timestamps with a ten-minute minimum increase. Stable versions must strictly increase numerically. Insufficient metadata displays an unknown comparison and the channel release page instead of claiming current or suggesting an older package.
- Public release data is cached for 60 seconds and concurrent reads deduplicate by channel/proxy; explicit checks bypass cache. Dev revisions/assets are checked before and after reading, with one retry on changes. Signature failure also allows at most one dev recheck; continued failure offers only installation/release links.
- Metadata bypasses business HttpClient and never sends Songloft tokens, Authorization, or Cookie. Native system TLS permits at most eight HTTPS-validated redirects, a twelve-second overall network deadline, and bounded streaming: API 512 KiB, manifest 128 KiB, signature 8 KiB. Web uses browser TLS and bounded credential-free fetch.
- The existing HTTPS GitHub proxy prefix wraps API and download addresses separately, without credentials/query parameters. Proxy transport failures retry only the same direct URL. Native signature/hash checks remain mandatory.
- Android/HarmonyOS offer APK/HAP; iOS explains IPA signing. Web offers the matching standalone/embedded deployment archive and refresh guidance; native bundles cannot update the Web host scripts.

## Validation and outstanding work

Regressions cover complete full packages, signing keys, byte tampering, size limits, missing external resources, debug payloads, unsigned fallback, immutable host snapshot consistency, and platform/engine/bridge/schema/capability mismatches. Production update signing is unconfigured; nothing was pushed or published.

iOS compilation, execution of the Apple verification harness, and device download/rollback remain open. Six HarmonyOS core regressions execute actual transpiled source using real Node RSA, HTTPS, and filesystem adapters, now including independent TLS metadata reads. Separately, SDK `26.0.0.105` passes ArkTS compilation and a clean release HAP build of `e09592b`, including package-content verification; the package remains unsigned and uninstalled. The API 13 minimum declaration is preserved, but device SDK, download/cold-start/rollback behavior remains unverified. Android evidence uses a Debug native shell, actual bundles without JS test-bridge markers, temporary public keys, and a local HTTPS release fixture; UI check/download/cancel/cold-start/restore evidence is not a production signing release. See [progress](../../project/progress.md). Native source integration does not establish acceptance on all three platforms.
