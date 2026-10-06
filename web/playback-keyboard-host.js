/* Keyboard events originate on the main thread; player actions stay in the Worker. */
;(function () {
  var previous = window.__SONGLOFT_KEYBOARD__
  var state = previous ? previous.getState() : { enabled: false }
  if (previous) previous.destroy()
  var app = document.getElementById('app')
  var ownsFocus = false
  var composing = false
  var removers = []
  function listen(target, name, handler) {
    target.addEventListener(name, handler)
    removers.push(function () { target.removeEventListener(name, handler) })
  }
  function pathOf(event) { return event.composedPath ? event.composedPath() : [event.target] }
  function isInteractive(element) {
    return element && element.nodeType === 1 && (
      /^(INPUT|TEXTAREA|SELECT|BUTTON|IFRAME)$/.test(element.tagName)
      || element.isContentEditable
      || element.getAttribute('contenteditable') === 'true'
      || element.getAttribute('contenteditable') === ''
      || (element.tagName === 'A' && element.hasAttribute('href'))
      || /^(button|switch|slider|textbox|combobox)$/.test(element.getAttribute('role') || '')
    )
  }
  listen(document, 'pointerdown', function (event) { ownsFocus = pathOf(event).includes(app) })
  listen(document, 'focusin', function (event) { ownsFocus = pathOf(event).includes(app) })
  listen(window, 'blur', function () { ownsFocus = false; composing = false })
  listen(document, 'compositionstart', function () { composing = true })
  listen(document, 'compositionend', function () { composing = false })
  listen(document, 'keydown', function (event) {
    if (!app || !app.isConnected || !ownsFocus || !document.hasFocus()
      || !state.enabled || state.blocked || !state.canPlay || event.defaultPrevented
      || composing || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey
      || document.querySelector('[data-songloft-transfer]')
      || isInteractive(document.activeElement) || pathOf(event).some(isInteractive)) return
    var command = event.ctrlKey || event.metaKey
    var action = null
    if (!command && (event.code === 'Space' || event.key === ' ')) action = 'toggle'
    if (command && event.key === 'ArrowLeft' && state.canPrev) action = 'previous'
    if (command && event.key === 'ArrowRight' && state.canNext) action = 'next'
    if (command && event.key === 'ArrowUp' && state.volume < 100) action = 'volumeUp'
    if (command && event.key === 'ArrowDown' && state.volume > 0) action = 'volumeDown'
    if (!action || (event.repeat && action !== 'volumeUp' && action !== 'volumeDown')
      || typeof app.sendGlobalEvent !== 'function') return
    try {
      app.sendGlobalEvent('SongloftKeyboard.action', [{ action: action }])
      event.preventDefault()
    } catch (_) { /* An unavailable bridge leaves the browser key unconsumed. */ }
  })
  window.__SONGLOFT_KEYBOARD__ = {
    configure: function (next) { state = next || { enabled: false } },
    getState: function () { return state },
    destroy: function () { removers.splice(0).forEach(function (remove) { remove() }) },
  }
})()
