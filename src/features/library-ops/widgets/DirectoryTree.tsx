import { useTranslation } from 'react-i18next'

import type { DirEntry } from '../../../models/library-ops.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { DirectoryTreeActions } from '../data/use-directory-tree.js'
import {
  ROOT_KEY,
  childrenOf,
  isExpanded,
  isLoading,
  nodeIndentPx,
  type DirectoryTreeState,
} from '../domain/directory-tree.js'

export interface DirectoryTreeProps {
  tree: DirectoryTreeState
  actions: DirectoryTreeActions
  selectedPaths: readonly string[]
  onTogglePath: (path: string) => void
}

interface NodeProps extends DirectoryTreeProps {
  entry: DirEntry
  depth: number
}

/**
 * Lazy-loading directory picker for "scan only these directories".
 *
 * **Two independent tap targets per row, deliberately.** Flutter made the whole
 * row toggle expansion and let the inner `Checkbox` handle selection; the Lynx
 * equivalent would need `catchtap` on the checkbox to stop the row handler — and
 * `fireEvent.tap` does not fire handlers on an element that only has `catchtap`
 * (see PROGRESS batch 12), which would push selecting a directory into the
 * "device-only" bucket. Splitting into a checkbox hit area and a chevron hit
 * area (with the name itself inert) keeps both interactions unit-testable and
 * leaves this batch with no `catchtap`-only interaction at all.
 */
export function DirectoryTree(props: DirectoryTreeProps) {
  const { t } = useTranslation()
  const { tree } = props

  if (tree.rootStatus === 'loading') {
    return (
      <text className='libops-tree__state' data-testid='dir-tree-loading'>
        {t('common.loading')}
      </text>
    )
  }
  if (tree.rootStatus === 'error') {
    return (
      <text className='libops-tree__state' data-testid='dir-tree-error'>
        {t('libops.loadDirFailed')}
      </text>
    )
  }

  const roots = childrenOf(tree, ROOT_KEY)
  if (roots.length === 0) {
    return (
      <text className='libops-tree__state' data-testid='dir-tree-empty'>
        {t('libops.dirEmpty')}
      </text>
    )
  }

  return (
    <view className='libops-tree' data-testid='dir-tree'>
      {roots.map((entry) => (
        <DirectoryNode key={entry.path} {...props} entry={entry} depth={0} />
      ))}
    </view>
  )
}

function DirectoryNode({ entry, depth, ...rest }: NodeProps) {
  const { tree, actions, selectedPaths, onTogglePath } = rest
  const { t } = useTranslation()

  const selected = selectedPaths.includes(entry.path)
  const expanded = isExpanded(tree, entry.path)
  const loading = isLoading(tree, entry.path)
  const children = childrenOf(tree, entry.path)

  return (
    <view className='libops-tree__branch'>
      <view
        className='libops-tree__row'
        style={{ paddingLeft: `${nodeIndentPx(depth)}px` }}
      >
        <view
          className='libops-tree__check-hit'
          bindtap={() => onTogglePath(entry.path)}
          data-testid={`dir-check-${entry.path}`}
        >
          <view
            className={selected
              ? 'libops-tree__box libops-tree__box--on'
              : 'libops-tree__box'}
          >
            {selected ? <Icon name='check' size={14} color={ICON_COLORS.primaryContent} /> : null}
          </view>
        </view>

        <Icon
          name={expanded ? 'folder-open' : 'folder'}
          size={18}
          color={selected ? ICON_COLORS.primary : ICON_COLORS.contentMuted}
        />
        <text className='libops-tree__name'>{entry.name}</text>

        {loading
          ? <text className='libops-tree__hint'>{t('common.loading')}</text>
          : entry.hasChildren
            ? (
              <view
                className='libops-tree__expand-hit'
                bindtap={() => actions.toggleExpand(entry.path, entry.hasChildren)}
                data-testid={`dir-expand-${entry.path}`}
              >
                <Icon
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={ICON_COLORS.contentMuted}
                />
              </view>
            )
            : null}
      </view>

      {expanded
        ? children.map((child) => (
          <DirectoryNode key={child.path} {...rest} entry={child} depth={depth + 1} />
        ))
        : null}
    </view>
  )
}
