/**
 * sync-readme-version.js
 *
 * Rewrites the version referenced by the README download table so the links
 * point at the release matching package.json. Run this after bumping the
 * version and before tagging:
 *
 *   npm version ...        (or edit package.json)
 *   npm run sync-readme    (updates README.md)
 *   git commit && git tag vX.Y.Z && git push --follow-tags
 */

'use strict'

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const readmePath = path.join(root, 'README.md')
const { version } = require(path.join(root, 'package.json'))

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[sync-readme] Unexpected version in package.json: ${version}`)
  process.exit(1)
}

const original = fs.readFileSync(readmePath, 'utf8')

const updated = original
  // Download URLs: .../releases/download/v1.2.3/...
  .replace(/releases\/download\/v\d+\.\d+\.\d+\//g, `releases/download/v${version}/`)
  // Asset file names: LabelIt-1.2.3-Setup.exe, LabelIt-1.2.3-mac-arm64.dmg, ...
  .replace(/LabelIt-\d+\.\d+\.\d+-/g, `LabelIt-${version}-`)
  // The "Current release" line above the table
  .replace(/Current release: \*\*v\d+\.\d+\.\d+\*\*/g, `Current release: **v${version}**`)

if (updated === original) {
  console.log(`[sync-readme] Already up to date at v${version}.`)
  process.exit(0)
}

fs.writeFileSync(readmePath, updated)

const changed = updated.split('\n').filter((line, i) => line !== original.split('\n')[i]).length
console.log(`[sync-readme] Updated README.md to v${version} (${changed} line(s) changed).`)
