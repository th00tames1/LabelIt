import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom API exposed to renderer
const api = {
  project: {
    create: (name: string, directory: string) =>
      ipcRenderer.invoke('project:create', name, directory),
    open: (filePath: string) =>
      ipcRenderer.invoke('project:open', filePath),
    close: () => ipcRenderer.invoke('project:close'),
    getMeta: () => ipcRenderer.invoke('project:getMeta'),
    listRecent: () => ipcRenderer.invoke('project:listRecent'),
    showOpenDialog: () => ipcRenderer.invoke('project:showOpenDialog'),
    showCreateDialog: () => ipcRenderer.invoke('project:showCreateDialog'),
  },

  image: {
    list: (filter?: unknown) => ipcRenderer.invoke('image:list', filter),
    get: (id: string) => ipcRenderer.invoke('image:get', id),
    import: (filePaths: string[]) => ipcRenderer.invoke('image:import', filePaths),
    importFolder: (folderPath: string) => ipcRenderer.invoke('image:importFolder', folderPath),
    updateStatus: (id: string, status: string) =>
      ipcRenderer.invoke('image:updateStatus', id, status),
    updateSplit: (id: string, split: string) =>
      ipcRenderer.invoke('image:updateSplit', id, split),
    autoSplit: (ratios: unknown) => ipcRenderer.invoke('image:autoSplit', ratios),
    showOpenDialog: () => ipcRenderer.invoke('image:showOpenDialog'),
    showFolderDialog: () => ipcRenderer.invoke('image:showFolderDialog'),
  },

  annotation: {
    listForImage: (imageId: string) =>
      ipcRenderer.invoke('annotation:listForImage', imageId),
    create: (imageId: string, dto: unknown) =>
      ipcRenderer.invoke('annotation:create', imageId, dto),
    update: (id: string, dto: unknown) =>
      ipcRenderer.invoke('annotation:update', id, dto),
    delete: (id: string) => ipcRenderer.invoke('annotation:delete', id),
    bulkCreate: (imageId: string, dtos: unknown[]) =>
      ipcRenderer.invoke('annotation:bulkCreate', imageId, dtos),
    bulkDelete: (ids: string[]) =>
      ipcRenderer.invoke('annotation:bulkDelete', ids),
  },

  label: {
    list: () => ipcRenderer.invoke('label:list'),
    create: (dto: unknown) => ipcRenderer.invoke('label:create', dto),
    update: (id: string, dto: unknown) => ipcRenderer.invoke('label:update', id, dto),
    delete: (id: string) => ipcRenderer.invoke('label:delete', id),
    reorder: (ids: string[]) => ipcRenderer.invoke('label:reorder', ids),
    listKeypointDefs: (labelClassId: string) =>
      ipcRenderer.invoke('label:listKeypointDefs', labelClassId),
    createKeypointDef: (labelClassId: string, name: string, color: string, sortOrder: number) =>
      ipcRenderer.invoke('label:createKeypointDef', labelClassId, name, color, sortOrder),
    deleteKeypointDef: (id: string) =>
      ipcRenderer.invoke('label:deleteKeypointDef', id),
    setSkeletonEdge: (labelClassId: string, fromKpId: string, toKpId: string) =>
      ipcRenderer.invoke('label:setSkeletonEdge', labelClassId, fromKpId, toKpId),
    removeSkeletonEdge: (labelClassId: string, fromKpId: string, toKpId: string) =>
      ipcRenderer.invoke('label:removeSkeletonEdge', labelClassId, fromKpId, toKpId),
    listSkeletonEdges: (labelClassId: string) =>
      ipcRenderer.invoke('label:listSkeletonEdges', labelClassId),
  },

  export: {
    toYOLO: (options: unknown) => ipcRenderer.invoke('export:toYOLO', options),
    toCOCO: (options: unknown) => ipcRenderer.invoke('export:toCOCO', options),
    toVOC: (options: unknown) => ipcRenderer.invoke('export:toVOC', options),
    toCSV: (options: unknown) => ipcRenderer.invoke('export:toCSV', options),
    showSaveDialog: () => ipcRenderer.invoke('export:showSaveDialog'),
    showCSVSaveDialog: () => ipcRenderer.invoke('export:showCSVSaveDialog'),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial: unknown) => ipcRenderer.invoke('settings:set', partial),
  },

  stats: {
    get: () => ipcRenderer.invoke('project:getStats'),
  },

  sidecar: {
    getStatus: () => ipcRenderer.invoke('sidecar:getStatus'),
  },

  yolo: {
    autoLabel: (req: unknown) => ipcRenderer.invoke('yolo:autoLabel', req),
    acceptAll: (imageId: string) => ipcRenderer.invoke('yolo:acceptAll', imageId),
    acceptOne: (annotationId: string) => ipcRenderer.invoke('yolo:acceptOne', annotationId),
    rejectAll: (imageId: string) => ipcRenderer.invoke('yolo:rejectAll', imageId),
    rejectOne: (annotationId: string) => ipcRenderer.invoke('yolo:rejectOne', annotationId),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
