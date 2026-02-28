import { useCallback, useEffect, useMemo, useState } from 'react'

type ProjectStatus = 'active' | 'archived' | 'unknown'

type ProjectMeta = {
  status: ProjectStatus
  memo: string
}

type ProjectListItem = {
  path: string
  name: string
  hasClaudeMd: boolean
  meta: ProjectMeta
}

type DetailTab = 'claude' | 'skills' | 'settings'

type GlobalTab = 'overview' | 'skills' | 'mcp' | 'usage'

type SkillFile = {
  path: string
  name: string
  content: string
}

type McpServer = {
  name: string
  command: string
  args: string[]
}

type DailyActivity = {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

type DailyTokens = {
  date: string
  tokensByModel: Record<string, number>
}

type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

type StatsCache = {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyTokens[]
  modelUsage: Record<string, ModelUsage>
  totalSessions: number
  totalMessages: number
}

type GlobalState = {
  claudeMd: string | null
  rules: { name: string; content: string }[]
  skills: SkillFile[]
  mcpServers: McpServer[]
  stats: StatsCache | null
}

type AppConfig = {
  projectPaths: string[]
}

const CLAUDE_DIR = '~/.claude'

const getProjectName = (projectPath: string): string => {
  const parts = projectPath.split(/[\\/]/).filter((part) => part.length > 0)
  return parts.at(-1) ?? projectPath
}

const toClaudePath = (projectPath: string): string => {
  const normalized = projectPath.replace(/[\\/]+$/, '')
  return `${normalized}/CLAUDE.md`
}

const toSettingsPath = (projectPath: string): string => {
  const normalized = projectPath.replace(/[\\/]+$/, '')
  return `${normalized}/.claude/settings.json`
}

const toSkillsRootPath = (projectPath: string): string => {
  const normalized = projectPath.replace(/[\\/]+$/, '')
  return `${normalized}/.claude/skills`
}

const getRelativePath = (basePath: string, targetPath: string): string => {
  const normalizedBase = basePath.replace(/[\\/]+$/, '')
  if (targetPath.startsWith(`${normalizedBase}/`)) {
    return targetPath.slice(normalizedBase.length + 1)
  }
  if (targetPath.startsWith(`${normalizedBase}\\`)) {
    return targetPath.slice(normalizedBase.length + 1)
  }
  return getProjectName(targetPath)
}

const normalizeMeta = (rawMeta: Record<string, unknown>): ProjectMeta => {
  const status =
    rawMeta.status === 'active' || rawMeta.status === 'archived' || rawMeta.status === 'unknown'
      ? rawMeta.status
      : 'unknown'
  const memo = typeof rawMeta.memo === 'string' ? rawMeta.memo : ''
  return { status, memo }
}

const normalizeConfig = (rawConfig: unknown): AppConfig => {
  if (rawConfig !== null && typeof rawConfig === 'object') {
    const obj = rawConfig as Record<string, unknown>
    if (Array.isArray(obj.projectPaths)) {
      const paths = obj.projectPaths
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
      return { projectPaths: Array.from(new Set(paths)) }
    }
  }
  return { projectPaths: [] }
}

const parseMcpServers = (raw: string | null): McpServer[] => {
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'mcpServers' in parsed &&
      typeof (parsed as Record<string, unknown>).mcpServers === 'object'
    ) {
      const servers = (parsed as { mcpServers: Record<string, unknown> }).mcpServers
      return Object.entries(servers).map(([name, cfg]) => {
        const c = cfg as Record<string, unknown>
        return {
          name,
          command: typeof c.command === 'string' ? c.command : '',
          args: Array.isArray(c.args)
            ? c.args.filter((a): a is string => typeof a === 'string')
            : [],
        }
      })
    }
    return []
  } catch {
    return []
  }
}

const parseStatsCache = (raw: string | null): StatsCache | null => {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    return {
      dailyActivity: Array.isArray(obj.dailyActivity)
        ? (obj.dailyActivity as DailyActivity[])
        : [],
      dailyModelTokens: Array.isArray(obj.dailyModelTokens)
        ? (obj.dailyModelTokens as DailyTokens[])
        : [],
      modelUsage:
        obj.modelUsage !== null && typeof obj.modelUsage === 'object'
          ? (obj.modelUsage as Record<string, ModelUsage>)
          : {},
      totalSessions: typeof obj.totalSessions === 'number' ? obj.totalSessions : 0,
      totalMessages: typeof obj.totalMessages === 'number' ? obj.totalMessages : 0,
    }
  } catch {
    return null
  }
}

// Extract first-level headings as section names from markdown
const extractSections = (md: string): string[] => {
  return md
    .split('\n')
    .filter((line) => /^#{1,2}\s/.test(line))
    .map((line) => line.replace(/^#{1,2}\s+/, '').trim())
}

const UsagePanel = ({ stats }: { stats: StatsCache | null }) => {
  if (stats === null) {
    return <p className="p-4 text-xs text-slate-500">~/.claude/stats-cache.json not found</p>
  }

  // Last 14 days of daily activity
  const recent = [...stats.dailyActivity].sort((a, b) => a.date.localeCompare(b.date)).slice(-14)
  const maxMessages = Math.max(...recent.map((d) => d.messageCount), 1)

  // Total tokens per model (all-time)
  const modelEntries = Object.entries(stats.modelUsage)

  // Today's activity
  const today = new Date().toISOString().slice(0, 10)
  const todayActivity = stats.dailyActivity.find((d) => d.date === today)

  // This month's messages
  const thisMonth = today.slice(0, 7)
  const monthMessages = stats.dailyActivity
    .filter((d) => d.date.startsWith(thisMonth))
    .reduce((sum, d) => sum + d.messageCount, 0)

  return (
    <div className="space-y-3 p-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-medium text-slate-500">Today messages</p>
          <p className="mt-0.5 text-xl font-bold text-slate-800">
            {todayActivity?.messageCount.toLocaleString() ?? '0'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-medium text-slate-500">This month</p>
          <p className="mt-0.5 text-xl font-bold text-slate-800">
            {monthMessages.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-medium text-slate-500">Total sessions</p>
          <p className="mt-0.5 text-xl font-bold text-slate-800">
            {stats.totalSessions.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-medium text-slate-500">Total messages</p>
          <p className="mt-0.5 text-xl font-bold text-slate-800">
            {stats.totalMessages.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Daily activity bar chart */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-[10px] font-semibold text-slate-600">Messages / day (last 14 days)</p>
        <div className="flex h-20 items-end gap-0.5">
          {recent.map((day) => {
            const heightPct = Math.max((day.messageCount / maxMessages) * 100, 2)
            const label = day.date.slice(5) // MM-DD
            return (
              <div
                key={day.date}
                className="group relative flex flex-1 flex-col items-center justify-end"
                title={`${day.date}: ${day.messageCount.toLocaleString()} messages`}
              >
                <div
                  className="w-full rounded-t bg-sky-400 transition-all group-hover:bg-sky-500"
                  style={{ height: `${heightPct}%` }}
                />
                {recent.length <= 7 ? (
                  <span className="mt-0.5 text-[9px] text-slate-400">{label}</span>
                ) : null}
              </div>
            )
          })}
        </div>
        {recent.length > 7 ? (
          <div className="mt-1 flex justify-between text-[9px] text-slate-400">
            <span>{recent[0]?.date.slice(5)}</span>
            <span>{recent.at(-1)?.date.slice(5)}</span>
          </div>
        ) : null}
      </div>

      {/* Model usage */}
      {modelEntries.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-semibold text-slate-600">Model usage (all-time tokens)</p>
          <div className="space-y-2">
            {modelEntries.map(([model, usage]) => {
              const total = usage.inputTokens + usage.outputTokens
              const shortName = model.replace('claude-', '').replace(/-\d{8}$/, '')
              return (
                <div key={model}>
                  <div className="mb-0.5 flex items-baseline justify-between">
                    <span className="text-[11px] font-medium text-slate-700">{shortName}</span>
                    <span className="text-[10px] text-slate-500">
                      {(total / 1000).toFixed(1)}k tokens
                    </span>
                  </div>
                  <div className="flex gap-px overflow-hidden rounded text-[9px]">
                    <div
                      className="bg-sky-400 px-1 py-0.5 text-white"
                      style={{
                        width: `${total > 0 ? (usage.inputTokens / total) * 100 : 50}%`,
                        minWidth: usage.inputTokens > 0 ? '1rem' : 0,
                      }}
                      title={`input: ${usage.inputTokens.toLocaleString()}`}
                    >
                      in
                    </div>
                    <div
                      className="bg-violet-400 px-1 py-0.5 text-white"
                      style={{
                        width: `${total > 0 ? (usage.outputTokens / total) * 100 : 50}%`,
                        minWidth: usage.outputTokens > 0 ? '1rem' : 0,
                      }}
                      title={`output: ${usage.outputTokens.toLocaleString()}`}
                    >
                      out
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const statusLabel: Record<ProjectStatus, string> = {
  active: 'active',
  archived: 'archived',
  unknown: 'unknown',
}

const statusBadgeClass: Record<ProjectStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-200 text-slate-600',
  unknown: 'bg-amber-100 text-amber-700',
}

const App = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [projectPaths, setProjectPaths] = useState<string[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isSavingMeta, setIsSavingMeta] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('claude')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [claudeMdContent, setClaudeMdContent] = useState<string | null>(null)
  const [settingsContent, setSettingsContent] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([])
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null)

  // Global state
  const [activeGlobalTab, setActiveGlobalTab] = useState<GlobalTab>('overview')
  const [globalState, setGlobalState] = useState<GlobalState>({
    claudeMd: null,
    rules: [],
    skills: [],
    mcpServers: [],
    stats: null,
  })
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false)
  const [selectedGlobalSkillPath, setSelectedGlobalSkillPath] = useState<string | null>(null)

  const loadProjectsFromPaths = useCallback(async (paths: string[]) => {
    setIsLoadingProjects(true)
    setErrorMessage(null)
    try {
      const loadedProjects = await Promise.all(
        paths.map(async (projectPath) => {
          const claudePath = toClaudePath(projectPath)
          const [claudeMd, rawMeta] = await Promise.all([
            window.api.readFile(claudePath),
            window.api.readMeta(projectPath),
          ])
          return {
            path: projectPath,
            name: getProjectName(projectPath),
            hasClaudeMd: claudeMd !== null,
            meta: normalizeMeta(rawMeta),
          } satisfies ProjectListItem
        }),
      )
      loadedProjects.sort((left, right) => left.name.localeCompare(right.name))
      setProjects(loadedProjects)
      setSelectedProjectPath((current) => {
        if (current !== null && loadedProjects.some((project) => project.path === current)) {
          return current
        }
        return loadedProjects[0]?.path ?? null
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load projects.')
      setProjects([])
      setSelectedProjectPath(null)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  const loadGlobalState = useCallback(async () => {
    setIsLoadingGlobal(true)
    try {
      const rulesDir = `${CLAUDE_DIR}/rules`
      const skillsDir = `${CLAUDE_DIR}/skills`

      const [claudeMd, mcpRaw, statsCacheRaw, ruleEntries, skillEntries] = await Promise.all([
        window.api.readFile(`${CLAUDE_DIR}/CLAUDE.md`),
        window.api.readFile(`${CLAUDE_DIR}/mcp.json`),
        window.api.readFile(`${CLAUDE_DIR}/stats-cache.json`),
        window.api.listDirEntries(rulesDir).catch(() => []),
        window.api.listDirEntries(skillsDir).catch(() => []),
      ])

      // Load rules files
      const ruleFiles = ruleEntries.filter(
        (e) => !e.isDirectory && e.name.endsWith('.md'),
      )
      const rules = await Promise.all(
        ruleFiles.map(async (entry) => {
          const content = await window.api.readFile(entry.path)
          return { name: entry.name.replace(/\.md$/, ''), content: content ?? '' }
        }),
      )

      // Load global skills (each skill is a subdirectory)
      const skillDirs = skillEntries.filter((e) => e.isDirectory)
      const skills: SkillFile[] = []
      for (const dir of skillDirs) {
        const subEntries = await window.api.listDirEntries(dir.path).catch(() => [])
        for (const sub of subEntries) {
          if (!sub.isDirectory && sub.name.endsWith('.md')) {
            const content = await window.api.readFile(sub.path)
            if (content !== null) {
              skills.push({
                path: sub.path,
                name: `${dir.name}/${sub.name}`,
                content,
              })
            }
          }
        }
      }
      skills.sort((a, b) => a.name.localeCompare(b.name))

      setGlobalState({
        claudeMd,
        rules: rules.sort((a, b) => a.name.localeCompare(b.name)),
        skills,
        mcpServers: parseMcpServers(mcpRaw),
        stats: parseStatsCache(statsCacheRaw),
      })
      setSelectedGlobalSkillPath(skills[0]?.path ?? null)
    } catch (error) {
      console.error('[loadGlobalState] failed:', error)
    } finally {
      setIsLoadingGlobal(false)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const initialize = async () => {
      try {
        const rawConfig = await window.api.readConfig()
        const config = normalizeConfig(rawConfig)
        if (isCancelled) return
        setProjectPaths(config.projectPaths)
        await loadProjectsFromPaths(config.projectPaths)
      } catch (error) {
        if (isCancelled) return
        console.error('[readConfig] failed:', error)
        setProjectPaths([])
        await loadProjectsFromPaths([])
      }
    }

    void initialize()
    void loadGlobalState()

    return () => {
      isCancelled = true
    }
  }, [loadProjectsFromPaths, loadGlobalState])

  const filteredProjects = useMemo(() => {
    const query = nameFilter.trim().toLowerCase()
    if (query.length === 0) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [nameFilter, projects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.path === selectedProjectPath) ?? null,
    [projects, selectedProjectPath],
  )

  const handleMetaChange = useCallback(
    (nextMeta: Partial<ProjectMeta>) => {
      if (selectedProjectPath === null) return
      setProjects((current) =>
        current.map((project) =>
          project.path === selectedProjectPath
            ? { ...project, meta: { ...project.meta, ...nextMeta } }
            : project,
        ),
      )
    },
    [selectedProjectPath],
  )

  const handleSaveMeta = useCallback(async () => {
    if (selectedProject === null) return
    setIsSavingMeta(true)
    try {
      await window.api.saveMeta(selectedProject.path, selectedProject.meta)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save project meta.')
    } finally {
      setIsSavingMeta(false)
    }
  }, [selectedProject])

  const handleAddPath = useCallback(async () => {
    const picked = await window.api.openDirectory()
    if (picked === null) return

    const nextPaths = projectPaths.includes(picked) ? projectPaths : [...projectPaths, picked]
    setProjectPaths(nextPaths)

    setIsSavingConfig(true)
    setErrorMessage(null)
    try {
      await window.api.saveConfig({ projectPaths: nextPaths } satisfies AppConfig)
      await loadProjectsFromPaths(nextPaths)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save config.')
    } finally {
      setIsSavingConfig(false)
    }
  }, [projectPaths, loadProjectsFromPaths])

  const handleRemovePath = useCallback(
    async (targetPath: string) => {
      const nextPaths = projectPaths.filter((p) => p !== targetPath)
      setProjectPaths(nextPaths)
      if (selectedProjectPath === targetPath) setSelectedProjectPath(null)

      setIsSavingConfig(true)
      setErrorMessage(null)
      try {
        await window.api.saveConfig({ projectPaths: nextPaths } satisfies AppConfig)
        await loadProjectsFromPaths(nextPaths)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save config.')
      } finally {
        setIsSavingConfig(false)
      }
    },
    [projectPaths, selectedProjectPath, loadProjectsFromPaths],
  )

  useEffect(() => {
    let isCancelled = false

    const loadProjectDetail = async () => {
      if (selectedProjectPath === null) {
        setIsLoadingDetail(false)
        setClaudeMdContent(null)
        setSettingsContent(null)
        setSkillFiles([])
        setSelectedSkillPath(null)
        return
      }

      setIsLoadingDetail(true)

      const projectPath = selectedProjectPath
      const skillsRootPath = toSkillsRootPath(projectPath)

      const [claudeResult, settingsResult, loadedSkills] = await Promise.all([
        window.api.readFile(toClaudePath(projectPath)),
        window.api.readFile(toSettingsPath(projectPath)),
        (async () => {
          try {
            const scannedPaths = await window.api.scanProjects(skillsRootPath)
            const skills = await Promise.all(
              Array.from(new Set(scannedPaths)).map(async (candidatePath) => {
                const directContent = await window.api.readFile(candidatePath)
                if (directContent !== null) {
                  return {
                    path: candidatePath,
                    name: getRelativePath(skillsRootPath, candidatePath),
                    content: directContent,
                  } satisfies SkillFile
                }
                const indexPath = `${candidatePath.replace(/[\\/]+$/, '')}/SKILL.md`
                const indexContent = await window.api.readFile(indexPath)
                if (indexContent !== null) {
                  return {
                    path: indexPath,
                    name: getRelativePath(skillsRootPath, indexPath),
                    content: indexContent,
                  } satisfies SkillFile
                }
                return null
              }),
            )
            return skills
              .filter((skill): skill is SkillFile => skill !== null)
              .sort((left, right) => left.name.localeCompare(right.name))
          } catch {
            return []
          }
        })(),
      ])

      if (isCancelled) return

      setClaudeMdContent(claudeResult)
      setSettingsContent(settingsResult)
      setSkillFiles(loadedSkills)
      setSelectedSkillPath((current) => {
        if (current !== null && loadedSkills.some((skill) => skill.path === current)) return current
        return loadedSkills[0]?.path ?? null
      })
      setIsLoadingDetail(false)
    }

    void loadProjectDetail()
    return () => {
      isCancelled = true
    }
  }, [selectedProjectPath])

  const selectedSkillFile = useMemo(
    () => skillFiles.find((skill) => skill.path === selectedSkillPath) ?? null,
    [selectedSkillPath, skillFiles],
  )

  const settingsDisplayText = useMemo(() => {
    if (settingsContent === null) return null
    try {
      return JSON.stringify(JSON.parse(settingsContent) as unknown, null, 2)
    } catch {
      return settingsContent
    }
  }, [settingsContent])

  const selectedGlobalSkill = useMemo(
    () => globalState.skills.find((s) => s.path === selectedGlobalSkillPath) ?? null,
    [globalState.skills, selectedGlobalSkillPath],
  )

  return (
    <div className="h-screen bg-slate-100 text-slate-900">
      <div className="grid h-full grid-cols-[300px_1fr_340px]">
        {/* Left: Project List */}
        <aside className="flex min-h-0 flex-col border-r border-slate-300/80 bg-gradient-to-b from-slate-100 to-slate-200/60 p-3 backdrop-blur-sm">
          <h1 className="mb-3 text-lg font-semibold tracking-tight">Projects</h1>

          <input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Search projects"
            className="mb-3 rounded-md border border-slate-300 bg-white/80 px-3 py-2 text-sm shadow-sm outline-none ring-sky-400/50 transition focus:ring-2"
          />

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-300/70 bg-white/70 p-1">
            {isLoadingProjects ? (
              <p className="p-3 text-sm text-slate-500">Loading projects...</p>
            ) : filteredProjects.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">
                {projectPaths.length === 0
                  ? 'Add a project directory to get started.'
                  : 'No projects found.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {filteredProjects.map((project) => {
                  const isSelected = project.path === selectedProjectPath
                  return (
                    <li key={project.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectPath(project.path)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${
                          isSelected
                            ? 'border-sky-300 bg-sky-100/70 shadow-sm'
                            : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{project.name}</span>
                          {project.hasClaudeMd ? (
                            <span
                              className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                              title="CLAUDE.md found"
                            >
                              CLAUDE
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass[project.meta.status]}`}
                          >
                            {statusLabel[project.meta.status]}
                          </span>
                          <span className="truncate text-[11px] text-slate-500">{project.path}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Project Meta Editor */}
          <div className="mt-3 rounded-lg border border-slate-300/70 bg-white/80 p-3">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Selected Project</h2>
            {selectedProject === null ? (
              <p className="text-xs text-slate-500">Select a project to edit status and memo.</p>
            ) : (
              <div className="space-y-2">
                <p className="truncate text-xs text-slate-600">{selectedProject.path}</p>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <span className="w-12 shrink-0">Status</span>
                  <select
                    value={selectedProject.meta.status}
                    onChange={(event) =>
                      handleMetaChange({ status: event.target.value as ProjectStatus })
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
                  >
                    <option value="unknown">unknown</option>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-700">
                  Memo
                  <textarea
                    value={selectedProject.meta.memo}
                    onChange={(event) => handleMetaChange({ memo: event.target.value })}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
                    placeholder="Write project memo..."
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveMeta()}
                    disabled={isSavingMeta}
                    className="flex-1 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                  >
                    {isSavingMeta ? 'Saving...' : 'Save Meta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemovePath(selectedProject.path)}
                    disabled={isSavingConfig}
                    className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>

          {errorMessage !== null ? (
            <p className="mt-2 rounded-md bg-rose-100 px-2 py-1 text-xs text-rose-700">{errorMessage}</p>
          ) : null}
        </aside>

        {/* Center: Project Detail */}
        <main className="flex min-h-0 flex-col border-r border-slate-300 bg-slate-50 p-6">
          {selectedProjectPath === null ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
              <p className="text-base font-medium text-slate-500">Select a project</p>
            </div>
          ) : (
            <>
              <header className="mb-4">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
                  {getProjectName(selectedProjectPath)}
                </h2>
                <p className="mt-1 truncate text-xs text-slate-500">{selectedProjectPath}</p>
              </header>

              <nav className="mb-4 flex items-center gap-2 border-b border-slate-300 pb-2">
                {([
                  { id: 'claude', label: 'CLAUDE.md' },
                  { id: 'skills', label: 'Skills' },
                  { id: 'settings', label: 'Settings' },
                ] as const).map((tab) => {
                  const isActive = activeDetailTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveDetailTab(tab.id)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        isActive
                          ? 'bg-sky-100 text-sky-700 underline decoration-2 underline-offset-4'
                          : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </nav>

              <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white/70 p-4">
                {isLoadingDetail ? (
                  <p className="text-sm text-slate-500">Loading project detail...</p>
                ) : activeDetailTab === 'claude' ? (
                  claudeMdContent === null ? (
                    <p className="text-sm text-slate-500">No CLAUDE.md found</p>
                  ) : (
                    <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-4 font-mono text-xs text-slate-100">
                      {claudeMdContent}
                    </pre>
                  )
                ) : activeDetailTab === 'skills' ? (
                  skillFiles.length === 0 ? (
                    <p className="text-sm text-slate-500">No skills found</p>
                  ) : (
                    <div className="grid h-full min-h-0 grid-cols-[260px_1fr] gap-3">
                      <ul className="min-h-0 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                        {skillFiles.map((skill) => {
                          const isSelected = selectedSkillPath === skill.path
                          return (
                            <li key={skill.path}>
                              <button
                                type="button"
                                onClick={() => setSelectedSkillPath(skill.path)}
                                className={`w-full truncate rounded px-2 py-1.5 text-left text-xs transition ${
                                  isSelected
                                    ? 'bg-sky-100 font-medium text-sky-800'
                                    : 'text-slate-700 hover:bg-slate-100'
                                }`}
                                title={skill.path}
                              >
                                {skill.name}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="min-h-0 overflow-auto rounded-md bg-slate-900 p-4">
                        {selectedSkillFile === null ? (
                          <p className="text-xs text-slate-300">Select a skill file</p>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-100">
                            {selectedSkillFile.content}
                          </pre>
                        )}
                      </div>
                    </div>
                  )
                ) : settingsDisplayText === null ? (
                  <p className="text-sm text-slate-500">No settings.json found</p>
                ) : (
                  <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-4 font-mono text-xs text-slate-100">
                    {settingsDisplayText}
                  </pre>
                )}
              </section>
            </>
          )}
        </main>

        {/* Right: Global Claude State */}
        <aside className="flex min-h-0 flex-col border-l border-slate-300/70 bg-white">
          {/* Header + Add Project */}
          <div className="border-b border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Global / ~/.claude</h2>
              <button
                type="button"
                onClick={() => void loadGlobalState()}
                disabled={isLoadingGlobal}
                className="rounded px-2 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                title="Reload"
              >
                ↺
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleAddPath()}
              disabled={isSavingConfig}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm leading-none">+</span>
              {isSavingConfig ? 'Adding...' : 'Open Directory…'}
            </button>
          </div>

          {/* Tabs */}
          <nav className="flex border-b border-slate-200 px-3">
            {([
              { id: 'overview', label: 'Overview' },
              { id: 'skills', label: 'Skills' },
              { id: 'mcp', label: 'MCP' },
              { id: 'usage', label: 'Usage' },
            ] as const).map((tab) => {
              const isActive = activeGlobalTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveGlobalTab(tab.id)}
                  className={`border-b-2 px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? 'border-sky-500 text-sky-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'skills' && globalState.skills.length > 0 ? (
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {globalState.skills.length}
                    </span>
                  ) : null}
                  {tab.id === 'mcp' && globalState.mcpServers.length > 0 ? (
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {globalState.mcpServers.length}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          {/* Tab Content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {isLoadingGlobal ? (
              <p className="p-4 text-xs text-slate-500">Loading...</p>
            ) : activeGlobalTab === 'overview' ? (
              <div className="space-y-3 p-3">
                {/* CLAUDE.md summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-700">CLAUDE.md</span>
                    {globalState.claudeMd !== null ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        found
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        not found
                      </span>
                    )}
                  </div>
                  {globalState.claudeMd !== null ? (
                    <ul className="divide-y divide-slate-100">
                      {extractSections(globalState.claudeMd).map((section) => (
                        <li key={section} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="text-slate-400">§</span>
                          <span className="text-xs text-slate-700">{section}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-500">~/.claude/CLAUDE.md not found</p>
                  )}
                </div>

                {/* rules/ */}
                <div className="rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-700">rules/</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                      {globalState.rules.length} files
                    </span>
                  </div>
                  {globalState.rules.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">No rule files found</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {globalState.rules.map((rule) => (
                        <li key={rule.name} className="px-3 py-2">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-medium text-indigo-700">
                              {rule.name}.md
                            </span>
                          </div>
                          <ul className="space-y-0.5">
                            {extractSections(rule.content).map((section) => (
                              <li key={section} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                <span className="text-slate-400">·</span>
                                {section}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : activeGlobalTab === 'skills' ? (
              globalState.skills.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">No global skills found in ~/.claude/skills/</p>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <ul className="border-b border-slate-200">
                    {globalState.skills.map((skill) => {
                      const isSelected = selectedGlobalSkillPath === skill.path
                      return (
                        <li key={skill.path}>
                          <button
                            type="button"
                            onClick={() => setSelectedGlobalSkillPath(skill.path)}
                            className={`w-full truncate border-b border-slate-100 px-3 py-2 text-left text-xs transition last:border-b-0 ${
                              isSelected
                                ? 'bg-sky-50 font-medium text-sky-800'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                            title={skill.path}
                          >
                            {skill.name}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3">
                    {selectedGlobalSkill === null ? (
                      <p className="text-xs text-slate-400">Select a skill</p>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-100">
                        {selectedGlobalSkill.content}
                      </pre>
                    )}
                  </div>
                </div>
              )
            ) : activeGlobalTab === 'mcp' ? (
              // MCP tab
              <div className="space-y-2 p-3">
                {globalState.mcpServers.length === 0 ? (
                  <p className="text-xs text-slate-500">No MCP servers found in ~/.claude/mcp.json</p>
                ) : (
                  globalState.mcpServers.map((server) => (
                    <div
                      key={server.name}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-semibold text-slate-800">{server.name}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="w-14 shrink-0 text-[10px] font-medium text-slate-500">command</span>
                          <code className="font-mono text-[11px] text-slate-700">{server.command}</code>
                        </div>
                        {server.args.length > 0 ? (
                          <div className="flex items-baseline gap-2">
                            <span className="w-14 shrink-0 text-[10px] font-medium text-slate-500">args</span>
                            <code className="break-all font-mono text-[11px] text-slate-600">
                              {server.args.join(' ')}
                            </code>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              // Usage tab
              <UsagePanel stats={globalState.stats} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
