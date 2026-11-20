import { desktopIdentity } from '../host/identity.mjs'

export function packageConfig({ channel, variant = 'bundled', version, target, root }) {
  if (!['standard', 'bundled'].includes(variant)) throw new Error('Invalid desktop package variant')
  const [os, arch] = target.split('-')
  const id = desktopIdentity({ channel, appData: '/' }).id
  // Lynxtron's Windows packager resolves extraResources against the app root.
  // Use an explicit path from that root to match the host and updater.
  const resourceOption = os === 'win32' ? 'extraFiles' : 'extraResources'
  const resources = os === 'win32' ? 'resources/songloft' : 'songloft'
  return {
    appId: id,
    productName: channel === 'dev' ? 'Songloft Dev' : 'Songloft',
    executableName: channel === 'dev' ? 'SongloftDev' : 'Songloft',
    directories: { output: `release/${channel}/${target}` },
    extraMetadata: { name: 'songloft-lynx-desktop', version, main: 'main.mjs' },
    asar: true,
    files: [
      'main.mjs',
      'target.mjs',
      'host/**/*.mjs',
      'compatibility.json',
      'package.json',
      '!**/tests/**',
      '!**/*.map',
      '!**/*.log',
      '!**/node_modules/@lynx-js/lynxtron-*-*/**',
      '!**/node_modules/@lynx-js/lynxtron/dist/**',
    ],
    [resourceOption]: [
      { from: `resources/${target}`, to: resources, filter: variant === 'bundled' ? ['**/*'] : ['**/*', '!backend/**'] },
      { from: '.lynxtron/app', to: `${resources}/app`, filter: ['**/*'] },
      { from: '.lynxtron/licenses/CEF.txt', to: `${resources}/licenses/CEF.txt` },
    ],
    // Keep the Release asset name stable so rolling dev releases replace the
    // previous installer instead of accumulating one asset per build.
    artifactName: `songloft-lynx-${variant}-${channel}-\${os}-\${arch}.\${ext}`,
    publish: null,
    forceCodeSigning: false,
    mac: {
      identity: '-',
      icon: '.lynxtron/app/app_icon.png',
      target: [
        { target: 'dmg', arch: [arch] },
        { target: 'zip', arch: [arch] },
      ],
      category: 'public.app-category.music',
      minimumSystemVersion: '13.0',
      hardenedRuntime: false,
      entitlements: 'entitlements.mac.plist',
      entitlementsInherit: 'entitlements.mac.plist',
      notarize: false,
    },
    win: {
      icon: '.lynxtron/app/app_icon.png',
      target: [{ target: 'nsis', arch: ['x64'] }],
      signAndEditExecutable: true,
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
    },
    lynxtron: { runtimeVariant: 'release' },
  }
}
