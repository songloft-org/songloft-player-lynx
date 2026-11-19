/** Diagnostics stay opt-in and cannot schedule shutdown of the business UI. */
export function readProbeOptions(argv) {
  const enabled = argv.includes('--probe')
  const value = (name) =>
    argv
      .find((argument) => argument.startsWith(`${name}=`))
      ?.slice(name.length + 1)
  const durationText = value('--probe-duration-ms')
  const durationMs = durationText === undefined ? null : Number(durationText)
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) ||
      durationMs < 1000 ||
      durationMs > 600000)
  ) {
    throw new Error(
      '--probe-duration-ms must be an integer from 1000 to 600000',
    )
  }
  const media = value('--probe-media') ?? ''
  const cefUrl = value('--probe-cef-url') ?? 'https://lynxjs.org/'
  const cef = argv.includes('--probe-cef')
  const report = argv.includes('--probe-report')
  const timeline = argv.includes('--probe-timeline')
  if (!enabled && argv.some((argument) => argument.startsWith('--probe-'))) {
    throw new Error('Probe options require --probe')
  }
  if (timeline && !media)
    throw new Error('--probe-timeline requires --probe-media')
  return { enabled, media, cef, cefUrl, report, timeline, durationMs }
}
