import { useState, useEffect } from 'react'
import { projectApi } from '../../api/ipc'
import { useProjectStore } from '../../store/projectStore'
import type { RecentProject } from '../../types'
import { useI18n } from '../../i18n'
import LanguageSwitcher from '../../components/LanguageSwitcher'

export default function HomePage() {
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { recentProjects, setRecentProjects, setCurrentProject } = useProjectStore()
  const { t, formatDate } = useI18n()

  useEffect(() => {
    projectApi.listRecent().then(setRecentProjects).catch(console.error)
  }, [setRecentProjects])

  const handleNewProject = async () => {
    if (!projectName.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const dir = await projectApi.showCreateDialog()
      if (!dir) { setIsCreating(false); return }
      const meta = await projectApi.create(projectName.trim(), dir)
      setCurrentProject(meta)
      setShowNewProject(false)
      setProjectName('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenProject = async () => {
    const filePath = await projectApi.showOpenDialog()
    if (!filePath) return
    try {
      const meta = await projectApi.open(filePath)
      setCurrentProject(meta)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleOpenRecent = async (project: RecentProject) => {
    try {
      const meta = await projectApi.open(project.file_path)
      setCurrentProject(meta)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="home-page">
      <style>{`
        .home-page {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          padding: 40px;
          isolation: isolate;
        }
        .home-page::before {
          content: '';
          position: absolute;
          inset: 8% auto auto 6%;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(var(--accent-rgb), 0.34), rgba(var(--accent-rgb), 0) 70%);
          filter: blur(10px);
          z-index: -2;
        }
        .home-page::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(115deg, rgba(255,255,255,0.02) 0%, transparent 22%),
            repeating-linear-gradient(135deg, rgba(var(--accent-rgb), 0.04) 0 2px, transparent 2px 22px);
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2));
          z-index: -1;
        }
        .home-toolbar {
          position: absolute;
          top: 24px;
          right: 24px;
        }
        .home-panel {
          width: min(820px, 100%);
          padding: 52px 54px 40px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          background:
            linear-gradient(145deg, rgba(44, 28, 20, 0.95), rgba(23, 16, 11, 0.94)),
            radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.18), transparent 30%);
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(10px);
        }
        .home-kicker {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(var(--accent-rgb), 0.35);
          background: rgba(var(--accent-rgb), 0.12);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #ffd6c7;
        }
        .home-kicker::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.6);
        }
        .home-header {
          text-align: center;
          margin-bottom: 36px;
        }
        .home-header h1 {
          font-size: clamp(42px, 7vw, 64px);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 12px;
          line-height: 1;
        }
        .home-header p {
          color: var(--text-secondary);
          font-size: 17px;
          max-width: 520px;
          margin: 0 auto;
          line-height: 1.7;
        }
        .home-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-bottom: 36px;
        }
        .btn-primary {
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          color: white;
          min-width: 156px;
          min-height: 46px;
          padding: 12px 22px;
          border-radius: 12px;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 14px 30px rgba(var(--accent-rgb), 0.22);
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #e04b13, var(--accent));
          transform: translateY(-1px);
        }
        .btn-secondary {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          color: var(--text-primary);
          min-width: 156px;
          min-height: 46px;
          padding: 12px 22px;
          border-radius: 12px;
          font-weight: 500;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.07);
          border-color: var(--border-strong);
          transform: translateY(-1px);
        }
        .recent-section {
          width: 100%;
          max-width: 700px;
          margin: 0 auto;
        }
        .recent-section h2 {
          font-size: 13px;
          font-weight: 600;
          color: #f4b9a4;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-bottom: 14px;
        }
        .recent-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .recent-card {
          position: relative;
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 18px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          overflow: hidden;
        }
        .recent-card::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
          background: linear-gradient(180deg, var(--accent), rgba(197, 138, 11, 0.9));
          opacity: 0.8;
        }
        .recent-card:hover {
          border-color: rgba(var(--accent-rgb), 0.42);
          background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.12), rgba(255,255,255,0.03));
          transform: translateY(-2px);
        }
        .recent-card-name {
          font-weight: 600;
          font-size: 15px;
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .recent-card-meta {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal {
          background: linear-gradient(145deg, rgba(44, 28, 20, 0.98), rgba(23, 16, 11, 0.98));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 28px;
          width: 420px;
          box-shadow: var(--shadow-lg);
        }
        .modal h3 {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 20px;
        }
        .modal label {
          display: block;
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .modal input {
          width: 100%;
          margin-bottom: 16px;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .error-text {
          color: var(--danger);
          font-size: 13px;
          margin-top: 8px;
        }
        @media (max-width: 720px) {
          .home-page {
            padding: 20px;
          }
          .home-toolbar {
            top: 16px;
            right: 16px;
          }
          .home-panel {
            padding: 72px 22px 24px;
            border-radius: 20px;
          }
          .home-actions {
            flex-direction: column;
          }
          .recent-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="home-toolbar">
        <LanguageSwitcher />
      </div>

      <div className="home-panel">
        <div className="home-header">
          <div className="home-kicker">{t('home.brandRibbon')}</div>
          <h1>LabelingTool</h1>
          <p>{t('home.subtitle')}</p>
        </div>

        <div className="home-actions">
          <button className="btn-primary" onClick={() => setShowNewProject(true)}>
            {t('home.newProject')}
          </button>
          <button className="btn-secondary" onClick={handleOpenProject}>
            {t('home.openProject')}
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="recent-section">
            <h2>{t('home.recentProjects')}</h2>
            <div className="recent-grid">
              {recentProjects.map((project) => (
                <button
                  key={project.file_path}
                  className="recent-card"
                  onClick={() => handleOpenRecent(project)}
                >
                  <div className="recent-card-name">{project.name}</div>
                  <div className="recent-card-meta">
                    {formatDate(project.last_opened)}
                  </div>
                  <div className="recent-card-meta" style={{ marginTop: 2 }}>
                    {project.file_path}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>

      {showNewProject && (
        <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('home.newProjectTitle')}</h3>
            <label>{t('home.projectName')}</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('home.projectNamePlaceholder')}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleNewProject()}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowNewProject(false); setProjectName('') }}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleNewProject}
                disabled={!projectName.trim() || isCreating}
              >
                {isCreating ? t('home.creating') : t('home.chooseFolder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
