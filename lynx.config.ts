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
  'globalThis.self=globalThis.self||globalThis;globalThis.window=globalThis.window||globalThis;'

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

const GLOBAL_BOOTSTRAP_BANNER = GLOBAL_SELF_BANNER + GLOBAL_ABORT_POLYFILL

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
    }),
    pluginTypeCheck(),
  ],
})
