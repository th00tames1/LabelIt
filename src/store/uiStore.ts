import { create } from 'zustand'
import type { ToolType } from '../types'

interface CanvasState {
  scale: number
  x: number
  y: number
}

interface UIState {
  activeTool: ToolType
  activeLabelClassId: string | null
  canvasState: CanvasState
  sidecarOnline: boolean
  isImporting: boolean
  annotationsVisible: boolean   // H key toggle: show/hide all annotations
  showShortcutsHelp: boolean    // ? key: keyboard shortcut reference overlay

  setActiveTool: (tool: ToolType) => void
  setActiveLabelClassId: (id: string | null) => void
  setCanvasState: (state: CanvasState) => void
  setSidecarOnline: (online: boolean) => void
  setImporting: (importing: boolean) => void
  toggleAnnotationsVisible: () => void
  setShowShortcutsHelp: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  activeLabelClassId: null,
  canvasState: { scale: 1, x: 0, y: 0 },
  sidecarOnline: false,
  isImporting: false,
  annotationsVisible: true,
  showShortcutsHelp: false,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveLabelClassId: (id) => set({ activeLabelClassId: id }),
  setCanvasState: (state) => set({ canvasState: state }),
  setSidecarOnline: (online) => set({ sidecarOnline: online }),
  setImporting: (importing) => set({ isImporting: importing }),
  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  setShowShortcutsHelp: (show) => set({ showShortcutsHelp: show }),
}))
