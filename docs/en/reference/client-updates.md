# Client update protocol

[简体中文](../../reference/client-updates.md) · [Releasing](../guides/releasing.md)

**P2a publishing and the P2b Android downloader/cold-start loader are implemented in source. iOS/HarmonyOS integration and the P2c UI remain in progress; there is no in-app hot-update entry yet.** Desktop and bundled local backends remain outside this work.

## Identity and release assets

Versions still originate from `package.json` and shared `.build/version.json`. `prepare-build.mjs` generates `.build/native-host.json` with shell identity, protocol, bridge/schema, engines, capabilities, and public keys. The compiler writes `.build/bundle-host.json` for the same compiled identity; copy scripts copy it as `native-host.json`. Explicit release builds reject snapshots differing from prepare. Android reads APK assets; hot bundles must never replace this resource. iOS/HarmonyOS resource/runtime integration remains pending.

`updates/native-contract.json` defines Android engine `4.0.0`, iOS/HarmonyOS `4.0.1`, bridge/local schema `1`, and minimum shell `0.1.0`. `audio.sourceLoad.v1` and `updater.v1` require a complete newly installed shell. Native capabilities, SDK changes, and incompatible local data changes require updating the contract and installing a new package.

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

## Android cold start and rollback (first P2b batch)

`SongloftUpdate` reads use Callbacks: `getInfo/getState/inspectManifest`. `download(requestJson, callback)` and `restoreBuiltin(callback)` respond after persistence. Cancel, startup confirmation, and failure reporting are void commands. TS detects every required method, times out reads after 15 seconds and downloads after 240 seconds, cancels the exact timed-out task, and ignores late callbacks. Web has no such module; deployment updates follow in P2c.

Android stores signed manifests and bundles in `filesDir/bundle_updates`. Streaming writes an isolated temporary directory; signature, compatibility, full size, and hash must pass before atomically committing `pending`. Cancellation stops the actual HTTP Call and cleans partial files. Downloads use independent system TLS, prohibit HTTP/downgrade redirects and initial token-bearing URLs, and never inherit music-server certificate bypass settings. Available storage is checked before downloading, with a 32 MiB cap. Subsequent preparation/startup prunes unreferenced candidates.

Prepared updates affect the next cold start, preserving current playback and the root view. Only the app root template uses this loader, leaving plugin frames separate. Each cold start revalidates disk manifests, signatures, compatibility, and hashes, retaining a confirmed bundle and its predecessor, with the APK bundle always available. Installing a new shell rechecks compatibility and newness so older downloaded code cannot override the new package.

The trial pointer is persisted before loading. Once the real route mounts and the auth/redirect splash settles, TS waits 1.5 seconds before confirming the bundleId; native confirmation expires after 120 seconds. Render-boundary errors, fatal native load errors, or crashes leave the trial unconfirmed, so the next cold start restores the previous confirmed or builtin bundle. Auth business errors are not JS startup failures. Restoring builtin code also takes effect on the next cold start.

The native downloader independently enforces channel/newness: stable versions strictly increase; known dev commits must differ, with a build-time fallback of at least ten minutes when commit identity is missing. Signature/hash, storage, cancellation, and download failures never commit `pending`.

## Validation and outstanding work

Regressions cover complete full packages, signing keys, byte tampering, size limits, missing external resources, debug payloads, unsigned fallback, immutable host snapshot consistency, and platform/engine/bridge/schema/capability mismatches. Production update signing is unconfigured; nothing was pushed or published.

P2b continues with iOS/HarmonyOS resources, modules, and the same download/rollback contract. P2c adds channel-specific checking, full-package links, and Web deployment updates. Android source and test completion does not establish acceptance on all three platforms.
