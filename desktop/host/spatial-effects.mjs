// Use the same impulse coefficients as the Web and native audio processors.
// The generated lavfi graph contains only validated numbers and no URLs.
export function spatialFilters(profile) {
  if (!profile) return ''
  const { side, dry, taps } = profile
  if (!Number.isFinite(side) || side < 1 || side > 1.5 ||
      !Number.isFinite(dry) || dry < 0 || dry > 1 ||
      !Array.isArray(taps) || taps.length > 48 ||
      taps.some(tap => !tap || !Number.isFinite(tap.milliseconds) || tap.milliseconds < 1 ||
        tap.milliseconds > 1000 || !Number.isFinite(tap.gain) || Math.abs(tap.gain) > 1) ||
      (dry + taps.reduce((sum, tap) => sum + Math.abs(tap.gain), 0)) * side > 1.00001)
    throw new Error('Invalid plugin spatial profile')

  const direct = (1 + side) / 2
  const cross = (1 - side) / 2
  const matrix = side === 1 ? '' :
    `aformat=channel_layouts=stereo,pan=stereo|c0=${direct}*c0${cross}*c1|c1=${direct}*c1${cross}*c0,`
  if (!taps.length) return `${matrix}volume=${dry}`

  const rate = 48000
  const inputs = taps.map((_, index) => `[tap${index}]`).join('')
  const delayed = taps.map(({ milliseconds, gain }, index) =>
    `[tap${index}]adelay=${Math.round(milliseconds * rate / 1000)}S:all=1,volume=${gain}[wet${index}]`,
  )
  const wet = taps.map((_, index) => `[wet${index}]`).join('')
  return [
    `${matrix}aresample=${rate},asplit=${taps.length + 1}[direct]${inputs}`,
    `[direct]volume=${dry}[dry]`,
    ...delayed,
    `[dry]${wet}amix=inputs=${taps.length + 1}:duration=first:normalize=0`,
  ].join(';')
}
