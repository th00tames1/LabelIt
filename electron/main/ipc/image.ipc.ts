import { ipcMain, dialog } from 'electron'
import { listImages, getImage, updateImageStatus, updateImageSplit, updateImageNull, autoSplit } from '../db/repositories/image.repo'
import { importImages, importFolder } from '../services/import.service'
import { getThumbnailDir, getCurrentProjectDir } from './project.ipc'
import type { ImageFilter, ImageStatus, SplitType, SplitRatios } from '../db/schema'

export function registerImageIpc(): void {
  ipcMain.handle('image:list', async (_event, filter?: ImageFilter) => {
    return listImages(filter)
  })

  ipcMain.handle('image:get', async (_event, id: string) => {
    return getImage(id)
  })

  ipcMain.handle('image:import', async (_event, filePaths: string[]) => {
    const thumbnailDir = getThumbnailDir()
    return importImages(filePaths, thumbnailDir)
  })

  ipcMain.handle('image:importFolder', async (_event, folderPath: string) => {
    const thumbnailDir = getThumbnailDir()
    return importFolder(folderPath, thumbnailDir)
  })

  ipcMain.handle('image:updateStatus', async (_event, id: string, status: ImageStatus) => {
    updateImageStatus(id, status)
  })

  ipcMain.handle('image:updateSplit', async (_event, id: string, split: SplitType) => {
    updateImageSplit(id, split)
  })

  ipcMain.handle('image:updateNull', async (_event, id: string, isNull: boolean) => {
    updateImageNull(id, isNull)
  })

  ipcMain.handle('image:autoSplit', async (_event, ratios: SplitRatios) => {
    autoSplit(ratios)
  })

  ipcMain.handle('image:showOpenDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Images',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'tiff', 'tif'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('image:showFolderDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Image Folder',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
