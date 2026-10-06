# Client update protocol

[简体中文](../../reference/client-updates.md) · [Releasing](../guides/releasing.md)

**P2a currently provides the publishing contract and compatibility model. Native download/loading/rollback and the update UI belong to P2b/P2c; clients cannot perform hot updates yet.** Desktop and bundled local backends remain outside this work.

## Identity and release assets

Versions still originate from `package.json` and shared `.build/version.json`. `prepare-build.mjs` also generates `.build/native-host.json` with shell identity, protocol, bridge/local schema, engine versions, required capabilities, and trusted public keys. This accompanies the same build. P2b will embed it in native resources; hot bundles must never replace it.

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

## Validation and outstanding work

Regressions cover complete full packages, signing keys, byte tampering, size limits, missing external resources, debug payloads, unsigned fallback, immutable host snapshot consistency, and platform/engine/bridge/schema/capability mismatches. Production update signing is unconfigured; nothing was pushed or published.

P2b connects shell resources, native modules, download progress/cancellation, and cold-start pending confirmation/rollback. P2c adds channel-specific checking, full-package links, and Web deployment updates. Until those paths are complete, this document describes protocol preparation.
