import { useSettingsStore } from '../store/settingsStore'
import { useI18n } from '../i18n'

interface Props {
  compact?: boolean
}

export default function ThemeSwitcher({ compact = false }: Props) {
  const theme = useSettingsStore((s) => s.settings.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const { t } = useI18n()

  const options: { value: 'dark' | 'light'; label: string }[] = [
    { value: 'light', label: t('common.light') },
    { value: 'dark', label: t('common.dark') },
  ]

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
      title={t('common.theme')}
    >
      {options.map((option) => {
        const active = theme === option.value
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value).catch(console.error)}
            style={{
              minWidth: compact ? 44 : 72,
              height: compact ? 28 : 32,
              padding: compact ? '4px 8px' : '5px 10px',
              borderRadius: 6,
              border: 'none',
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            {compact ? option.label.slice(0, 1).toUpperCase() : option.label}
          </button>
        )
      })}
    </div>
  )
}
