import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'fs'
import { app } from 'electron'
import https from 'https'
import http from 'http'
import type { IncomingMessage } from 'http'

export type SetupStatus = 'idle' | 'running' | 'done' | 'error'

export interface SetupProgress {
  message: string
  percent: number  // 0–100, or -1 on fatal error
  error?: string
}

type ProgressCallback = (p: SetupProgress) => void

class PythonSetupService {
  private _status: SetupStatus = 'idle'
  private handlers: ProgressCallback[] = []

  get status(): SetupStatus { return this._status }

  onProgress(cb: ProgressCallback): () => void {
    this.handlers.push(cb)
    return () => { this.handlers = this.handlers.filter(h => h !== cb) }
  }

  private emit(p: SetupProgress): void {
    this.handlers.forEach(h => h(p))
  }

  /** Returns true if the venv is missing or core packages are not importable. */
  async isSetupNeeded(): Promise<boolean> {
    const venvPython = this.getVenvPython()
    if (!existsSync(venvPython)) return true
    try {
      execSync(`"${venvPython}" -c "import fastapi, uvicorn, ultralytics"`, {
        timeout: 12_000,
        stdio: 'ignore',
      })
      return false
    } catch {
      return true
    }
  }

  async run(): Promise<void> {
    if (this._status === 'running') return
    this._status = 'running'
    try {
      await this.doSetup()
      this._status = 'done'
    } catch (err) {
      this._status = 'error'
      throw err
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private getPythonDir(): string {
    const appPath = app.getAppPath()
    for (const c of [
      join(appPath, 'python'),
      join(appPath, '..', 'python'),
      join(process.resourcesPath ?? '', 'python'),
    ]) {
      if (existsSync(c)) return c
    }
    return join(appPath, 'python')
  }

  private getVenvPython(): string {
    const venvDir = join(this.getPythonDir(), '.venv')
    return process.platform === 'win32'
      ? join(venvDir, 'Scripts', 'python.exe')
      : join(venvDir, 'bin', 'python')
  }

  private getVenvPip(): string {
    const venvDir = join(this.getPythonDir(), '.venv')
    return process.platform === 'win32'
      ? join(venvDir, 'Scripts', 'pip.exe')
      : join(venvDir, 'bin', 'pip')
  }

  private async doSetup(): Promise<void> {
    const pythonDir = this.getPythonDir()

    // 1. Find / acquire a base Python ≥ 3.10
    this.emit({ message: 'Python 인터프리터 찾는 중...', percent: 5 })
    const basePython = await this.findOrAcquirePython()
    if (!basePython) {
      throw new Error(
        'Python 3.10 이상을 찾을 수 없습니다. python.org에서 Python을 설치한 뒤 다시 시도해주세요.',
      )
    }

    // 2. Create venv
    const venvDir = join(pythonDir, '.venv')
    if (!existsSync(venvDir)) {
      this.emit({ message: '가상 환경 생성 중...', percent: 15 })
      // Try venv first; if that fails (embeddable Python) try virtualenv
      try {
        await this.exec(basePython, ['-m', 'venv', venvDir])
      } catch {
        await this.exec(basePython, ['-m', 'pip', 'install', 'virtualenv', '-q'])
        await this.exec(basePython, ['-m', 'virtualenv', venvDir])
      }
    }

    const venvPython = this.getVenvPython()
    const venvPip = this.getVenvPip()

    // 3. Upgrade pip inside the venv
    this.emit({ message: 'pip 업데이트 중...', percent: 20 })
    await this.exec(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q'])

    // 4. Detect GPU → install matching PyTorch build
    this.emit({ message: 'GPU 감지 중...', percent: 25 })
    const hasCuda = this.detectCuda()

    if (hasCuda) {
      this.emit({
        message: 'PyTorch (CUDA 12.4) 설치 중...\n파일 크기가 커서 시간이 걸릴 수 있습니다 (~2–3 GB).',
        percent: 30,
      })
      await this.exec(venvPip, [
        'install', 'torch', 'torchvision',
        '--index-url', 'https://download.pytorch.org/whl/cu124',
        '-q',
      ])
    } else {
      this.emit({ message: 'PyTorch (CPU) 설치 중... (~500 MB)', percent: 30 })
      await this.exec(venvPip, [
        'install', 'torch', 'torchvision',
        '--index-url', 'https://download.pytorch.org/whl/cpu',
        '-q',
      ])
    }

    // 5. Install the rest of requirements.txt
    this.emit({ message: '나머지 패키지 설치 중...', percent: 72 })
    const reqPath = join(pythonDir, 'requirements.txt')
    await this.exec(venvPip, ['install', '-r', reqPath, '-q'])

    this.emit({ message: '설치 완료!', percent: 100 })
  }

  /** Find an existing Python 3.10+ on the system, or download the embeddable build. */
  private async findOrAcquirePython(): Promise<string | null> {
    // Common Windows Python / Conda installations
    if (process.platform === 'win32') {
      const home = process.env.USERPROFILE || ''
      const cands = [
        join(home, 'anaconda3', 'python.exe'),
        join(home, 'Anaconda3', 'python.exe'),
        join(home, 'miniconda3', 'python.exe'),
        join(home, 'Miniconda3', 'python.exe'),
        join(home, 'AppData', 'Local', 'anaconda3', 'python.exe'),
        join(home, 'AppData', 'Local', 'miniconda3', 'python.exe'),
        'C:\\ProgramData\\anaconda3\\python.exe',
        'C:\\ProgramData\\Anaconda3\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
        join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
      ]
      for (const c of cands) {
        if (existsSync(c) && this.isPython310Plus(c)) return c
      }
    }

    // Try PATH
    for (const cmd of ['python', 'python3']) {
      try {
        if (this.isPython310Plus(cmd)) return cmd
      } catch { /* skip */ }
    }

    // Last resort on Windows: download Python 3.12 embeddable
    if (process.platform === 'win32') {
      return this.acquireEmbeddedPython()
    }

    return null
  }

  private isPython310Plus(pythonExe: string): boolean {
    try {
      const out = execSync(
        `"${pythonExe}" -c "import sys; print(sys.version_info[:2])"`,
        { timeout: 5_000, encoding: 'utf8' },
      )
      const m = out.match(/\((\d+),\s*(\d+)\)/)
      if (!m) return false
      const [major, minor] = [parseInt(m[1]), parseInt(m[2])]
      return major > 3 || (major === 3 && minor >= 10)
    } catch {
      return false
    }
  }

  /**
   * Download Python 3.12 embeddable for Windows, bootstrap pip, and return the
   * path to python.exe so we can create a proper venv from it.
   */
  private async acquireEmbeddedPython(): Promise<string | null> {
    const embedDir = join(app.getPath('userData'), 'python-embed')
    const pythonExe = join(embedDir, 'python.exe')

    if (existsSync(pythonExe)) {
      this.emit({ message: 'Python 임베디드 버전 사용 중...', percent: 8 })
      return pythonExe
    }

    mkdirSync(embedDir, { recursive: true })

    // Download embeddable zip (~10 MB)
    this.emit({ message: 'Python 3.12 다운로드 중 (~10 MB)...', percent: 6 })
    const zipPath = join(embedDir, 'python-embed.zip')
    await this.downloadFile(
      'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip',
      zipPath,
      (pct) => this.emit({
        message: `Python 다운로드 중... ${pct}%`,
        percent: Math.round(6 + pct * 0.05),
      }),
    )

    // Extract via PowerShell
    this.emit({ message: 'Python 압축 해제 중...', percent: 11 })
    await this.exec('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${embedDir}" -Force`,
    ])

    // Patch ._pth to enable site-packages (required for pip to work)
    const pthFiles = readdirSync(embedDir).filter(f => f.endsWith('._pth'))
    for (const f of pthFiles) {
      const pthPath = join(embedDir, f)
      const patched = readFileSync(pthPath, 'utf8').replace('#import site', 'import site')
      writeFileSync(pthPath, patched)
    }

    // Bootstrap pip via get-pip.py
    this.emit({ message: 'pip 부트스트랩 중...', percent: 12 })
    const getPipPath = join(embedDir, 'get-pip.py')
    await this.downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath, () => {})
    await this.exec(pythonExe, [getPipPath, '-q'])

    return pythonExe
  }

  private detectCuda(): boolean {
    try {
      execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
        timeout: 3_000,
        stdio: 'ignore',
      })
      return true
    } catch {
      return false
    }
  }

  private exec(exe: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => { stderr += String(d) })
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Exit ${code}: ${stderr.slice(-500)}`))
      })
      proc.on('error', reject)
    })
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress: (pct: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (target: string) => {
        const mod = target.startsWith('https') ? https : http
        mod.get(target, (res: IncomingMessage) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            follow(res.headers.location!)
            return
          }
          const total = parseInt(res.headers['content-length'] ?? '0')
          let received = 0
          const file = createWriteStream(dest)
          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            if (total > 0) onProgress(Math.round(received / total * 100))
          })
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
          file.on('error', (err) => { file.close(); reject(err) })
        }).on('error', reject)
      }
      follow(url)
    })
  }
}

export const pythonSetupService = new PythonSetupService()
