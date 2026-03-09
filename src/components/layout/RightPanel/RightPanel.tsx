import { useEffect } from 'react'
import AnnotationList from './AnnotationList'
import LabelManager from './LabelManager'
import StatsPanel from './StatsPanel'
import { useLabelStore } from '../../../store/labelStore'
import { useUIStore } from '../../../store/uiStore'
import { useI18n } from '../../../i18n'
import type { RightPanelTab } from '../../../types'

export default function RightPanel() {
  const tab = useUIStore((s) => s.rightPanelTab)
  const setTab = useUIStore((s) => s.setRightPanelTab)
  const labels = useLabelStore((s) => s.labels)
  const { t } = useI18n()

  const tabs: { value: RightPanelTab; label: string }[] = [
    { value: 'annotations', label: t('tabs.annotations') },
    { value: 'labels', label: t('tabs.labels') },
    { value: 'stats', label: t('tabs.stats') },
  ]

  useEffect(() => {
    if (labels.length === 0 && tab !== 'labels') {
      setTab('labels')
    }
  }, [labels.length, tab, setTab])

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
        {tabs.map((panelTab) => (
          <button
            key={panelTab.value}
            style={tabStyle(tab === panelTab.value)}
            onClick={() => setTab(panelTab.value)}
          >
            {panelTab.label}
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
