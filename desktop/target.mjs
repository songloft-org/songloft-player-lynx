import { readFileSync } from 'node:fs'

export const compatibility = JSON.parse(
  readFileSync(new URL('./compatibility.json', import.meta.url), 'utf8'),
)

export const desktopReleaseRepo = 'songloft-org/songloft-player-lynx'

export function desktopReleaseAsset(tag, name, variant = 'bundled') {
  if (
    tag !== 'dev' &&
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)
  )
    throw new Error('Invalid desktop release tag')
  if (!['standard', 'bundled'].includes(variant)) throw new Error('Invalid desktop package variant')
  return `https://github.com/${desktopReleaseRepo}/releases/download/${tag}/${encodeURIComponent(name)}`
}

export function desktopUpdateManifestUrl(channel, target, variant = 'bundled') {
  if (!compatibility.targets.includes(target))
    throw new Error('Invalid desktop update target')
  if (!['standard', 'bundled'].includes(variant)) throw new Error('Invalid desktop package variant')
  const name = `desktop-${variant}-${target}.json`
  if (channel === 'dev') return desktopReleaseAsset('dev', name)
  if (channel === 'stable')
    return `https://github.com/${desktopReleaseRepo}/releases/latest/download/${name}`
  throw new Error('Invalid desktop channel')
}

export function assertTarget(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`
  if (!compatibility.targets.includes(target))
    throw new Error(
      `Unsupported desktop probe target: ${target}. Expected ${compatibility.targets.join(', ')}.`,
    )
  return target
}
