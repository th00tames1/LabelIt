import { useState, useEffect } from 'react'
import { projectApi } from '../../api/ipc'
import { useProjectStore } from '../../store/projectStore'
import type { RecentProject } from '../../types'

export default function HomePage() {
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { recentProjects, setRecentProjects, setCurrentProject } = useProjectStore()

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
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: var(--bg-primary);
          padding: 40px;
        }
        .home-header {
          text-align: center;
          margin-bottom: 48px;
        }
        .home-header h1 {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .home-header p {
          color: var(--text-secondary);
          font-size: 15px;
        }
        .home-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 48px;
        }
        .btn-primary {
          background: var(--accent);
          color: white;
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 600;
          transition: background 0.15s;
        }
        .btn-primary:hover { background: var(--accent-hover); }
        .btn-secondary {
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 500;
          transition: background 0.15s;
        }
        .btn-secondary:hover { background: var(--bg-hover); }
        .recent-section {
          width: 100%;
          max-width: 640px;
        }
        .recent-section h2 {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        .recent-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .recent-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .recent-card:hover {
          border-color: var(--accent);
          background: var(--bg-tertiary);
        }
        .recent-card-name {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
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
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 28px;
          width: 420px;
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
      `}</style>

      <div className="home-header">
        <h1>LabelingTool</h1>
        <p>Fully local, offline-capable image annotation</p>
      </div>

      <div className="home-actions">
        <button className="btn-primary" onClick={() => setShowNewProject(true)}>
          + New Project
        </button>
        <button className="btn-secondary" onClick={handleOpenProject}>
          Open Project
        </button>
      </div>

      {recentProjects.length > 0 && (
        <div className="recent-section">
          <h2>Recent Projects</h2>
          <div className="recent-grid">
            {recentProjects.map((project) => (
              <button
                key={project.file_path}
                className="recent-card"
                onClick={() => handleOpenRecent(project)}
              >
                <div className="recent-card-name">{project.name}</div>
                <div className="recent-card-meta">
                  {new Date(project.last_opened).toLocaleDateString()}
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

      {showNewProject && (
        <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New Project</h3>
            <label>Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Dataset"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleNewProject()}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowNewProject(false); setProjectName('') }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleNewProject}
                disabled={!projectName.trim() || isCreating}
              >
                {isCreating ? 'Creating...' : 'Choose Folder →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
