import { create } from 'zustand'
import type { ProjectMeta, RecentProject } from '../types'

interface ProjectState {
  currentProject: ProjectMeta | null
  recentProjects: RecentProject[]
  isLoading: boolean

  setCurrentProject: (project: ProjectMeta | null) => void
  updateCurrentProjectName: (name: string) => void
  setRecentProjects: (projects: RecentProject[]) => void
  setLoading: (loading: boolean) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  recentProjects: [],
  isLoading: false,

  setCurrentProject: (project) => set({ currentProject: project }),
  updateCurrentProjectName: (name) => set((state) => ({
    currentProject: state.currentProject ? { ...state.currentProject, name } : null,
    recentProjects: state.recentProjects.map((project, index) =>
      index === 0 ? { ...project, name } : project
    ),
  })),
  setRecentProjects: (projects) => set({ recentProjects: projects }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
