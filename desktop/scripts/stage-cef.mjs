import { spawnSync } from 'node:child_process'
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  symlink,
  writeFile,
  rm,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { buildCefHelper } from './build-cef-helper.mjs'

const copyOptions = {
  recursive: true,
  dereference: false,
  verbatimSymlinks: true,
}

export async function stageMacCefFramework(source, destination) {
  // Some pnpm installs materialize npm tarball symlinks. codesign rejects a
  // versioned framework with duplicate files and directories at its root.
  const version = 'Versions/A'
  const aliases = [basename(source, '.framework'), 'Libraries', 'Resources']
  await Promise.all(aliases.map((name) => access(join(source, version, name))))
  await cp(join(source, version), join(destination, version), copyOptions)
  await symlink('A', join(destination, 'Versions', 'Current'))
  await Promise.all(
    aliases.map((name) => symlink(`${version}/${name}`, join(destination, name))),
  )
}

export async function stageCef(root, target) {
  const require = createRequire(join(root, 'package.json'))
  const source = dirname(require.resolve('@lynx-js/cef-webview/package.json'))
  const manifest = JSON.parse(
    await readFile(join(source, 'lynx.lib.json'), 'utf8'),
  )
  const [os, arch] = target.split('-')
  const selected = manifest.platforms.lynxtron.targets.find(
    (item) => item.os === os && item.arch === arch,
  )
  if (!selected) throw new Error('CEF target missing')
  const helper = await buildCefHelper(root, target)
  const licenses = join(root, '.lynxtron', 'licenses')
  await mkdir(licenses, { recursive: true })
  await copyFile(helper.license, join(licenses, 'CEF.txt'))
  const destination = join(
    root,
    '.lynxtron',
    'native',
    'node_modules',
    '@lynx-js',
    'cef-webview',
  )
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  for (const file of [
    'index.cjs',
    'package.json',
    'lynx.lib.json',
    ...selected.files,
    ...(selected.appBundles ?? []),
  ])
    await cp(join(source, file), join(destination, file), copyOptions)
  for (const framework of selected.frameworks ?? [])
    await stageMacCefFramework(
      join(source, framework),
      join(destination, framework),
    )
  if (os === 'win32') {
    const subprocess = selected.files.find(
      (file) => basename(file) === 'cef_subprocess.exe',
    )
    if (!subprocess) throw new Error('CEF subprocess is missing')
    await copyFile(helper.executable, join(destination, subprocess))
  } else {
    for (const app of selected.appBundles) {
      const bundle = join(destination, app)
      const executable = join(
        bundle,
        'Contents',
        'MacOS',
        basename(app, '.app'),
      )
      await copyFile(helper.executable, executable)
      await chmod(executable, 0o755)
      // Re-seal the development helper after replacing its executable. The
      // installer builder applies the distribution signature to nested apps.
      const signature = spawnSync(
        'codesign',
        ['--force', '--sign', '-', bundle],
        { stdio: 'inherit' },
      )
      if (signature.error) throw signature.error
      if (signature.status !== 0)
        throw new Error('Cannot sign staged CEF helper')
    }
  }
  // Keep the original full target manifest: the official builder selects the
  // matching record and signs its nested frameworks/helpers before the app.
  await writeFile(
    join(destination, 'lynx.lib.json'),
    JSON.stringify(manifest, null, 2),
  )
}
