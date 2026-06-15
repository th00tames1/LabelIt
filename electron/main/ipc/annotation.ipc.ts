import { ipcMain } from 'electron'
import {
  listForImage, createAnnotation, updateAnnotation,
  deleteAnnotation, bulkCreate, bulkDelete
} from '../db/repositories/annotation.repo'
import type { CreateAnnotationDto, UpdateAnnotationDto } from '../db/schema'

// Translate raw better-sqlite3 errors into something a user can act on.
// Without this, FK-constraint failures and similar leak through as cryptic
// "SqliteError: FOREIGN KEY constraint failed" messages in IPC error dialogs.
function describeDbError(err: unknown, fallback: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (/FOREIGN KEY/i.test(msg)) {
    return new Error('Cannot complete: this annotation references something that no longer exists (likely a deleted label or image). Try refreshing.')
  }
  if (/UNIQUE constraint/i.test(msg)) {
    return new Error('Duplicate detected — this item already exists.')
  }
  if (/database is locked|SQLITE_BUSY/i.test(msg)) {
    return new Error('Project database is busy. Wait a moment and try again — another save may be in progress.')
  }
  if (/no such table|database disk image is malformed|SQLITE_CORRUPT/i.test(msg)) {
    return new Error('Project file appears corrupted. Close the project and reopen it; if the issue persists, restore from backup.')
  }
  return new Error(`${fallback}: ${msg}`)
}

export function registerAnnotationIpc(): void {
  ipcMain.handle('annotation:listForImage', async (_event, imageId: string) => {
    try { return listForImage(imageId) }
    catch (err) { throw describeDbError(err, 'Failed to load annotations') }
  })

  ipcMain.handle('annotation:create', async (_event, imageId: string, dto: CreateAnnotationDto) => {
    try { return createAnnotation(imageId, dto) }
    catch (err) { throw describeDbError(err, 'Failed to create annotation') }
  })

  ipcMain.handle('annotation:update', async (_event, id: string, dto: UpdateAnnotationDto) => {
    try { return updateAnnotation(id, dto) }
    catch (err) { throw describeDbError(err, 'Failed to update annotation') }
  })

  ipcMain.handle('annotation:delete', async (_event, id: string) => {
    try { deleteAnnotation(id) }
    catch (err) { throw describeDbError(err, 'Failed to delete annotation') }
  })

  ipcMain.handle('annotation:bulkCreate', async (_event, imageId: string, dtos: CreateAnnotationDto[]) => {
    try { return bulkCreate(imageId, dtos) }
    catch (err) { throw describeDbError(err, 'Failed to save annotations') }
  })

  ipcMain.handle('annotation:bulkDelete', async (_event, ids: string[]) => {
    try { bulkDelete(ids) }
    catch (err) { throw describeDbError(err, 'Failed to delete annotations') }
  })
}
