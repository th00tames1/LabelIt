import { create } from 'zustand'
import type { ProjectMeta, RecentProject } from '../types'

interface ProjectState {
  currentProject: ProjectMeta | null
  recentProjects: RecentProject[]
  isLoading: boolean

  setCurrentProject: (project: ProjectMeta | null) => void
  setRecentProjects: (projects: RecentProject[]) => void
  setLoading: (loading: boolean) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  recentProjects: [],
  isLoading: false,

  setCurrentProject: (project) => set({ currentProject: project }),
  setRecentProjects: (projects) => set({ recentProjects: projects }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
