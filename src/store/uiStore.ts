import { create } from 'zustand'
import type { ToolType, RightPanelTab, SidecarRuntimeInfo } from '../types'

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
  sidecarRuntime: SidecarRuntimeInfo | null
  isImporting: boolean
  annotationsVisible: boolean   // H key toggle: show/hide all annotations
  displayContrast: number
  displayBrightness: number
  hideLabelText: boolean
  showShortcutsHelp: boolean    // ? key: keyboard shortcut reference overlay
  rightPanelTab: RightPanelTab

  setActiveTool: (tool: ToolType) => void
  setActiveLabelClassId: (id: string | null) => void
  setCanvasState: (state: CanvasState) => void
  setSidecarOnline: (online: boolean) => void
  setSidecarRuntime: (runtime: SidecarRuntimeInfo | null) => void
  setImporting: (importing: boolean) => void
  toggleAnnotationsVisible: () => void
  setDisplayContrast: (value: number) => void
  setDisplayBrightness: (value: number) => void
  setHideLabelText: (hide: boolean) => void
  setShowShortcutsHelp: (show: boolean) => void
  setRightPanelTab: (tab: RightPanelTab) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  activeLabelClassId: null,
  canvasState: { scale: 1, x: 0, y: 0 },
  sidecarOnline: false,
  sidecarRuntime: null,
  isImporting: false,
  annotationsVisible: true,
  displayContrast: 0,
  displayBrightness: 0,
  hideLabelText: false,
  showShortcutsHelp: false,
  rightPanelTab: 'annotations',

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveLabelClassId: (id) => set({ activeLabelClassId: id }),
  setCanvasState: (state) => set({ canvasState: state }),
  setSidecarOnline: (online) => set({ sidecarOnline: online }),
  setSidecarRuntime: (runtime) => set({ sidecarRuntime: runtime }),
  setImporting: (importing) => set({ isImporting: importing }),
  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  setDisplayContrast: (value) => set({ displayContrast: value }),
  setDisplayBrightness: (value) => set({ displayBrightness: value }),
  setHideLabelText: (hide) => set({ hideLabelText: hide }),
  setShowShortcutsHelp: (show) => set({ showShortcutsHelp: show }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
}))
