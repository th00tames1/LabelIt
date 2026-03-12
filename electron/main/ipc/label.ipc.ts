import { ipcMain } from 'electron'
import {
  listLabels, createLabel, updateLabel, deleteLabel, reorderLabels, getLabelUsageCount,
  listKeypointDefs, createKeypointDef, deleteKeypointDef,
  setSkeletonEdge, removeSkeletonEdge, listSkeletonEdges,
} from '../db/repositories/label.repo'
import type { CreateLabelDto, UpdateLabelDto } from '../db/schema'

export function registerLabelIpc(): void {
  ipcMain.handle('label:list', async () => listLabels())

  ipcMain.handle('label:create', async (_event, dto: CreateLabelDto) => createLabel(dto))

  ipcMain.handle('label:update', async (_event, id: string, dto: UpdateLabelDto) => updateLabel(id, dto))

  ipcMain.handle('label:delete', async (_event, id: string) => deleteLabel(id))

  ipcMain.handle('label:getUsageCount', async (_event, id: string) => getLabelUsageCount(id))

  ipcMain.handle('label:reorder', async (_event, ids: string[]) => reorderLabels(ids))

  // Keypoint definitions
  ipcMain.handle('label:listKeypointDefs', async (_event, labelClassId: string) =>
    listKeypointDefs(labelClassId))

  ipcMain.handle('label:createKeypointDef',
    async (_event, labelClassId: string, name: string, color: string, sortOrder: number) =>
      createKeypointDef(labelClassId, name, color, sortOrder))

  ipcMain.handle('label:deleteKeypointDef', async (_event, id: string) => deleteKeypointDef(id))

  ipcMain.handle('label:setSkeletonEdge',
    async (_event, labelClassId: string, fromKpId: string, toKpId: string) =>
      setSkeletonEdge(labelClassId, fromKpId, toKpId))

  ipcMain.handle('label:removeSkeletonEdge',
    async (_event, labelClassId: string, fromKpId: string, toKpId: string) =>
      removeSkeletonEdge(labelClassId, fromKpId, toKpId))

  ipcMain.handle('label:listSkeletonEdges', async (_event, labelClassId: string) =>
    listSkeletonEdges(labelClassId))
}
