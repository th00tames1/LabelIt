import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { settingsStore } from './settings.service'

export type SidecarStatus = 'stopped' | 'starting' | 'running' | 'error'

class SidecarService {
  private process: ChildProcess | null = null
  private _status: SidecarStatus = 'stopped'
  private readonly port = 7842
  private lastErrorDetail = ''

  get status(): SidecarStatus { return this._status }
  get baseUrl(): string { return `http://127.0.0.1:${this.port}` }

  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') return
    this._status = 'starting'
    this.lastErrorDetail = ''

    const pythonExe = this.resolvePythonPath()
    if (!pythonExe) {
      this._status = 'error'
      console.warn('Python not found — AI features disabled')
      return
    }

    const scriptDir = this.resolvePythonDir()
    if (!existsSync(scriptDir)) {
      this._status = 'error'
      console.warn('Python sidecar directory not found — AI features disabled')
      return
    }

    this.process = spawn(pythonExe, [
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--log-level', 'warning',
    ], {
      cwd: scriptDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LABELING_TOOL_AI_DEVICE: settingsStore.get('ai_device_mode') ?? 'auto',
      },
    })

    this.process.stderr?.on('data', (chunk) => {
      this.lastErrorDetail += String(chunk)
      if (this.lastErrorDetail.length > 4000) {
        this.lastErrorDetail = this.lastErrorDetail.slice(-4000)
      }
    })

    this.process.on('exit', () => {
      this._status = 'stopped'
      this.process = null
    })

    try {
      await this.waitForHealth(60_000)
      this._status = 'running'
      this.prewarmSam().catch((err) => {
        console.warn('[sidecar] SAM prewarm failed:', err.message)
      })
    } catch {
      console.warn('[sidecar] Startup timed out or failed.', this.lastErrorDetail || '(no stderr)')
      this.stop()
      this._status = 'error'
      await new Promise((resolve) => setTimeout(resolve, 1500))
      this._status = 'stopped'
      await this.startWithoutRetry()
    }
  }

  private async startWithoutRetry(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') return
    this._status = 'starting'
    this.lastErrorDetail = ''

    const pythonExe = this.resolvePythonPath()
    if (!pythonExe) {
      this._status = 'error'
      console.warn('Python not found — AI features disabled')
      return
    }

    const scriptDir = this.resolvePythonDir()
    if (!existsSync(scriptDir)) {
      this._status = 'error'
      console.warn('Python sidecar directory not found — AI features disabled')
      return
    }

    this.process = spawn(pythonExe, [
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--log-level', 'warning',
    ], {
      cwd: scriptDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LABELING_TOOL_AI_DEVICE: settingsStore.get('ai_device_mode') ?? 'auto',
      },
    })

    this.process.stderr?.on('data', (chunk) => {
      this.lastErrorDetail += String(chunk)
      if (this.lastErrorDetail.length > 4000) {
        this.lastErrorDetail = this.lastErrorDetail.slice(-4000)
      }
    })

    this.process.on('exit', () => {
      this._status = 'stopped'
      this.process = null
    })

    try {
      await this.waitForHealth(60_000)
      this._status = 'running'
      this.prewarmSam().catch((err) => {
        console.warn('[sidecar] SAM prewarm failed:', err.message)
      })
    } catch {
      this._status = 'error'
      console.warn('[sidecar] Retry start failed.', this.lastErrorDetail || '(no stderr)')
      this.stop()
    }
  }

  private async prewarmSam(): Promise<void> {
    if (this._status !== 'running') return
    const response = await fetch(`${this.baseUrl}/sam/preload`, {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  }

  stop(): void {
    this.process?.kill('SIGTERM')
    this.process = null
    this._status = 'stopped'
  }

  async restart(): Promise<void> {
    this.stop()
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    await this.start()
  }

  private resolvePythonDir(): string {
    const appPath = app.getAppPath()
    const candidates = [
      join(appPath, 'python'),
      join(appPath, '..', 'python'),
      join(process.resourcesPath, 'python'),
    ]

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
  }

  private resolvePythonPath(): string | null {
    const appPath = app.getAppPath()
    const pythonDir = this.resolvePythonDir()

    // 1. Bundled venv (production)
    const bundledPython = join(pythonDir, '.venv', 'Scripts', 'python.exe')
    if (existsSync(bundledPython)) return bundledPython

    // 2. Local venv (development)
    const localVenv = join(appPath, 'python', '.venv', 'Scripts', 'python.exe')
    if (existsSync(localVenv)) return localVenv

    // 3. System python
    return 'python'
  }

  private async waitForHealth(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1000) })
        if (res.ok) return
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    throw new Error('Sidecar health check timed out')
  }
}

export const sidecarService = new SidecarService()
