export interface BuildMetadata {
  version: string
  package_version: string
  native_version: string
  build_number: number
  git_commit: string
  build_time: string
  channel: 'dev' | 'preview' | 'stable'
  release_tag: string
}
export function createBuildMetadata(options: {
  packageVersion: string
  ref?: string
  sha?: string
  now?: Date
  buildNumber?: number
}): BuildMetadata
export function validateBuildMetadata(
  value: unknown,
  packageVersion: string,
): BuildMetadata
