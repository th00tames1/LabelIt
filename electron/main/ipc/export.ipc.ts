import { ipcMain, dialog } from 'electron'
import { exportToYOLO } from '../services/export/yolo.exporter'
import { exportToCOCO } from '../services/export/coco.exporter'
import { exportToVOC } from '../services/export/voc.exporter'
import { exportToCSV } from '../services/export/csv.exporter'
import { getDatasetStats } from '../services/stats.service'
import { sidecarService } from '../services/sidecar.service'
import type { YOLOExportOptions, COCOExportOptions, VOCExportOptions, CSVExportOptions } from '../db/schema'

export function registerExportIpc(): void {
  ipcMain.handle('export:toYOLO', async (_event, options: YOLOExportOptions) => {
    return exportToYOLO(options)
  })

  ipcMain.handle('export:toCOCO', async (_event, options: COCOExportOptions) => {
    return exportToCOCO(options)
  })

  ipcMain.handle('export:toVOC', async (_event, options: VOCExportOptions) => {
    return exportToVOC(options)
  })

  ipcMain.handle('export:toCSV', async (_event, options: CSVExportOptions) => {
    return exportToCSV(options)
  })

  ipcMain.handle('export:showSaveDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Export Directory',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('export:showCSVSaveDialog', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save CSV Export',
      defaultPath: 'annotations.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('project:getStats', async () => {
    return getDatasetStats()
  })

  ipcMain.handle('sidecar:getStatus', async () => {
    return sidecarService.status
  })
}
