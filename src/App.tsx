import { useState, useEffect, useRef } from 'react'
import HomePage from './pages/Home/HomePage'
import AnnotatePage from './pages/Annotate/AnnotatePage'
import FinishPage from './pages/Finish/FinishPage'
import AiSetupModal from './components/setup/AiSetupModal'
import { useProjectStore } from './store/projectStore'
import { useUIStore } from './store/uiStore'
import { useSettingsStore } from './store/settingsStore'
import { useImageStore } from './store/imageStore'
import { sidecarClient } from './api/sidecar'
import { menuApi, projectApi, sidecarApi, setupApi, updateApi } from './api/ipc'
import type { UpdateCheckResult } from './api/ipc'
import { useI18n } from './i18n'
import labelItWhiteLogo from './assets/Labelit_White.svg'
import labelItDarkLogo from './assets/Labelit_Dark.svg'

type Page = 'home' | 'annotate' | 'finish'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')
  const [homeCreateModalSignal, setHomeCreateModalSignal] = useState(0)
  const [annotateImportSignal, setAnnotateImportSignal] = useState(0)
  const [showAbout, setShowAbout] = useState(false)
  const [showAiSetup, setShowAiSetup] = useState(false)
  const currentProject = useProjectStore((s) => s.currentProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const setSidecarOnline = useUIStore((s) => s.setSidecarOnline)
  const setSidecarRuntime = useUIStore((s) => s.setSidecarRuntime)
  const theme = useSettingsStore((s) => s.settings.theme)
  const setActiveImageId = useImageStore((s) => s.setActiveImageId)
  const sidecarBootingRef = useRef(false)
  const setupCheckedRef = useRef(false)
  const updateCheckedRef = useRef(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  // Check AI setup on first load (after a short delay so app feels snappy)
  useEffect(() => {
    if (setupCheckedRef.current) return
    setupCheckedRef.current = true
    const timer = setTimeout(async () => {
      try {
        const needed = await setupApi.isNeeded()
        if (needed) setShowAiSetup(true)
      } catch {
        // Non-critical — skip silently
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Notify-only update check: one GitHub Releases lookup shortly after launch.
  // Offline or blocked networks resolve to null and nothing is shown — this app
  // must stay fully usable without internet.
  useEffect(() => {
    if (updateCheckedRef.current) return
    updateCheckedRef.current = true
    const timer = setTimeout(() => {
      updateApi.check().then(setUpdateInfo).catch(() => { /* offline is normal */ })
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  // Poll sidecar health every 5 seconds
  useEffect(() => {
    const check = async () => {
      let health = await sidecarClient.health()
      let status: string | null = null

      if (health == null && !sidecarBootingRef.current) {
        status = await sidecarApi.getStatus().catch(() => 'stopped')
        if (status !== 'running' && status !== 'starting') {
          sidecarBootingRef.current = true
          try {
            await sidecarApi.ensureStarted()
            health = await sidecarClient.health()
            status = health != null ? 'running' : await sidecarApi.getStatus().catch(() => 'stopped')
          } catch (error) {
            console.warn('[renderer] Failed to ensure sidecar start:', error)
          } finally {
            sidecarBootingRef.current = false
          }
        }
      }

      if (health?.runtime != null) {
        setSidecarRuntime(health.runtime)
      } else if (status === 'stopped' || status === 'error') {
        setSidecarRuntime(null)
      }

      setSidecarOnline(health != null || status === 'running' || status === 'starting')
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

  const aiSetupOverlay = showAiSetup && (
    <AiSetupModal
      onDone={() => setShowAiSetup(false)}
      onSkip={() => setShowAiSetup(false)}
    />
  )

  const updateOverlay = updateInfo?.update_available && !updateDismissed && (
    <UpdateBanner
      latest={updateInfo.latest_version}
      current={updateInfo.current_version}
      onDownload={() => { updateApi.openDownloadPage().catch(console.error) }}
      onDismiss={() => setUpdateDismissed(true)}
    />
  )

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
      {aiSetupOverlay}
      {updateOverlay}
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
          onSetupAi={() => setShowAiSetup(true)}
        />
        <AboutOverlay open={showAbout} onClose={() => setShowAbout(false)} logo={resolvedTheme === 'light' ? labelItWhiteLogo : labelItDarkLogo} />
        {aiSetupOverlay}
        {updateOverlay}
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
      {aiSetupOverlay}
      {updateOverlay}
    </>
  )
}

/**
 * Bottom-right toast offering a newer release. Notify-only by design: macOS
 * builds are ad-hoc signed and Squirrel.Mac refuses to auto-install them, so
 * the download button opens the GitHub releases page instead. See
 * electron/main/services/update.service.ts for the full-auto-update path.
 */
function UpdateBanner({ latest, current, onDownload, onDismiss }: {
  latest: string
  current: string
  onDownload: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()

  return (
    <div style={{
      position: 'fixed',
      right: 20,
      bottom: 20,
      zIndex: 9000,
      width: 'min(340px, calc(100vw - 40px))',
      padding: '14px 16px',
      borderRadius: 12,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {t('update.title')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
        {t('update.body', { latest, current })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onDismiss}
          style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          {t('update.dismiss')}
        </button>
        <button
          onClick={onDownload}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
          }}
        >
          {t('update.download')}
        </button>
      </div>
    </div>
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
          <div>Version 1.5.4</div>
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
