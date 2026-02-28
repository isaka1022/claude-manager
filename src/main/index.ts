import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

const claudeDir = resolve(join(homedir(), '.claude'))
const metaPath = join(claudeDir, 'claude-manager-meta.json')

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
    const entries = await readdir(resolvedDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => join(resolvedDir, entry.name))
  })

  ipcMain.handle('read-file', async (_, filePath: string) => {
    try {
      return await readFile(filePath, 'utf-8')
    } catch (err) {
      console.error('[read-file] failed:', filePath, err)
      return null
    }
  })

  ipcMain.handle('write-file', async (_, filePath: string, content: string) => {
    if (!isPathWithin(filePath, claudeDir)) {
      throw new Error('Write access denied: only ~/.claude/ is writable')
    }
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
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
