import { app } from 'electron'

/**
 * Update check against GitHub Releases.
 *
 * This is deliberately NOTIFY-ONLY: it fetches the latest release tag, compares
 * versions, and lets the renderer show a banner with a download link. Nothing
 * is downloaded or installed automatically.
 *
 * Why not electron-updater (full auto-update)? Documented for the future:
 *  - macOS: Squirrel.Mac validates the code signature of the update. The
 *    project ships ad-hoc signed builds (no Apple Developer certificate), and
 *    Squirrel.Mac rejects those, so auto-update CANNOT work on macOS until a
 *    Developer ID certificate (and notarization) is set up.
 *  - Windows (NSIS) and Linux (AppImage) would work today, but electron-updater
 *    needs latest.yml / latest-mac.yml / latest-linux.yml plus .blockmap files
 *    in the release. The CI pipeline currently strips those on purpose
 *    (--publish never; the release job uploads installers only). To enable
 *    auto-update later: let electron-builder publish its metadata again, add
 *    electron-updater to the main process, and keep macOS on the notify flow
 *    until the app is properly signed.
 *
 * Privacy: the check is a single unauthenticated GET to the GitHub API. It
 * carries no user data. Failure (offline, rate limit, firewall) is a normal
 * state for this app and resolves to "no update information", never an error.
 */

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  update_available: boolean
}

const RELEASES_API = 'https://api.github.com/repos/th00tames1/LabelIt/releases/latest'

/** Fixed download page. The renderer never supplies a URL; the shell only ever
 *  opens this constant, so a compromised renderer cannot redirect users. */
export const RELEASES_PAGE = 'https://github.com/th00tames1/LabelIt/releases/latest'

// One network hit per app run is plenty (unauthenticated API allows 60/hour).
const CACHE_MS = 6 * 60 * 60 * 1000
let cached: UpdateCheckResult | null = null
let checkedAt = 0

function parseVersion(value: string): number[] {
  return value.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  const now = Date.now()
  if (cached && now - checkedAt < CACHE_MS) return cached

  try {
    const res = await fetch(RELEASES_API, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null

    const data = await res.json() as { tag_name?: unknown }
    const tag = typeof data.tag_name === 'string' ? data.tag_name : ''
    // Only accept plain semver tags; anything else is treated as "no info".
    if (!/^v?\d+\.\d+\.\d+$/.test(tag)) return null

    const latest = tag.replace(/^v/i, '')
    const current = app.getVersion()
    cached = {
      current_version: current,
      latest_version: latest,
      update_available: isNewer(latest, current),
    }
    checkedAt = now
    return cached
  } catch {
    // Offline / blocked / slow network — all normal, never surface an error.
    return null
  }
}
