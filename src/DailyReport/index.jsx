import {useEffect, useMemo, useRef, useState} from 'react'
import ConfirmDialog from './ConfirmDialog'
import './index.css'

const DB_PREFIX = 'daily/'
const TEMPLATE_DOC_ID = 'settings/templates'
const HOLIDAY_PREFIX = 'holiday/'
const memoryDocs = {}

const defaultTemplates = [
    {
        id: 'standard',
        name: '标准日报',
        content: `今日完成：

进行中：

问题/阻塞：

明日计划：

备注：
 `
    },
    {
        id: 'simple',
        name: '简洁日报',
        content: `完成：

问题：

明日计划：
`
    }
]

function pad(value) {
    return String(value).padStart(2, '0')
}

function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

function shiftDate(value, amount) {
    const date = parseDate(value)
    date.setDate(date.getDate() + amount)
    return formatDate(date)
}

function getWeekday(value) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseDate(value).getDay()]
}

function getWorkweekRange(value) {
    const date = parseDate(value)
    const day = date.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setDate(date.getDate() + mondayOffset)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    return {start: formatDate(monday), end: formatDate(friday)}
}

function getWeekInsertDate(weekStart) {
    return shiftDate(weekStart, 6)
}

function getDateRange(start, end) {
    const startDate = parseDate(start)
    const endDate = parseDate(end)
    const dates = []
    if (startDate > endDate) return dates
    const dayMs = 24 * 60 * 60 * 1000
    for (let time = startDate.getTime(); time <= endDate.getTime(); time += dayMs) {
        const cursor = new Date(time)
        dates.push(formatDate(cursor))
    }
    return dates
}

function getMonthDays(value) {
    const current = parseDate(value)
    const year = current.getFullYear()
    const month = current.getMonth()
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const days = []
    const leadingEmptyDays = (first.getDay() + 6) % 7
    for (let i = 0; i < leadingEmptyDays; i++) {
        days.push(null)
    }
    for (let day = 1; day <= last.getDate(); day++) {
        days.push(formatDate(new Date(year, month, day)))
    }
    return days
}

function getMonthStart(value) {
    const date = parseDate(value)
    return formatDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

function shiftMonth(value, amount) {
    const date = parseDate(value)
    return formatDate(new Date(date.getFullYear(), date.getMonth() + amount, 1))
}

function hasUtoolsDb() {
    return Boolean(window.utools?.db)
}

function getStoredTemplates() {
    const doc = dbGet(TEMPLATE_DOC_ID)
    const templates = doc?.templates
    if (!Array.isArray(templates) || templates.length === 0) return defaultTemplates
    return templates.filter(item => item.id !== 'project')
}

function setStoredTemplates(templates) {
    const oldDoc = dbGet(TEMPLATE_DOC_ID)
    dbPut(oldDoc ? {...oldDoc, templates} : {_id: TEMPLATE_DOC_ID, templates})
}

function getHolidayCacheKey(year, month) {
    return `${HOLIDAY_PREFIX}${year}-${pad(month)}`
}

function getCachedHolidays(year, month) {
    return dbGet(getHolidayCacheKey(year, month))?.value || {}
}

function setCachedHolidays(year, month, holidays) {
    const id = getHolidayCacheKey(year, month)
    const oldDoc = dbGet(id)
    dbPut(oldDoc ? {...oldDoc, value: holidays} : {_id: id, value: holidays})
}

function fetchRichCalendar(year, month) {
    if (window.services?.fetchRichCalendar) {
        return window.services.fetchRichCalendar(year, month)
    }
    return window.fetch(`/richcalendar/fetch?year=${year}&month=${month}&day=1`).then(response => response.text())
}

function parseRichCalendar(html, year, month) {
    const result = {}
    const parser = new window.DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    doc.querySelectorAll('[data-date]').forEach(node => {
        const itemDate = node.getAttribute('data-date')
        if (!itemDate || !itemDate.startsWith(`${year}-${pad(month)}`)) return
        const label = node.querySelector('.rcld_celllabel')?.textContent?.trim()
        const alias = node.querySelector('.rcld_cellalias')?.textContent?.trim() || ''
        const festivals = node.getAttribute('data-festivals') || ''
        const festivalName = festivals.split('#').find(Boolean) || ''
        const isHoliday = label === '休'
        const isWorkday = label === '班'
        result[itemDate] = {
            type: isWorkday ? 'workday' : (isHoliday ? 'holiday' : ''),
            label: isWorkday ? '班' : (isHoliday ? '休' : ''),
            name: festivalName || alias,
            lunar: alias
        }
    })
    return result
}

function dbGet(id) {
    if (!hasUtoolsDb()) {
        return memoryDocs[id] || null
    }
    return window.utools.db.get(id)
}

function dbPut(doc) {
    if (!hasUtoolsDb()) {
        const savedDoc = {...doc, _rev: String(Date.now())}
        memoryDocs[doc._id] = savedDoc
        return {ok: true, id: doc._id, rev: savedDoc._rev}
    }
    return window.utools.db.put(doc)
}

function dbAllDaily() {
    if (!hasUtoolsDb()) {
        return Object.values(memoryDocs).filter(item => item._id?.startsWith(DB_PREFIX))
    }
    return window.utools.db.allDocs(DB_PREFIX) || []
}

export default function DailyReport() {
    const today = useMemo(() => formatDate(new Date()), [])
    const [date, setDate] = useState(today)
    const [content, setContent] = useState('')
    const [currentDoc, setCurrentDoc] = useState(null)
    const [records, setRecords] = useState([])
    const [keyword, setKeyword] = useState('')
    const [templates, setTemplates] = useState(() => getStoredTemplates())
    const [holidayData, setHolidayData] = useState({})
    const [activePanel, setActivePanel] = useState('records')
    const [editorMode, setEditorMode] = useState('daily')
    const [showTemplatePicker, setShowTemplatePicker] = useState(false)
    const [showCalendarPicker, setShowCalendarPicker] = useState(false)
    const [editingTemplateId, setEditingTemplateId] = useState('')
    const [templateName, setTemplateName] = useState('')
    const [templateContent, setTemplateContent] = useState('')
    const [weekStart, setWeekStart] = useState('')
    const [weekEnd, setWeekEnd] = useState('')
    const [selectedWeeklyKey, setSelectedWeeklyKey] = useState('')
    const [saveState, setSaveState] = useState('idle')
    const [message, setMessage] = useState('')
    const [confirmDialog, setConfirmDialog] = useState(null)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const textareaRef = useRef(null)
    const templatePickerRef = useRef(null)
    const calendarPickerRef = useRef(null)
    const saveTimer = useRef(null)
    const didLoad = useRef(false)
    const latestDraft = useRef({date: today, content: '', doc: null})

    const refreshRecords = () => {
        const nextRecords = dbAllDaily()
            .filter(item => item.content?.trim())
            .sort((a, b) => b.date.localeCompare(a.date))
        setRecords(nextRecords)
    }

    const persistContent = (targetDate, targetContent, targetDoc) => {
        const now = Date.now()
        const doc = targetDoc
            ? {...targetDoc, content: targetContent, updatedAt: now}
            : {_id: DB_PREFIX + targetDate, date: targetDate, content: targetContent, createdAt: now, updatedAt: now}
        const result = dbPut(doc)
        if (!result.ok) return null
        return {...doc, _rev: result.rev}
    }

    const flushPendingSave = () => {
        if (!didLoad.current) return
        if (saveTimer.current) {
            clearTimeout(saveTimer.current)
            saveTimer.current = null
        }
        const draft = latestDraft.current
        const savedDoc = persistContent(draft.date, draft.content, draft.doc)
        if (savedDoc && draft.date === date) {
            setCurrentDoc(savedDoc)
            setSaveState('saved')
        }
        refreshRecords()
    }

    const loadByDate = (nextDate) => {
        flushPendingSave()
        const doc = dbGet(DB_PREFIX + nextDate)
        setDate(nextDate)
        setCurrentDoc(doc)
        setContent(doc?.content || '')
        setSaveState('idle')
        latestDraft.current = {date: nextDate, content: doc?.content || '', doc}
        didLoad.current = false
        window.utools?.setSubInputValue?.('')
        setTimeout(() => {
            didLoad.current = true
            textareaRef.current?.focus()
        })
    }

    const saveContent = (nextContent) => {
        const savedDoc = persistContent(date, nextContent, currentDoc)
        if (savedDoc) {
            setCurrentDoc(savedDoc)
            latestDraft.current = {date, content: nextContent, doc: savedDoc}
            setSaveState('saved')
            refreshRecords()
        } else {
            setSaveState('error')
        }
    }

    useEffect(() => {
        refreshRecords()
        loadByDate(today)
        window.utools?.setSubInput?.(({text}) => {
            setKeyword(text.trim())
        }, '搜索历史日报')

        return () => {
            window.utools?.removeSubInput?.()
            if (saveTimer.current) clearTimeout(saveTimer.current)
        }
    }, [today])

    useEffect(() => {
        if (!didLoad.current) return
        latestDraft.current = {date, content, doc: currentDoc}
        setSaveState('saving')
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
            saveContent(content)
        }, 500)
    }, [content])

    useEffect(() => {
        const closePickers = (event) => {
            if (templatePickerRef.current?.contains(event.target)) return
            if (calendarPickerRef.current?.contains(event.target)) return
            setShowTemplatePicker(false)
            setShowCalendarPicker(false)
        }

        window.addEventListener('pointerdown', closePickers)
        return () => window.removeEventListener('pointerdown', closePickers)
    }, [])

    useEffect(() => {
        const year = Number(date.slice(0, 4))
        const month = Number(date.slice(5, 7))
        const cached = getCachedHolidays(year, month)
        setHolidayData(cached)

        let ignore = false
        fetchRichCalendar(year, month)
            .then(html => {
                if (ignore) return
                const holidays = parseRichCalendar(html, year, month)
                setCachedHolidays(year, month, holidays)
                setHolidayData(holidays)
            })
            .catch(() => {
                if (!ignore) setHolidayData(cached)
            })

        return () => {
            ignore = true
        }
    }, [date])

    useEffect(() => {
        const isMac = window.utools?.isMacOs?.() || /Mac/i.test(navigator.userAgentData?.platform || navigator.userAgent || '')
        const handleDateShortcut = (event) => {
            if (editorMode !== 'daily') return
            const hasModifier = isMac ? event.metaKey : event.ctrlKey
            if (!hasModifier || event.altKey || event.shiftKey) return

            if (event.key === 'ArrowLeft') {
                event.preventDefault()
                loadByDate(shiftDate(date, -1))
            } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                loadByDate(shiftDate(date, 1))
            }
        }

        window.addEventListener('keydown', handleDateShortcut)
        return () => window.removeEventListener('keydown', handleDateShortcut)
    }, [date, editorMode])

    const showMessage = (text) => {
        setMessage(text)
        setTimeout(() => setMessage(''), 1600)
    }

    const openConfirm = (dialog, onConfirm) => {
        setConfirmDialog({...dialog, onConfirm})
    }

    const closeConfirm = () => {
        setConfirmDialog(null)
    }

    const handleConfirm = () => {
        const onConfirm = confirmDialog?.onConfirm
        setConfirmDialog(null)
        onConfirm?.()
    }

    const saveTemplates = (nextTemplates) => {
        setTemplates(nextTemplates)
        setStoredTemplates(nextTemplates)
    }

    const copyText = async (text) => {
        if (window.utools?.copyText) {
            window.utools.copyText(text)
            return true
        }
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
        textareaRef.current?.select()
        return document.execCommand('copy')
    }

    const handleCopy = async () => {
        try {
            const ok = await copyText(content)
            showMessage(ok ? '已复制正文' : '复制失败')
        } catch {
            showMessage('复制失败')
        }
    }

    const handleExport = () => {
        try {
            const filePath = window.services?.exportDailyReport?.(date, content, 'txt')
            if (filePath) {
                window.utools?.shellShowItemInFolder?.(filePath)
                showMessage('已导出 TXT')
            }
        } catch {
            showMessage('导出失败')
        }
    }

    const buildWeeklySummary = (start, end, sourceRecords) => {
        const dates = getDateRange(start, end)
        const recordMap = new Map(sourceRecords.map(item => [item.date, item]))
        const sections = dates.map(itemDate => {
            return recordMap.get(itemDate)?.content?.trim()
        }).filter(Boolean)
        return sections.join('\n\n')
    }

    const handleOpenWeekly = (start, end) => {
        flushPendingSave()
        setWeekStart(start)
        setWeekEnd(end)
        setSelectedWeeklyKey(`weekly/${start}`)
        setEditorMode('weekly')
    }

    const handleCopyWeekly = async () => {
        try {
            const ok = await copyText(weeklyContent)
            showMessage(ok ? '已复制周报' : '复制失败')
        } catch {
            showMessage('复制失败')
        }
    }

    const handleExportWeekly = () => {
        try {
            const filePath = window.services?.exportWeeklyReport?.(weekStart, weekEnd, weeklyContent, 'txt')
            if (filePath) {
                window.utools?.shellShowItemInFolder?.(filePath)
                showMessage('已导出周报 TXT')
            }
        } catch {
            showMessage('导出失败')
        }
    }

    const handleInsertTemplate = () => {
        if (content.trim()) return
        setShowTemplatePicker(!showTemplatePicker)
    }

    const handleApplyTemplate = (template) => {
        setContent(template.content)
        setShowTemplatePicker(false)
        setEditorMode('daily')
        setTimeout(() => textareaRef.current?.focus())
    }

    const handleNewTemplate = () => {
        setActivePanel('templates')
        setEditorMode('template')
        setEditingTemplateId('new')
        setTemplateName('')
        setTemplateContent('')
    }

    const handleEditTemplate = (template) => {
        setActivePanel('templates')
        setEditorMode('template')
        setEditingTemplateId(template.id)
        setTemplateName(template.name)
        setTemplateContent(template.content)
    }

    const handleCancelTemplateEdit = () => {
        setEditingTemplateId('')
        setTemplateName('')
        setTemplateContent('')
    }

    const handleSaveTemplate = () => {
        const name = templateName.trim()
        const body = templateContent.trimEnd()
        if (!name || !body) return showMessage('模板名称和内容不能为空')
        if (editingTemplateId === 'new') {
            const id = 'custom-' + Date.now()
            saveTemplates([...templates, {id, name, content: body}])
        } else {
            saveTemplates(templates.map(item => item.id === editingTemplateId ? {...item, name, content: body} : item))
        }
        handleCancelTemplateEdit()
        setEditorMode('daily')
        showMessage('模板已保存')
    }

    const handleDeleteTemplate = (template) => {
        if (templates.length <= 1) return showMessage('至少保留一个模板')
        openConfirm({
            title: '删除模板',
            message: `确认删除「${template.name}」？`,
            confirmText: '删除'
        }, () => {
            const nextTemplates = templates.filter(item => item.id !== template.id)
            saveTemplates(nextTemplates)
            if (editingTemplateId === template.id) handleCancelTemplateEdit()
            showMessage('模板已删除')
        })
    }

    const handleClear = () => {
        if (!content.trim()) return
        openConfirm({
            title: '清空日报',
            message: '确认清空这一天的日报内容？',
            confirmText: '清空'
        }, () => setContent(''))
    }

    const filteredRecords = records.filter(item => {
        if (!keyword) return true
        return item.date.includes(keyword) || item.content.toLowerCase().includes(keyword.toLowerCase())
    })

    const timelineRecords = (() => {
        const visibleDailyRecords = filteredRecords.map(item => ({
            type: 'daily',
            sortTime: parseDate(item.date).getTime(),
            item
        }))
        const weekMap = new Map()
        records.forEach(item => {
            if (!item.content?.trim()) return
            const weekday = parseDate(item.date).getDay()
            if (weekday === 0 || weekday === 6) return
            const range = getWorkweekRange(item.date)
            weekMap.set(range.start, range)
        })
        const weeklyRecords = Array.from(weekMap.values()).map(range => {
            const insertDate = getWeekInsertDate(range.start)
            return {
                type: 'weekly',
                sortTime: parseDate(insertDate).getTime() + 12 * 60 * 60 * 1000,
                key: `weekly/${range.start}`,
                start: range.start,
                end: range.end,
                insertDate
            }
        })
        return [...visibleDailyRecords, ...weeklyRecords]
            .filter(item => {
                if (!keyword || item.type === 'daily') return true
                return item.start.includes(keyword) || item.end.includes(keyword) || '周报'.includes(keyword)
            })
            .sort((a, b) => b.sortTime - a.sortTime)
    })()

    const selectedRecord = (() => {
        if (saveState === 'saving') return '保存中...'
        if (saveState === 'error') return '保存失败'
        if (currentDoc?.updatedAt)
            return `更新于 ${new Date(currentDoc.updatedAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            })}`
        return '还没有保存记录'
    })()

    const weeklyContent = weekStart && weekEnd ? buildWeeklySummary(weekStart, weekEnd, records) : ''
    const shortcutModifier = window.utools?.isMacOs?.() || /Mac/i.test(navigator.userAgentData?.platform || navigator.userAgent || '') ? 'Cmd' : 'Ctrl'
    const recordDateSet = new Set(records.map(item => item.date))
    const monthDays = getMonthDays(date)
    const monthTitle = `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`

    return (
        <main className={'daily-app' + (sidebarOpen ? ' sidebar-open' : '')}>
            <section className='daily-sidebar'>
                <div className='daily-brand'>
                    <div>
                        <h1>我的日报</h1>
                        <p>记录每天推进了什么</p>
                    </div>
                    <div className='daily-brand-actions'>
                        <button className='daily-sidebar-toggle' onClick={() => setSidebarOpen(!sidebarOpen)}>
                            {sidebarOpen ? '✕' : '☰'}
                        </button>
                        <button className='daily-today' onClick={() => loadByDate(today)}>今天</button>
                        <div className='daily-calendar-picker-wrap' ref={calendarPickerRef}>
                            <button className='daily-today'
                                    onClick={() => setShowCalendarPicker(!showCalendarPicker)}>日历
                            </button>
                            {showCalendarPicker && (
                                <div className='daily-calendar daily-calendar-popover'>
                                    <div className='daily-calendar-head'>
                                        <button onClick={() => loadByDate(shiftMonth(getMonthStart(date), -1))}>‹
                                        </button>
                                        <span>{monthTitle}</span>
                                        <button onClick={() => loadByDate(shiftMonth(getMonthStart(date), 1))}>›
                                        </button>
                                    </div>
                                    <div className='daily-calendar-week'>
                                        {['一', '二', '三', '四', '五', '六', '日'].map(item => <span
                                            key={item}>{item}</span>)}
                                    </div>
                                    <div className='daily-calendar-grid'>
                                        {monthDays.map((item, index) => (
                                            (() => {
                                                const holiday = item ? holidayData[item] : null
                                                const weekday = item ? parseDate(item).getDay() : -1
                                                const bottomText = holiday?.type === 'holiday' ? holiday.name : (holiday?.lunar || '')
                                                const topLabel = item === today ? '今' : holiday?.label
                                                return item
                                                    ? (
                                                        <button
                                                            key={item}
                                                            className={
                                                                (item === date ? 'is-selected ' : '') +
                                                                (recordDateSet.has(item) ? 'has-record ' : '') +
                                                                (item === today ? 'is-today ' : '') +
                                                                ((weekday === 0 || weekday === 6) && holiday?.type !== 'workday' ? 'is-weekend ' : '') +
                                                                (holiday?.type === 'holiday' ? 'is-holiday ' : '') +
                                                                (holiday?.type === 'workday' ? 'is-workday' : '')
                                                            }
                                                            onClick={() => {
                                                                setEditorMode('daily')
                                                                setSelectedWeeklyKey('')
                                                                setShowCalendarPicker(false)
                                                                loadByDate(item)
                                                            }}
                                                        >
                                                            <span>{Number(item.slice(8, 10))}</span>
                                                            {topLabel && <em>{topLabel}</em>}
                                                            {bottomText && <small>{bottomText}</small>}
                                                        </button>
                                                    )
                                                    : <span key={'empty-' + index}/>
                                            })()
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className='daily-tabs'>
                    <button className={activePanel === 'records' ? 'is-active' : ''} onClick={() => {
                        setActivePanel('records');
                        setEditorMode('daily')
                    }}>最近记录
                    </button>
                    <button className={activePanel === 'templates' ? 'is-active' : ''}
                            onClick={() => setActivePanel('templates')}>日报模板
                    </button>
                </div>

                {activePanel === 'records' && (
                    <div className='daily-history'>
                        <input
                            className='daily-search'
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value.trimStart())}
                            placeholder='搜索日期或内容'
                        />
                        <div className='daily-records'>
                            {timelineRecords.length === 0 && <div className='daily-empty-small'>暂无匹配记录</div>}
                            {timelineRecords.slice(0, 40).map(row => {
                                if (row.type === 'weekly') {
                                    return (
                                        <button
                                            key={row.key}
                                            className={'daily-record daily-weekly-record' + (selectedWeeklyKey === row.key && editorMode === 'weekly' ? ' is-active' : '')}
                                            onClick={() => handleOpenWeekly(row.start, row.end)}
                                        >
                      <span>
                        <b>周报</b>
                        <small>{row.start} 至 {row.end}</small>
                      </span>
                                        </button>
                                    )
                                }
                                const item = row.item
                                return (
                                    <button
                                        key={item._id}
                                        className={'daily-record' + (item.date === date && editorMode === 'daily' ? ' is-active' : '')}
                                        onClick={() => {
                                            setEditorMode('daily');
                                            setSelectedWeeklyKey('');
                                            loadByDate(item.date)
                                        }}
                                    >
                    <span>
                      <b>{item.date}</b>
                      <small>{item.content.split('\n').find(line => line.trim()) || '空日报'}</small>
                    </span>
                                        <strong>{getWeekday(item.date)}</strong>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {activePanel === 'templates' && (
                    <div className='daily-templates'>
                        <div className='daily-section-head'>
                            <span>模板列表</span>
                            <button onClick={handleNewTemplate}>新增</button>
                        </div>
                        <div className='daily-template-list'>
                            {templates.map(item => (
                                <div
                                    className={'daily-template-item' + (item.id === editingTemplateId ? ' is-active' : '')}
                                    key={item.id}>
                                    <button onClick={() => handleEditTemplate(item)}>{item.name}</button>
                                    <div>
                                        <button onClick={() => handleEditTemplate(item)}>编辑</button>
                                        <button onClick={() => handleDeleteTemplate(item)}>删除</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </section>

            <section className='daily-editor'>
                {editorMode === 'daily' && (
                    <>
                        <header className='daily-toolbar'>
                            <div className='daily-datebar'>
                                <button className='daily-tooltip' data-tooltip={`${shortcutModifier} + ←`}
                                        onClick={() => loadByDate(shiftDate(date, -1))}>前一天
                                </button>
                                <strong>{date}</strong>
                                <span>{getWeekday(date)}</span>
                                <button className='daily-tooltip' data-tooltip={`${shortcutModifier} + →`}
                                        onClick={() => loadByDate(shiftDate(date, 1))}>后一天
                                </button>
                            </div>
                            <div className='daily-actions'>
                                <span className={'daily-record-state state-' + saveState}>{selectedRecord}</span>
                                <div className='daily-template-picker-wrap' ref={templatePickerRef}>
                                    <button className='daily-btn-icon daily-tooltip' data-tooltip='插入模板'
                                            onClick={handleInsertTemplate} disabled={Boolean(content.trim())}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                             stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                             strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                            <line x1="12" y1="18" x2="12" y2="12"/>
                                            <line x1="9" y1="15" x2="15" y2="15"/>
                                        </svg>
                                    </button>
                                    {showTemplatePicker && (
                                        <div className='daily-template-picker'>
                                            {templates.map(item => (
                                                <button key={item.id}
                                                        onClick={() => handleApplyTemplate(item)}>{item.name}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button className='daily-btn-icon daily-tooltip' data-tooltip='复制'
                                        onClick={handleCopy}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                </button>
                                <button className='daily-btn-icon daily-tooltip' data-tooltip='导出 TXT'
                                        onClick={handleExport}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                </button>
                                <button className='daily-btn-icon daily-tooltip daily-danger' data-tooltip='清空'
                                        onClick={handleClear}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path
                                            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        <line x1="10" y1="11" x2="10" y2="17"/>
                                        <line x1="14" y1="11" x2="14" y2="17"/>
                                    </svg>
                                    </button>
                            </div>
                        </header>

                        <div className='daily-writing'>
              <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder='写下今天完成的工作、遇到的问题和明天计划...'
              />
                        </div>
                    </>
                )}

                {editorMode === 'template' && (
                    <>
                        <header className='daily-toolbar'>
                            <div className='daily-datebar'>
                                <strong>{editingTemplateId === 'new' ? '新增模板' : '编辑模板'}</strong>
                                <span>维护日报模板内容</span>
                            </div>
                            <div className='daily-actions'>
                                <button onClick={handleSaveTemplate}>保存模板</button>
                            </div>
                        </header>
                        <div className='daily-template-main-editor'>
                            <input
                                value={templateName}
                                onChange={(event) => setTemplateName(event.target.value)}
                                placeholder='模板名称'
                            />
                            <textarea
                                value={templateContent}
                                onChange={(event) => setTemplateContent(event.target.value)}
                                placeholder='模板内容'
                            />
                        </div>
                    </>
                )}

                {editorMode === 'weekly' && (
                    <>
                        <header className='daily-toolbar'>
                            <div className='daily-datebar'>
                                <strong>总结周报</strong>
                                <input type='date' value={weekStart}
                                       onChange={(event) => setWeekStart(event.target.value)}/>
                                <span>至</span>
                                <input type='date' value={weekEnd}
                                       onChange={(event) => setWeekEnd(event.target.value)}/>
                                <span>可手动选择时间段</span>
                            </div>
                            <div className='daily-actions'>
                                <button className='daily-btn-icon daily-tooltip' data-tooltip='复制'
                                        onClick={handleCopyWeekly}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                    </button>
                                <button className='daily-btn-icon daily-tooltip' data-tooltip='导出 TXT'
                                        onClick={handleExportWeekly}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                         strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                </button>

                            </div>
                        </header>
                        <div className='daily-writing'>
              <textarea
                  value={weeklyContent}
                  readOnly
                  placeholder='所选日期范围内还没有日报内容...'
              />
                        </div>
                    </>
                )}
            </section>

            {message && <div className='daily-toast'>{message}</div>}
            <ConfirmDialog dialog={confirmDialog} onCancel={closeConfirm} onConfirm={handleConfirm}/>
        </main>
    )
}
