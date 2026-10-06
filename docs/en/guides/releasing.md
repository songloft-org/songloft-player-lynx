# Building and releasing

[简体中文](../../guides/releasing.md)

## Triggers and artifacts

`.github/workflows/build-and-release.yml` replaces the three independent manual dev workflows.

| Trigger                    | Behavior                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Code push to `main`        | Validate/build all platforms, then update the `dev` prerelease                      |
| Push `vX.Y.Z`              | Validate tag against package.json and publish a stable release                      |
| Push `vX.Y.Z-beta.N`, etc. | Publish a versioned prerelease without making it latest                             |
| Actions → Run workflow     | Select main to rebuild dev, or a v\* tag to build that version                      |
| Pull request               | Validate/build; Android uses debug signing and HarmonyOS is unsigned; no publishing |

Documentation/license changes do not automatically trigger builds. Manual builds on other branches produce artifacts only. Both dev and versioned publishing require Android, iOS, HarmonyOS, and both Web modes to succeed. Failed platform runs retain their artifacts and do not update the release.

Assets upload to a draft and become public only after every upload succeeds. Dev is temporarily hidden during replacement; a failed upload leaves a draft for inspection and rerun. Existing stable/preview releases, including drafts, cannot be overwritten: inspect any failed draft before manually deleting or publishing it. Dev removes legacy asset names from the same release.

See [installation](installation.md) for filenames. Releases include `version.json` and `checksums.txt`. The new workflow replaces the separate `dev-harmony` entry point; historical releases are not automatically deleted.

## One-time setup

Repository Actions must allow workflow execution and `contents: write` for the release job. Configure repository secrets:

| Secret                           | Purpose                             |
| -------------------------------- | ----------------------------------- |
| `ANDROID_KEYSTORE_BASE64`        | Base64 Android release keystore     |
| `ANDROID_KEYSTORE_PASSWORD`      | Keystore password                   |
| `ANDROID_KEY_ALIAS`              | Signing alias                       |
| `ANDROID_KEY_PASSWORD`           | Private-key password                |
| `HARMONY_SIGNING_KEY_BASE64`     | Base64 `.p12` private-key container |
| `HARMONY_SIGNING_PROFILE_BASE64` | Base64 `.p7b` profile               |
| `HARMONY_SIGNING_CERT_BASE64`    | Base64 certificate chain            |
| `HARMONY_KEYSTORE_PASSWORD`      | Container password                  |
| `HARMONY_SIGNING_KEY_PASSWORD`   | Private-key password                |
| `HARMONY_KEY_ALIAS`              | Optional; defaults to `songloft`    |

Keep the same Android signing identity across development/stable releases to preserve upgrade compatibility. A HarmonyOS profile determines authorized target devices. Missing signing materials fail published builds instead of falling back to debug/unsigned packages. Unsigned PR artifacts only validate compilation.

iOS builds a device Release app explicitly labeled `nosign`. Certificate import and App Store upload are not implemented.

## Manual release script

```bash
pnpm run release patch --dry-run
pnpm run release patch
pnpm run release minor
pnpm run release major
pnpm run release 0.2.0-beta.1
pnpm run release release       # Remove the current prerelease suffix
```

`--dry-run` prints the version and operations without editing, committing, connecting to the network, or pushing; a dirty working tree is allowed for previewing. Actual releases require `main`, a clean tree, a newer version, an unused local/remote tag, and local main containing remote main. The script checks these prerequisites before asking for confirmation.

It synchronizes package.json and native iOS/HarmonyOS versions, makes a Chinese Conventional Commit, creates an annotated `v*` tag, then pushes main and that exact tag using `git push --atomic`. Pushing the tag starts CI. Android reads defaults from package.json/build metadata instead of maintaining another version constant.

`--yes` skips the script's interactive prompt. `--no-push` creates the local commit/tag only; remote preflight still runs. Published versions are immutable. Failures preserve local results for inspection; the script never deletes tags, resets, or automatically rolls back.

```bash
pnpm run release minor --no-push
# After reviewing, push the exact generated tag:
git push --atomic origin HEAD:refs/heads/main refs/tags/v0.2.0
```

Do not rerun the bump script to retry the same version: it calculates another version. Retry failed builds in Actions on the existing tag. Rerunning a tag with an existing stable/preview release refuses to overwrite it.

## Shared version and build number

`package.json.version` is the sole base semantic version. CI generates `.build/version.json` once and distributes it together with the exact Lynx/Web bundles to platform jobs.

- Dev displays `dev`; stable/preview displays the version tag without `v`.
- iOS uses the base `X.Y.Z` as MARKETING_VERSION, without prerelease suffixes. JS displays the complete version.
- All native hosts use the same `build_number`: UTC build seconds minus `2020-01-01T00:00:00Z`. It grows across channels without depending on workflow run counters or rerun numbering.
- About displays the client version, source commit, and UTC build time.
- `SONGLOFT_BUILD_METADATA` points to metadata validated against package.json. Corrupt/mismatched metadata fails the build.

To inject local CI-style metadata:

```bash
node scripts/prepare-build.mjs
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
```

This generates dev metadata. Ordinary local builds also display dev and carry no release source provenance. In-app client update checks remain unimplemented; version.json provides accurate metadata for future integration.

## Release gates

Prepare runs typechecking, production builds for both JS targets, the full JS suite, and release-tool regressions. Platform jobs compile hosts and inspect embedded bundles, versions/build numbers, Lynx libraries, signatures, and Web asset references. The release job requires all five nonempty packages and generates SHA-256 hashes and a version.json asset manifest.

Production JS replaces the devtools/E2E entry point by default. Native TestBridge registration/startup is Debug-only and listens on `127.0.0.1:9230`. Downloadable dev packages are Release builds too and cannot be used for TestBridge E2E. See [testing](testing.md) for test builds.

CI verifies compilation and packages. Background playback, permissions, DLNA, video, and HarmonyOS still require device testing. After the new workflow first succeeds, check all five downloads, metadata and signing identities, then test installation and upgrade behavior on actual devices.
