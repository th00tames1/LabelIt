import { ipcMain, app, shell } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { pythonSetupService } from '../services/python-setup.service'
import type { SetupProgress } from '../services/python-setup.service'

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

  /** Returns the user-writable models directory path. */
  ipcMain.handle('setup:getModelsDir', async (): Promise<string> => {
    return join(app.getPath('userData'), 'models')
  })

  /** Opens the models directory in the OS file explorer. */
  ipcMain.handle('setup:openModelsDir', async (): Promise<void> => {
    const dir = join(app.getPath('userData'), 'models')
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  /** Opens a URL in the user's default external browser. */
  ipcMain.handle('setup:openExternal', async (_event, url: string): Promise<void> => {
    await shell.openExternal(url)
  })
}
