/**
 * `SongloftStorage` facade — the contract from
 * `docs/archive/migration/lynx_native_modules_spec.md#2-songloftstorage`.
 *
 * Three namespaces:
 * - `prefs`   — non-sensitive key/value (SharedPreferences / UserDefaults / localStorage).
 * - `secure`  — sensitive values, e.g. tokens (Keystore / Keychain / DPAPI / localStorage on web).
 * - `paths`   — app directory paths (native dirs / virtual paths on web).
 *
 * Every method is async to match the eventual native (JSB) bridge, even where
 * the web implementation is synchronous underneath.
 */
export interface SongloftPrefs {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
}

export interface SongloftSecure {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface SongloftPaths {
  appData(): Promise<string>
  cache(): Promise<string>
  documents(): Promise<string>
}

export interface SongloftStorage {
  prefs: SongloftPrefs
  secure: SongloftSecure
  paths: SongloftPaths
}
