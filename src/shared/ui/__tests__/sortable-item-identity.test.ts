import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

const files = [
  'src/features/library/widgets/LibraryViewEditor.tsx',
  'src/features/jsplugin/widgets/PluginNavigationSettings.tsx',
  'src/features/playlist/widgets/PlaylistsView.tsx',
  'src/features/playlist/pages/PlaylistDetailPage.tsx',
]

// The SDK maps children directly, without adding keys. Index identity otherwise
// lets an item's MTS refs and overlay state move to another row after a sort.
test.each(files)('%s keeps React identity aligned with sorting identity', (file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.resolve(__dirname, '../../../../', file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const items: ts.JsxOpeningElement[] = []
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'SortableItem') {
      items.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(items.length).toBeGreaterThan(0)
  for (const item of items) {
    const attributes = item.attributes.properties.filter(ts.isJsxAttribute)
    const key = attributes.find((attribute) => attribute.name.getText(source) === 'key')
    const sortingKey = attributes.find(
      (attribute) => attribute.name.getText(source) === 'sortingKey',
    )
    expect(key?.initializer?.getText(source)).toBe(sortingKey?.initializer?.getText(source))
    expect(key?.initializer).toBeDefined()
  }
})
