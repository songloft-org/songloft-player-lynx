# Responsive Design

Build responsive layouts in Lynx.

## CSS Media Queries (Lynx 4.0+)

Lynx 4.0 adds a subset of CSS Media Queries Level 4. Both the host SDK and bundle build must support the feature. CSS Rule encoding is required; without it, media rules are not encoded and have no runtime effect.

Add the config plugin to the existing build plugins, preserving the ReactLynx and other plugins:

```ts
import { pluginLynxConfig } from '@lynx-js/config-rsbuild-plugin'

// Inside the existing plugins array:
pluginLynxConfig({ enableCSSRule: true })
```

Verify the installed config plugin and encoder support this option and that the bundle's engine compatibility matches the target hosts. Songloft currently targets `engineVersion: '2.14'` and does not enable `enableCSSRule` in `lynx.config.ts`; upgrading native hosts to 4.0 alone does not activate media queries. Do not change that build contract merely to follow a documentation example.

```css
.container {
  display: flex;
  flex-direction: column;
}

/* Requires Lynx 4.0+ and CSS Rule encoding. */
@media (min-width: 768px) {
  .container { flex-direction: row; }
}
```

- Supported queries include viewport width/height, aspect ratio, orientation, pixel density, and `prefers-color-scheme`, with min/max forms, range syntax, query lists, and logical conditions.
- `device-*` dimensions use the viewport, not the physical device size. The host must update viewport/screen metrics during resizing or folding.
- Native `prefers-color-scheme` depends on the host's color-scheme update API; a theme class or globalProps field alone does not establish that integration. Preserve Songloft's existing theme and reduce-motion contracts.
- Native `hover`/`pointer` queries have no host-provided environment values; do not use them as reliable capability probes. Unrecognized features evaluate to false. `print` and other non-screen media types never match.
- For older hosts or builds without CSS Rule encoding, use fluid units and host-driven JavaScript breakpoints. Web behavior must be checked independently against the installed web-core/build pipeline.

Sources, checked 2026-10-08: [Lynx 4.0 release](https://lynxjs.org/next/blog/lynx-4-0), [Media Query API](https://lynxjs.org/4.0/api/css/media-query.html), [official API source](https://github.com/lynx-family/lynx-website/blob/main/docs/en/api/css/media-query.mdx). Development docs may cover newer APIs; apply SDK gates rather than assuming all examples work in 4.0.

## Scale Automatically with `rem` and `vw` (Recommended)

> **Recommended approach:** Use `rem` together with `vw` to set the root font size. `rpx` is a fully supported Lynx-specific unit, but it is not Web-compatible.

```css
/* Set the base font size on the root element */
page {
  font-size: calc(100vw / 23.4375); /* 1rem = 16px at a 375px viewport width */
}

/* Use rem for responsive scaling */
.container {
  width: 100%; /* Full width */
  padding: 2rem; /* 2rem on each side, approximately 32px at 375px */
}

.card {
  width: 100%; /* Fill the container's content box */
  margin-bottom: 1.5rem;
}

/* Font sizes */
.title {
  font-size: 1.125rem; /* Approximately 18px at a 375px viewport width */
}

.body {
  font-size: 0.875rem; /* Approximately 14px at a 375px viewport width */
}
```

## Use Viewport Units (`vw` and `vh`)

> Viewport units provide fluid layouts on both older and newer hosts. Media queries additionally require the version and encoding checks above.

```css
/* Fluid layout without a discrete breakpoint */
.container {
  display: flex;
  flex-direction: column;
  padding: 4vw; /* Scales with the viewport width */
}

/* Optimize for larger screens */
.sidebar {
  width: 26vw; /* Approximately 200px at a 768px viewport width */
}

.main {
  flex: 1;
}
```

## Responsive Grid

Combine Grid layout with percentages or `vw` units:

```css
.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr; /* Mobile: one column */
}
```

## Responsive Flex Layout

```css
.flex-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.flex-item {
  flex: 1 1 40vw; /* Scales with the viewport width */
}
```

## Safe-Area Insets

```css
/* Account for notched iPhone displays */
.safe-area {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Fixed bottom button */
.fixed-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
  background-color: #fff;
}
```

## Dynamic Responsive Layouts with JavaScript

Read the viewport dimensions and select a layout dynamically:

```javascript
// Convert the physical screen width reported by Lynx to CSS pixels.
const viewportWidth = SystemInfo.pixelWidth / SystemInfo.pixelRatio;

// Select a layout based on the viewport width
function getLayoutClass(width) {
  if (width >= 1024) return 'desktop-layout';
  if (width >= 768) return 'tablet-layout';
  return 'mobile-layout';
}

// Apply the result to the component
const layoutClass = getLayoutClass(viewportWidth);
const showSidebar = viewportWidth >= 768;
```

Combine this with conditional rendering:

```jsx
<view className={layoutClass}>
  {showSidebar ? <Sidebar /> : null}
  <MainContent />
</view>
```

```css
.desktop-layout {
  display: flex;
  flex-direction: row;
}

.tablet-layout {
  display: flex;
  flex-direction: row;
}

.mobile-layout {
  display: flex;
  flex-direction: column;
}
```

## Responsive Design Best Practices

1. **Start mobile-first**: Define mobile styles first, then use enabled media queries for style changes or JavaScript for structural changes.
2. **Use `rem`**: Prefer `rem` for responsive scaling, with `vw` defining the root font size.
3. **Use viewport units**: Use `vw` and `vh` to create fluid layouts.
4. **Choose breakpoints for the actual content**, in enabled media queries or JavaScript:
   - 320px - Small phone
   - 375px - Standard iPhone
   - 414px - iPhone Plus
   - 768px - iPad in portrait orientation
   - 1024px - iPad in landscape orientation
5. **Test across devices**: Verify the layout on a range of device sizes.

## Common Pitfalls

### Do Not Assume `@media` Is Enabled

```css
/* No effect in native bundles without CSS Rule encoding, or on older SDKs. */
@media (min-width: 768px) {
  .container {
    flex-direction: row;
  }
}
```

### Use Supported Alternatives

```css
/* ✅ Use rem and viewport units */
.container {
  display: flex;
  flex-direction: column;
  padding: 4vw;
}

/* Set the base font size on the root element */
page {
  font-size: calc(100vw / 23.4375); /* 1rem = 16px at a 375px viewport width */
}
```

```javascript
// ✅ Update the layout dynamically with JavaScript
const viewportWidth = SystemInfo.pixelWidth / SystemInfo.pixelRatio;
const isWide = viewportWidth >= 768;
```
