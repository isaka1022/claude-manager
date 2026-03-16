import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { exec } from 'node:child_process'
import { stat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const claudeDir = resolve(join(homedir(), '.claude'))
const metaPath = join(claudeDir, 'claude-manager-meta.json')
const tipsPath = join(claudeDir, 'claude-manager-tips.json')

type TipStatus = 'inbox' | 'trying' | 'accepted' | 'promoted' | 'rejected'
type TipTargetType = 'rule' | 'skill' | 'claude-md' | 'permission' | 'none'

type Tip = {
  id: string
  title: string
  content: string
  tags: string[]
  status: TipStatus
  targetType: TipTargetType
  trialProjectPath: string | null
  promotedPath: string | null
  source: string
  createdAt: number
  updatedAt: number
}

const TIP_STATUSES: TipStatus[] = ['inbox', 'trying', 'accepted', 'promoted', 'rejected']
const TIP_TARGET_TYPES: TipTargetType[] = ['rule', 'skill', 'claude-md', 'permission', 'none']

const normalizeTip = (raw: Record<string, unknown>): Tip => ({
  id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
  title: typeof raw.title === 'string' ? raw.title : '',
  content: typeof raw.content === 'string' ? raw.content : '',
  tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
  status: TIP_STATUSES.includes(raw.status as TipStatus) ? (raw.status as TipStatus) : 'inbox',
  targetType: TIP_TARGET_TYPES.includes(raw.targetType as TipTargetType) ? (raw.targetType as TipTargetType) : 'none',
  trialProjectPath: typeof raw.trialProjectPath === 'string' ? raw.trialProjectPath :
    (typeof raw.projectPath === 'string' ? (raw.projectPath as string) : null),
  promotedPath: typeof raw.promotedPath === 'string' ? raw.promotedPath : null,
  source: typeof raw.source === 'string' ? raw.source : 'manual',
  createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
})

const readTips = async (): Promise<Tip[]> => {
  try {
    const raw = await readFile(tipsPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return (parsed as Record<string, unknown>[]).map(normalizeTip)
    return []
  } catch {
    return []
  }
}

const writeTips = async (tips: Tip[]): Promise<void> => {
  await mkdir(dirname(tipsPath), { recursive: true })
  await writeFile(tipsPath, JSON.stringify(tips, null, 2), 'utf-8')
}

const isPathWithin = (targetPath: string, basePath: string): boolean => {
  const normalizedTarget = resolve(targetPath)
  const normalizedBase = resolve(basePath)
  return (
    normalizedTarget === normalizedBase ||
    normalizedTarget.startsWith(`${normalizedBase}${sep}`)
  )
}

const expandHomePath = (targetPath: string): string => {
  if (targetPath === '~') {
    return homedir()
  }
  if (targetPath.startsWith('~/')) {
    return join(homedir(), targetPath.slice(2))
  }
  return targetPath
}

const registerIpcHandlers = (): void => {
  ipcMain.handle('scan-projects', async (_, dir: string) => {
    const resolvedDir = expandHomePath(dir)
    try {
      const entries = await readdir(resolvedDir, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => join(resolvedDir, entry.name))
    } catch {
      return []
    }
  })

  ipcMain.handle('list-dir-entries', async (_, dir: string) => {
    const resolvedDir = expandHomePath(dir)
    try {
      const entries = await readdir(resolvedDir, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: join(resolvedDir, entry.name),
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle('read-file', async (_, filePath: string) => {
    try {
      return await readFile(expandHomePath(filePath), 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('write-file', async (_, filePath: string, content: string) => {
    const resolvedPath = expandHomePath(filePath)
    if (!isPathWithin(resolvedPath, claudeDir)) {
      throw new Error('Write access denied: only ~/.claude/ is writable')
    }
    await mkdir(dirname(resolvedPath), { recursive: true })
    await writeFile(resolvedPath, content, 'utf-8')
  })

  ipcMain.handle('read-meta', async (_, projectPath: string) => {
    try {
      const raw = await readFile(metaPath, 'utf-8')
      const all = JSON.parse(raw) as Record<string, unknown>
      const projectMeta = all[projectPath]
      if (projectMeta !== null && typeof projectMeta === 'object' && !Array.isArray(projectMeta)) {
        return projectMeta as Record<string, unknown>
      }
      return {}
    } catch {
      return {}
    }
  })

  ipcMain.handle('save-meta', async (_, projectPath: string, meta: unknown) => {
    let all: Record<string, unknown> = {}
    try {
      const raw = await readFile(metaPath, 'utf-8')
      all = JSON.parse(raw) as Record<string, unknown>
    } catch {
      // new file
    }
    all[projectPath] = meta
    await mkdir(dirname(metaPath), { recursive: true })
    await writeFile(metaPath, JSON.stringify(all, null, 2), 'utf-8')
  })

  ipcMain.handle('read-config', async () => {
    const configPath = join(claudeDir, 'claude-manager-config.json')
    try {
      const raw = await readFile(configPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return {}
    }
  })

  ipcMain.handle('save-config', async (_, config: unknown) => {
    const configPath = join(claudeDir, 'claude-manager-config.json')
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  })

  ipcMain.handle('open-directory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? new BrowserWindow(), {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('open-in-editor', async (_, projectPath: string) => {
    await execAsync(`cursor "${projectPath}"`)
  })

  ipcMain.handle('get-active-projects', async () => {
    const projectsDir = join(claudeDir, 'projects')
    const now = Date.now()
    const activeThresholdMs = 60 * 60 * 1000 // 1 hour
    try {
      const dirs = await readdir(projectsDir, { withFileTypes: true })
      const active: string[] = []
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue
        const subEntries = await readdir(join(projectsDir, dir.name))
        for (const file of subEntries) {
          if (!file.endsWith('.jsonl')) continue
          const fileStat = await stat(join(projectsDir, dir.name, file))
          if (now - fileStat.mtimeMs < activeThresholdMs) {
            // encode: leading '-' represents '/', then '-' -> '/'
            const decoded = '/' + dir.name.slice(1).replace(/-/g, '/')
            active.push(decoded)
            break
          }
        }
      }
      return active
    } catch {
      return []
    }
  })

  ipcMain.handle('get-project-sessions', async (_, projectPath: string) => {
    // encode: /Users/amane/foo -> -Users-amane-foo
    const encoded = projectPath.replace(/^\//, '-').replace(/\//g, '-')
    const projectDir = join(claudeDir, 'projects', encoded)
    try {
      const files = await readdir(projectDir)
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
      const sessions = await Promise.all(
        jsonlFiles.map(async (file) => {
          const filePath = join(projectDir, file)
          const fileStat = await stat(filePath)
          const sessionId = file.replace(/\.jsonl$/, '')

          // Read file to extract first user text and last assistant text
          const raw = await readFile(filePath, 'utf-8')
          const lines = raw.trim().split('\n').filter((l) => l.trim().length > 0)

          let firstUserText: string | null = null
          let lastAssistantText: string | null = null
          let lastUserText: string | null = null

          for (const line of lines) {
            try {
              const entry = JSON.parse(line) as Record<string, unknown>
              if (entry.type === 'user') {
                const msg = entry.message as Record<string, unknown> | undefined
                if (msg?.role === 'user' && Array.isArray(msg.content)) {
                  for (const part of msg.content as Record<string, unknown>[]) {
                    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0) {
                      if (firstUserText === null) firstUserText = part.text.trim()
                      lastUserText = part.text.trim()
                      break
                    }
                  }
                }
              } else if (entry.type === 'assistant') {
                const msg = entry.message as Record<string, unknown> | undefined
                if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
                  for (const part of msg.content as Record<string, unknown>[]) {
                    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0) {
                      lastAssistantText = part.text.trim()
                      break
                    }
                  }
                }
              }
            } catch {
              // skip malformed lines
            }
          }

          return {
            sessionId,
            updatedAt: fileStat.mtimeMs,
            firstUserText,
            lastUserText,
            lastAssistantText,
          }
        }),
      )

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch {
      return []
    }
  })

  ipcMain.handle('get-usage', async () => {
    try {
      const env = { ...process.env }
      delete env.CLAUDECODE
      const { stdout } = await execAsync('claude --print "/usage"', { env })
      return stdout
    } catch {
      return null
    }
  })

  ipcMain.handle('get-home-path', () => {
    return homedir()
  })

  ipcMain.handle('get-tips', async () => {
    return await readTips()
  })

  ipcMain.handle('save-tip', async (_, tip: Tip) => {
    const tips = await readTips()
    const idx = tips.findIndex((t) => t.id === tip.id)
    if (idx >= 0) {
      tips[idx] = { ...tip, updatedAt: Date.now() }
    } else {
      tips.unshift({ ...tip, createdAt: Date.now(), updatedAt: Date.now() })
    }
    await writeTips(tips)
  })

  ipcMain.handle('delete-tip', async (_, tipId: string) => {
    const tips = await readTips()
    await writeTips(tips.filter((t) => t.id !== tipId))
  })

  ipcMain.handle('claude-chat', async (_, projectPath: string, message: string) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    try {
      const { stdout, stderr } = await execAsync(
        `claude --print "${escaped}"`,
        { cwd: projectPath, env, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      )
      return { output: stdout.trim(), error: stderr.trim() || null }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return { output: '', error: msg }
    }
  })
}

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
