import ElectronStore from 'electron-store'
import type { AppSettings } from '../db/schema'
import { DEFAULT_SETTINGS } from '../db/schema'

export const settingsStore = new ElectronStore<AppSettings>({
  name: 'app-settings',
  defaults: DEFAULT_SETTINGS,
})

export function getAppSettings(): AppSettings {
  return settingsStore.store
}

export function updateAppSettings(partial: Partial<AppSettings>): AppSettings {
  Object.entries(partial).forEach(([key, value]) => {
    settingsStore.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings])
  })
  return settingsStore.store
}
