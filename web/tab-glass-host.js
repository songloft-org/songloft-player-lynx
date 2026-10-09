// Runs in the browser host, never in the ReactLynx Worker. SVG displacement
// samples the live bar backdrop, with the same capsule geometry as Android.
let nextId = 0
const NS = 'http://www.w3.org/2000/svg'
const node = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value))
  return el
}

customElements.whenDefined('x-blur-view').then(() => {
  if (customElements.get('blur-view')) return
  const Base = customElements.get('x-blur-view')
  customElements.define('blur-view', class extends Base {
    animateTabLens({ frames, count, duration, startedAt }) {
      cancelAnimationFrame(this.tabFrame)
      this.style.opacity = '0'
      if (!duration || frames.length < 2 || !this.isConnected) return
      const width = this.clientWidth
      const height = this.clientHeight
      if (!width || !height) return
      if (!this.tabSvg) {
        const id = `songloft-tab-lens-${++nextId}`
        this.tabSvg = node('svg', { width: 0, height: 0 })
        this.tabSvg.style.cssText = 'position:absolute;pointer-events:none'
        this.tabFilter = node('filter', { id, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })
        this.tabImage = node('feImage', { result: 'map', preserveAspectRatio: 'none' })
        this.tabFilter.append(this.tabImage,
          node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 20, xChannelSelector: 'R', yChannelSelector: 'G', result: 'bent' }),
          node('feComposite', { in: 'bent', in2: 'map', operator: 'in' }))
        this.tabSvg.append(this.tabFilter)
        this.parentElement.append(this.tabSvg)
        this.style.backdropFilter = `url(#${id})`
        // Override web-core's ordinary Gaussian filter in the shadow stylesheet.
        const style = document.createElement('style')
        style.textContent = ':host { backdrop-filter: inherit; }'
        this.shadowRoot?.append(style)
      }
      for (const element of [this.tabFilter, this.tabImage]) {
        element.setAttribute('x', 0)
        element.setAttribute('y', 0)
        element.setAttribute('width', width)
        element.setAttribute('height', height)
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width)
      canvas.height = Math.ceil(height)
      const context = canvas.getContext('2d')
      const maps = new Map()
      const paint = index => {
        if (!maps.has(index)) {
          const [position, sx, sy] = frames[index]
          const cx = width / count * (position + 0.5)
          const ex = (width / count - 8) / 2
          const ey = 26
          const radius = Math.min(ex, ey)
          const image = context.createImageData(canvas.width, canvas.height)
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const px = (x + 0.5 - cx) / sx, py = (y + 0.5 - height / 2) / sy
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
            const normalScale = Math.max(Math.hypot(nx / sx, ny / sy), 0.001)
            nx = nx / sx / normalScale; ny = ny / sy / normalScale
            const t = Math.max(0, Math.min(1, -d / 10))
            const edge = 1 - t * t * (3 - 2 * t)
            const bend = 5 * Math.sin(edge * Math.PI / 2)
            const offset = (y * canvas.width + x) * 4
            image.data[offset] = 128 - nx * bend / 20 * 255
            image.data[offset + 1] = 128 - ny * bend / 20 * 255
            image.data[offset + 2] = 128
            image.data[offset + 3] = Math.max(0, Math.min(1, 0.5 - d / normalScale)) * 255
          }
          context.putImageData(image, 0, 0)
          maps.set(index, canvas.toDataURL())
        }
        this.tabImage.setAttribute('href', maps.get(index))
        this.style.opacity = String(frames[index][3])
      }
      const start = startedAt ? startedAt - performance.timeOrigin : performance.now()
      const tick = now => {
        // A queued RAF timestamp may precede the UI-method call this frame.
        const progress = Math.max(0, Math.min(1, (now - start) / duration))
        paint(Math.round(progress * (frames.length - 1)))
        if (progress < 1 && this.isConnected) this.tabFrame = requestAnimationFrame(tick)
      }
      paint(0)
      this.tabFrame = requestAnimationFrame(tick)
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.tabFrame)
      this.tabSvg?.remove()
      this.tabSvg = null
      super.disconnectedCallback?.()
    }
  })
})
