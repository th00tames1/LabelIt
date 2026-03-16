import { ipcMain, BrowserWindow } from 'electron'
import { pythonSetupService } from '../services/python-setup.service'
import type { SetupProgress } from '../services/python-setup.service'

export function registerSetupIpc(): void {
  /** Check whether AI setup (venv + packages) is needed. */
  ipcMain.handle('setup:isNeeded', async (): Promise<boolean> => {
    return pythonSetupService.isSetupNeeded()
  })

  /**
   * Run the full Python setup.
   * Progress events are sent back to the calling window as 'setup:progress'.
   */
  ipcMain.handle('setup:run', async (event): Promise<void> => {
    const sender = event.sender

    const unsub = pythonSetupService.onProgress((progress: SetupProgress) => {
      if (!sender.isDestroyed()) {
        sender.send('setup:progress', progress)
      }
    })

    try {
      await pythonSetupService.run()
    } finally {
      unsub()
    }
  })
}
