// Browser host only. Build a local edge map once per slot size, then move it
// over the live material. No PNG encoding in the animation frame loop.
let nextId = 0
const NS = 'http://www.w3.org/2000/svg'
const node = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value))
  return el
}

function edgeMap(width, height, capsule = false) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width)
  canvas.height = Math.ceil(height)
  const context = canvas.getContext('2d')
  const image = context.createImageData(canvas.width, canvas.height)
  const ex = width / 2, ey = height / 2, radius = Math.min(ex, ey)
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const px = x + 0.5 - ex, py = y + 0.5 - ey
    const qx = Math.abs(px) - (ex - radius), qy = Math.abs(py) - (ey - radius)
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0)
    const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius
    let nx = ox * Math.sign(px), ny = oy * Math.sign(py)
    if (Math.hypot(nx, ny) < 0.001) {
      nx = qx > qy ? Math.sign(px) : 0
      ny = qx > qy ? 0 : Math.sign(py)
    }
    const length = Math.max(Math.hypot(nx, ny), 0.001)
    nx /= length; ny /= length
    const t = Math.max(0, Math.min(1, -d / 10))
    const edge = 1 - t * t * (3 - 2 * t)
    const bend = 5 * Math.sin(edge * Math.PI / 2)
    const offset = (y * canvas.width + x) * 4
    image.data[offset] = 128 - nx * bend / 20 * 255
    image.data[offset + 1] = 128 - ny * bend / 20 * 255
    image.data[offset + 2] = 128
    // Only the bevel overlays the persistent selection wash. Its interior
    // stays a thin layer in the bar, rather than another opaque glass plane.
    image.data[offset + 3] = Math.max(0, Math.min(1, 0.5 - d)) * (capsule ? 1 : edge) * 255
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

customElements.whenDefined('x-blur-view').then(() => {
  if (customElements.get('blur-view')) return
  const Base = customElements.get('x-blur-view')
  customElements.define('blur-view', class extends Base {
    connectedCallback() {
      super.connectedCallback?.()
      this.tabSceneMode = JSON.parse(document.getElementById('app')?.getAttribute('global-props') || '{}').webGlassSceneSupported === true
      this.tabWarmFrame = requestAnimationFrame(() => {
        if (!this.isConnected) return
        if (this.classList.contains('ui-backdrop-blur--optical')) {
          this.tabResize = new ResizeObserver(() => this.scheduleTabResize())
          this.tabResize.observe(this)
          return
        }
        if (!this.classList.contains('nav-indicator__glass--web')) return
        this.style.opacity = '0'
        this.tabResize = new ResizeObserver(() => this.scheduleTabResize())
        this.tabResize.observe(this)
      })
    }

    scheduleTabResize() {
      // SVG sizing may itself affect layout. Commit outside ResizeObserver's
      // delivery cycle and coalesce notifications rather than causing a loop.
      if (this.tabResizeFrame) return
      this.tabResizeFrame = requestAnimationFrame(() => {
        this.tabResizeFrame = 0
        if (!this.isConnected) return
        if (this.classList.contains('ui-backdrop-blur--optical')) this.prepareCapsule()
        else this.prepareMovingLens()
      })
    }

    prepareMovingLens(count = this.tabCount || Number(this.getAttribute('data-tabcount'))) {
      const width = parseFloat(getComputedStyle(this).width)
      const height = parseFloat(getComputedStyle(this).height)
      if (!(width > 0) || !(height > 0)) return false
      if (this.tabSceneMode && !(count > 0)) return false
      this.ensureTabFilter()
      if (!this.tabFilter) return false
      this.prepareTabMap(width)
      for (const element of [this.tabFilter, this.tabImage]) {
        element.setAttribute('x', 0)
        element.setAttribute('y', 0)
        element.setAttribute('width', width)
        element.setAttribute('height', height)
      }
      this.tabImage.setAttribute('href', this.tabMapHref)
      return true
    }

    ensureTabFilter(blur = 0) {
      if (this.tabSvg) return
      const id = `songloft-tab-lens-${++nextId}`
      if (this.tabSceneMode) {
        const sourceId = blur ? 'songloft-backdrop' : 'songloft-tab-backdrop'
        const source = this.getRootNode().querySelector(`#${sourceId}`)
        if (!source || !this.shadowRoot) return
        this.songloftScene = songloftGlassScene(this, source, blur, blur ? this : source)
        this.tabSvg = this.songloftScene.svg
      } else {
        this.tabSvg = node('svg', { width: 0, height: 0 })
        this.tabSvg.style.cssText = 'position:absolute;pointer-events:none'
      }
      this.tabFilter = node('filter', { id, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })
      this.tabImage = node('feImage', { result: 'map', preserveAspectRatio: 'none' })
      this.tabDisplacement = node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'bent' })
      this.tabFilter.append(this.tabImage, this.tabDisplacement,
        node('feComposite', { in: 'bent', in2: 'map', operator: 'in' }))
      if (this.tabSceneMode) {
        this.songloftScene.defs.append(this.tabFilter)
        this.songloftScene.stage.setAttribute('filter', `url(#${id})`)
        return
      }
      this.tabSvg.append(this.tabFilter)
      this.parentElement.append(this.tabSvg)
      // Keep Gaussian blur in the browser's native filter pipeline. Nesting
      // an SVG Gaussian inside another moving backdrop filter forces expensive
      // intermediate rasterization on software/compositor fallback paths.
      this.style.backdropFilter = `${blur ? `blur(${blur}px) ` : ''}url(#${id})`
      const style = document.createElement('style')
      style.textContent = ':host { backdrop-filter: inherit; }'
      this.shadowRoot?.append(style)
    }

    prepareCapsule() {
      const width = this.clientWidth, height = this.clientHeight
      if (!width || !height) return
      this.ensureTabFilter(parseFloat(this.getAttribute('blur-radius')) || 6)
      if (!this.tabFilter) return
      for (const element of [this.tabFilter, this.tabImage]) {
        element.setAttribute('x', 0)
        element.setAttribute('y', 0)
        element.setAttribute('width', width)
        element.setAttribute('height', height)
      }
      const size = `${width}:${height}`
      if (this.tabCapsuleSize !== size) {
        this.tabImage.setAttribute('href', edgeMap(width, height, true))
        this.tabCapsuleSize = size
      }
      this.tabDisplacement.setAttribute('scale', 20)
    }

    prepareTabMap(width) {
      const pixels = Math.ceil(width)
      if (this.tabMapWidth === pixels) return
      this.tabMapHref = edgeMap(pixels, 52)
      this.tabMapWidth = pixels
    }

    animateTabLens({ frames, count, duration, startedAt }) {
      const epoch = this.tabEpoch = (this.tabEpoch || 0) + 1
      this.tabOpacity?.cancel()
      this.tabBackground?.cancel()
      this.tabBackgroundTravel?.cancel()
      cancelAnimationFrame(this.tabAlignFrame)
      for (const animation of this.tabAnimations || []) {
        animation.endElement()
        animation.remove()
      }
      this.tabAnimations = []
      this.tabDisplacement?.setAttribute('scale', 0)
      this.style.opacity = '0'
      if (!duration || frames.length < 2 || !this.isConnected) return
      this.tabCount = count
      if (!this.prepareMovingLens(count) || count <= 0) return
      // Geometry belongs to the animated capsule ancestor. Browser-managed
      // opacity and SVG numeric animation modulate optics on the same clock,
      // without a JS frame loop racing the compositor's translation.
      const elapsed = Math.max(0, Math.min(duration, startedAt ? Date.now() - startedAt : 0))
      const animateValue = (element, attribute, values) => {
        element.setAttribute(attribute, values[0])
        const animation = node('animate', {
          attributeName: attribute, values: values.join(';'), dur: `${duration}ms`,
          begin: 'indefinite', fill: 'freeze', calcMode: 'linear',
        })
        element.append(animation)
        animation.beginElementAt(-elapsed / 1000)
        this.tabAnimations.push(animation)
      }
      if (this.tabSceneMode) {
        // The lens itself is a child of the real animated pill. WebKit can
        // defer SMIL geometry sampling, so never move a separate SVG mask.
        // Cancel the parent's pose only for the fixed material background.
        const source = this.songloftScene.source
        const slot = source.clientWidth / count, ex = (slot - 8) / 2, ey = 26
        const background = this.songloftScene.blurred
        const content = this.songloftScene.content
        background.style.transformOrigin = '0 0'
        content.style.transformOrigin = '0 0'
        const inverse = frames.map(([, sx, sy]) => ({ transform: `matrix(${1 / sx},0,0,${1 / sy},${ex},${ey})` }))
        const inverseTravel = frames.map(([position]) => ({ transform: `translate(${-slot * (position + 0.5)}px,${-source.clientHeight / 2}px)` }))
        this.tabBackground = background.animate(inverse, { duration, easing: 'linear', fill: 'forwards' })
        this.tabBackground.currentTime = 0
        this.tabBackgroundTravel = content.animate(inverseTravel, { duration, easing: 'linear', fill: 'forwards' })
        this.tabBackgroundTravel.currentTime = 0
        // Parents start at the supplied pose, not at bridge wall-clock age.
        // Match that first pose while waiting for their ready timelines.
        // Align once with the actual UI animation's timeline. Retargeting and
        // disposal cancel this callback; there is no recurring JS frame loop.
        const align = attempt => {
          if (this.tabEpoch !== epoch || !this.isConnected) return
          const travel = this.getRootNode().querySelector('.nav-indicator')?.getAnimations()[0]
          const jelly = this.closest('.nav-indicator__pill')?.getAnimations()[0]
          if (!travel || !jelly) {
            // Main-thread commands may create the parent animations after the
            // host invocation. Bound startup discovery; never track geometry.
            if (attempt < 6) this.tabAlignFrame = requestAnimationFrame(() => align(attempt + 1))
            return
          }
          Promise.all([travel.ready, jelly.ready]).then(() => {
            if (this.tabEpoch !== epoch || !this.isConnected) return
            if (travel.startTime != null && this.tabBackgroundTravel) this.tabBackgroundTravel.startTime = travel.startTime
            if (jelly.startTime != null && this.tabBackground) this.tabBackground.startTime = jelly.startTime
            if (travel.startTime != null && this.tabOpacity) this.tabOpacity.startTime = travel.startTime
          }).catch(() => {})
        }
        this.tabAlignFrame = requestAnimationFrame(() => align(0))
      }
      animateValue(this.tabDisplacement, 'scale', frames.map(frame => frame[3] * 20))
      this.tabOpacity = this.animate(frames.map(frame => ({ opacity: frame[3] })), { duration, easing: 'linear', fill: 'forwards' })
      this.tabOpacity.currentTime = elapsed
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.tabResizeFrame)
      this.tabResizeFrame = 0
      this.tabEpoch = (this.tabEpoch || 0) + 1
      this.tabOpacity?.cancel()
      this.tabBackground?.cancel()
      this.tabBackgroundTravel?.cancel()
      cancelAnimationFrame(this.tabAlignFrame)
      for (const animation of this.tabAnimations || []) animation.remove()
      this.tabAnimations = null
      cancelAnimationFrame(this.tabWarmFrame)
      this.tabResize?.disconnect()
      this.songloftScene?.dispose()
      this.songloftScene = null
      this.tabSvg?.remove()
      this.tabSvg = null
      this.tabFilter = null
      this.tabImage = null
      this.tabDisplacement = null
      this.tabMapWidth = null
      this.tabMapHref = null
      this.tabCapsuleSize = null
      super.disconnectedCallback?.()
    }
  })
})
