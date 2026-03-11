import { ipcMain } from 'electron'
import type { AppSettings } from '../db/schema'
import { applyAppSettingsPatch } from '../services/menu.service'
import { getAppSettings } from '../services/settings.service'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => getAppSettings())

  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => applyAppSettingsPatch(partial))
}
