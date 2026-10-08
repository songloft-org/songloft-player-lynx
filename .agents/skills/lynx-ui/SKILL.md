---
name: lynx-ui
description: "Use when building with lynx-ui: select components, verify public APIs, adapt examples, configure Luna themes, choose motion packages, compose screens, or troubleshoot lynx-ui usage."
---

# lynx-ui

Use the smallest relevant reference set.

## Workflow

1. Route the task:
   - Component selection: `references/component-overview.md`
   - Setup or troubleshooting boundaries: `references/foundation.md`
   - Luna themes and tokens: `references/theming-and-tokens.md`
   - Animation choice: `references/motion.md`
   - Common component combinations: `references/component-composition.md`
2. After selecting a component, inspect:
   - `references/components/<component>/guide.md` when available
   - `references/components/<component>/api.md` for exact public props, methods, and exports
   - `references/components/<component>/examples.md` for implementation patterns
3. Load additional component references only for components used by the task.

## Rules

- Follow the consuming repository's import constraints. Songloft imports component packages individually and uses `src/shared/ui/AppSwitch.tsx`; its AGENTS.md forbids the `@lynx-js/lynx-ui` barrel and `@lynx-js/lynx-ui-popover`. Check installed exports before adapting upstream examples.
- Preserve documented component composition and state handling.
- Verify props, methods, and exports in `api.md`.
- Treat examples as usage patterns; verify their APIs in `api.md`.
- Report missing coverage instead of guessing.
