import { create } from 'zustand'
import { settingsApi } from '../api/ipc'
import type { AIDeviceMode, AppLanguage, AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'dark',
  ai_device_mode: 'auto',
  default_label_colors: [
    '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16',
  ],
  canvas_zoom_sensitivity: 1,
  auto_save_interval_ms: 0,
  sidecar_port: 7842,
  shortcut_overrides: {},
}

interface SettingsState {
  settings: AppSettings
  isLoaded: boolean
  isSaving: boolean
  load: () => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
  setLanguage: (language: AppLanguage) => Promise<void>
  setTheme: (theme: AppSettings['theme']) => Promise<void>
  setAIDeviceMode: (mode: AIDeviceMode) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  isSaving: false,

  load: async () => {
    try {
      const settings = await settingsApi.get()
      set({ settings, isLoaded: true })
    } catch (error) {
      console.error(error)
      set({ isLoaded: true })
    }
  },

  updateSettings: async (partial) => {
    const previous = get().settings
    const optimistic = { ...previous, ...partial }
    set({ settings: optimistic, isSaving: true })

    try {
      const saved = await settingsApi.set(partial)
      set({ settings: saved, isSaving: false })
    } catch (error) {
      console.error(error)
      set({ settings: previous, isSaving: false })
      throw error
    }
  },

  setLanguage: async (language) => {
    await get().updateSettings({ language })
  },

  setTheme: async (theme) => {
    await get().updateSettings({ theme })
  },

  setAIDeviceMode: async (mode) => {
    await get().updateSettings({ ai_device_mode: mode })
  },
}))
