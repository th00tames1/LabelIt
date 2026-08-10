import { ipcMain, shell } from 'electron'
import { checkForUpdates, RELEASES_PAGE } from '../services/update.service'

export function registerUpdateIpc(): void {
  ipcMain.handle('update:check', async () => checkForUpdates())

  // Opens the fixed releases page only. No URL parameter is accepted, so the
  // renderer (or anything that compromises it) cannot direct users elsewhere.
  ipcMain.handle('update:openDownloadPage', async () => {
    await shell.openExternal(RELEASES_PAGE)
  })
}
