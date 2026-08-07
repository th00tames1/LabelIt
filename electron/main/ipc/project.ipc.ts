import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import Database from 'better-sqlite3'
import { openDatabase, closeDatabase } from '../db/database'
import { initProjectMeta, getProjectMeta, setProjectName } from '../db/repositories/project.repo'
import type { RecentProject } from '../db/schema'
import ElectronStore from 'electron-store'
import { importFolder } from '../services/import.service'
import { relinkProjectImages, getLastRelinkResult } from '../services/relink.service'

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

// Turn raw fs/sqlite errors into something a user can act on.
function describeProjectError(err: unknown, context: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (/EACCES|permission denied/i.test(msg)) {
    return new Error(`${context}: Permission denied. Choose a folder you own (avoid system-protected paths like Program Files).`)
  }
  if (/ENOSPC|disk full/i.test(msg)) {
    return new Error(`${context}: Not enough disk space.`)
  }
  if (/EBUSY|locked|SQLITE_BUSY/i.test(msg)) {
    return new Error(`${context}: Project file is locked by another process. Close any other LabelIt window using it and retry.`)
  }
  if (/SQLITE_CORRUPT|database disk image is malformed|file is not a database/i.test(msg)) {
    return new Error(`${context}: Project file appears corrupted or is not a valid LabelIt project.`)
  }
  if (/ENOENT|no such file/i.test(msg)) {
    return new Error(`${context}: File or folder no longer exists.`)
  }
  return new Error(`${context}: ${msg}`)
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:create', async (_event, name: string, directory: string) => {
    try {
      mkdirSync(directory, { recursive: true })
      const dbPath = join(directory, 'project.lbl')
      closeDatabase()
      openDatabase(dbPath)
      initProjectMeta(name)
      currentProjectDir = directory
      const thumbnailDir = join(directory, '.thumbnails')
      mkdirSync(thumbnailDir, { recursive: true })

      addRecent({ name, file_path: dbPath, last_opened: Date.now(), image_count: 0 })

      // "Create" on a folder that already holds a copied project.lbl reuses that
      // database. Heal its stale absolute paths BEFORE the auto-import below,
      // otherwise the path-based duplicate check misses and every image would be
      // imported a second time.
      relinkProjectImages(directory)

      // Auto-import images and annotations already present in the project folder.
      // We catch separately because a partial import failure shouldn't make the
      // whole project-create call fail — the project is already created.
      await importFolder(directory, thumbnailDir).catch((err) => {
        console.warn('[project:create] Auto-import failed:', err.message)
      })

      return getProjectMeta()
    } catch (err) {
      throw describeProjectError(err, 'Failed to create project')
    }
  })

  ipcMain.handle('project:open', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) {
        throw new Error('Project file no longer exists. It may have been moved or deleted.')
      }
      closeDatabase()
      openDatabase(filePath)
      currentProjectDir = join(filePath, '..')
      mkdirSync(join(currentProjectDir, '.thumbnails'), { recursive: true })

      // Heal absolute image/thumbnail paths that went stale because the
      // project folder was copied or moved (possibly from another machine).
      const relink = relinkProjectImages(currentProjectDir)
      if (relink.relinked > 0 || relink.thumbnails_fixed > 0 || relink.missing > 0) {
        console.log(
          `[project:open] Relinked ${relink.relinked}/${relink.checked} image paths, `
          + `fixed ${relink.thumbnails_fixed} thumbnails, ${relink.missing} not found`,
        )
      }

      const meta = getProjectMeta()
      addRecent({ name: meta.name, file_path: filePath, last_opened: Date.now(), image_count: 0 })
      return meta
    } catch (err) {
      currentProjectDir = null
      throw describeProjectError(err, 'Failed to open project')
    }
  })

  ipcMain.handle('project:close', async () => {
    closeDatabase()
    currentProjectDir = null
  })

  ipcMain.handle('project:getMeta', async () => getProjectMeta())
  ipcMain.handle('project:getCurrentDir', async () => currentProjectDir)

  // Lets the renderer report images that could not be located after the project
  // folder was moved, instead of leaving the user with a black canvas.
  ipcMain.handle('project:getRelinkResult', async () => getLastRelinkResult())

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
