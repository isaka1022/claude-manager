import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  scanProjects: (dir: string) => ipcRenderer.invoke('scan-projects', dir),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readMeta: (projectPath: string) => ipcRenderer.invoke('read-meta', projectPath),
  saveMeta: (projectPath: string, meta: unknown) => ipcRenderer.invoke('save-meta', projectPath, meta),
})

declare global {
  interface Window {
    api: {
      scanProjects: (dir: string) => Promise<string[]>
      readFile: (filePath: string) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<void>
      readMeta: (projectPath: string) => Promise<Record<string, unknown>>
      saveMeta: (projectPath: string, meta: unknown) => Promise<void>
    }
  }
}
