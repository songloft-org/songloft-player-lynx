import { readFileSync } from 'node:fs'

export const compatibility = JSON.parse(
  readFileSync(new URL('./compatibility.json', import.meta.url), 'utf8'),
)

export const desktopReleaseRepo = 'songloft-org/songloft-player-lynx'

export function desktopReleaseTag(channel) {
  if (!['dev', 'stable'].includes(channel))
    throw new Error('Invalid desktop channel')
  return `desktop-${channel}`
}

export function desktopReleaseAsset(channel, name) {
  return `https://github.com/${desktopReleaseRepo}/releases/download/${desktopReleaseTag(channel)}/${encodeURIComponent(name)}`
}

export function assertTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`
  if (!compatibility.targets.includes(target))
    throw new Error(
      `Unsupported desktop probe target: ${target}. Expected ${compatibility.targets.join(', ')}.`,
    )
  return target
}
