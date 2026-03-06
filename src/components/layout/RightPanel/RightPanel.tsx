import { useState } from 'react'
import AnnotationList from './AnnotationList'
import LabelManager from './LabelManager'
import StatsPanel from './StatsPanel'

type Tab = 'annotations' | 'labels' | 'stats'

const TABS: { value: Tab; label: string }[] = [
  { value: 'annotations', label: 'Annots' },
  { value: 'labels', label: 'Labels' },
  { value: 'stats', label: 'Stats' },
]

export default function RightPanel() {
  const [tab, setTab] = useState<Tab>('annotations')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    fontSize: 12,
    fontWeight: 600,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    background: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      width: 240,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button key={t.value} style={tabStyle(tab === t.value)} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'annotations' && <AnnotationList />}
        {tab === 'labels' && <LabelManager />}
        {tab === 'stats' && <StatsPanel />}
      </div>
    </div>
  )
}
