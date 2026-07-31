import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Locate a file recorded with an absolute path from another machine (or a
 * previous location) under `anchorDir`.
 *
 * The stored path is split into segments and progressively shorter tails are
 * tested against the anchor directory, longest first, so a preserved subfolder
 * structure wins over a bare filename match:
 *
 *   stored:  C:\Users\old\proj\train\images\img.jpg
 *   anchor:  D:\copied\proj
 *   tried:   D:\copied\proj\Users\old\proj\train\images\img.jpg
 *            D:\copied\proj\old\proj\train\images\img.jpg
 *            ...
 *            D:\copied\proj\train\images\img.jpg   <- first hit, returned
 *
 * Returns the resolved absolute path, or null when nothing matches.
 * Kept free of database imports so it stays unit-testable outside Electron.
 */
export function resolveAgainstDir(storedPath: string, anchorDir: string): string | null {
  const segments = String(storedPath)
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')

  // Start at 1 to skip the drive/root segment ("C:", server name, ...).
  for (let start = 1; start < segments.length; start += 1) {
    const candidate = join(anchorDir, ...segments.slice(start))
    if (existsSync(candidate)) return candidate
  }
  return null
}
