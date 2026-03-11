import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppSettings } from '../db/schema'
import { getAppSettings, updateAppSettings } from './settings.service'
import { sidecarService } from './sidecar.service'

function broadcastSettingsChanged(settings: AppSettings): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('settings:changed', settings)
  }
}

export function refreshApplicationMenu(): void {
  const settings = getAppSettings()

  const themeMenu = (['light', 'dark'] as const).map((theme) => ({
    label: theme === 'light' ? 'Light' : 'Dark',
    type: 'radio' as const,
    checked: settings.theme === theme,
    click: () => { void applyAppSettingsPatch({ theme }) },
  }))

  const languageMenu: MenuItemConstructorOptions[] = [
    {
      label: 'English',
      type: 'radio',
      checked: settings.language === 'en',
      click: () => { void applyAppSettingsPatch({ language: 'en' }) },
    },
    {
      label: 'Korean',
      type: 'radio',
      checked: settings.language === 'ko',
      click: () => { void applyAppSettingsPatch({ language: 'ko' }) },
    },
  ]

  const deviceMenu: MenuItemConstructorOptions[] = [
    {
      label: 'Auto',
      type: 'radio',
      checked: settings.ai_device_mode === 'auto',
      click: () => { void applyAppSettingsPatch({ ai_device_mode: 'auto' }) },
    },
    {
      label: 'GPU',
      type: 'radio',
      checked: settings.ai_device_mode === 'gpu',
      click: () => { void applyAppSettingsPatch({ ai_device_mode: 'gpu' }) },
    },
    {
      label: 'CPU',
      type: 'radio',
      checked: settings.ai_device_mode === 'cpu',
      click: () => { void applyAppSettingsPatch({ ai_device_mode: 'cpu' }) },
    },
  ]

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit', label: app.name },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Theme', submenu: themeMenu },
        { label: 'Language', submenu: languageMenu },
        { label: 'AI Device', submenu: deviceMenu },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export async function applyAppSettingsPatch(partial: Partial<AppSettings>): Promise<AppSettings> {
  const previousMode = getAppSettings().ai_device_mode
  const next = updateAppSettings(partial)
  broadcastSettingsChanged(next)
  refreshApplicationMenu()

  if (partial.ai_device_mode != null && partial.ai_device_mode !== previousMode) {
    await sidecarService.restart()
  }

  return next
}
