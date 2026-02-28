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

type GlobalTab = 'claude' | 'settings'

type SkillFile = {
  path: string
  name: string
  content: string
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

  // Global Settings state
  const [activeGlobalTab, setActiveGlobalTab] = useState<GlobalTab>('claude')
  const [globalClaudeMd, setGlobalClaudeMd] = useState<string | null>(null)
  const [globalSettings, setGlobalSettings] = useState<string | null>(null)
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false)

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

  const loadGlobalFiles = useCallback(async () => {
    setIsLoadingGlobal(true)
    try {
      const [claudeMd, settings] = await Promise.all([
        window.api.readFile(`${CLAUDE_DIR}/CLAUDE.md`),
        window.api.readFile(`${CLAUDE_DIR}/settings.json`),
      ])
      setGlobalClaudeMd(claudeMd)
      setGlobalSettings(settings)
    } catch (error) {
      console.error('[loadGlobalFiles] failed:', error)
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
    void loadGlobalFiles()

    return () => {
      isCancelled = true
    }
  }, [loadProjectsFromPaths, loadGlobalFiles])

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

      if (selectedProjectPath === targetPath) {
        setSelectedProjectPath(null)
      }

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
        if (current !== null && loadedSkills.some((skill) => skill.path === current)) {
          return current
        }
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

  const globalSettingsDisplayText = useMemo(() => {
    if (globalSettings === null) return null
    try {
      return JSON.stringify(JSON.parse(globalSettings) as unknown, null, 2)
    } catch {
      return globalSettings
    }
  }, [globalSettings])

  return (
    <div className="h-screen bg-slate-100 text-slate-900">
      <div className="grid h-full grid-cols-[300px_1fr_320px]">
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
                    rows={4}
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

        {/* Right: Global Settings */}
        <aside className="flex min-h-0 flex-col border-l border-slate-300/70 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Global Settings</h2>

          {/* Add Project */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Add Project</h3>
            <button
              type="button"
              onClick={() => void handleAddPath()}
              disabled={isSavingConfig}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-medium text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-base leading-none">+</span>
              {isSavingConfig ? 'Adding...' : 'Open Directory…'}
            </button>
          </div>

          {/* Global Claude Files */}
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50">
            <div className="border-b border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">~/.claude/</h3>
              <nav className="mt-2 flex gap-1">
                {([
                  { id: 'claude', label: 'CLAUDE.md' },
                  { id: 'settings', label: 'settings.json' },
                ] as const).map((tab) => {
                  const isActive = activeGlobalTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveGlobalTab(tab.id)}
                      className={`rounded px-2 py-1 text-xs font-medium transition ${
                        isActive
                          ? 'bg-sky-100 text-sky-700'
                          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {isLoadingGlobal ? (
                <p className="text-xs text-slate-500">Loading...</p>
              ) : activeGlobalTab === 'claude' ? (
                globalClaudeMd === null ? (
                  <p className="text-xs text-slate-500">~/.claude/CLAUDE.md not found</p>
                ) : (
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                    {globalClaudeMd}
                  </pre>
                )
              ) : globalSettingsDisplayText === null ? (
                <p className="text-xs text-slate-500">~/.claude/settings.json not found</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                  {globalSettingsDisplayText}
                </pre>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
