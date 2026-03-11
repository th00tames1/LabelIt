import { useSettingsStore } from '../store/settingsStore'
import { useUIStore } from '../store/uiStore'
import { useI18n } from '../i18n'
import type { AIDeviceMode } from '../types'

interface Props {
  compact?: boolean
}

export default function DeviceModeSwitcher({ compact = false }: Props) {
  const mode = useSettingsStore((s) => s.settings.ai_device_mode)
  const setAIDeviceMode = useSettingsStore((s) => s.setAIDeviceMode)
  const setSidecarOnline = useUIStore((s) => s.setSidecarOnline)
  const setSidecarRuntime = useUIStore((s) => s.setSidecarRuntime)
  const { t } = useI18n()

  const applyMode = async (nextMode: AIDeviceMode) => {
    if (nextMode === mode) return
    setSidecarOnline(false)
    setSidecarRuntime(null)
    await setAIDeviceMode(nextMode)
  }

  const options: AIDeviceMode[] = ['cpu', 'gpu']

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: compact ? 2 : 3,
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
      title={t('common.deviceMode')}
    >
      {options.map((option) => {
        const active = option === mode
        return (
          <button
            key={option}
            onClick={() => applyMode(option).catch(console.error)}
            style={{
              minWidth: compact ? 44 : 60,
              height: compact ? 28 : 32,
              padding: compact ? '4px 8px' : '5px 10px',
              borderRadius: 6,
              border: 'none',
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
