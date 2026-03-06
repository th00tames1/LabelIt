import { useState, useEffect } from 'react'
import { statsApi, type DatasetStats } from '../../../api/ipc'

export default function StatsPanel() {
  const [stats, setStats] = useState<DatasetStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await statsApi.get()
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const statusColor: Record<string, string> = {
    unlabeled: '#6b7280',
    in_progress: '#f59e0b',
    labeled: '#22c55e',
    approved: '#3b82f6',
  }
  const splitColor: Record<string, string> = {
    train: '#8b5cf6',
    val: '#06b6d4',
    test: '#f97316',
    unassigned: '#6b7280',
  }

  const row = (label: string, value: number | string, color?: string) => (
    <div key={label} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {color && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
      letterSpacing: '0.08em', marginTop: 12, marginBottom: 4,
    }}>
      {text}
    </div>
  )

  if (loading) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ padding: 16, color: '#f87171', fontSize: 12 }}>{error}</div>
  )

  if (!stats) return null

  const maxClassCount = Math.max(...stats.by_class.map((c) => c.annotation_count), 1)

  return (
    <div style={{ padding: '12px 14px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          onClick={load}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Summary */}
      {sectionLabel('OVERVIEW')}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 4,
      }}>
        {[
          { label: 'Images', value: stats.total_images },
          { label: 'Labeled', value: stats.labeled_images },
          { label: 'Annots', value: stats.total_annotations },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 6px',
            textAlign: 'center', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* By Status */}
      {sectionLabel('BY STATUS')}
      {stats.by_status.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data</div>
        : stats.by_status.map((s) => row(s.status, s.count, statusColor[s.status]))}

      {/* By Split */}
      {sectionLabel('BY SPLIT')}
      {stats.by_split.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data</div>
        : stats.by_split.map((s) => row(s.split, s.count, splitColor[s.split]))}

      {/* By Class */}
      {sectionLabel('BY CLASS')}
      {stats.by_class.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No annotations yet</div>
        : stats.by_class.map((c) => (
          <div key={c.label_class_id} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {c.annotation_count}
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: c.color,
                width: `${(c.annotation_count / maxClassCount) * 100}%`,
              }} />
            </div>
          </div>
        ))}
    </div>
  )
}
