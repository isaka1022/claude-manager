import { contextBridge, ipcRenderer } from 'electron'

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
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  getTips: () => ipcRenderer.invoke('get-tips'),
  saveTip: (tip: unknown) => ipcRenderer.invoke('save-tip', tip),
  deleteTip: (tipId: string) => ipcRenderer.invoke('delete-tip', tipId),
})
