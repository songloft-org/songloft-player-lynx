import { fileURLToPath } from 'node:url'

import { defineConfig, rspack } from '@lynx-js/rspeedy'

import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

/**
 * TanStack Router's `router-core` writes `self.__TSR_ROUTER__ = this` in the
 * `RouterCore` constructor whenever its bundled `isServer` constant is `false`
 * (rspeedy resolves the `browser` export condition, so it is). The Lynx
 * background thread realm has no `self`/`window`, so on device this throws
 * `undefined is not an object (evaluating 'x.__TSR_ROUTER__=this')` — `x` is the
 * minifier's scope-hoisted alias of the global `self`, captured while the
 * background bundle's modules are being evaluated (the SWC minifier also drops
 * the `if (!(isServer ?? …))` guard because `isServer === false`, making the
 * write unconditional). A runtime shim inside `createAppRouter` runs too late:
 * the module-scope alias is fixed before that code executes.
 *
 * Fix at the bundler layer: prepend a raw banner so `globalThis.self`/`window`
 * exist as the very FIRST statements of every emitted chunk — before the Rspack
 * runtime and before any app/vendor module (incl. router-core) is evaluated in
 * that chunk. `entryOnly: false` covers vendor/async chunks too, and the guard
 * is idempotent + harmless on the main-thread bundle. We deliberately do NOT
 * define `document`, keeping router-core on its non-DOM (non-SSR) branch.
 */
const GLOBAL_SELF_BANNER =
  'typeof globalThis.self==="undefined"&&(globalThis.self=globalThis);'

/**
 * Lynx's engine provides NO `AbortController`/`AbortSignal` (a WHATWG API, not
 * ECMAScript). TanStack Router's `loadClientRoute` and TanStack Query's fetch
 * path both do `new AbortController()` unconditionally → on device this throws
 * `ReferenceError: AbortController is not defined` (seen on the main thread
 * during `checkAuth` → route load). Unlike `self` (a declared-but-undefined host
 * binding), `AbortController` is *undeclared*, so defining `globalThis.AbortController`
 * makes the bare reference resolve. Inject a minimal, existence-guarded polyfill
 * as a raw banner so it exists on EVERY chunk (main-thread + background) before
 * any router/query code runs. Real engines that already have it are untouched.
 */
const GLOBAL_ABORT_POLYFILL =
  '(function(g){if(typeof g.AbortController!=="undefined")return;' +
  'function S(){this.aborted=false;this.reason=undefined;this._l=[];}' +
  'S.prototype.addEventListener=function(t,c){if(t==="abort")this._l.push(c);};' +
  'S.prototype.removeEventListener=function(t,c){if(t==="abort")this._l=this._l.filter(function(f){return f!==c;});};' +
  'S.prototype.dispatchEvent=function(e){var l=this._l.slice();for(var i=0;i<l.length;i++){try{l[i].call(this,e);}catch(_){}}' +
  'if(typeof this.onabort==="function"){try{this.onabort(e);}catch(_){}}return true;};' +
  'S.prototype.throwIfAborted=function(){if(this.aborted)throw this.reason;};' +
  'function C(){this.signal=new S();}' +
  'C.prototype.abort=function(r){var s=this.signal;if(s.aborted)return;s.aborted=true;' +
  's.reason=r!==undefined?r:new Error("Aborted");s.dispatchEvent({type:"abort"});};' +
  'g.AbortController=C;g.AbortSignal=S;})(globalThis);'

/**
 * Lynx 4.0.0's host `lynx.queueMicrotask` throws from inside its own
 * implementation on device: `TypeError: cannot read property 'getNativeLynx' of
 * undefined` (LynxError 20100, stack bottoms out at `lynx_core.js` —
 * `queueMicrotask`). That matters far more than it looks, because ReactLynx does
 *
 *     if (lynx.queueMicrotask) return (fn) => lynx.queueMicrotask(fn)   // utils.js
 *     options.requestAnimationFrame = lynxQueueMicrotask                // lynx.js
 *
 * i.e. the broken host function becomes **Preact's effect scheduler**. When it
 * throws, the scheduled callback is never invoked, so that flush of `useEffect`
 * is silently dropped (later renders mask it, which is why this shows up as
 * intermittent stale UI rather than an obvious failure).
 *
 * ReactLynx already ships the correct fallback — a resolved-Promise microtask —
 * but only picks it when `lynx.queueMicrotask` is absent. So substitute that
 * same implementation onto `lynx` *before* any module is evaluated, keeping the
 * property present (other readers still get a working scheduler) while making
 * its behaviour sound. `lynx` is a BARE host global (like `fetch`/`self`), so it
 * must be read as a bare identifier behind `typeof` — `globalThis.lynx` is not
 * reliable (AGENTS.md §3).
 */
const GLOBAL_QUEUE_MICROTASK_FIX =
  '(function(){try{if(typeof lynx==="undefined"||!lynx)return;' +
  'if(typeof lynx.queueMicrotask!=="function")return;' +
  'var P=globalThis.Promise;if(typeof P!=="function")return;var r=P.resolve();' +
  'lynx.queueMicrotask=function(fn){r.then(fn).catch(function(e){' +
  'setTimeout(function(){throw e;},0);});};}catch(_){}})();'

const GLOBAL_BOOTSTRAP_BANNER =
  GLOBAL_SELF_BANNER + GLOBAL_ABORT_POLYFILL + GLOBAL_QUEUE_MICROTASK_FIX

/**
 * Lynx's native CSS engine supports CSS custom properties in class-based
 * selectors but not in inline styles — the `__SetInlineStyles` path ignores
 * `--`-prefixed keys. However, the tasm binary contains an
 * `enable_css_inline_variables` flag that makes the compiled template emit the
 * right opcodes for runtime CSS variable resolution from inline declarations.
 * This flag isn't exposed through the standard plugin options, so we inject it
 * directly into the encode options via the `beforeEncode` hook.
 */
const LYNX_TEMPLATE_HOOKS_KEY = Symbol.for(
  '@lynx-js/template-webpack-plugin/hooks',
)

class EnableCSSInlineVariablesPlugin {
  apply(compiler: any) {
    compiler.hooks.compilation.tap(
      'EnableCSSInlineVariablesPlugin',
      (compilation: any) => {
        const hooks = (compilation as any)[LYNX_TEMPLATE_HOOKS_KEY]
        if (!hooks) return
        hooks.beforeEncode.tap(
          'EnableCSSInlineVariablesPlugin',
          (args: any) => {
            if (args.encodeData?.sourceContent?.config) {
              args.encodeData.sourceContent.config.enableCSSInlineVariables =
                true
            }
            if (args.encodeData?.compilerOptions) {
              args.encodeData.compilerOptions.enableCSSInlineVariables = true
            }
            return args
          },
        )
      },
    )
  }
}

export default defineConfig({
  source: {
    alias: {
      // Third-party libraries (e.g. TanStack Router) import from the bare
      // `react` specifier. Route them to a local shim that re-exports
      // ReactLynx's compat entry (adding `startTransition` / `useTransition`)
      // plus a `use` stub, so ESM linking of React-19-only APIs succeeds.
      react$: fileURLToPath(new URL('./src/shims/react.ts', import.meta.url)),
    },
  },
  tools: {
    // Function form + appendPlugins so we ADD the banner without replacing
    // Rspeedy's default Rspack config (notably the SWC JS minimizer — passing
    // `tools.rspack` as a plain object would clobber those defaults).
    rspack: (_config, { appendPlugins }) => {
      appendPlugins(
        new rspack.BannerPlugin({
          banner: GLOBAL_BOOTSTRAP_BANNER,
          raw: true,
          // JS chunks only — a raw JS banner must not be injected into CSS
          // assets (it would break the CSS minifier).
          test: /\.(?:js|mjs|cjs)$/,
          // Prepend to every chunk (entry + vendor/async), not just entries, so
          // the background chunk that hosts router-core is always covered.
          entryOnly: false,
        }),
      )
      appendPlugins(new EnableCSSInlineVariablesPlugin())
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        // We use `?fullscreen=true` to open the page in LynxExplorer in full screen mode
        return `${url}?fullscreen=true`
      },
    }),
    pluginReactLynx({
      // lynx-ui foundation requires the new gesture system (Engine >= 3.2).
      enableNewGesture: true,
      // Minimal Lynx Engine version this bundle targets.
      engineVersion: '2.14',
      // Enable CSS custom property inheritance so inline-declared variables
      // propagate to descendants on native.
      enableCSSInheritance: true,
    }),
    pluginTypeCheck(),
  ],

  // Declaring `environments` REPLACES rspeedy's implicit default environment
  // rather than extending it, so `lynx` has to be listed explicitly even though
  // it needs no options. Dropping it does not fail the build — `rspeedy build`
  // just quietly stops emitting `dist/main.lynx.bundle`, while the copy-bundle
  // scripts keep shipping whatever stale file is left in `dist/` (that is how a
  // 6.5 MB dev bundle ended up in the native packages; see
  // docs/archive/2026-08-14-audit-fix-plan.md P0-0). `scripts/assert-bundle-fresh.mjs`
  // now catches a regression here, and a build must list BOTH bundles.
  environments: {
    // Native (Android / iOS): dist/main.lynx.bundle
    lynx: {},
    // Web: a main-thread JS bundle for @lynx-js/web-core → dist/web/main.web.bundle
    web: {
      output: {
        distPath: {
          root: 'dist/web',
        },
      },
    },
  },
})
