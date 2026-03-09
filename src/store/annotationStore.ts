import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Annotation, AnnotationGeometry, AnnotationType } from '../types'
import { annotationApi, imageApi } from '../api/ipc'
import { useImageStore } from './imageStore'

interface UndoRecord {
  type: 'create' | 'update' | 'delete'
  annotation: Annotation
  previousGeometry?: AnnotationGeometry   // for update
}

interface AnnotationState {
  annotations: Annotation[]
  selectedId: string | null
  isLoading: boolean
  undoStack: UndoRecord[]
  redoStack: UndoRecord[]

  // Load
  loadForImage: (imageId: string) => Promise<void>
  clear: () => void

  // CRUD with optimistic updates
  createAnnotation: (
    imageId: string,
    annotationType: AnnotationType,
    geometry: AnnotationGeometry,
    labelClassId?: string | null
  ) => Promise<Annotation>
  updateGeometry: (id: string, geometry: AnnotationGeometry) => Promise<void>
  updateLabel: (id: string, labelClassId: string | null) => Promise<void>
  deleteAnnotation: (id: string) => Promise<void>
  duplicateAnnotation: (id: string) => Promise<Annotation | null>

  // Direct list mutation (used by review queue: accept/reject operations)
  setAnnotations: (annotations: Annotation[]) => void

  // Selection
  setSelectedId: (id: string | null) => void

  // Undo / Redo (async, fire-and-forget OK)
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export const useAnnotationStore = create<AnnotationState>()(
  immer((set, get) => ({
    annotations: [],
    selectedId: null,
    isLoading: false,
    undoStack: [],
    redoStack: [],

    loadForImage: async (imageId) => {
      set({ isLoading: true, selectedId: null })
      const annotations = await annotationApi.listForImage(imageId)
      set({ annotations, isLoading: false, undoStack: [], redoStack: [] })
    },

    clear: () => set({ annotations: [], selectedId: null, undoStack: [], redoStack: [] }),

    createAnnotation: async (imageId, annotationType, geometry, labelClassId) => {
      // Auto-advance image status: unlabeled → in_progress on first annotation
      const isFirst = get().annotations.length === 0
      if (isFirst) {
        imageApi.updateStatus(imageId, 'in_progress').catch(() => {/* best-effort */})
      }

      // Optimistic — add placeholder
      const tempId = `temp-${Date.now()}`
      const now = Date.now()
      const temp: Annotation = {
        id: tempId, image_id: imageId, label_class_id: labelClassId ?? null,
        annotation_type: annotationType, geometry, confidence: null, source: 'manual',
        created_at: now, updated_at: now,
      }
      set((s) => { s.annotations.push(temp); s.selectedId = tempId })

      // Persist
      const created = await annotationApi.create(imageId, {
        annotation_type: annotationType, geometry, label_class_id: labelClassId,
      })

      // Replace temp with real record
      set((s) => {
        const idx = s.annotations.findIndex((a) => a.id === tempId)
        if (idx >= 0) s.annotations[idx] = created
        s.selectedId = created.id
        s.undoStack.push({ type: 'create', annotation: created })
        s.redoStack = []
      })

      // Refresh image in sidebar to update annotation_count badge
      imageApi.get(imageId).then((img) => {
        if (img) useImageStore.getState().updateImageInList(img)
      }).catch(() => {/* best-effort */})

      return created
    },

    updateGeometry: async (id, geometry) => {
      const prev = get().annotations.find((a) => a.id === id)
      if (!prev) return

      // Optimistic
      set((s) => {
        const a = s.annotations.find((a) => a.id === id)
        if (a) a.geometry = geometry
      })

      const updated = await annotationApi.update(id, { geometry })

      set((s) => {
        const idx = s.annotations.findIndex((a) => a.id === id)
        if (idx >= 0) s.annotations[idx] = updated
        s.undoStack.push({
          type: 'update', annotation: updated, previousGeometry: prev.geometry,
        })
        s.redoStack = []
      })
    },

    updateLabel: async (id, labelClassId) => {
      const updated = await annotationApi.update(id, { label_class_id: labelClassId })
      set((s) => {
        const idx = s.annotations.findIndex((a) => a.id === id)
        if (idx >= 0) s.annotations[idx] = updated
      })
    },

    deleteAnnotation: async (id) => {
      const annotation = get().annotations.find((a) => a.id === id)
      if (!annotation) return

      // Optimistic
      set((s) => {
        s.annotations = s.annotations.filter((a) => a.id !== id)
        if (s.selectedId === id) s.selectedId = null
        s.undoStack.push({ type: 'delete', annotation })
        s.redoStack = []
      })

      await annotationApi.delete(id)

      // Refresh image in sidebar to update annotation_count badge
      imageApi.get(annotation.image_id).then((img) => {
        if (img) useImageStore.getState().updateImageInList(img)
      }).catch(() => {/* best-effort */})
    },

    duplicateAnnotation: async (id) => {
      const source = get().annotations.find((a) => a.id === id)
      if (!source) return null

      const offsetGeometry = offsetAnnotation(source.geometry, 0.01)
      return get().createAnnotation(
        source.image_id, source.annotation_type, offsetGeometry, source.label_class_id
      )
    },

    setAnnotations: (annotations) => set({ annotations }),
    setSelectedId: (id) => set({ selectedId: id }),

    undo: async () => {
      const { undoStack } = get()
      if (undoStack.length === 0) return
      const record = undoStack[undoStack.length - 1]

      // Pop from undo stack first
      set((s) => { s.undoStack.pop() })

      if (record.type === 'create') {
        // Undo create = delete without touching history
        set((s) => {
          s.annotations = s.annotations.filter((a) => a.id !== record.annotation.id)
          if (s.selectedId === record.annotation.id) s.selectedId = null
        })
        await annotationApi.delete(record.annotation.id)
      } else if (record.type === 'delete') {
        // Undo delete = re-create without touching history
        const [created] = await annotationApi.bulkCreate(record.annotation.image_id, [{
          annotation_type: record.annotation.annotation_type,
          geometry: record.annotation.geometry,
          label_class_id: record.annotation.label_class_id,
        }])
        set((s) => { s.annotations.push(created) })
      } else if (record.type === 'update' && record.previousGeometry) {
        // Undo update = restore previous geometry without touching history
        set((s) => {
          const a = s.annotations.find((a) => a.id === record.annotation.id)
          if (a) a.geometry = record.previousGeometry!
        })
        await annotationApi.update(record.annotation.id, { geometry: record.previousGeometry })
      }

      // Push to redo stack after completion
      set((s) => { s.redoStack.push(record) })
    },

    redo: async () => {
      const { redoStack } = get()
      if (redoStack.length === 0) return
      const record = redoStack[redoStack.length - 1]

      set((s) => { s.redoStack.pop() })

      if (record.type === 'create') {
        // Redo create = re-create without touching history
        const created = await annotationApi.create(record.annotation.image_id, {
          annotation_type: record.annotation.annotation_type,
          geometry: record.annotation.geometry,
          label_class_id: record.annotation.label_class_id,
        })
        set((s) => { s.annotations.push(created) })
      } else if (record.type === 'delete') {
        // Redo delete = delete again without touching history
        set((s) => {
          s.annotations = s.annotations.filter((a) => a.id !== record.annotation.id)
          if (s.selectedId === record.annotation.id) s.selectedId = null
        })
        await annotationApi.delete(record.annotation.id)
      } else if (record.type === 'update') {
        // Redo update = apply updated geometry without touching history
        set((s) => {
          const a = s.annotations.find((a) => a.id === record.annotation.id)
          if (a) a.geometry = record.annotation.geometry
        })
        await annotationApi.update(record.annotation.id, { geometry: record.annotation.geometry })
      }

      set((s) => { s.undoStack.push(record) })
    },
  }))
)

function offsetAnnotation(geometry: AnnotationGeometry, offset: number): AnnotationGeometry {
  if (geometry.type === 'bbox') {
    return { ...geometry, x: clamp(geometry.x + offset), y: clamp(geometry.y + offset) }
  }
  if (geometry.type === 'polygon' || geometry.type === 'polyline') {
    return {
      ...geometry,
      points: geometry.points.map(([x, y]) => [clamp(x + offset), clamp(y + offset)]),
    }
  }
  return geometry
}

function clamp(v: number): number { return Math.max(0, Math.min(1, v)) }
