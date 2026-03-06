import { ipcMain } from 'electron'
import {
  listForImage, createAnnotation, updateAnnotation,
  deleteAnnotation, bulkCreate, bulkDelete
} from '../db/repositories/annotation.repo'
import type { CreateAnnotationDto, UpdateAnnotationDto } from '../db/schema'

export function registerAnnotationIpc(): void {
  ipcMain.handle('annotation:listForImage', async (_event, imageId: string) => {
    return listForImage(imageId)
  })

  ipcMain.handle('annotation:create', async (_event, imageId: string, dto: CreateAnnotationDto) => {
    return createAnnotation(imageId, dto)
  })

  ipcMain.handle('annotation:update', async (_event, id: string, dto: UpdateAnnotationDto) => {
    return updateAnnotation(id, dto)
  })

  ipcMain.handle('annotation:delete', async (_event, id: string) => {
    deleteAnnotation(id)
  })

  ipcMain.handle('annotation:bulkCreate', async (_event, imageId: string, dtos: CreateAnnotationDto[]) => {
    return bulkCreate(imageId, dtos)
  })

  ipcMain.handle('annotation:bulkDelete', async (_event, ids: string[]) => {
    bulkDelete(ids)
  })
}
