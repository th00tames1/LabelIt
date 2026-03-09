const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const rootDir = join(__dirname, '..')
const betterSqliteDir = join(rootDir, 'node_modules', 'better-sqlite3')
const betterSqliteBinary = join(betterSqliteDir, 'build', 'Release', 'better_sqlite3.node')

function hasExpectedBinaryHeader(filePath) {
  if (!existsSync(filePath)) return false

  const header = readFileSync(filePath)
  if (header.length < 4) return false

  if (process.platform === 'win32') {
    return header[0] === 0x4d && header[1] === 0x5a
  }

  if (process.platform === 'linux') {
    return header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46
  }

  if (process.platform === 'darwin') {
    const magic = header.readUInt32BE(0)
    return magic === 0xcffaedfe || magic === 0xfeedfacf || magic === 0xcafebabe
  }

  return true
}

function ensureBetterSqliteBinary() {
  if (!existsSync(betterSqliteDir)) return
  if (hasExpectedBinaryHeader(betterSqliteBinary)) return

  const prebuildInstall = require.resolve('prebuild-install/bin.js', { paths: [rootDir] })
  const electronVersion = require(join(rootDir, 'node_modules', 'electron', 'package.json')).version

  const result = spawnSync(
    process.execPath,
    [
      prebuildInstall,
      '--runtime', 'electron',
      '--target', electronVersion,
      '--platform', process.platform,
      '--arch', process.arch,
      '--force',
    ],
    {
      cwd: betterSqliteDir,
      stdio: 'inherit',
    }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

ensureBetterSqliteBinary()
