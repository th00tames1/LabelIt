import { useState, useEffect } from 'react'
import HomePage from './pages/Home/HomePage'
import AnnotatePage from './pages/Annotate/AnnotatePage'
import { useProjectStore } from './store/projectStore'
import { useUIStore } from './store/uiStore'
import { sidecarClient } from './api/sidecar'

type Page = 'home' | 'annotate'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const currentProject = useProjectStore((s) => s.currentProject)
  const setSidecarOnline = useUIStore((s) => s.setSidecarOnline)
  const setSidecarRuntime = useUIStore((s) => s.setSidecarRuntime)

  // Poll sidecar health every 5 seconds
  useEffect(() => {
    const check = async () => {
      const health = await sidecarClient.health()
      setSidecarOnline(health != null)
      setSidecarRuntime(health?.runtime ?? null)
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [setSidecarOnline, setSidecarRuntime])

  // Navigate to annotate page when a project is open
  useEffect(() => {
    if (currentProject) setPage('annotate')
    else setPage('home')
  }, [currentProject])

  if (page === 'annotate' && currentProject) {
    return <AnnotatePage onGoHome={() => setPage('home')} />
  }

  return <HomePage />
}
