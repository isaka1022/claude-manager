import { contextBridge, ipcRenderer } from 'electron'

type DirEntry = {
  name: string
  isDirectory: boolean
  path: string
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
})
