import { ipcMain, dialog } from 'electron'
import { existsSync, accessSync, constants as fsConstants } from 'fs'
import { exportToYOLO } from '../services/export/yolo.exporter'
import { exportToCOCO } from '../services/export/coco.exporter'
import { exportToVOC } from '../services/export/voc.exporter'
import { exportToCSV } from '../services/export/csv.exporter'
import { getDatasetStats } from '../services/stats.service'
import { sidecarService } from '../services/sidecar.service'
import type { YOLOExportOptions, COCOExportOptions, VOCExportOptions, CSVExportOptions } from '../db/schema'

// Wrap an exporter so any thrown error becomes an IPC-safe Error with a
// user-actionable message instead of a cryptic stack trace.  Without this,
// export failures crash the renderer with raw Node errors like "ENOENT" or
// "EACCES" that mean nothing to end users.
function wrapExport<T, O>(label: string, fn: (opts: O) => Promise<T> | T): (opts: O) => Promise<T> {
  return async (opts: O) => {
    try {
      return await fn(opts)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      let friendly = raw
      if (/EACCES|permission denied/i.test(raw)) {
        friendly = `Permission denied. Try a different folder or close any program that has it open.`
      } else if (/ENOSPC|disk full|no space/i.test(raw)) {
        friendly = `Not enough disk space to complete the export.`
      } else if (/ENOENT|no such file/i.test(raw)) {
        friendly = `A source image file is missing on disk — re-import the missing image and try again.`
      } else if (/EBUSY|locked/i.test(raw)) {
        friendly = `The output folder is locked by another process. Close any program viewing it and retry.`
      }
      throw new Error(`${label} export failed: ${friendly}`)
    }
  }
}

// Verify the user-selected output directory is writable BEFORE the export runs
// (so we fail fast with a clear message instead of mid-write).
function assertWritableDir(dir: string | undefined | null): void {
  if (!dir) throw new Error('No output folder selected.')
  if (!existsSync(dir)) throw new Error(`Output folder no longer exists: ${dir}`)
  try {
    accessSync(dir, fsConstants.W_OK)
  } catch {
    throw new Error(`Output folder is not writable: ${dir}`)
  }
}

export function registerExportIpc(): void {
  ipcMain.handle('export:toYOLO', async (_event, options: YOLOExportOptions) => {
    assertWritableDir(options?.output_dir)
    return wrapExport('YOLO', exportToYOLO)(options)
  })

  ipcMain.handle('export:toCOCO', async (_event, options: COCOExportOptions) => {
    assertWritableDir(options?.output_dir)
    return wrapExport('COCO', exportToCOCO)(options)
  })

  ipcMain.handle('export:toVOC', async (_event, options: VOCExportOptions) => {
    assertWritableDir(options?.output_dir)
    return wrapExport('VOC', exportToVOC)(options)
  })

  ipcMain.handle('export:toCSV', async (_event, options: CSVExportOptions) => {
    return wrapExport('CSV', exportToCSV)(options)
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

  ipcMain.handle('sidecar:ensureStarted', async () => {
    await sidecarService.start()
    return sidecarService.status
  })
}
