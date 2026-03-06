import { spawn, ChildProcess } from 'child_process'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

export type SidecarStatus = 'stopped' | 'starting' | 'running' | 'error'

class SidecarService {
  private process: ChildProcess | null = null
  private _status: SidecarStatus = 'stopped'
  private readonly port = 7842

  get status(): SidecarStatus { return this._status }
  get baseUrl(): string { return `http://127.0.0.1:${this.port}` }

  async start(): Promise<void> {
    if (this._status === 'running') return
    this._status = 'starting'

    const pythonExe = this.resolvePythonPath()
    if (!pythonExe) {
      this._status = 'error'
      console.warn('Python not found — AI features disabled')
      return
    }

    const scriptDir = join(app.getAppPath(), 'python')
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
    })

    this.process.on('exit', () => {
      this._status = 'stopped'
      this.process = null
    })

    try {
      await this.waitForHealth(15_000)
      this._status = 'running'
    } catch {
      this._status = 'error'
      this.stop()
    }
  }

  stop(): void {
    this.process?.kill('SIGTERM')
    this.process = null
    this._status = 'stopped'
  }

  private resolvePythonPath(): string | null {
    const appPath = app.getAppPath()

    // 1. Bundled venv (production)
    const bundledPython = join(appPath, '..', 'python', '.venv', 'Scripts', 'python.exe')
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
