import { create } from 'zustand'
import type { Image } from '../types'
import type { ImageFilter } from '../api/ipc'

interface ImageState {
  images: Image[]
  activeImageId: string | null
  filter: ImageFilter | null
  isLoading: boolean

  setImages: (images: Image[]) => void
  setActiveImageId: (id: string | null) => void
  setFilter: (filter: ImageFilter | null) => void
  setLoading: (loading: boolean) => void
  updateImageInList: (updated: Image) => void
  getActiveImage: () => Image | null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  activeImageId: null,
  filter: null,
  isLoading: false,

  setImages: (images) => set({ images }),
  setActiveImageId: (id) => set({ activeImageId: id }),
  setFilter: (filter) => set({ filter }),
  setLoading: (loading) => set({ isLoading: loading }),

  updateImageInList: (updated) =>
    set((state) => ({
      images: state.images.map((img) => (img.id === updated.id ? updated : img)),
    })),

  getActiveImage: () => {
    const { images, activeImageId } = get()
    return images.find((img) => img.id === activeImageId) ?? null
  },
}))
