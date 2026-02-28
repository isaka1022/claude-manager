import { app, BrowserWindow, dialog, ipcMain } from 'electron'
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

  ipcMain.handle('list-dir-entries', async (_, dir: string) => {
    const resolvedDir = expandHomePath(dir)
    const entries = await readdir(resolvedDir, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: join(resolvedDir, entry.name),
    }))
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
