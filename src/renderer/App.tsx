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

type SkillFile = {
  path: string
  name: string
  content: string
}

const PROJECTS_ROOT = '~/projects'

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
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isSavingMeta, setIsSavingMeta] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('claude')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [claudeMdContent, setClaudeMdContent] = useState<string | null>(null)
  const [settingsContent, setSettingsContent] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([])
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    setErrorMessage(null)
    try {
      const projectPaths = await window.api.scanProjects(PROJECTS_ROOT)
      console.log('[scanProjects] first 3:', projectPaths.slice(0, 3))
      const loadedProjects = await Promise.all(
        projectPaths.map(async (projectPath) => {
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

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const filteredProjects = useMemo(() => {
    const query = nameFilter.trim().toLowerCase()
    if (query.length === 0) {
      return projects
    }
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [nameFilter, projects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.path === selectedProjectPath) ?? null,
    [projects, selectedProjectPath],
  )

  const handleMetaChange = useCallback(
    (nextMeta: Partial<ProjectMeta>) => {
      if (selectedProjectPath === null) {
        return
      }
      setProjects((current) =>
        current.map((project) =>
          project.path === selectedProjectPath
            ? {
                ...project,
                meta: {
                  ...project.meta,
                  ...nextMeta,
                },
              }
            : project,
        ),
      )
    },
    [selectedProjectPath],
  )

  const handleSaveMeta = useCallback(async () => {
    if (selectedProject === null) {
      return
    }
    setIsSavingMeta(true)
    try {
      await window.api.saveMeta(selectedProject.path, selectedProject.meta)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save project meta.')
    } finally {
      setIsSavingMeta(false)
    }
  }, [selectedProject])

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

      const claudeFilePath = toClaudePath(projectPath)
      console.log('[loadProjectDetail] projectPath:', projectPath)
      console.log('[loadProjectDetail] claudeFilePath:', claudeFilePath)
      const [claudeResult, settingsResult, loadedSkills] = await Promise.all([
        window.api.readFile(claudeFilePath),
        window.api.readFile(toSettingsPath(projectPath)),
        (async () => {
          try {
            const scannedPaths = await window.api.scanProjects(skillsRootPath)
            const skillCandidates = Array.from(new Set(scannedPaths))
            const skills = await Promise.all(
              skillCandidates.map(async (candidatePath) => {
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

      if (isCancelled) {
        return
      }

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
    if (settingsContent === null) {
      return null
    }
    try {
      const parsed = JSON.parse(settingsContent) as unknown
      return JSON.stringify(parsed, null, 2)
    } catch {
      return settingsContent
    }
  }, [settingsContent])

  return (
    <div className="h-screen bg-slate-100 text-slate-900">
      <div className="grid h-full grid-cols-[320px_1fr_320px]">
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
              <p className="p-3 text-sm text-slate-500">No projects found.</p>
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
                      handleMetaChange({
                        status: event.target.value as ProjectStatus,
                      })
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
                    onChange={(event) =>
                      handleMetaChange({
                        memo: event.target.value,
                      })
                    }
                    rows={4}
                    className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
                    placeholder="Write project memo..."
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSaveMeta()}
                  disabled={isSavingMeta}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
                >
                  {isSavingMeta ? 'Saving...' : 'Save Meta'}
                </button>
              </div>
            )}
          </div>

          {errorMessage !== null ? (
            <p className="mt-2 rounded-md bg-rose-100 px-2 py-1 text-xs text-rose-700">{errorMessage}</p>
          ) : null}
        </aside>

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

        <aside className="bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Global Settings</h2>
          <p className="text-sm text-slate-600">グローバル設定（SG3で実装）</p>
        </aside>
      </div>
    </div>
  )
}

export default App
