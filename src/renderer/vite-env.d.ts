/// <reference types="vite/client" />

type DirEntry = {
  name: string
  isDirectory: boolean
  path: string
}

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

declare interface Window {
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
    getHomePath: () => Promise<string>
    getTips: () => Promise<Tip[]>
    saveTip: (tip: Tip) => Promise<void>
    deleteTip: (tipId: string) => Promise<void>
  }
}

type ProjectSession = {
  sessionId: string
  updatedAt: number
  firstUserText: string | null
  lastUserText: string | null
  lastAssistantText: string | null
}
