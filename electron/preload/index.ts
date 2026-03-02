import { contextBridge, ipcRenderer } from 'electron'

type DirEntry = {
  name: string
  isDirectory: boolean
  path: string
}

type ProjectSession = {
  sessionId: string
  updatedAt: number
  firstUserText: string | null
  lastUserText: string | null
  lastAssistantText: string | null
}

contextBridge.exposeInMainWorld('api', {
  scanProjects: (dir: string) => ipcRenderer.invoke('scan-projects', dir),
  listDirEntries: (dir: string) => ipcRenderer.invoke('list-dir-entries', dir),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readMeta: (projectPath: string) => ipcRenderer.invoke('read-meta', projectPath),
  saveMeta: (projectPath: string, meta: unknown) => ipcRenderer.invoke('save-meta', projectPath, meta),
  readConfig: () => ipcRenderer.invoke('read-config'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('save-config', config),
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  openInEditor: (projectPath: string) => ipcRenderer.invoke('open-in-editor', projectPath),
  getActiveProjects: () => ipcRenderer.invoke('get-active-projects'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getProjectSessions: (projectPath: string) => ipcRenderer.invoke('get-project-sessions', projectPath),
  claudeChat: (projectPath: string, message: string) => ipcRenderer.invoke('claude-chat', projectPath, message),
})

declare global {
  interface Window {
    api: {
      scanProjects: (dir: string) => Promise<string[]>
      listDirEntries: (dir: string) => Promise<DirEntry[]>
      readFile: (filePath: string) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<void>
      readMeta: (projectPath: string) => Promise<Record<string, unknown>>
      saveMeta: (projectPath: string, meta: unknown) => Promise<void>
      readConfig: () => Promise<unknown>
      saveConfig: (config: unknown) => Promise<void>
      openDirectory: () => Promise<string | null>
      openInEditor: (projectPath: string) => Promise<void>
      getActiveProjects: () => Promise<string[]>
      getUsage: () => Promise<string | null>
      getProjectSessions: (projectPath: string) => Promise<ProjectSession[]>
      claudeChat: (projectPath: string, message: string) => Promise<{ output: string; error: string | null }>
    }
  }
}
