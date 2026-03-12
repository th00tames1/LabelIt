import { ipcMain } from 'electron'
import type { DatasetVersionInput, VersionExportRequest } from '../db/schema'
import {
  deleteFinishVersion,
  exportFinishVersions,
  getDefaultRecipe,
  getFinishSummary,
  listFinishVersions,
  upsertFinishVersion,
} from '../services/finish.service'

export function registerFinishIpc(): void {
  ipcMain.handle('finish:getSummary', async () => getFinishSummary())
  ipcMain.handle('finish:listVersions', async () => listFinishVersions())
  ipcMain.handle('finish:getDefaultRecipe', async () => getDefaultRecipe())
  ipcMain.handle('finish:saveVersion', async (_event, input: DatasetVersionInput) => upsertFinishVersion(input))
  ipcMain.handle('finish:deleteVersion', async (_event, id: string) => {
    deleteFinishVersion(id)
  })
  ipcMain.handle('finish:exportVersions', async (_event, request: VersionExportRequest) => exportFinishVersions(request))
}
