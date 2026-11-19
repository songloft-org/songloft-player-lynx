import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { DesktopVisibility } from '../host/visibility.mjs'

test('locked display skips presentation and unlocking never reveals a hidden window', () => {
  const powerMonitor = new EventEmitter(),
    window = new EventEmitter(),
    config = {}
  let state = 'locked',
    presented
  powerMonitor.getSystemIdleState = () => state
  window.isVisible = () => true
  window.isMinimized = () => false
  const visibility = new DesktopVisibility({
    native: {
      player(_method, value) {
        presented = value
      },
    },
    send() {},
    powerMonitor,
    config,
  })
  visibility.attach(window)
  window.emit('show')
  assert.equal(presented, false)
  state = 'active'
  powerMonitor.emit('unlock-screen')
  assert.equal(presented, true)
  window.emit('hide')
  powerMonitor.emit('lock-screen')
  powerMonitor.emit('unlock-screen')
  assert.equal(presented, false)
  window.emit('restore')
  assert.equal(presented, true)
  powerMonitor.emit('suspend')
  assert.equal(config.windowVisible, false)
  powerMonitor.emit('resume')
  assert.equal(config.windowVisible, true)
  visibility.close()
  assert.equal(powerMonitor.listenerCount('lock-screen'), 0)
})
