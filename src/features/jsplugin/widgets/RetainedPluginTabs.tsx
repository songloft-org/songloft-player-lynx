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

/** Web already retains its child workers in lynx-frame-host. Native frames
 * must belong to the shell, not the routed page that disappears on navigation. */
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
  const [visited, setVisited] = useState<string[]>([])
  const match = /^\/plugin\/([^/]+)$/.exec(location.pathname)
  const entry =
    location.search?.tab === true && match ? decodeURIComponent(match[1]!) : ''
  const eligible =
    data?.plugins.filter(
      (p) => p.isActive && p.renderEngine === 'lynx' && p.entryPath,
    ) ?? []
  const current = eligible.find((p) => p.entryPath === entry)
  const eligiblePaths = eligible.map((p) => p.entryPath).join('\0')
  const entries =
    current && !visited.includes(entry) ? [...visited, entry] : visited
  useEffect(() => {
    setVisited((old) => {
      const next = old.filter((path) =>
        eligible.some((p) => p.entryPath === path),
      )
      if (current && !next.includes(entry)) next.push(entry)
      return next.length === old.length &&
        next.every((path, i) => path === old[i])
        ? old
        : next
    })
  }, [eligiblePaths, entry])
  return (
    <ManagedTabs.Provider value={true}>
      {children}
      {eligible
        .filter((p) => entries.includes(p.entryPath!))
        .map((plugin) => (
          <view
            key={`${plugin.id}:${plugin.entryPath}:${plugin.version}:${plugin.updatedAt}`}
            className='plugin-tab-retained'
            style={{ display: plugin.entryPath === entry ? 'flex' : 'none' }}
            data-testid={`retained-plugin-${plugin.entryPath}`}
          >
            <LynxPluginFrame
              entryPath={plugin.entryPath!}
              isTabEntry
              active={plugin.entryPath === entry}
            />
          </view>
        ))}
    </ManagedTabs.Provider>
  )
}
