import { useState } from 'react'
import { imageApi } from '../api/ipc'

interface Props {
  totalImages: number
  onClose: () => void
  onComplete: () => void
}

export default function AutoSplitDialog({ totalImages, onClose, onComplete }: Props) {
  const [train, setTrain] = useState(70)
  const [val, setVal] = useState(20)
  const [test, setTest] = useState(10)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const sum = train + val + test
  const invalid = sum !== 100

  const handleChange = (
    field: 'train' | 'val' | 'test',
    value: number,
  ) => {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
    const v = clamp(value)
    if (field === 'train') setTrain(v)
    else if (field === 'val') setVal(v)
    else setTest(v)
  }

  const handleRun = async () => {
    if (invalid) return
    setError(null)
    setIsRunning(true)
    try {
      await imageApi.autoSplit({
        train: train / 100,
        val: val / 100,
        test: test / 100,
      })
      setDone(true)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-split failed')
    } finally {
      setIsRunning(false)
    }
  }

  const numField = (
    label: string,
    field: 'train' | 'val' | 'test',
    value: number,
    color: string,
  ) => (
    <div>
      <label style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
        display: 'block', marginBottom: 4,
      }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8,
          borderRadius: '50%', background: color, marginRight: 5,
        }} />
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="range"
          min={0} max={100} value={value}
          onChange={(e) => handleChange(field, parseInt(e.target.value))}
          style={{ flex: 1, accentColor: color }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input
            type="number"
            min={0} max={100} value={value}
            onChange={(e) => handleChange(field, parseInt(e.target.value) || 0)}
            style={{
              width: 46, padding: '4px 6px', borderRadius: 5,
              border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
              textAlign: 'right',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400, background: 'var(--bg-secondary)',
        borderRadius: 10, border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            Auto Split Dataset
          </span>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 18, background: 'none' }}>✕</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Randomly assign {totalImages} image{totalImages !== 1 ? 's' : ''} to train / val / test splits.
            Existing split assignments will be overwritten.
          </div>

          {numField('Train', 'train', train, '#8b5cf6')}
          {numField('Val', 'val', val, '#06b6d4')}
          {numField('Test', 'test', test, '#f97316')}

          {/* Sum indicator */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', borderRadius: 6,
            background: invalid ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${invalid ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: invalid ? '#f87171' : '#4ade80' }}>
              {sum}%{invalid ? ' — must equal 100%' : ' ✓'}
            </span>
          </div>

          {/* Preview */}
          {!invalid && (
            <div style={{
              display: 'flex', borderRadius: 6, overflow: 'hidden', height: 8,
            }}>
              {[
                { pct: train, color: '#8b5cf6' },
                { pct: val, color: '#06b6d4' },
                { pct: test, color: '#f97316' },
              ].map(({ pct, color }, i) => (
                pct > 0 && <div key={i} style={{ flex: pct, background: color }} />
              ))}
            </div>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 12, color: '#f87171',
            }}>{error}</div>
          )}

          {done && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              fontSize: 12, color: '#4ade80',
            }}>
              ✓ Split complete — images assigned to train/val/test
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={handleRun}
              disabled={isRunning || invalid}
              style={{
                padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: invalid || isRunning ? 'var(--bg-tertiary)' : 'var(--accent)',
                border: 'none', color: 'white',
                cursor: invalid || isRunning ? 'not-allowed' : 'pointer',
                opacity: invalid || isRunning ? 0.6 : 1,
              }}
            >
              {isRunning ? 'Splitting…' : 'Apply Split'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
