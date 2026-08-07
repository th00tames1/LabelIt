/**
 * adhoc-sign-mac.cjs — electron-builder afterSign hook.
 *
 * The project ships without an Apple Developer certificate, so builds cannot be
 * notarized. They must still carry an ad-hoc signature: macOS refuses to launch
 * a bundle with no signature at all, and the usual "right click > Open" escape
 * hatch does not override that. The user still sees the unidentified-developer
 * prompt once, which is expected and documented in the README.
 *
 * electron-builder simply skips signing when it finds no identity, which is what
 * shipped the Intel build broken in 1.5.1. Apple Silicon toolchains attach an
 * ad-hoc signature during linking, so arm64 happened to work and hid the bug.
 *
 * codesign must run on macOS, so this is a no-op on every other platform.
 * --deep is deprecated by Apple but is the only single-shot way to cover the
 * nested Electron frameworks and helper apps; the alternative is walking the
 * bundle and signing inside-out, which buys nothing for an ad-hoc identity.
 */

'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSignMac(context) {
  const platformName = context.packager.platform.name
  if (platformName !== 'mac' || process.platform !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  console.log(`[adhoc-sign] Signing ${appPath} with an ad-hoc identity`)

  try {
    execFileSync(
      'codesign',
      ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
      { stdio: 'inherit' },
    )
  } catch (err) {
    throw new Error(`[adhoc-sign] codesign failed for ${appPath}: ${err.message}`)
  }

  // Fail the build rather than ship another unlaunchable app.
  try {
    execFileSync('codesign', ['--verify', '--verbose=2', appPath], { stdio: 'inherit' })
    console.log('[adhoc-sign] Signature verified')
  } catch (err) {
    throw new Error(`[adhoc-sign] Signature verification failed for ${appPath}: ${err.message}`)
  }
}
