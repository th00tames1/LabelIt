import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'fs'
import { app } from 'electron'
import https from 'https'
import http from 'http'
import type { IncomingMessage } from 'http'

type Lang = 'en' | 'ko'

export type SetupStatus = 'idle' | 'running' | 'done' | 'error'

export interface SetupProgress {
  message: string
  percent: number  // 0–100, or -1 on fatal error
  eta?: string     // e.g. "2m 30s" — only present during file downloads
  error?: string
}

type ProgressCallback = (p: SetupProgress) => void

// ── Bilingual messages ────────────────────────────────────────────────────────

const T: Record<string, Record<Lang, string>> = {
  findingPython:    { en: 'Finding Python interpreter...',                   ko: 'Python 인터프리터 찾는 중...' },
  usingEmbedded:    { en: 'Using embedded Python...',                        ko: 'Python 임베디드 버전 사용 중...' },
  downloadPython:   { en: 'Downloading Python 3.12 (~10 MB)...',             ko: 'Python 3.12 다운로드 중 (~10 MB)...' },
  extractPython:    { en: 'Extracting Python...',                            ko: 'Python 압축 해제 중...' },
  bootstrapPip:     { en: 'Bootstrapping pip...',                            ko: 'pip 부트스트랩 중...' },
  creatingVenv:     { en: 'Creating virtual environment...',                 ko: '가상 환경 생성 중...' },
  upgradePip:       { en: 'Upgrading pip...',                                ko: 'pip 업데이트 중...' },
  detectGpu:        { en: 'Detecting GPU...',                                ko: 'GPU 감지 중...' },
  pytorchCuda:      {
    en: 'Installing PyTorch (CUDA 12.4)...\nLarge file, this may take several minutes (~2-3 GB).',
    ko: 'PyTorch (CUDA 12.4) 설치 중...\n파일 크기가 커서 시간이 걸릴 수 있습니다 (~2-3 GB).',
  },
  pytorchCpu:       { en: 'Installing PyTorch (CPU)... (~500 MB)',           ko: 'PyTorch (CPU) 설치 중... (~500 MB)' },
  packages:         { en: 'Installing remaining packages...',                ko: '나머지 패키지 설치 중...' },
  sam2Download:     { en: 'Downloading SAM2 model (~39 MB)...',              ko: 'SAM2 모델 다운로드 중 (~39 MB)...' },
  done:             { en: 'Installation complete!',                          ko: '설치 완료!' },
  pythonNotFound:   {
    en: 'Python 3.10+ not found. Please install Python from python.org and try again.',
    ko: 'Python 3.10 이상을 찾을 수 없습니다. python.org에서 Python을 설치한 뒤 다시 시도해주세요.',
  },
}

function msg(lang: Lang, key: string): string {
  return T[key]?.[lang] ?? T[key]?.['en'] ?? key
}

function formatEta(seconds: number, lang: Lang): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  const time = m > 0 ? `${m}m ${s}s` : `${s}s`
  return lang === 'ko' ? `남은 시간: ${time}` : `${time} remaining`
}

// ── Service ───────────────────────────────────────────────────────────────────

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

  async run(lang: Lang = 'en'): Promise<void> {
    if (this._status === 'running') return
    this._status = 'running'
    try {
      await this.doSetup(lang)
      this._status = 'done'
    } catch (err) {
      this._status = 'error'
      throw err
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  /**
   * Venv lives in the user's AppData — writable even when the app is installed system-wide.
   *   %APPDATA%\LabelIt\python-venv\
   */
  private getVenvDir(): string {
    return join(app.getPath('userData'), 'python-venv')
  }

  private getPythonScriptsDir(): string {
    return process.platform === 'win32'
      ? join(this.getVenvDir(), 'Scripts')
      : join(this.getVenvDir(), 'bin')
  }

  private getVenvPython(): string {
    return process.platform === 'win32'
      ? join(this.getPythonScriptsDir(), 'python.exe')
      : join(this.getPythonScriptsDir(), 'python')
  }

  private getVenvPip(): string {
    return process.platform === 'win32'
      ? join(this.getPythonScriptsDir(), 'pip.exe')
      : join(this.getPythonScriptsDir(), 'pip')
  }

  /** SAM models dir — user-writable, matches LABELING_TOOL_MODELS_DIR env var in sidecar. */
  private getModelsDir(): string {
    return join(app.getPath('userData'), 'models')
  }

  /** Python scripts/resources bundled with the app (read-only in production). */
  private getPythonResourceDir(): string {
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

  private async doSetup(lang: Lang): Promise<void> {
    // 1. Find / acquire a base Python ≥ 3.10
    this.emit({ message: msg(lang, 'findingPython'), percent: 5 })
    const basePython = await this.findOrAcquirePython(lang)
    if (!basePython) {
      throw new Error(msg(lang, 'pythonNotFound'))
    }

    // 2. Create venv in user-writable %APPDATA%\LabelIt\python-venv
    const venvDir = this.getVenvDir()
    if (!existsSync(venvDir)) {
      this.emit({ message: msg(lang, 'creatingVenv'), percent: 15 })
      mkdirSync(venvDir, { recursive: true })
      // Try stdlib venv first; fall back to virtualenv (needed for embedded Python)
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
    this.emit({ message: msg(lang, 'upgradePip'), percent: 20 })
    await this.exec(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q'])

    // 4. Detect GPU → install matching PyTorch build
    this.emit({ message: msg(lang, 'detectGpu'), percent: 25 })
    const hasCuda = this.detectCuda()

    if (hasCuda) {
      this.emit({ message: msg(lang, 'pytorchCuda'), percent: 30 })
      await this.exec(venvPip, [
        'install', 'torch', 'torchvision',
        '--index-url', 'https://download.pytorch.org/whl/cu124',
        '-q',
      ])
    } else {
      this.emit({ message: msg(lang, 'pytorchCpu'), percent: 30 })
      await this.exec(venvPip, [
        'install', 'torch', 'torchvision',
        '--index-url', 'https://download.pytorch.org/whl/cpu',
        '-q',
      ])
    }

    // 5. Install the rest of requirements.txt (from read-only app resources)
    this.emit({ message: msg(lang, 'packages'), percent: 70 })
    const reqPath = join(this.getPythonResourceDir(), 'requirements.txt')
    await this.exec(venvPip, ['install', '-r', reqPath, '-q'])

    // 6. Download SAM2 model if not already present
    const modelsDir = this.getModelsDir()
    const sam2Path = join(modelsDir, 'sam2.1_b.pt')
    if (!existsSync(sam2Path)) {
      mkdirSync(modelsDir, { recursive: true })
      const baseMsg = msg(lang, 'sam2Download')
      this.emit({ message: baseMsg, percent: 78 })
      await this.downloadFile(
        'https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_b.pt',
        sam2Path,
        (pct, eta) => this.emit({
          message: `${baseMsg}\n${pct}%`,
          percent: Math.round(78 + pct * 0.14),
          eta,
        }),
        lang,
      )
    }

    this.emit({ message: msg(lang, 'done'), percent: 100 })
  }

  /** Find an existing Python 3.10+ on the system, or download the embeddable build. */
  private async findOrAcquirePython(lang: Lang): Promise<string | null> {
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
      return this.acquireEmbeddedPython(lang)
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
  private async acquireEmbeddedPython(lang: Lang): Promise<string | null> {
    const embedDir = join(app.getPath('userData'), 'python-embed')
    const pythonExe = join(embedDir, 'python.exe')

    if (existsSync(pythonExe)) {
      this.emit({ message: msg(lang, 'usingEmbedded'), percent: 8 })
      return pythonExe
    }

    mkdirSync(embedDir, { recursive: true })

    // Download embeddable zip (~10 MB)
    this.emit({ message: msg(lang, 'downloadPython'), percent: 6 })
    const zipPath = join(embedDir, 'python-embed.zip')
    await this.downloadFile(
      'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip',
      zipPath,
      (pct, eta) => this.emit({
        message: `${msg(lang, 'downloadPython')}\n${pct}%`,
        percent: Math.round(6 + pct * 0.05),
        eta,
      }),
      lang,
    )

    // Extract via PowerShell
    this.emit({ message: msg(lang, 'extractPython'), percent: 11 })
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
    this.emit({ message: msg(lang, 'bootstrapPip'), percent: 12 })
    const getPipPath = join(embedDir, 'get-pip.py')
    await this.downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath, () => {}, lang)
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
    onProgress: (pct: number, eta?: string) => void,
    lang: Lang = 'en',
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
          const startTime = Date.now()
          const file = createWriteStream(dest)
          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            if (total > 0) {
              const pct = Math.round(received / total * 100)
              let eta: string | undefined
              const elapsedSec = (Date.now() - startTime) / 1000
              if (elapsedSec > 1 && received < total) {
                const speed = received / elapsedSec  // bytes/sec
                const remainingSec = (total - received) / speed
                if (remainingSec > 5) {
                  eta = formatEta(remainingSec, lang)
                }
              }
              onProgress(pct, eta)
            }
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
