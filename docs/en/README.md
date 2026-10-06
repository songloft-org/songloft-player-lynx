# Documentation index

Songloft Player (Lynx) documentation, organized by task using Diátaxis.

[简体中文](../README.md) · [Installation](guides/installation.md) · [Releasing](guides/releasing.md) · [Contributing](../../CONTRIBUTING.en.md)

Public installation, release, build, testing, and contribution guides are bilingual. Historical batches, internal audits, and ArkTS references retain their original language; this index explicitly links to Chinese source documents.

| Directory                                             | Category         | Purpose                                                |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| [getting-started.md (Chinese)](../getting-started.md) | Tutorial         | Run the project for the first time                     |
| [guides/](guides/)                                    | How-to           | Build, test, deploy, debug, or add native capabilities |
| [reference/ (Chinese)](../reference/)                 | Reference        | Exact conventions and contracts                        |
| [architecture/ (Chinese)](../architecture/)           | Explanation      | Understand architectural decisions                     |
| [project/](project/)                                  | Project tracking | Status, handoff, issues, and plans                     |
| [archive/ (Chinese)](../archive/)                     | Archive          | Historical evidence, not current state                 |

Root references: [AGENTS](../../AGENTS.md), [ARCHITECTURE](../../ARCHITECTURE.md), [HARNESS](../../HARNESS.md), and [DESIGN](../../DESIGN.md).

## Project status

Avoid duplicating changing test counts, artifact sizes, or platform validation dates.

| Question                                           | Maintained reference                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Current delivery, validation, and outstanding work | [Handoff](project/handoff.md)                                            |
| Historical batches                                 | [Progress (Chinese)](../project/progress.md)                             |
| Known issues                                       | [Bugs (Chinese)](../project/bugs.md)                                     |
| Minimum versions and platform capabilities         | [Platforms (Chinese)](../reference/platforms.md)                         |
| Native methods, events, and registration           | [Native modules (Chinese)](../reference/native-modules.md)               |
| September 1 historical audit                       | [Audit report (Chinese)](../archive/2026-09-01-codebase-audit/Report.md) |

## guides/ — How-to

| Document                                                        | Purpose                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Installation](guides/installation.md)                          | Packages, signing limitations, checksums, and server connections |
| [Releasing](guides/releasing.md)                                | Automatic dev, manual releases, versions, secrets, and gates     |
| [Build and run](guides/build-and-run.md)                        | Four-platform commands and toolchain pitfalls                    |
| [Testing](guides/testing.md)                                    | Unit/E2E execution, environment checks, and skips                |
| [Native development (Chinese)](../guides/native-development.md) | Synchronizing facades, host methods, and registration            |
| [Web deployment](guides/web-deployment.md)                      | Standalone/embedded hosts and limitations                        |
| [Debugging (Chinese)](../guides/debugging.md)                   | Device diagnostics and browser probes                            |

## reference/ — Contracts

| Document                                                     | Purpose                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| [API conventions (Chinese)](../reference/api-conventions.md) | API/store signatures, ranges, naming, E2E handles        |
| [Native modules (Chinese)](../reference/native-modules.md)   | Methods, events, platform matrix, and invariants         |
| [Client updates](reference/client-updates.md) | Bundle signatures, compatibility, assets, shell identity, and current delivery limits |
| [Device cache](reference/device-cache.md) | Cache identity, variant index, task Callback contract, and platform implementation status |
| [Back navigation (Chinese)](../reference/back-navigation.md) | Overlay/route/tab back behavior                          |
| [Platforms (Chinese)](../reference/platforms.md)             | Android API 21, iOS 15, HarmonyOS NEXT, current browsers |
| [ArkTS references (Chinese)](../reference/arkts/)            | HarmonyOS constraints and migration references           |

Design tokens are defined in [tokens.css](../../src/shared/theme/tokens.css). Design rationale lives in [DESIGN.md](../../DESIGN.md), including Liquid Glass notes. Backend OpenAPI lives in the backend repository or its development Swagger UI; do not duplicate it here.

## architecture/ — Explanation

| Document                                                                  | Purpose                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Overview (Chinese)](../architecture/overview.md)                         | Layers, state boundaries, playback flow, and root overlays |
| [Lynx constraints (Chinese)](../architecture/lynx-constraints.md)         | Threads, realms, Worker behavior, and layout constraints   |
| [Platform differences (Chinese)](../architecture/platform-differences.md) | Capability/behavior differences and media handling         |
| [E2E design (Chinese)](../architecture/e2e-testing-design.md)             | Drivers, TestBridge protocol, and scenarios                |

## project/ — Tracking

| Document                                                         | Purpose                                            |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| [Handoff](project/handoff.md)                                    | Current snapshot, validation, and outstanding work |
| [Pitfalls (Chinese)](../project/pitfalls.md)                     | Root-cause evidence and operational references     |
| [Progress (Chinese)](../project/progress.md)                     | Dated implementation/validation history            |
| [Bugs (Chinese)](../project/bugs.md)                             | Open/closed defects                                |
| [Upstream issues (Chinese)](../project/plans/upstream-issues.md) | Upstream reports and local patches                 |

## archive/ — Historical evidence

Archived material describes a frozen baseline. Do not copy its signatures or status into current documentation; see the [migration corrections (Chinese)](../archive/migration/README.md).

| Document                                                           | Purpose                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [September 1 audit](../archive/2026-09-01-codebase-audit/)         | Frozen report and evidence; open findings are tracked in bugs                 |
| [Design plans](../archive/plans/)                                  | Delivered HIG/material plans, with remaining work called out in their headers |
| [August audit fix plan](../archive/2026-08-14-audit-fix-plan.md)   | Closed historical audit fixes                                                 |
| [Harmony integration plan](../archive/harmony-integration-plan.md) | Historical host integration                                                   |
| [Native Lynx plugins](../archive/lynx-native-plugin-rendering.md)  | Delivered native plugin/frame design                                          |
| [Migration research](../archive/migration/)                        | Pre-implementation research and corrections                                   |
| [Web plugin crash](../archive/web-plugin-tab-crash.md)             | Closed frame-lifecycle crash investigation                                    |
| [Web support](../archive/web-support.md)                           | Original plan and corrected assumptions                                       |

Completed lyrics/settings plans were removed in August because later implementations made their target-state descriptions obsolete.
