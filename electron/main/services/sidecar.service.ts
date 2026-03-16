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
      env: this.buildEnv(),
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
      env: this.buildEnv(),
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

    if (process.platform === 'win32') {
      const home = process.env.USERPROFILE || process.env.HOME || ''
      const winCandidates = [
        // Conda environments (common on AI/ML setups)
        join(home, 'anaconda3', 'python.exe'),
        join(home, 'Anaconda3', 'python.exe'),
        join(home, 'miniconda3', 'python.exe'),
        join(home, 'Miniconda3', 'python.exe'),
        join(home, 'AppData', 'Local', 'anaconda3', 'python.exe'),
        join(home, 'AppData', 'Local', 'miniconda3', 'python.exe'),
        'C:\\ProgramData\\anaconda3\\python.exe',
        'C:\\ProgramData\\Anaconda3\\python.exe',
        'C:\\ProgramData\\miniconda3\\python.exe',
        // Standard Python installations
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python39\\python.exe',
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
      ]
      for (const candidate of winCandidates) {
        if (existsSync(candidate)) return candidate
      }
    }

    // 3. System python / python3
    return 'python'
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const cudaPaths: string[] = []
    if (process.platform === 'win32') {
      // Add common CUDA bin paths so torch can find CUDA DLLs
      const cudaRoot = process.env.CUDA_PATH || 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA'
      for (const ver of ['v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.8']) {
        cudaPaths.push(`${cudaRoot}\\${ver}\\bin`)
      }
    }
    const pathSep = process.platform === 'win32' ? ';' : ':'
    const extraPath = cudaPaths.length > 0 ? cudaPaths.join(pathSep) + pathSep : ''
    return {
      ...process.env,
      LABELING_TOOL_AI_DEVICE: settingsStore.get('ai_device_mode') ?? 'auto',
      PATH: extraPath + (process.env.PATH ?? ''),
    }
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
