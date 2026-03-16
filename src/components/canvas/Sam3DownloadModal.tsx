import { useState, useEffect } from 'react'
import { setupApi } from '../../api/ipc'
import { useI18n } from '../../i18n'

interface Props {
  onClose: () => void
}

/**
 * SAM3_DOWNLOAD_URL: Set this to the public download URL for the SAM3 model file (sam3.pt).
 * The user should place the downloaded file in the models folder shown in this dialog.
 * Leave as an empty string until the URL is known — the download button will be hidden.
 */
const SAM3_DOWNLOAD_URL = 'https://drive.google.com/file/d/1hEkyNvxRUXlLuxNhsOux1BA7yKNqQSwj/view'

export default function Sam3DownloadModal({ onClose }: Props) {
  const { t } = useI18n()
  const [modelsDir, setModelsDir] = useState<string>('')

  useEffect(() => {
    setupApi.getModelsDir()
      .then(setModelsDir)
      .catch(() => setModelsDir('%APPDATA%\\LabelIt\\models'))
  }, [])

  return (
    <div
      onClick={onClose}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, calc(100vw - 32px))',
          padding: '28px 26px',
          borderRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
          {t('setup.sam3Title')}
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
          {t('setup.sam3Description')}
        </p>

        {/* File name */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>
            {t('setup.sam3FileLabel')}
          </div>
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            fontFamily: 'monospace',
            fontSize: 13,
            color: 'var(--text-primary)',
            userSelect: 'text',
          }}>
            sam3.pt
          </div>
        </div>

        {/* Models folder */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.04em' }}>
            {t('setup.sam3FolderLabel')}
          </div>
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            fontFamily: 'monospace',
            fontSize: 12,
            color: 'var(--text-primary)',
            userSelect: 'text',
            wordBreak: 'break-all',
          }}>
            {modelsDir || '...'}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setupApi.openModelsDir().catch(console.error)}
            style={btnStyle('secondary')}
          >
            {t('setup.sam3OpenFolder')}
          </button>

          {SAM3_DOWNLOAD_URL ? (
            <button
              onClick={() => setupApi.openExternal(SAM3_DOWNLOAD_URL).catch(console.error)}
              style={btnStyle('primary')}
            >
              {t('setup.sam3Download')}
            </button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              height: 38,
              borderRadius: 10,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 600,
            }}>
              {t('setup.sam3NotYet')}
            </div>
          )}

          <button onClick={onClose} style={btnStyle('close')}>
            {t('setup.sam3Close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary' | 'close'): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 38,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '0 16px',
    border: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  if (variant === 'primary') {
    return { ...base, background: '#c59a19', color: '#000', border: 'none' }
  }
  if (variant === 'secondary') {
    return { ...base, background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }
  }
  // close
  return { ...base, background: 'transparent', color: 'var(--text-secondary)' }
}
