import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsSection } from '../../settings/widgets/SettingsSection.js'
import {
  useDirectoryTree,
  useDirNames,
  useMusicPathSetting,
  useUpdateExcludeConfig,
} from '../data/index.js'
import { toggleSelected } from '../domain/directory-tree.js'
import {
  EXCLUDE_TABS,
  excludeTabLabelKey,
  filterDirNameSuggestions,
  relativeToRoot,
  type ExcludeTab,
} from '../domain/exclude-dir-model.js'
import { DirectoryTree } from './DirectoryTree.js'

export interface ExcludeDirSectionProps {
  onWriteError: () => void
}

/**
 * Exclude-directory manager — batch 26. Ports the Flutter `ExcludeDirManager`
 * three-tab model (name / path / auto-create-playlist excludes). `path` (the
 * music root) is never editable here — see the model + data-layer doc comments
 * — this section only ever writes the three exclude lists.
 *
 * Drafts are local state, hydrated once from the first successful read (not on
 * every background refetch, which would clobber in-progress edits) and only
 * sent to the server when the user taps Save — mirrors the Flutter reference's
 * local `_excludeDirs` state + single `FilledButton`.
 */
export function ExcludeDirSection({ onWriteError }: ExcludeDirSectionProps) {
  const { t } = useTranslation()

  const [activeTab, setActiveTab] = useState<ExcludeTab>('name')
  const [hydrated, setHydrated] = useState(false)
  const [excludeDirs, setExcludeDirs] = useState<string[]>([])
  const [excludePaths, setExcludePaths] = useState<string[]>([])
  const [autoCreateExcludeDirs, setAutoCreateExcludeDirs] = useState<string[]>([])
  const [nameInput, setNameInput] = useState('')
  const [autoCreateInput, setAutoCreateInput] = useState('')
  const [saved, setSaved] = useState(false)

  const musicPath = useMusicPathSetting()
  const dirNames = useDirNames()
  const updateExcludeConfig = useUpdateExcludeConfig()
  const { tree, actions: treeActions } = useDirectoryTree()

  useEffect(() => {
    if (hydrated || !musicPath.data) return
    setExcludeDirs(musicPath.data.value.excludeDirs)
    setExcludePaths(musicPath.data.value.excludePaths)
    setAutoCreateExcludeDirs(musicPath.data.value.autoCreateExcludeDirs)
    setHydrated(true)
  }, [hydrated, musicPath.data])

  const addExcludeDir = (name: string) => {
    const trimmed = name.trim()
    if (trimmed.length === 0 || excludeDirs.includes(trimmed)) return
    setExcludeDirs((prev) => toggleSelected(prev, trimmed))
    setNameInput('')
    setSaved(false)
  }

  const addAutoCreateExcludeDir = (name: string) => {
    const trimmed = name.trim()
    if (trimmed.length === 0 || autoCreateExcludeDirs.includes(trimmed)) return
    setAutoCreateExcludeDirs((prev) => toggleSelected(prev, trimmed))
    setAutoCreateInput('')
    setSaved(false)
  }

  const togglePath = (path: string) => {
    setExcludePaths((prev) => toggleSelected(prev, path))
    setSaved(false)
  }

  const onSave = () => {
    setSaved(false)
    updateExcludeConfig.mutate(
      { excludeDirs, excludePaths, autoCreateExcludeDirs },
      { onSuccess: () => setSaved(true), onError: onWriteError },
    )
  }

  const suggestions = filterDirNameSuggestions(dirNames.data?.value ?? [], nameInput, excludeDirs)

  return (
    <SettingsSection title={t('libops.excludeSection')}>
      <view className='libops-exclude__tabs' data-testid='exclude-tabs'>
        {EXCLUDE_TABS.map((tab) => (
          <view
            key={tab}
            className={tab === activeTab
              ? 'libops-exclude__tab libops-exclude__tab--active'
              : 'libops-exclude__tab'}
            bindtap={() => setActiveTab(tab)}
            data-testid={`exclude-tab-${tab}`}
          >
            <text className='libops-exclude__tab-text'>{t(excludeTabLabelKey(tab))}</text>
          </view>
        ))}
      </view>

      {musicPath.data?.readFailed
        ? (
          <text className='libops-exclude__read-error' data-testid='exclude-read-error'>
            {t('libops.readConfigFailed')}
          </text>
        )
        : null}

      {activeTab === 'name'
        ? (
          <view className='libops-exclude__panel'>
            <view className='libops-exclude__input-row'>
              <Input
                className='libops-exclude__input'
                placeholder={t('libops.excludeNameInputPlaceholder')}
                value={nameInput}
                onInput={(value) => setNameInput(value)}
                onConfirm={() => addExcludeDir(nameInput)}
              />
              <view
                className='libops-exclude__add-btn'
                bindtap={() => addExcludeDir(nameInput)}
                data-testid='exclude-name-add'
              >
                <Icon name='plus' size={16} color={ICON_COLORS.primaryContent} />
              </view>
            </view>

            {suggestions.length > 0
              ? (
                <view className='libops-exclude__suggestions' data-testid='exclude-name-suggestions'>
                  {suggestions.map((name) => (
                    <view
                      key={name}
                      className='libops-exclude__suggestion-row'
                      bindtap={() => addExcludeDir(name)}
                      data-testid={`exclude-suggestion-${name}`}
                    >
                      <text className='libops-exclude__suggestion-text'>{name}</text>
                    </view>
                  ))}
                </view>
              )
              : null}

            <ChipList
              label={t('libops.excludeExcludedNames')}
              empty={t('libops.excludeEmptyNames')}
              items={excludeDirs}
              display={(name) => name}
              onRemove={(name) => setExcludeDirs((prev) => prev.filter((n) => n !== name))}
            />
          </view>
        )
        : null}

      {activeTab === 'path'
        ? (
          <view className='libops-exclude__panel'>
            <text className='libops-exclude__music-dir'>
              {t('libops.excludeMusicDir', { path: tree.root })}
            </text>

            <DirectoryTree
              tree={tree}
              actions={treeActions}
              selectedPaths={excludePaths}
              onTogglePath={togglePath}
            />

            <ChipList
              label={t('libops.excludeExcludedPaths')}
              empty={t('libops.excludeEmptyPaths')}
              items={excludePaths}
              display={(path) => relativeToRoot(path, tree.root)}
              onRemove={(path) => setExcludePaths((prev) => prev.filter((p) => p !== path))}
            />
          </view>
        )
        : null}

      {activeTab === 'autoCreate'
        ? (
          <view className='libops-exclude__panel'>
            <view className='libops-exclude__input-row'>
              <Input
                className='libops-exclude__input'
                placeholder={t('libops.excludeAutoCreateInputPlaceholder')}
                value={autoCreateInput}
                onInput={(value) => setAutoCreateInput(value)}
                onConfirm={() => addAutoCreateExcludeDir(autoCreateInput)}
              />
              <view
                className='libops-exclude__add-btn'
                bindtap={() => addAutoCreateExcludeDir(autoCreateInput)}
                data-testid='exclude-auto-create-add'
              >
                <Icon name='plus' size={16} color={ICON_COLORS.primaryContent} />
              </view>
            </view>

            <ChipList
              label={t('libops.excludeAutoCreateExcluded')}
              empty={t('libops.excludeEmptyAutoCreate')}
              items={autoCreateExcludeDirs}
              display={(name) => name}
              onRemove={(name) => setAutoCreateExcludeDirs((prev) => prev.filter((n) => n !== name))}
            />
          </view>
        )
        : null}

      <view className='libops-exclude__save-row'>
        {saved ? <text className='libops-exclude__saved-note'>{t('libops.excludeSaved')}</text> : null}
        <view
          className={updateExcludeConfig.isPending
            ? 'libops-exclude__save-btn libops-exclude__save-btn--disabled'
            : 'libops-exclude__save-btn'}
          bindtap={updateExcludeConfig.isPending ? undefined : onSave}
          data-testid='exclude-save'
        >
          <text className='libops-exclude__save-text'>
            {updateExcludeConfig.isPending ? t('libops.excludeSaving') : t('libops.excludeSaveConfig')}
          </text>
        </view>
      </view>
    </SettingsSection>
  )
}

function ChipList({
  label,
  empty,
  items,
  display,
  onRemove,
}: {
  label: string
  empty: string
  items: readonly string[]
  display: (item: string) => string
  onRemove: (item: string) => void
}) {
  return (
    <view className='libops-exclude__chips'>
      <text className='libops-exclude__chips-label'>{label}</text>
      {items.length === 0
        ? <text className='libops-exclude__empty'>{empty}</text>
        : (
          <view className='libops-exclude__chips-row'>
            {items.map((item) => (
              <view className='libops-exclude__chip' key={item}>
                <text className='libops-exclude__chip-text'>{display(item)}</text>
                <view
                  className='libops-exclude__chip-remove'
                  bindtap={() => onRemove(item)}
                  data-testid={`exclude-chip-remove-${item}`}
                >
                  <Icon name='x' size={12} color={ICON_COLORS.contentMuted} />
                </view>
              </view>
            ))}
          </view>
        )}
    </view>
  )
}
