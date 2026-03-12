import { useState, useEffect } from 'react'
import HomePage from './pages/Home/HomePage'
import AnnotatePage from './pages/Annotate/AnnotatePage'
import FinishPage from './pages/Finish/FinishPage'
import { useProjectStore } from './store/projectStore'
import { useUIStore } from './store/uiStore'
import { useSettingsStore } from './store/settingsStore'
import { useImageStore } from './store/imageStore'
import { sidecarClient } from './api/sidecar'
import { menuApi, projectApi } from './api/ipc'
import labelItWhiteLogo from './assets/Labelit_White.svg'
import labelItDarkLogo from './assets/Labelit_Dark.svg'

type Page = 'home' | 'annotate' | 'finish'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')
  const [homeCreateModalSignal, setHomeCreateModalSignal] = useState(0)
  const [annotateImportSignal, setAnnotateImportSignal] = useState(0)
  const [showAbout, setShowAbout] = useState(false)
  const currentProject = useProjectStore((s) => s.currentProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const setSidecarOnline = useUIStore((s) => s.setSidecarOnline)
  const setSidecarRuntime = useUIStore((s) => s.setSidecarRuntime)
  const theme = useSettingsStore((s) => s.settings.theme)
  const setActiveImageId = useImageStore((s) => s.setActiveImageId)

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

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      const resolvedTheme = theme === 'system'
        ? (media.matches ? 'light' : 'dark')
        : theme
      document.documentElement.dataset.theme = resolvedTheme
      setResolvedTheme(resolvedTheme)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    return menuApi.onAction((action) => {
      if (action === 'new-project') {
        const openNewProject = async () => {
          if (currentProject) {
            await projectApi.close()
            setCurrentProject(null)
          }
          setPage('home')
          setHomeCreateModalSignal((value) => value + 1)
        }
        openNewProject().catch(console.error)
        return
      }

      if (action === 'open-project') {
        const openProject = async () => {
          const filePath = await projectApi.showOpenDialog()
          if (!filePath) return
          const meta = await projectApi.open(filePath)
          setCurrentProject(meta)
        }
        openProject().catch(console.error)
        return
      }

      if (action === 'open-image-files') {
        if (currentProject) {
          setPage('annotate')
          setAnnotateImportSignal((value) => value + 1)
        }
        return
      }

      if (action === 'about') {
        setShowAbout(true)
      }
    })
  }, [currentProject, setCurrentProject])

  // Navigate to annotate page when a project is open
  useEffect(() => {
    if (currentProject) setPage('annotate')
    else setPage('home')
  }, [currentProject])

  if (page === 'finish' && currentProject) {
    return (
      <>
      <FinishPage
        onBackToAnnotate={() => setPage('annotate')}
        onOpenImage={(imageId) => {
          setActiveImageId(imageId)
          setPage('annotate')
        }}
      />
      <AboutOverlay open={showAbout} onClose={() => setShowAbout(false)} logo={resolvedTheme === 'light' ? labelItWhiteLogo : labelItDarkLogo} />
      </>
    )
  }

  if (page === 'annotate' && currentProject) {
    return (
      <>
        <AnnotatePage
          onGoHome={() => setPage('home')}
          onFinish={() => setPage('finish')}
          menuImportSignal={annotateImportSignal}
        />
        <AboutOverlay open={showAbout} onClose={() => setShowAbout(false)} logo={resolvedTheme === 'light' ? labelItWhiteLogo : labelItDarkLogo} />
      </>
    )
      }

  return (
    <>
      <HomePage
        openCreateModalSignal={homeCreateModalSignal}
        onCreateModalSignalHandled={() => setHomeCreateModalSignal(0)}
      />
      <AboutOverlay open={showAbout} onClose={() => setShowAbout(false)} logo={resolvedTheme === 'light' ? labelItWhiteLogo : labelItDarkLogo} />
    </>
  )
}

function AboutOverlay({ open, onClose, logo }: { open: boolean; onClose: () => void; logo: string }) {
  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.52)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, calc(100vw - 32px))',
          padding: '28px 26px',
          borderRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-lg)',
          textAlign: 'center',
        }}
      >
        <img src={logo} alt="LabelIt" style={{ width: 220, maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>LabelIt</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>Version 1.0</div>
          <div>Heechan Jeong</div>
          <div>heechan.jeong@oregonstate.edu</div>
          <div>Oregon State University</div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button
            onClick={onClose}
            style={{
              minWidth: 88,
              height: 36,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
