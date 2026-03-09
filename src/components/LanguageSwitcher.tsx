import { useSettingsStore } from '../store/settingsStore'
import { useI18n } from '../i18n'
import type { AppLanguage } from '../types'

interface Props {
  compact?: boolean
}

const OPTIONS: AppLanguage[] = ['en', 'ko']

export default function LanguageSwitcher({ compact = false }: Props) {
  const language = useSettingsStore((s) => s.settings.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const { t } = useI18n()

  const buttonLabel = (value: AppLanguage) => {
    if (compact) return value.toUpperCase()
    return value === 'en' ? t('common.english') : t('common.korean')
  }

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
      title={t('common.language')}
    >
      {OPTIONS.map((value) => {
        const active = value === language
        return (
          <button
            key={value}
            onClick={() => setLanguage(value).catch(console.error)}
            style={{
              padding: compact ? '4px 8px' : '5px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
            }}
          >
            {buttonLabel(value)}
          </button>
        )
      })}
    </div>
  )
}
