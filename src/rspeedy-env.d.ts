/// <reference types="@lynx-js/rspeedy/client" />

declare module '@lynx-js/types' {
  interface GlobalProps {
    /**
     * Host-injected system appearance, read through `lynx.__globalProps` by
     * `src/native/system-appearance.ts`. Set by the Android host before
     * `renderTemplateUrl` (so the first frame has the right theme) and refreshed
     * on `onConfigurationChanged`. Optional because non-Android hosts
     * (LynxExplorer, Lynxtron, tests) inject nothing — every read coerces.
     */
    systemTheme?: string
    systemLocale?: string
  }
}

// This export makes the file a module
export {}
