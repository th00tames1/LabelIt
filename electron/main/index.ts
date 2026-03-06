import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAllIpc } from './ipc'
import { sidecarService } from './services/sidecar.service'
import { closeDatabase } from './db/database'

// ─── Windows: DPI + Rendering Flags ──────────────────────────────────────────
// Must be set BEFORE app.whenReady() — these configure Chromium's rendering.
if (process.platform === 'win32') {
  // Enable PerMonitorV2 DPI awareness for the browser window.
  // Chromium's DPI awareness is embedded in the Electron binary; these flags
  // ensure no legacy DPI virtualization is applied by Windows.
  app.commandLine.appendSwitch('enable-features', 'HighDPISupport')
  // Force disable the legacy 96 DPI fallback — Chromium already reports correct DPR.
  app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder')
  // Use angle/GL for canvas rendering (better for Konva at high DPI)
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'gl')
}

// ─── Single Instance Lock ─────────────────────────────────────────────────────
// Only one instance of the app can run at a time.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── Window Factory ───────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: true,
    backgroundColor: '#0f0f0f',
    title: 'LabelingTool',
    // Use the generated icon for the window title bar (Windows taskbar)
    icon: is.dev
      ? join(__dirname, '../../resources/icon.ico')
      : join(process.resourcesPath, '../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Security: disable navigation to untrusted origins
      webviewTag: false,
    },
  })

  // Show the window only after the renderer has fully loaded (prevents white flash)
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // In development, open DevTools
    if (is.dev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Handle second-instance focus
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Block all navigation to external URLs — open in system browser instead
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow file:// and devtools, block everything else
    if (!url.startsWith('file://') && !url.startsWith('devtools://')) {
      event.preventDefault()
    }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  return mainWindow
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Set the Windows App User Model ID (for taskbar grouping + notifications)
  electronApp.setAppUserModelId('com.labelingtool.app')

  // Electron devtools shortcut optimization
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register all IPC channels before the window is created
  registerAllIpc()

  // Create the main window
  createWindow()

  // Start AI sidecar in background (non-blocking, optional feature)
  sidecarService.start().catch((err) => {
    console.warn('[sidecar] Failed to start:', err.message)
  })

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
app.on('before-quit', () => {
  sidecarService.stop()
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Unhandled Rejection Safety Net ──────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason)
  if (!is.dev) {
    // In production: show error dialog only for critical errors
    dialog.showErrorBox(
      'Unexpected Error',
      `LabelingTool encountered an unexpected error:\n\n${String(reason)}\n\nThe app will continue running.`,
    )
  }
})
