/**
 * setup-codesign-cache.cjs
 *
 * electron-builder downloads winCodeSign (code-signing tools) before packaging.
 * The .7z archive contains macOS symlinks (darwin/lib/libcrypto.dylib → ...)
 * which 7-Zip cannot create on Windows without Developer Mode.
 *
 * This script pre-populates the electron-builder winCodeSign cache by:
 *  1. Downloading the .7z (if not already cached)
 *  2. Extracting ONLY the Windows-relevant files, skipping darwin/ and linux/
 *  3. Creating empty placeholder files for the macOS symlinks so electron-builder
 *     finds the directory "valid" and skips re-extraction.
 *
 * Run via: npm run prebuild:win
 */

'use strict'

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')

const LOCAL_APP_DATA =
  process.env.LOCALAPPDATA ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Local')

const CACHE_DIR = path.join(LOCAL_APP_DATA, 'electron-builder', 'Cache', 'winCodeSign')
const VERSION   = 'winCodeSign-2.6.0'
const TARGET    = path.join(CACHE_DIR, VERSION)
const ZIP_URL   = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'

// 7za.exe bundled with electron-builder's own dependency
const SEVEN_ZA = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

// Known macOS symlinks inside the archive that cause the error on Windows
const MAC_PLACEHOLDERS = [
  path.join('darwin', '10.12', 'lib', 'libcrypto.dylib'),
  path.join('darwin', '10.12', 'lib', 'libssl.dylib'),
  path.join('darwin', '10.13', 'lib', 'libcrypto.dylib'),
  path.join('darwin', '10.13', 'lib', 'libssl.dylib'),
]

async function main () {
  if (fs.existsSync(TARGET)) {
    console.log(`[codesign-cache] Already cached: ${TARGET}`)
    return
  }

  if (!fs.existsSync(SEVEN_ZA)) {
    console.error(`[codesign-cache] 7za.exe not found at ${SEVEN_ZA}`)
    console.error('  Run "npm install" first, then retry.')
    process.exit(1)
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true })

  // ── 1. Download ───────────────────────────────────────────────────────────
  const zipPath = path.join(CACHE_DIR, 'winCodeSign-2.6.0.7z')
  if (!fs.existsSync(zipPath)) {
    process.stdout.write(`[codesign-cache] Downloading ${VERSION}...`)
    await downloadFile(ZIP_URL, zipPath)
    console.log(' done.')
  } else {
    console.log(`[codesign-cache] Zip already downloaded: ${zipPath}`)
  }

  // ── 2. Extract (skip darwin/ and linux/ to avoid symlink errors) ──────────
  console.log(`[codesign-cache] Extracting to ${TARGET} ...`)
  fs.mkdirSync(TARGET, { recursive: true })

  try {
    execFileSync(SEVEN_ZA, [
      'x', zipPath,
      `-o${TARGET}`,
      '-x!darwin',   // exclude macOS binaries (have symlinks)
      '-x!linux',    // exclude Linux binaries
      '-bd',         // no progress bar
      '-y',          // yes to all prompts
    ], { stdio: ['ignore', 'inherit', 'inherit'] })
    console.log('[codesign-cache] Extraction complete (Windows files only).')
  } catch (err) {
    console.warn('[codesign-cache] Extraction warning:', err.message)
    console.warn('[codesign-cache] Continuing — partial extraction may be fine.')
  }

  // ── 3. Create placeholder files for missing macOS symlinks ────────────────
  //    electron-builder may scan the directory; empty files prevent it
  //    from thinking the cache is corrupt and re-downloading.
  for (const rel of MAC_PLACEHOLDERS) {
    const full = path.join(TARGET, rel)
    if (!fs.existsSync(full)) {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '')
    }
  }

  console.log('[codesign-cache] winCodeSign cache ready. Building...')
}

function downloadFile (url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (target) => {
      const mod = target.startsWith('https') ? https : http
      mod.get(target, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${target}`))
        }
        const file = fs.createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

main().catch((err) => {
  console.error('[codesign-cache] Fatal error:', err.message)
  process.exit(1)
})
