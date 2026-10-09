// Browser main thread only. Some engines cannot displace a CSS backdrop.
// Paint a bounded copy of the actual page behind the material instead. Copies
// contain no custom elements, controls or event handlers; foreground stays crisp.
const songloftGlassScene = (() => {
  const NS = 'http://www.w3.org/2000/svg'
  let nextScene = 0
  const element = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    return node
  }
  const properties = ['background-color', 'background-image', 'background-size', 'background-position',
    'background-repeat', 'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
    'border-top-style', 'border-bottom-style', 'border-left-style', 'border-right-style', 'border-top-color',
    'border-bottom-color', 'border-left-color', 'border-right-color', 'border-radius', 'box-shadow', 'color',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'white-space',
    'word-break', 'text-align', 'object-fit', 'object-position', 'text-decoration', 'direction']
  const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
  const intersect = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })
  const opticalTag = node => ['BLUR-VIEW', 'X-BLUR-VIEW'].includes(node.tagName)

  function cloneSurface(surface, rect, bounds) {
    const prefix = `songloft-scene-copy-${++nextScene}-`
    const copy = surface.cloneNode(true)
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      if (node.id) node.id = prefix + node.id
      for (const attr of [...node.attributes]) {
        if (attr.value.includes('url(#')) node.setAttribute(attr.name, attr.value.replaceAll('url(#', `url(#${prefix}`))
      }
    }
    copy.removeAttribute('style')
    copy.setAttribute('x', rect.x - bounds.x)
    copy.setAttribute('y', rect.y - bounds.y)
    copy.setAttribute('width', rect.width)
    copy.setAttribute('height', rect.height)
    return copy
  }

  function paint(source, bounds, background, pad, baseline) {
    const prefix = `songloft-scene-paint-${++nextScene}-`
    const defs = element('defs'), scene = element('g')
    scene.append(element('rect', { x: -pad, y: -pad, width: bounds.width + pad * 2,
      height: bounds.height + pad * 2, fill: background }))
    const region = { left: bounds.left - pad, top: bounds.top - pad, right: bounds.right + pad, bottom: bounds.bottom + pad }
    const seen = new Set()
    let clipId = 0, visited = 0, valid = true
    function append(node, clips) {
      for (const clip of clips) {
        const wrapper = element('g', { 'clip-path': `url(#${clip})` })
        wrapper.append(node)
        node = wrapper
      }
      scene.append(node)
    }
    function draw(node, rect, style, clips, opacity, text) {
      if (!rect.width || !rect.height) return
      if (text !== undefined) {
        // WebKit can paint foreignObject HTML text above its ancestor SVG
        // filters. Native SVG glyphs stay in the actual Gaussian/lens plane.
        const glyphs = element('text', { x: rect.x - bounds.x, y: rect.y - bounds.y + baseline(style), opacity,
          fill: style.color, 'text-anchor': style.direction === 'rtl' ? 'end' : 'start' })
        if (style.direction === 'rtl') glyphs.setAttribute('x', rect.right - bounds.x)
        for (const name of properties.filter(name => name.startsWith('font-') || ['letter-spacing', 'white-space', 'direction', 'text-decoration'].includes(name))) glyphs.style.setProperty(name, style.getPropertyValue(name))
        glyphs.textContent = text
        append(glyphs, clips)
        return
      }
      const foreign = element('foreignObject', { x: rect.x - bounds.x, y: rect.y - bounds.y,
        width: rect.width, height: rect.height })
      const copy = document.createElement(node.tagName === 'IMG' ? 'img' : 'div')
      for (const name of properties) copy.style.setProperty(name, style.getPropertyValue(name))
      // A positioned HTML child breaks foreignObject filter coordinates in
      // WebKit. Bounds belong to SVG; the inert HTML child stays unpositioned.
      copy.style.cssText += `;box-sizing:border-box;width:100%;height:100%;margin:0;padding:0;opacity:${opacity}`
      if (node.tagName === 'IMG') copy.src = node.currentSrc || node.src
      foreign.append(copy)
      append(foreign, clips)
    }
    function visit(node, clipBounds, clips = [], opacity = 1) {
      if (seen.has(node) || !valid) return
      seen.add(node)
      if (++visited > 4000) { valid = false; return }
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.trim() || !node.parentElement) return
        const range = document.createRange()
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        if (!intersects(rect, clipBounds)) return
        const style = getComputedStyle(node.parentElement)
        if (range.getClientRects().length <= 1) draw(node.parentElement, rect, style, clips, opacity, node.textContent)
        else {
          if (node.textContent.length > 4096) { valid = false; return }
          // Preserve the real browser's line breaks rather than wrapping again
          // inside a differently sized foreignObject. Only visible lines paint.
          let offset = 0, line = null
          const flush = () => { if (line && intersects(line.rect, clipBounds)) draw(node.parentElement, line.rect, style, clips, opacity, line.text) }
          for (const character of node.textContent) {
            range.setStart(node, offset)
            offset += character.length
            range.setEnd(node, offset)
            const box = range.getBoundingClientRect()
            if (!line || Math.abs(box.y - line.rect.y) > 0.5) {
              flush()
              line = { rect: box, text: character }
            } else {
              const left = Math.min(line.rect.left, box.left), right = Math.max(line.rect.right, box.right)
              line.rect = new DOMRect(left, box.y, right - left, box.height)
              line.text += character
            }
          }
          flush()
        }
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      if (node.tagName === 'SLOT') {
        for (const child of node.assignedNodes({ flatten: true })) visit(child, clipBounds, clips, opacity)
        return
      }
      if (['SCRIPT', 'STYLE'].includes(node.tagName)) return
      const rect = node.getBoundingClientRect()
      // Empty web-core / display:contents wrappers still have painted children.
      if (rect.width && rect.height && !intersects(rect, clipBounds)) return
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return
      const localOpacity = Number.parseFloat(style.opacity)
      opacity *= Number.isFinite(localOpacity) ? localOpacity : 1
      if (opacity <= 0) return
      if (opticalTag(node)) {
        if (node.songloftScene?.valid) append(cloneSurface(node.songloftScene.svg, rect, bounds), clips)
        else valid = false
        return
      }
      // Never replace content we cannot faithfully sample with invented pixels.
      // Native blur remains available while an unsupported scene is visible.
      if (['IFRAME', 'VIDEO', 'CANVAS', 'SVG', 'INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) { valid = false; return }
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none'
        || style.borderTopWidth !== '0px' || style.boxShadow !== 'none' || node.tagName === 'IMG') draw(node, rect, style, clips, opacity)
      if (rect.width && rect.height && [style.overflowX, style.overflowY].some(value => ['hidden', 'scroll', 'auto', 'clip'].includes(value))) {
        clipBounds = intersect(clipBounds, rect)
        const id = `${prefix}${++clipId}`
        const clip = element('clipPath', { id, clipPathUnits: 'userSpaceOnUse' })
        clip.append(element('rect', { x: rect.x - bounds.x, y: rect.y - bounds.y,
          width: rect.width, height: rect.height, rx: parseFloat(style.borderRadius) || 0 }))
        defs.append(clip)
        clips = [...clips, id]
      }
      for (const child of node.shadowRoot?.childNodes || node.childNodes) visit(child, clipBounds, clips, opacity)
    }
    visit(source, region)
    return { defs, scene, valid }
  }

  class Scene {
    constructor(host, source, radius, reference = host) {
      this.host = host
      this.source = source
      this.radius = radius
      this.reference = reference
      this.roots = new Map()
      this.listeners = new Set()
      this.baselines = new Map()
      this.frame = 0
      this.disposed = false
      this.valid = false
      this.schedule = () => {
        if (!this.disposed && !this.frame) this.frame = requestAnimationFrame(() => this.refresh())
      }
      const id = `songloft-scene-blur-${++nextScene}`
      this.svg = element('svg', { 'aria-hidden': true })
      this.svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:paint;clip-path:inset(0)'
      this.defs = element('defs')
      const blur = element('filter', { id, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })
      blur.append(element('feGaussianBlur', { stdDeviation: radius }))
      this.blur = blur
      this.defs.append(blur)
      this.stage = element('g')
      this.blurred = element('g', radius ? { filter: `url(#${id})` } : {})
      this.content = element('g')
      this.blurred.append(this.content)
      this.stage.append(this.blurred)
      this.svg.append(this.defs, this.stage)
      host.shadowRoot.append(this.svg)
      const style = document.createElement('style')
      // Important shadow-host declarations outrank the host's inline fallback.
      // Only the native inner surface inherits that independently chosen value.
      style.textContent = ':host > div { backdrop-filter: inherit !important; -webkit-backdrop-filter: inherit !important; }'
      host.shadowRoot.append(style)
      this.style = style
      this.resize = new ResizeObserver(this.schedule)
      this.resize.observe(host)
      this.resize.observe(source)
      this.theme = source.getRootNode().querySelector('.theme-root')
      this.themeObserver = new MutationObserver(this.schedule)
      if (this.theme) this.themeObserver.observe(this.theme, { attributes: true })
      source.addEventListener('songloft-glass-change', this.schedule, true)
      this.fontsChanged = () => { this.baselines.clear(); this.schedule() }
      document.fonts.addEventListener('loadingdone', this.fontsChanged)
      this.refresh()
    }

    syncObservers() {
      const active = new Set()
      const walk = root => {
        active.add(root)
        for (const child of root.querySelectorAll('*')) {
          if (child.shadowRoot && !opticalTag(child)) walk(child.shadowRoot)
        }
      }
      walk(this.source)
      for (const [root, observer] of this.roots) {
        if (active.has(root)) continue
        observer.disconnect()
        root.removeEventListener('scroll', this.schedule, true)
        root.removeEventListener('load', this.schedule, true)
        this.roots.delete(root)
      }
      for (const root of active) {
        if (this.roots.has(root)) continue
        const observer = new MutationObserver(this.schedule)
        observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
        root.addEventListener('scroll', this.schedule, true)
        root.addEventListener('load', this.schedule, true)
        this.roots.set(root, observer)
      }
    }

    refresh() {
      if (this.frame) cancelAnimationFrame(this.frame)
      this.frame = 0
      if (this.disposed || !this.host.isConnected || !this.source.isConnected) return
      const bounds = this.reference.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const pad = Math.max(16, this.radius * 3)
      const background = this.theme ? getComputedStyle(this.theme).backgroundColor : 'transparent'
      const result = paint(this.source, bounds, background, pad, style => this.baseline(style))
      this.valid = result.valid
      // A moving lens captures the fixed bar, but its viewport belongs to the
      // actual pill. An inverse background transform cancels the pill's pose.
      const local = getComputedStyle(this.host)
      const width = this.reference === this.host ? bounds.width : parseFloat(local.width)
      const height = this.reference === this.host ? bounds.height : parseFloat(local.height)
      this.svg.setAttribute('width', width)
      this.svg.setAttribute('height', height)
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      this.svg.style.width = `${width}px`
      this.svg.style.height = `${height}px`
      this.svg.style.opacity = result.valid ? '1' : '0'
      for (const [name, value] of Object.entries({ x: -pad, y: -pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 })) this.blur.setAttribute(name, value)
      this.paintDefs?.remove()
      this.paintDefs = result.defs
      this.defs.append(result.defs)
      this.content.replaceChildren(result.scene)
      const fallback = result.valid ? 'none' : `blur(${this.radius}px)`
      this.host.style.setProperty('backdrop-filter', fallback, 'important')
      this.host.style.setProperty('-webkit-backdrop-filter', fallback, 'important')
      this.syncObservers()
      this.host.dispatchEvent(new Event('songloft-glass-change', { bubbles: true }))
      for (const listener of this.listeners) listener()
    }

    baseline(style) {
      const key = ['font-family', 'font-size', 'font-weight', 'font-style'].map(name => style.getPropertyValue(name)).join('|')
      if (this.baselines.has(key)) return this.baselines.get(key)
      const probe = document.createElement('span'), marker = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;display:inline-block;white-space:pre;line-height:normal;padding:0;margin:0;border:0'
      for (const name of ['font-family', 'font-size', 'font-weight', 'font-style']) probe.style.setProperty(name, style.getPropertyValue(name))
      marker.style.cssText = 'display:inline-block;vertical-align:baseline;width:0;height:0;padding:0;margin:0;border:0'
      probe.append(document.createTextNode('Hg'), marker)
      this.host.shadowRoot.append(probe)
      const range = document.createRange()
      range.selectNodeContents(probe.firstChild)
      const offset = marker.getBoundingClientRect().y - range.getBoundingClientRect().y
      probe.remove()
      this.baselines.set(key, offset)
      return offset
    }

    dispose() {
      this.disposed = true
      cancelAnimationFrame(this.frame)
      this.resize.disconnect()
      this.themeObserver.disconnect()
      this.source.removeEventListener('songloft-glass-change', this.schedule, true)
      document.fonts.removeEventListener('loadingdone', this.fontsChanged)
      for (const [root, observer] of this.roots) {
        observer.disconnect()
        root.removeEventListener('scroll', this.schedule, true)
        root.removeEventListener('load', this.schedule, true)
      }
      this.roots.clear()
      this.listeners.clear()
      this.baselines.clear()
      this.svg.remove()
      this.style.remove()
      this.host.style.removeProperty('backdrop-filter')
      this.host.style.removeProperty('-webkit-backdrop-filter')
    }
  }
  return (host, source, radius, reference) => new Scene(host, source, radius, reference)
})()
