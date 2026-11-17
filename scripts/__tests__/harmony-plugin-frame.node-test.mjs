import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

// Execute the production ArkTS lifecycle/bridge. Only ArkUI's declarative builder
// is replaced: its actual LynxView wiring is checked separately and by HAP build.
function fixture({ deferred = false } = {}) {
  const nodes = [],
    events = [],
    logs = [],
    attachments = []
  const globals = {
    exports: {},
    LynxModule: class {
      constructor(context) {
        this.context = context
      }
    },
    LynxViewClient: class {},
    UIBase: class {
      uiContext = {}
      nativeUI = { setFrameNode: (node) => attachments.push(node) }
      update() {}
      onNodeReady() {}
      dispose() {}
      sendCustomEvent(name, params) {
        events.push({ name, params })
      }
    },
    MetaData: class {
      constructor(data, props) {
        this.globalProps = props
      }
    },
    TemplateData: class {
      constructor(json) {
        this.data = JSON.parse(json)
      }
    },
    BuilderNode: class {
      constructor() {
        nodes.push(this)
        this.disposed = false
      }
      build(_builder, params) {
        this.params = params
        this.context = {
          updates: [],
          events: [],
          visibility: [],
          updateMetaData(data) {
            this.updates.push(data.globalProps.data)
          },
          sendGlobalEvent(name, data) {
            this.events.push([name, data])
          },
          onEnterForeground() {
            this.visibility.push('foreground')
          },
          onEnterBackground() {
            this.visibility.push('background')
          },
        }
        if (!deferred) params.onCreate(this.context)
      }
      getFrameNode() {
        return this
      }
      dispose() {
        assert.equal(this.disposed, false)
        this.disposed = true
      }
    },
    wrapBuilder: (builder) => builder,
    ClientFileLog: { write: (...args) => logs.push(args) },
  }
  const load = (path) => {
    let source = read(path).replace(
      /^import[\s\S]*?from ['"][^'"]+['"]\s*;?\r?\n/gm,
      '',
    )
    // This builder is ArkUI syntax, not TypeScript. Keep the production class intact.
    source = source.replace(
      /@Builder\nfunction buildPluginFrame[\s\S]*?\n}\n/,
      'function buildPluginFrame() {}\n',
    )
    const result = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    })
    assert.equal(
      result.diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
      ).length,
      0,
    )
    globals.exports = {}
    runInNewContext(result.outputText, globals)
    Object.assign(globals, globals.exports)
  }
  load(
    'harmony/entry/src/main/ets/modules/plugin/SongloftPluginBridgeModule.ets',
  )
  const framePath = 'harmony/entry/src/main/ets/ui/SongloftPluginFrameUI.ets'
  if (existsSync(new URL(framePath, root))) load(framePath)
  const registered =
    /this\.behaviors\.set\('songloft-plugin-frame', new Behavior\(SongloftPluginFrameUI, undefined,\s*new SongloftPluginFrameConfig\(/.test(
      read('harmony/entry/src/main/ets/pages/Index.ets'),
    )
  const config = registered
    ? new globals.SongloftPluginFrameConfig({}, new Map(), {}, {}, {})
    : undefined
  const frame = registered
    ? new globals.SongloftPluginFrameUI({}, config)
    : new globals.UIBase()
  return { ...globals, frame, config, nodes, events, logs, attachments }
}

const props = (extra = {}) => ({
  frameId: 'miot-a',
  serverUrl: 'http://server/prefix',
  theme: 'dark',
  hostVersion: 'dev',
  embed: true,
  access_token: '',
  playerState: { playing: true },
  ...extra,
})
const start = (h) => {
  h.frame.update({
    src: 'http://server/prefix/api/v1/jsplugin/miot/static/main.lynx.bundle',
    'global-props': props(),
  })
  h.frame.onNodeReady()
}
const clone = (value) => JSON.parse(JSON.stringify(value))

test('the actual native frame tag has a Harmony Behavior that creates a child with initial props', () => {
  const h = fixture()
  start(h)
  assert.equal(
    h.nodes.length,
    1,
    'unregistered frame becomes an empty UIView on SDK 4.0.1',
  )
  const params = h.nodes[0].params
  assert.equal(
    params.src,
    'http://server/prefix/api/v1/jsplugin/miot/static/main.lynx.bundle',
  )
  assert.deepEqual(clone(params.metaData.globalProps.data), props())
  assert.equal(
    params.config.templateResourceFetcher,
    h.config.templateResourceFetcher,
  )
  assert.equal(
    params.config.modules.get('SongloftPluginBridge').moduleClass,
    h.SongloftPluginBridgeModule,
  )
  assert.deepEqual([...params.config.modules.keys()], ['SongloftPluginBridge'])
  const builder = read(
    'harmony/entry/src/main/ets/ui/SongloftPluginFrameUI.ets',
  )
    .split('@Builder')[1]
    .split('/**')[0]
  for (const field of [
    'url: params.src',
    'metaData: params.metaData',
    'modules: params.config.modules',
    'behaviors: params.config.behaviors',
    'templateResourceFetcher: params.config.templateResourceFetcher',
    'genericResourceFetcher: params.config.genericResourceFetcher',
    'mediaResourceFetcher: params.config.mediaResourceFetcher',
    'clients: params.clients',
    'onCreate: params.onCreate',
  ])
    assert.ok(builder.includes(field), field)
})

test('prop order and a token arriving during child creation preserve a single child and latest props', () => {
  const h = fixture({ deferred: true })
  h.frame.onNodeReady()
  h.frame.update({ src: 'http://server/miot.bundle' })
  assert.equal(h.nodes.length, 0)
  h.frame.update({ 'global-props': props() })
  assert.equal(h.nodes.length, 1)
  h.frame.update({ 'global-props': props({ access_token: 'test-token' }) })
  const node = h.nodes[0]
  node.params.onCreate(node.context)
  assert.equal(node.context.updates.at(-1).access_token, 'test-token')
  h.frame.update({
    'global-props': props({ theme: 'light', access_token: 'test-token' }),
  })
  assert.equal(h.nodes.length, 1)
  assert.equal(node.context.updates.at(-1).theme, 'light')
  h.frame.onNodeReady()
  assert.equal(h.nodes.length, 1, 'retained tab must not reload the child')
})

test('actual bridge routes child RPC, host reply and pushes; disposing releases the child registry', () => {
  const h = fixture()
  start(h)
  const context = h.nodes[0].context
  const hostEvents = []
  const host = new h.SongloftPluginBridgeModule({
    sendGlobalEvent: (...args) => hostEvents.push(args),
  })
  const child = new h.SongloftPluginBridgeModule(context)
  host.registerHost('miot-a')
  child.registerChild('miot-a')
  child.hostCall(
    'miot-a',
    'call-1',
    'plugin',
    'apiRequest',
    '{"path":"/status"}',
  )
  assert.equal(hostEvents[0][0], 'SongloftPluginBridge.hostCall')
  assert.equal(hostEvents[0][1][0].callId, 'call-1')
  host.hostReply('miot-a', 'call-1', '{"ok":true}')
  host.pushToChild('miot-a', 'theme', '{"theme":"dark"}')
  assert.deepEqual(clone(context.events), [
    [
      'SongloftPluginBridge.hostReply',
      [{ callId: 'call-1', result: '{"ok":true}' }],
    ],
    [
      'SongloftPluginBridge.push',
      [{ event: 'theme', data: '{"theme":"dark"}' }],
    ],
  ])
  h.frame.dispose()
  host.hostReply('miot-a', 'late', '{}')
  host.pushToChild('miot-a', 'theme', '{}')
  assert.equal(context.events.length, 2)
  assert.equal(h.nodes[0].disposed, true)
  assert.equal(h.attachments.at(-1), null)
})

test('replacement and final disposal ignore late creation/load/error callbacks', () => {
  const h = fixture({ deferred: true })
  start(h)
  const old = h.nodes[0]
  h.frame.update({
    src: 'http://server/new.bundle',
    'global-props': props({ frameId: 'miot-b' }),
  })
  assert.equal(old.disposed, true)
  assert.equal(h.nodes.length, 2)
  old.params.onCreate(old.context)
  old.params.clients[0].onFirstScreen()
  old.params.clients[0].onReceivedError({ getErrorCode: () => 1 })
  assert.equal(old.context.updates.length, 0)
  assert.equal(h.events.length, 0)
  const current = h.nodes[1]
  current.params.onCreate(current.context)
  current.params.clients[0].onFirstScreen()
  current.params.clients[0].onReceivedError({ getErrorCode: () => 123 })
  assert.deepEqual(clone(h.events), [
    { name: 'load', params: {} },
    { name: 'error', params: { errorCode: 123 } },
  ])
  assert.equal(h.logs.length, 1)
  assert.ok(!JSON.stringify(h.logs).includes('http://server'))
  h.frame.dispose()
  current.params.onCreate(current.context)
  current.params.clients[0].onFirstScreen()
  h.frame.update({ src: 'http://server/late.bundle' })
  h.frame.onNodeReady()
  assert.equal(h.nodes.length, 2)
  assert.equal(h.events.length, 2)
})

test('child engine follows window lifecycle without attaching the root appearance/lifecycle singleton', () => {
  const h = fixture({ deferred: true })
  start(h)
  h.frame.onEnterBackground()
  const node = h.nodes[0]
  node.params.onCreate(node.context)
  assert.deepEqual(node.context.visibility, ['background'])
  h.frame.onEnterForeground()
  h.frame.onEnterBackground()
  assert.deepEqual(node.context.visibility, [
    'background',
    'foreground',
    'background',
  ])
  h.frame.dispose()
  h.frame.onEnterForeground()
  assert.equal(node.context.visibility.length, 3)
})

test('old child cleanup cannot delete the bridge of a replacement using the same frame ID', () => {
  const h = fixture()
  const old = { sendGlobalEvent() {} },
    received = []
  const current = { sendGlobalEvent: (...args) => received.push(args) }
  new h.SongloftPluginBridgeModule(old).registerChild('miot-a')
  new h.SongloftPluginBridgeModule(current).registerChild('miot-a')
  h.SongloftPluginBridgeModule.detachChild(old)
  new h.SongloftPluginBridgeModule({}).hostReply('miot-a', 'current', '{}')
  assert.equal(received.length, 1)
  h.SongloftPluginBridgeModule.detachChild(current)
  new h.SongloftPluginBridgeModule({}).hostReply('miot-a', 'late', '{}')
  assert.equal(received.length, 1)
})
