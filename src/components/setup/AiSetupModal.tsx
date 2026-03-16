import { useState, useEffect, useRef } from 'react'
import { setupApi } from '../../api/ipc'

interface Props {
  onDone: () => void
  onSkip: () => void
}

interface Progress {
  message: string
  percent: number
  error?: string
}

export default function AiSetupModal({ onDone, onSkip }: Props) {
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
    setProgress({ message: '시작 중...', percent: 0 })

    unsubRef.current = setupApi.onProgress((p) => {
      setProgress(p)
    })

    try {
      await setupApi.run()
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
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
          🤖 AI 기능 설정
        </div>

        {/* Prompt phase */}
        {phase === 'prompt' && (
          <>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
              AI 기능(SAM 자동 분할, YOLO 자동 라벨링)을 사용하려면 Python 패키지 설치가 필요합니다.
              <br /><br />
              설치 중 인터넷 연결이 필요하며, GPU 감지에 따라 PyTorch CUDA (~2–3 GB) 또는
              CPU 버전 (~500 MB)을 다운로드합니다.
              <br /><br />
              <strong style={{ color: 'var(--text-primary)' }}>지금 설치하시겠습니까?</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onSkip} style={btnStyle('secondary')}>
                나중에
              </button>
              <button onClick={startSetup} style={btnStyle('primary')}>
                설치 시작
              </button>
            </div>
          </>
        )}

        {/* Running phase */}
        {phase === 'running' && progress && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, whiteSpace: 'pre-line' }}>
              {progress.message}
            </p>
            <ProgressBar percent={progress.percent} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              창을 닫지 마세요. 완료될 때까지 기다려 주세요.
            </p>
          </>
        )}

        {/* Done phase */}
        {phase === 'done' && (
          <>
            <p style={{ fontSize: 14, color: '#22c55e', marginBottom: 24 }}>
              ✅ AI 패키지 설치가 완료되었습니다! 앱을 재시작하면 AI 기능이 활성화됩니다.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onDone} style={btnStyle('primary')}>
                확인
              </button>
            </div>
          </>
        )}

        {/* Error phase */}
        {phase === 'error' && (
          <>
            <p style={{ fontSize: 14, color: '#ef4444', marginBottom: 8 }}>
              ❌ 설치 중 오류가 발생했습니다.
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
                marginBottom: 20,
              }}
            >
              {errorMsg}
            </pre>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Python 3.10 이상이 설치되어 있는지 확인하거나, 수동으로{' '}
              <code>python/.venv</code>를 생성 후 <code>requirements.txt</code>를 설치해주세요.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onSkip} style={btnStyle('secondary')}>
                닫기
              </button>
              <button onClick={startSetup} style={btnStyle('primary')}>
                다시 시도
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
