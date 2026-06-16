import { ipcMain, dialog } from 'electron'
import { existsSync, unlinkSync } from 'fs'
import { listImages, getImage, updateImageStatus, updateImageSplit, updateImageNull, autoSplit, deleteImages, setImagesExcluded, setImagesStatus, setImagesSplit } from '../db/repositories/image.repo'
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

  // Exclude/include images from the dataset (split/export/augmentation).
  // Reversible and non-destructive — annotations are preserved.
  ipcMain.handle('image:setExcluded', async (_event, ids: string[], excluded: boolean) => {
    if (!Array.isArray(ids) || ids.length === 0) return { changed: 0 }
    const changed = setImagesExcluded(ids, excluded)
    return { changed }
  })

  // Batch status / split updates for multi-selected images.
  ipcMain.handle('image:setStatusBatch', async (_event, ids: string[], status: ImageStatus) => {
    if (!Array.isArray(ids) || ids.length === 0) return { changed: 0 }
    return { changed: setImagesStatus(ids, status) }
  })

  ipcMain.handle('image:setSplitBatch', async (_event, ids: string[], split: SplitType) => {
    if (!Array.isArray(ids) || ids.length === 0) return { changed: 0 }
    return { changed: setImagesSplit(ids, split) }
  })

  // Remove images from the project.  Source image files on disk are NEVER
  // touched — LabelIt only stores file paths, not the originals.  We do clean
  // up the generated thumbnails since those are ours to own.  Annotations
  // delete via FK CASCADE in the DB schema.
  ipcMain.handle('image:delete', async (_event, ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deleted: 0, thumbnails_removed: 0 }
    }
    const { deleted, thumbnailPaths } = deleteImages(ids)
    let thumbnailsRemoved = 0
    for (const path of thumbnailPaths) {
      try {
        if (existsSync(path)) {
          unlinkSync(path)
          thumbnailsRemoved += 1
        }
      } catch {
        // Best-effort cleanup — orphan thumbnail files are harmless and the
        // user can purge them manually if needed.
      }
    }
    return { deleted, thumbnails_removed: thumbnailsRemoved }
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
