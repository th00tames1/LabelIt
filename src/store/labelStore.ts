import { create } from 'zustand'
import type { LabelClass } from '../types'
import { labelApi } from '../api/ipc'

const DEFAULT_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16',
]

interface LabelState {
  labels: LabelClass[]
  visibilityById: Record<string, boolean>
  isLoading: boolean

  load: () => Promise<void>
  createLabel: (name: string, color?: string, shortcut?: string | null) => Promise<LabelClass>
  updateLabel: (id: string, dto: Partial<LabelClass>) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  setLabelVisible: (id: string, visible: boolean) => void
  toggleLabelVisible: (id: string) => void
  isLabelVisible: (id: string | null) => boolean
  getNextColor: () => string
}

export const useLabelStore = create<LabelState>((set, get) => ({
  labels: [],
  visibilityById: {},
  isLoading: false,

  load: async () => {
    set({ isLoading: true })
    const labels = await labelApi.list()
    set((state) => {
      const nextVisibility: Record<string, boolean> = {}
      labels.forEach((label) => {
        nextVisibility[label.id] = state.visibilityById[label.id] ?? true
      })
      return { labels, visibilityById: nextVisibility, isLoading: false }
    })
  },

  createLabel: async (name, color, shortcut) => {
    const resolvedColor = color ?? get().getNextColor()
    const created = await labelApi.create({ name, color: resolvedColor, shortcut })
    set((s) => ({ labels: [...s.labels, created], visibilityById: { ...s.visibilityById, [created.id]: true } }))
    return created
  },

  updateLabel: async (id, dto) => {
    const updated = await labelApi.update(id, dto)
    set((s) => ({
      labels: s.labels.map((l) => (l.id === id ? updated : l)),
    }))
  },

  deleteLabel: async (id) => {
    await labelApi.delete(id)
    set((s) => {
      const nextVisibility = { ...s.visibilityById }
      delete nextVisibility[id]
      return { labels: s.labels.filter((l) => l.id !== id), visibilityById: nextVisibility }
    })
  },

  setLabelVisible: (id, visible) => set((s) => ({
    visibilityById: { ...s.visibilityById, [id]: visible },
  })),

  toggleLabelVisible: (id) => set((s) => ({
    visibilityById: { ...s.visibilityById, [id]: !(s.visibilityById[id] ?? true) },
  })),

  isLabelVisible: (id) => {
    if (id == null) return true
    return get().visibilityById[id] ?? true
  },

  getNextColor: () => {
    const { labels } = get()
    return DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length]
  },
}))
