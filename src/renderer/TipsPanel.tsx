import { useCallback, useMemo, useState } from 'react'

type EvaluatedTip = {
  title: string
  content: string
  tags: string[]
  targetType: TipTargetType
  reason: string
}

type TipsPanelProps = {
  tips: Tip[]
  projects: { path: string; name: string }[]
  onSaveTip: (tip: Tip) => Promise<void>
  onDeleteTip: (tipId: string) => Promise<void>
  onPromoteFile: (filePath: string, content: string) => Promise<void>
  onReadFile: (filePath: string) => Promise<string | null>
  onEvaluate: (input: string) => Promise<string>
}

const TIP_STATUSES: TipStatus[] = ['inbox', 'trying', 'accepted', 'promoted', 'rejected']

const slugify = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

const relativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

const formatPromoteContent = (tip: Tip, targetType: string): string => {
  if (targetType === 'skill') {
    return [
      '---',
      `name: ${slugify(tip.title)}`,
      `description: "${tip.title}"`,
      'license: "MIT"',
      '---',
      '',
      `# ${tip.title}`,
      '',
      tip.content,
    ].join('\n')
  }
  if (targetType === 'claude-md') {
    return `\n\n## ${tip.title}\n\n${tip.content}\n`
  }
  if (targetType === 'permission') {
    return tip.content.trim()
  }
  // rule (default)
  return `# ${tip.title}\n\n${tip.content}`
}

const getPromotePath = (tip: Tip, targetType: string, category: string): string => {
  const slug = slugify(tip.title) || 'untitled'
  switch (targetType) {
    case 'rule': return `~/.claude/rules/${slug}.md`
    case 'skill': return `~/.claude/skills/${category || 'tips'}/${slug}.md`
    case 'claude-md': return '~/.claude/CLAUDE.md'
    case 'permission': return '~/.claude/settings.json'
    default: return `~/.claude/rules/${slug}.md`
  }
}

const parseEvaluateResponse = (raw: string): EvaluatedTip[] => {
  try {
    // Extract JSON array from response (may have surrounding text)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (jsonMatch === null) return []
    const parsed = JSON.parse(jsonMatch[0]) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item) => ({
        title: typeof item.title === 'string' ? item.title : '',
        content: typeof item.content === 'string' ? item.content : '',
        tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
        targetType: (['rule', 'skill', 'claude-md', 'permission', 'none'] as TipTargetType[]).includes(item.targetType as TipTargetType)
          ? (item.targetType as TipTargetType) : 'none',
        reason: typeof item.reason === 'string' ? item.reason : '',
      }))
      .filter((tip) => tip.title.length > 0)
  } catch {
    return []
  }
}

const TipsPanel = ({ tips, projects, onSaveTip, onDeleteTip, onPromoteFile, onReadFile, onEvaluate }: TipsPanelProps) => {
  const [filter, setFilter] = useState<TipStatus>('inbox')
  const [isAdding, setIsAdding] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formSource, setFormSource] = useState('manual')
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null)
  // Try form state
  const [tryProject, setTryProject] = useState<string>('')
  const [tryTargetType, setTryTargetType] = useState<TipTargetType>('none')
  // Promote form state
  const [promoteTarget, setPromoteTarget] = useState<string>('rule')
  const [promoteCategory, setPromoteCategory] = useState('')
  const [isPromoting, setIsPromoting] = useState(false)
  // Evaluate state
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [showEvaluate, setShowEvaluate] = useState(false)
  const [evalInput, setEvalInput] = useState('')
  const [evalResults, setEvalResults] = useState<EvaluatedTip[]>([])
  const [evalError, setEvalError] = useState<string | null>(null)

  const filteredTips = useMemo(
    () => tips.filter((t) => t.status === filter),
    [tips, filter],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<TipStatus, number> = { inbox: 0, trying: 0, accepted: 0, promoted: 0, rejected: 0 }
    for (const t of tips) counts[t.status]++
    return counts
  }, [tips])

  const handleAddTip = useCallback(async () => {
    if (formTitle.trim().length === 0) return
    const newTip: Tip = {
      id: crypto.randomUUID(),
      title: formTitle.trim(),
      content: formContent.trim(),
      tags: formTags.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      status: 'inbox',
      targetType: 'none',
      trialProjectPath: null,
      promotedPath: null,
      source: formSource.trim() || 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await onSaveTip(newTip)
    setFormTitle('')
    setFormContent('')
    setFormTags('')
    setFormSource('manual')
    setIsAdding(false)
  }, [formTitle, formContent, formTags, formSource, onSaveTip])

  const handleStatusChange = useCallback(async (tip: Tip, newStatus: TipStatus) => {
    await onSaveTip({ ...tip, status: newStatus, updatedAt: Date.now() })
  }, [onSaveTip])

  const handleStartTrial = useCallback(async (tip: Tip) => {
    await onSaveTip({
      ...tip,
      status: 'trying',
      trialProjectPath: tryProject || null,
      targetType: tryTargetType,
      updatedAt: Date.now(),
    })
    setExpandedTipId(null)
  }, [onSaveTip, tryProject, tryTargetType])

  const handlePromote = useCallback(async (tip: Tip) => {
    setIsPromoting(true)
    try {
      const path = getPromotePath(tip, promoteTarget, promoteCategory)
      if (promoteTarget === 'claude-md') {
        const existing = await onReadFile(path) ?? ''
        const appendContent = formatPromoteContent(tip, promoteTarget)
        await onPromoteFile(path, existing + appendContent)
      } else if (promoteTarget === 'permission') {
        const raw = await onReadFile('~/.claude/settings.json')
        const settings = raw ? JSON.parse(raw) as Record<string, unknown> : {}
        const perms = (settings.permissions ?? {}) as Record<string, unknown>
        const allow = Array.isArray(perms.allow) ? [...perms.allow] : []
        const permValue = tip.content.trim()
        if (!allow.includes(permValue)) allow.push(permValue)
        settings.permissions = { ...perms, allow }
        await onPromoteFile('~/.claude/settings.json', JSON.stringify(settings, null, 2))
      } else {
        const content = formatPromoteContent(tip, promoteTarget)
        await onPromoteFile(path, content)
      }
      await onSaveTip({ ...tip, status: 'promoted', promotedPath: path, updatedAt: Date.now() })
      setExpandedTipId(null)
    } finally {
      setIsPromoting(false)
    }
  }, [onSaveTip, onPromoteFile, onReadFile, promoteTarget, promoteCategory])

  const handleEvaluate = useCallback(async () => {
    if (evalInput.trim().length === 0) return
    setIsEvaluating(true)
    setEvalError(null)
    setEvalResults([])
    try {
      const raw = await onEvaluate(evalInput.trim())
      const results = parseEvaluateResponse(raw)
      if (results.length === 0) {
        setEvalError('No tips found. The response may not have contained valid suggestions.')
      } else {
        setEvalResults(results)
      }
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : 'Evaluation failed')
    } finally {
      setIsEvaluating(false)
    }
  }, [evalInput, onEvaluate])

  const handleAddEvalTip = useCallback(async (evalTip: EvaluatedTip, source: string) => {
    const newTip: Tip = {
      id: crypto.randomUUID(),
      title: evalTip.title,
      content: evalTip.content,
      tags: evalTip.tags,
      status: 'inbox',
      targetType: evalTip.targetType,
      trialProjectPath: null,
      promotedPath: null,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await onSaveTip(newTip)
  }, [onSaveTip])

  const actionBtnClass = 'rounded px-2 py-1 text-[11px] font-medium transition'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2">
        {TIP_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilter(s); setExpandedTipId(null) }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              filter === s
                ? 'bg-sky-100 text-sky-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {s}
            {statusCounts[s] > 0 ? (
              <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">
                {statusCounts[s]}
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setShowEvaluate((v) => !v); setIsAdding(false) }}
          className="ml-auto rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-violet-700"
        >
          Evaluate
        </button>
        <button
          type="button"
          onClick={() => { setIsAdding((v) => !v); setShowEvaluate(false) }}
          className="rounded-md bg-sky-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-sky-700"
        >
          +
        </button>
      </div>

      {/* Add form */}
      {isAdding ? (
        <div className="border-b border-slate-200 bg-slate-50 p-3">
          <div className="space-y-2">
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Title"
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="Source (grok, web...)"
                className="w-1/3 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
              />
              <input
                type="text"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
              />
            </div>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Tip content..."
              rows={4}
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-400/50 focus:ring-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className={`${actionBtnClass} text-slate-500 hover:bg-slate-200`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddTip()}
                disabled={formTitle.trim().length === 0}
                className={`${actionBtnClass} bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-300`}
              >
                Save to Inbox
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Evaluate form */}
      {showEvaluate ? (
        <div className="border-b border-slate-200 bg-violet-50/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
            Evaluate URL / text
          </p>
          <div className="space-y-2">
            <textarea
              value={evalInput}
              onChange={(e) => setEvalInput(e.target.value)}
              placeholder="URL, GitHub repo, or paste text to analyze..."
              rows={3}
              disabled={isEvaluating}
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-violet-400/50 focus:ring-2 disabled:opacity-50"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowEvaluate(false); setEvalResults([]); setEvalError(null) }}
                className={`${actionBtnClass} text-slate-500 hover:bg-slate-200`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEvaluate()}
                disabled={isEvaluating || evalInput.trim().length === 0}
                className={`${actionBtnClass} bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-300`}
              >
                {isEvaluating ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
            {evalError !== null ? (
              <p className="text-[11px] text-rose-600">{evalError}</p>
            ) : null}
            {evalResults.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-violet-600">
                  {evalResults.length} suggestion{evalResults.length > 1 ? 's' : ''} found
                </p>
                {evalResults.map((result, i) => (
                  <div key={i} className="rounded-lg border border-violet-200 bg-white p-2.5">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">{result.title}</p>
                      <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-600">
                        {result.targetType}
                      </span>
                    </div>
                    <p className="mb-1.5 line-clamp-3 text-[11px] text-slate-600">{result.content}</p>
                    {result.reason.length > 0 ? (
                      <p className="mb-2 text-[10px] italic text-slate-400">{result.reason}</p>
                    ) : null}
                    <div className="flex items-center gap-1">
                      {result.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                          {tag}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleAddEvalTip(result, 'evaluate')}
                        className="ml-auto rounded-md bg-sky-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-sky-700"
                      >
                        Add to Inbox
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Tip list */}
      <div className="min-h-0 flex-1 overflow-auto">
        {filteredTips.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-400">
            {filter === 'inbox' ? 'No tips in inbox. Click + to add one.' : `No ${filter} tips.`}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTips.map((tip) => {
              const isExpanded = expandedTipId === tip.id
              return (
                <div key={tip.id} className="px-3 py-2.5">
                  {/* Card header */}
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {tip.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">{tip.source}</span>
                  </div>

                  {/* Title + content */}
                  <button
                    type="button"
                    onClick={() => setExpandedTipId(isExpanded ? null : tip.id)}
                    className="w-full text-left"
                  >
                    <p className="text-xs font-medium text-slate-800">{tip.title}</p>
                    {isExpanded ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600">
                        {tip.content}
                      </p>
                    ) : (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{tip.content}</p>
                    )}
                  </button>

                  {/* Trial project info */}
                  {tip.status === 'trying' && tip.trialProjectPath ? (
                    <p className="mt-1 text-[10px] text-sky-600">
                      Trial: {tip.trialProjectPath.split('/').pop()} ({tip.targetType})
                    </p>
                  ) : null}

                  {/* Promoted path */}
                  {tip.status === 'promoted' && tip.promotedPath ? (
                    <p className="mt-1 truncate text-[10px] text-emerald-600">{tip.promotedPath}</p>
                  ) : null}

                  {/* Actions */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {tip.status === 'inbox' ? (
                      <>
                        <button type="button" onClick={() => { setExpandedTipId(tip.id); setTryProject(projects[0]?.path ?? ''); setTryTargetType('none') }} className={`${actionBtnClass} bg-sky-50 text-sky-700 hover:bg-sky-100`}>Try</button>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'rejected')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>Skip</button>
                        <button type="button" onClick={() => void onDeleteTip(tip.id)} className={`${actionBtnClass} text-rose-500 hover:bg-rose-50`}>Delete</button>
                      </>
                    ) : tip.status === 'trying' ? (
                      <>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'accepted')} className={`${actionBtnClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>Accept</button>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'rejected')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>Reject</button>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'inbox')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>← Inbox</button>
                      </>
                    ) : tip.status === 'accepted' ? (
                      <>
                        <button type="button" onClick={() => { setExpandedTipId(tip.id); setPromoteTarget('rule'); setPromoteCategory('') }} className={`${actionBtnClass} bg-amber-50 text-amber-700 hover:bg-amber-100`}>Promote</button>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'rejected')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>Reject</button>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'trying')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>← Trying</button>
                      </>
                    ) : tip.status === 'promoted' ? (
                      <>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'accepted')} className={`${actionBtnClass} text-slate-500 hover:bg-slate-100`}>Demote</button>
                      </>
                    ) : (
                      // rejected
                      <>
                        <button type="button" onClick={() => void handleStatusChange(tip, 'inbox')} className={`${actionBtnClass} text-sky-600 hover:bg-sky-50`}>Restore</button>
                        <button type="button" onClick={() => void onDeleteTip(tip.id)} className={`${actionBtnClass} text-rose-500 hover:bg-rose-50`}>Delete</button>
                      </>
                    )}
                    <span className="ml-auto text-[10px] text-slate-400">{relativeTime(tip.updatedAt)}</span>
                  </div>

                  {/* Try expanded form */}
                  {isExpanded && tip.status === 'inbox' ? (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-sky-600">Trial config</p>
                      <div className="space-y-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Project</label>
                          <select
                            value={tryProject}
                            onChange={(e) => setTryProject(e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {projects.map((p) => (
                              <option key={p.path} value={p.path}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Target type</label>
                          <select
                            value={tryTargetType}
                            onChange={(e) => setTryTargetType(e.target.value as TipTargetType)}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="none">none (manual test)</option>
                            <option value="rule">rule</option>
                            <option value="skill">skill</option>
                            <option value="claude-md">claude-md</option>
                            <option value="permission">permission</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleStartTrial(tip)}
                          className="w-full rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-700"
                        >
                          Start Trial
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Promote expanded form */}
                  {isExpanded && tip.status === 'accepted' ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Promote to global</p>
                      <div className="space-y-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Target</label>
                          <select
                            value={promoteTarget}
                            onChange={(e) => setPromoteTarget(e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="rule">Global rule</option>
                            <option value="skill">Global skill</option>
                            <option value="claude-md">Append to CLAUDE.md</option>
                            <option value="permission">Permission</option>
                          </select>
                        </div>
                        {promoteTarget === 'skill' ? (
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Category folder</label>
                            <input
                              type="text"
                              value={promoteCategory}
                              onChange={(e) => setPromoteCategory(e.target.value)}
                              placeholder="tips"
                              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none ring-amber-400/50 focus:ring-2"
                            />
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-0.5 text-[10px] font-medium text-slate-500">
                            Path: {getPromotePath(tip, promoteTarget, promoteCategory)}
                          </p>
                        </div>
                        <pre className="max-h-24 overflow-auto rounded-md bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-200">
                          {formatPromoteContent(tip, promoteTarget)}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void handlePromote(tip)}
                          disabled={isPromoting}
                          className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:bg-amber-300"
                        >
                          {isPromoting ? 'Writing...' : 'Promote & Write'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default TipsPanel
