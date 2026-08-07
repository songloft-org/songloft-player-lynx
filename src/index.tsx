// Compat shims must load before anything imports the router.
import './shims/router-env.js'

import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import { root } from '@lynx-js/react'

import { App } from './App.js'

root.render(<App />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
