import { ipcMain } from 'electron'
import ElectronStore from 'electron-store'
import type { AppSettings } from '../db/schema'
import { DEFAULT_SETTINGS } from '../db/schema'

const settingsStore = new ElectronStore<AppSettings>({
  name: 'app-settings',
  defaults: DEFAULT_SETTINGS,
})

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => settingsStore.store)

  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => {
    Object.entries(partial).forEach(([k, v]) => {
      settingsStore.set(k as keyof AppSettings, v as AppSettings[keyof AppSettings])
    })
    return settingsStore.store
  })
}
