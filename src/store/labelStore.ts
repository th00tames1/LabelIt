import { create } from 'zustand'
import type { LabelClass } from '../types'
import { labelApi } from '../api/ipc'

const DEFAULT_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E', '#84CC16',
]

interface LabelState {
  labels: LabelClass[]
  isLoading: boolean

  load: () => Promise<void>
  createLabel: (name: string, color?: string, shortcut?: string | null) => Promise<LabelClass>
  updateLabel: (id: string, dto: Partial<LabelClass>) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  getNextColor: () => string
}

export const useLabelStore = create<LabelState>((set, get) => ({
  labels: [],
  isLoading: false,

  load: async () => {
    set({ isLoading: true })
    const labels = await labelApi.list()
    set({ labels, isLoading: false })
  },

  createLabel: async (name, color, shortcut) => {
    const resolvedColor = color ?? get().getNextColor()
    const created = await labelApi.create({ name, color: resolvedColor, shortcut })
    set((s) => ({ labels: [...s.labels, created] }))
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
    set((s) => ({ labels: s.labels.filter((l) => l.id !== id) }))
  },

  getNextColor: () => {
    const { labels } = get()
    return DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length]
  },
}))
