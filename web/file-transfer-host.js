/* Main-thread file controls. Text methods never receive credentials or server URLs. */
;(function () {
  var active = null
  var MAX_BYTES = 20 * 1024 * 1024

  function operation(run, kind) {
    if (active) return Promise.resolve({ error: 'file_transfer_busy' })
    return new Promise(function (resolve) {
      var cleanups = []
      var closed = false
      var op = {
        kind: kind,
        alive: function () { return !closed },
        cleanup: function (fn) { cleanups.push(fn) },
        finish: function (error, body) {
          if (closed) return
          closed = true
          cleanups.forEach(function (fn) { fn() })
          if (active === op) active = null
          resolve({ error: error || null, body: body == null ? null : body })
        },
      }
      active = op
      try { run(op) } catch (_) { op.finish('file_transfer_failed') }
    })
  }

  function hasActivation() {
    return Boolean(navigator.userActivation && navigator.userActivation.isActive)
  }

  // Worker RPC may arrive after transient activation expired. This is an actual
  // DOM control: its trusted click establishes a fresh main-thread activation.
  function panel(op, labels, control) {
    var overlay = document.createElement('div')
    overlay.dataset.songloftTransfer = 'true'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box'
    var card = document.createElement('section')
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    card.setAttribute('aria-label', labels.title)
    card.style.cssText = 'background:Canvas;color:CanvasText;border-radius:16px;padding:24px;width:100%;max-width:420px;max-height:90%;overflow:auto;font:inherit;box-sizing:border-box'
    var title = document.createElement('h2')
    title.textContent = labels.title
    title.style.cssText = 'font:inherit;font-weight:bold;margin:0 0 20px;overflow-wrap:anywhere'
    var cancel = document.createElement('button')
    cancel.textContent = labels.cancel
    cancel.style.cssText = 'display:block;min-height:44px;width:100%;margin-top:16px;font:inherit'
    cancel.addEventListener('click', function () { op.finish('cancelled') })
    control.style.cssText = 'display:block;min-height:44px;width:100%;font:inherit;box-sizing:border-box;overflow-wrap:anywhere'
    card.append(title, control, cancel)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    var previousFocus = document.activeElement
    var keydown = function (event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); op.finish('cancelled') }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (document.activeElement === control) cancel.focus()
        else control.focus()
      }
    }
    overlay.addEventListener('keydown', keydown)
    control.focus()
    op.cleanup(function () {
      overlay.remove()
      if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus()
    })
  }

  window.__SONGLOFT_TEXT_FILES__ = {
    pickAndUploadFile: function (uploadUrl, fieldName, mimeType) {
      return operation(function (op) {
        var chinese = /^zh\b/i.test(navigator.language || '')
        var labels = chinese
          ? { title: '上传文件', choose: '选择文件', cancel: '取消' }
          : { title: 'Upload file', choose: 'Choose file', cancel: 'Cancel' }
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = mimeType === 'application/zip' ? '.zip,application/zip,application/x-zip-compressed' : (mimeType || '*/*')
        input.setAttribute('aria-label', labels.choose)
        var uploading = false
        input.addEventListener('change', async function () {
          if (uploading || !op.alive()) return
          var file = input.files && input.files[0]
          if (!file) return op.finish('cancelled')
          uploading = true
          input.disabled = true
          var controller = new AbortController()
          // Picking may take arbitrarily long. Bound only the HTTP upload, in
          // line with the native plugin-install allowance, and keep Cancel usable.
          var deadline = setTimeout(function () { op.finish('Upload timed out') }, 240000)
          op.cleanup(function () { clearTimeout(deadline); controller.abort() })
          try {
            var form = new FormData()
            form.append(fieldName, file)
            var response = await fetch(uploadUrl, {
              method: 'POST', body: form, credentials: 'same-origin', signal: controller.signal,
            })
            if (!response.ok) throw new Error('HTTP ' + response.status)
            var body = await response.text()
            op.finish(null, body)
          } catch (error) { op.finish((error && error.message) || 'upload failed') }
        })
        input.addEventListener('cancel', function () { if (!uploading) op.finish('cancelled') })
        op.cleanup(function () { input.remove() })
        // Always use a real control here: the Worker round trip cannot carry
        // Safari's file-picker gesture. A hidden input.click() may silently do
        // nothing, leaving neither change nor cancel to settle the RPC.
        panel(op, labels, input)
      }, 'upload')
    },
    pickTextFile: function (labels) {
      return operation(function (op) {
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.setAttribute('aria-label', labels.choose)
        var choosing = false
        input.addEventListener('change', async function () {
          choosing = true
          var file = input.files && input.files[0]
          if (!file) return op.finish('cancelled')
          if (file.size > MAX_BYTES) return op.finish('file_too_large')
          try {
            var text = await file.text()
            if (op.alive()) op.finish(null, text)
          } catch (_) { op.finish('file_read_failed') }
        })
        input.addEventListener('cancel', function () { op.finish('cancelled') })
        op.cleanup(function () { input.remove() })
        if (hasActivation()) {
          input.style.display = 'none'
          document.body.appendChild(input)
          try { input.click(); return } catch (_) { if (choosing) return }
        }
        panel(op, labels, input)
      })
    },
    saveTextFile: function (options) {
      return operation(function (op) {
        var blob = new Blob([options.text], { type: 'application/json;charset=utf-8' })
        var url = URL.createObjectURL(blob)
        var anchor = document.createElement('a')
        anchor.href = url
        anchor.download = options.fileName
        anchor.textContent = options.save
        // Keep the blob alive briefly after a successful click; cancellation
        // revokes immediately. Every URL has one eventual revoke.
        var started = false
        op.cleanup(function () {
          anchor.remove()
          if (started) setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
          else URL.revokeObjectURL(url)
        })
        anchor.addEventListener('click', function () {
          if (!op.alive()) return
          started = true
          setTimeout(function () { op.finish(null) }, 0)
        })
        if (hasActivation()) {
          anchor.style.display = 'none'
          document.body.appendChild(anchor)
          anchor.click()
        } else panel(op, options, anchor)
      })
    },
    cancelTextFile: function () { if (active && active.kind !== 'upload') active.finish('cancelled') },
  }
})()
