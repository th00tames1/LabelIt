import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import Database from 'better-sqlite3'
import { openDatabase, closeDatabase } from '../db/database'
import { initProjectMeta, getProjectMeta, setProjectName } from '../db/repositories/project.repo'
import type { RecentProject } from '../db/schema'
import ElectronStore from 'electron-store'

const recentStore = new ElectronStore<{ recent: RecentProject[] }>({
  name: 'recent-projects',
  defaults: { recent: [] },
})

let currentProjectDir: string | null = null

export function getCurrentProjectDir(): string | null {
  return currentProjectDir
}

export function getThumbnailDir(): string {
  if (!currentProjectDir) throw new Error('No project open')
  return join(currentProjectDir, '.thumbnails')
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:create', async (_event, name: string, directory: string) => {
    mkdirSync(directory, { recursive: true })
    const dbPath = join(directory, 'project.lbl')
    closeDatabase()
    openDatabase(dbPath)
    initProjectMeta(name)
    currentProjectDir = directory
    mkdirSync(join(directory, '.thumbnails'), { recursive: true })

    addRecent({ name, file_path: dbPath, last_opened: Date.now(), image_count: 0 })
    return getProjectMeta()
  })

  ipcMain.handle('project:open', async (_event, filePath: string) => {
    closeDatabase()
    openDatabase(filePath)
    currentProjectDir = join(filePath, '..')
    mkdirSync(join(currentProjectDir, '.thumbnails'), { recursive: true })

    const meta = getProjectMeta()
    addRecent({ name: meta.name, file_path: filePath, last_opened: Date.now(), image_count: 0 })
    return meta
  })

  ipcMain.handle('project:close', async () => {
    closeDatabase()
    currentProjectDir = null
  })

  ipcMain.handle('project:getMeta', async () => getProjectMeta())
  ipcMain.handle('project:getCurrentDir', async () => currentProjectDir)

  ipcMain.handle('project:updateName', async (_event, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Project name cannot be empty')
    setProjectName(trimmed)
    if (currentProjectDir) {
      const filePath = join(currentProjectDir, 'project.lbl')
      const recent = (recentStore.get('recent') as RecentProject[]).map((project) =>
        project.file_path === filePath ? { ...project, name: trimmed } : project,
      )
      recentStore.set('recent', recent)
    }
    return getProjectMeta()
  })

  ipcMain.handle('project:renameRecent', async (_event, filePath: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Project name cannot be empty')
    if (!existsSync(filePath)) throw new Error('Project file does not exist')

    const currentFilePath = currentProjectDir ? join(currentProjectDir, 'project.lbl') : null
    if (currentFilePath === filePath) {
      setProjectName(trimmed)
    } else {
      const database = new Database(filePath)
      try {
        database.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)').run('name', trimmed)
      } finally {
        database.close()
      }
    }

    const recent = (recentStore.get('recent') as RecentProject[]).map((project) =>
      project.file_path === filePath ? { ...project, name: trimmed } : project,
    )
    recentStore.set('recent', recent)
    return recent.filter((project) => existsSync(project.file_path))
  })

  ipcMain.handle('project:listRecent', async () => {
    return (recentStore.get('recent') as RecentProject[]).filter(
      (r) => existsSync(r.file_path)
    )
  })

  ipcMain.handle('project:showOpenDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Project',
        filters: [{ name: 'LabelIt Project', extensions: ['lbl'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:showCreateDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

function addRecent(project: RecentProject): void {
  const recent = (recentStore.get('recent') as RecentProject[])
    .filter((r) => r.file_path !== project.file_path)
  recent.unshift(project)
  recentStore.set('recent', recent.slice(0, 10))
}
