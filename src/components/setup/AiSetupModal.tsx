import { useState, useEffect, useRef } from 'react'
import { setupApi } from '../../api/ipc'
import { useI18n } from '../../i18n'

interface Props {
  onDone: () => void
  onSkip: () => void
}

interface Progress {
  message: string
  percent: number
  eta?: string
  error?: string
}

export default function AiSetupModal({ onDone, onSkip }: Props) {
  const { language, t } = useI18n()
  const [phase, setPhase] = useState<'prompt' | 'running' | 'done' | 'error'>('prompt')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      unsubRef.current?.()
    }
  }, [])

  const startSetup = async () => {
    setPhase('running')
    setProgress({ message: language === 'ko' ? '시작 중...' : 'Starting...', percent: 0 })

    unsubRef.current = setupApi.onProgress((p) => {
      setProgress(p)
    })

    try {
      await setupApi.run(language)
      setPhase('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setPhase('error')
    } finally {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          width: 'min(500px, calc(100vw - 32px))',
          padding: '32px 28px',
          borderRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>
          {t('setup.title')}
        </div>

        {/* Prompt phase */}
        {phase === 'prompt' && (
          <>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 24, whiteSpace: 'pre-line' }}>
              {t('setup.promptDescription')}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onSkip} style={btnStyle('secondary')}>
                {t('setup.later')}
              </button>
              <button onClick={startSetup} style={btnStyle('primary')}>
                {t('setup.installNow')}
              </button>
            </div>
          </>
        )}

        {/* Running phase */}
        {phase === 'running' && progress && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {progress.message}
            </p>
            <ProgressBar percent={progress.percent} />
            {progress.eta && (
              <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6, fontWeight: 600 }}>
                {progress.eta}
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              {t('setup.waiting')}
            </p>
          </>
        )}

        {/* Done phase */}
        {phase === 'done' && (
          <>
            <p style={{ fontSize: 14, color: '#22c55e', marginBottom: 24, lineHeight: 1.65 }}>
              {t('setup.done')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onDone} style={btnStyle('primary')}>
                {t('setup.ok')}
              </button>
            </div>
          </>
        )}

        {/* Error phase */}
        {phase === 'error' && (
          <>
            <p style={{ fontSize: 14, color: '#ef4444', marginBottom: 8, fontWeight: 700 }}>
              {t('setup.errorTitle')}
            </p>
            <pre
              style={{
                fontSize: 11,
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 150,
                overflow: 'auto',
                marginBottom: 14,
              }}
            >
              {errorMsg}
            </pre>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              {t('setup.errorHint')}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onSkip} style={btnStyle('secondary')}>
                {t('setup.close')}
              </button>
              <button onClick={startSetup} style={btnStyle('primary')}>
                {t('setup.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div
      style={{
        height: 8,
        borderRadius: 999,
        background: 'var(--bg-tertiary)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #c59a19, #f0c040)',
          borderRadius: 999,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary'): React.CSSProperties {
  const base: React.CSSProperties = {
    minWidth: 100,
    height: 38,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '0 18px',
    border: '1px solid var(--border)',
  }
  if (variant === 'primary') {
    return {
      ...base,
      background: '#c59a19',
      color: '#000',
      border: 'none',
    }
  }
  return {
    ...base,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
  }
}
