import { ipcMain, app, shell } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { pythonSetupService } from '../services/python-setup.service'
import type { SetupProgress } from '../services/python-setup.service'

/**
 * Resolves the models directory relative to the app installation.
 * Tries: {appPath}/python, {appPath}/../python, {resourcesPath}/python
 * This matches where sam_service.py looks for model files.
 */
function resolveModelsDir(): string {
  const appPath = app.getAppPath()
  const candidates = [
    join(appPath, 'python'),
    join(appPath, '..', 'python'),
    join(process.resourcesPath ?? '', 'python'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return join(c, 'models')
  }
  return join(appPath, 'python', 'models')
}

export function registerSetupIpc(): void {
  /** Check whether AI setup (venv + packages) is needed. */
  ipcMain.handle('setup:isNeeded', async (): Promise<boolean> => {
    return pythonSetupService.isSetupNeeded()
  })

  /**
   * Run the full Python setup.
   * Accepts optional language ('en' | 'ko') so progress messages are localised.
   * Progress events are sent back to the calling window as 'setup:progress'.
   */
  ipcMain.handle('setup:run', async (event, lang = 'en'): Promise<void> => {
    const sender = event.sender

    const unsub = pythonSetupService.onProgress((progress: SetupProgress) => {
      if (!sender.isDestroyed()) {
        sender.send('setup:progress', progress)
      }
    })

    try {
      await pythonSetupService.run(lang)
    } finally {
      unsub()
    }
  })

  /** Returns the models directory path (relative to app installation). */
  ipcMain.handle('setup:getModelsDir', async (): Promise<string> => {
    return resolveModelsDir()
  })

  /** Opens the models directory in the OS file explorer. */
  ipcMain.handle('setup:openModelsDir', async (): Promise<void> => {
    const dir = resolveModelsDir()
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  /** Opens a URL in the user's default external browser. */
  ipcMain.handle('setup:openExternal', async (_event, url: string): Promise<void> => {
    await shell.openExternal(url)
  })
}
