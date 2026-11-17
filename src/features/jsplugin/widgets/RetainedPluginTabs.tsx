import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from '@lynx-js/react'
import { useRouterState } from '@tanstack/react-router'
import { appConfig } from '../../../core/config/app-config.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import { LynxPluginFrame } from './LynxPluginFrame.js'
import './RetainedPluginTabs.css'

const ManagedTabs = createContext(false)
export const useRetainedPluginTabs = () => useContext(ManagedTabs)

/** Web already retains its child workers in lynx-frame-host. All native Lynx
 * entries belong to the shell, including pushed pages from the home grid. */
export function RetainedPluginTabs({ children }: { children: ReactNode }) {
  if (isWebPlatform()) return children
  return (
    <NativePluginTabs key={`${appConfig.baseUrl}${appConfig.basePath}`}>
      {children}
    </NativePluginTabs>
  )
}

function NativePluginTabs({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (s) => s.location })
  const { data } = usePluginsQuery()
  const [visited, setVisited] = useState<Array<{ path: string; tab: boolean }>>(
    [],
  )
  const match = /^\/plugin\/([^/]+)$/.exec(location.pathname)
  const entry = match ? decodeURIComponent(match[1]!) : ''
  const isTabEntry = location.search?.tab === true
  const eligible =
    data?.plugins.filter(
      (p) => p.isActive && p.renderEngine === 'lynx' && p.entryPath,
    ) ?? []
  const current = eligible.find((p) => p.entryPath === entry)
  const eligiblePaths = eligible.map((p) => p.entryPath).join('\0')
  const entries = visited.filter((visit) =>
    eligible.some((p) => p.entryPath === visit.path),
  )
  if (current) {
    const visit = { path: entry, tab: isTabEntry }
    const index = entries.findIndex((item) => item.path === entry)
    if (index < 0) entries.push(visit)
    else entries[index] = visit
  }
  useEffect(() => {
    setVisited((old) =>
      entries.length === old.length &&
      entries.every(
        (visit, i) => visit.path === old[i]?.path && visit.tab === old[i]?.tab,
      )
        ? old
        : entries,
    )
  }, [eligiblePaths, entry, isTabEntry])
  return (
    <ManagedTabs.Provider value={true}>
      {children}
      {eligible
        .filter((p) => entries.some((visit) => visit.path === p.entryPath))
        .map((plugin) => (
          <view
            key={`${plugin.id}:${plugin.entryPath}:${plugin.version}:${plugin.updatedAt}`}
            className="plugin-tab-retained"
            style={{ display: plugin.entryPath === entry ? 'flex' : 'none' }}
            data-testid={`retained-plugin-${plugin.entryPath}`}
          >
            <LynxPluginFrame
              entryPath={plugin.entryPath!}
              isTabEntry={
                entries.find((visit) => visit.path === plugin.entryPath)!.tab
              }
              active={plugin.entryPath === entry}
            />
          </view>
        ))}
    </ManagedTabs.Provider>
  )
}
