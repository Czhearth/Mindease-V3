requireAuth()

const summaryWrap = document.getElementById("summaryWrap")
const reminderBanner = document.getElementById("reminderBanner")
const insightsList = document.getElementById("insightsList")
const moodGraph = document.getElementById("moodGraph")
const graphCaption = document.getElementById("graphCaption")
const dashboardDate = document.getElementById("dashboardDate")
const overviewDateInline = document.getElementById("overviewDateInline")

const checkinModal = document.getElementById("checkinModal")
const moodModal = document.getElementById("moodModal")
const breathingModal = document.getElementById("breathingModal")
const forestModal = document.getElementById("forestModal")
const oceanModal = document.getElementById("oceanModal")

const moodSlider = document.getElementById("moodSlider")
const moodEmoji = document.getElementById("moodEmoji")
const moodLabel = document.getElementById("moodLabel")

const breathingPhase = document.getElementById("breathingPhase")
const breathingProgressFill = document.getElementById("breathingProgressFill")
const breathingRound = document.getElementById("breathingRound")
const breathingPauseBtn = document.getElementById("breathingPauseBtn")

const forestTimerInput = document.getElementById("forestTimer")
const forestVolumeInput = document.getElementById("forestVolume")
const forestRemaining = document.getElementById("forestRemaining")

const oceanTimerInput = document.getElementById("oceanTimer")
const oceanVolumeInput = document.getElementById("oceanVolume")
const oceanRemaining = document.getElementById("oceanRemaining")

const journalModal = document.getElementById("journalModal")
const journalForm = document.getElementById("journalForm")
const journalEntryInput = document.getElementById("journalEntryInput")
const journalSaveBtn = document.getElementById("saveJournalBtn")
const journalStatus = document.getElementById("journalStatus")
const journalHistoryList = document.getElementById("journalHistoryList")
const loadMoreJournalBtn = document.getElementById("loadMoreJournalBtn")

const activityStartCta = document.getElementById("activityStartCta")
const activityButtons = Array.from(document.querySelectorAll("[data-activity]"))

const sliderMoodMap = {
  1: { key: "sad", label: "Low", emoji: "😔" },
  2: { key: "anxious", label: "Anxious", emoji: "😟" },
  3: { key: "neutral", label: "Neutral", emoji: "🙂" },
  4: { key: "grateful", label: "Good", emoji: "😄" },
  5: { key: "happy", label: "Great", emoji: "🤗" },
}

const moodScoreMap = {
  sad: 1,
  anxious: 2,
  stressed: 2,
  tired: 2,
  neutral: 3,
  grateful: 4,
  happy: 5,
}

let breathingTimer = null
let breathingTick = null
let breathingState = {
  running: false,
  paused: false,
  round: 1,
  phaseIndex: 0,
  phaseStartedAt: 0,
  elapsedInPhase: 0,
}

const breathingPhases = [
  { label: "Breathe In", seconds: 4 },
  { label: "Hold", seconds: 4 },
  { label: "Breathe Out", seconds: 6 },
]

const TOTAL_ROUNDS = 5

let audioCtx = null
let forestSession = null
let oceanSession = null
let selectedActivity = "journal"
let journalHistoryOffset = 0
let journalHistoryHasMore = false
let journalHistoryTotal = 0
let currentJournalEntryId = ""
const JOURNAL_PAGE_SIZE = 8
const DASHBOARD_CACHE_KEY = "mindease_dashboard_cache_v1"
const DASHBOARD_REQUEST_TIMEOUT_MS = 12000

function formatTodayFull() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function formatTodayShort() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function buildMoodSeries(timeline, days = 7) {
  const byDate = new Map()
  timeline.forEach((entry) => {
    const score = moodScoreMap[entry.mood] ?? 3
    const existing = byDate.get(entry.date) || { total: 0, count: 0 }
    existing.total += score
    existing.count += 1
    byDate.set(entry.date, existing)
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const bucket = byDate.get(iso)
    result.push({
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      score: bucket ? bucket.total / bucket.count : null,
    })
  }
  return result
}

function renderMoodGraph(timeline) {
  if (!moodGraph) return
  const series = buildMoodSeries(timeline, 7)
  const points = series.filter((s) => s.score !== null)

  if (!points.length) {
    moodGraph.innerHTML = "<div class='mood-graph-empty'>No mood data yet.</div>"
    if (graphCaption) graphCaption.innerText = "Track moods to reveal your trend."
    return
  }

  const w = 300
  const h = 118
  const p = 16
  const stepX = (w - p * 2) / (series.length - 1)
  const y = (score) => h - p - ((score - 1) / 4) * (h - p * 2)

  const linePoints = series
    .map((item, idx) => {
      if (item.score === null) return null
      return { x: p + idx * stepX, y: y(item.score) }
    })
    .filter(Boolean)

  const path = linePoints.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ")

  moodGraph.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="mood-line-svg" preserveAspectRatio="none">
      <line x1="${p}" y1="${y(5)}" x2="${w - p}" y2="${y(5)}" class="mood-grid-line"></line>
      <line x1="${p}" y1="${y(3)}" x2="${w - p}" y2="${y(3)}" class="mood-grid-line"></line>
      <line x1="${p}" y1="${y(1)}" x2="${w - p}" y2="${y(1)}" class="mood-grid-line"></line>
      <text x="2" y="${y(5) + 3}" class="mood-axis">Good</text>
      <text x="2" y="${y(3) + 3}" class="mood-axis">Mid</text>
      <text x="2" y="${y(1) + 3}" class="mood-axis">Low</text>
      <path d="${path}" class="mood-line"></path>
      ${linePoints.map((pt) => `<circle cx="${pt.x}" cy="${pt.y}" r="2.5" class="mood-dot"></circle>`).join("")}
      ${series.map((item, idx) => `<text x="${p + idx * stepX}" y="${h - 2}" text-anchor="middle" class="mood-day">${item.day}</text>`).join("")}
    </svg>
  `

  const first = points[0].score
  const last = points[points.length - 1].score
  if (graphCaption) {
    graphCaption.innerText = last >= first
      ? "Mood trend is moving upward overall."
      : "Mood trend dipped recently, keep tracking what helps."
  }
}

function computeOverviewStats(timeline) {
  const total = timeline.length
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayEntries = timeline.filter((entry) => entry.date === todayIso)
  const todayCount = todayEntries.length

  const moodMap = { happy: 5, grateful: 4, neutral: 3, tired: 2, stressed: 2, anxious: 2, sad: 1 }
  const avg = todayCount
    ? todayEntries.reduce((sum, item) => sum + (moodMap[item.mood] || 3), 0) / todayCount
    : null

  const moodScore = avg ? `${avg.toFixed(1)}/5` : "No data"
  const completionRate = total ? `${Math.min(100, Math.round((todayCount / Math.max(1, total)) * 100))}%` : "100%"

  return [
    { label: "Mood Score", value: moodScore, sub: "Today's average mood", tone: "stat-tone-1" },
    { label: "Completion Rate", value: completionRate, sub: "Today completion rate", tone: "stat-tone-2" },
    { label: "Therapy Sessions", value: String(Math.max(0, total - 1)), sub: "Total sessions completed", tone: "stat-tone-3" },
    { label: "Total Activities", value: String(total), sub: "Planned for today", tone: "stat-tone-4" },
  ]
}

function renderSummaryCards(timeline) {
  if (!summaryWrap) return

  const stats = computeOverviewStats(timeline)
  summaryWrap.innerHTML = ""

  stats.forEach((card) => {
    const item = document.createElement("article")
    item.className = `overview-stat ${card.tone}`
    item.innerHTML = `
      <p class="overview-kicker">${card.label}</p>
      <h3>${card.value}</h3>
      <p class="overview-sub">${card.sub}</p>
    `
    summaryWrap.appendChild(item)
  })
}

function renderInsights(reminders) {
  if (!insightsList) return
  insightsList.innerHTML = ""
  insightsList.classList.add("hidden")
}

function readDashboardCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.timeline)) return null
    return parsed
  } catch {
    return null
  }
}

function writeDashboardCache(timeline) {
  try {
    const payload = {
      timeline,
      cached_at: new Date().toISOString(),
    }
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

async function fetchDashboardDataWithTimeout() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_URL}/dashboard/mood?days=21`, {
      method: "GET",
      headers: authHeaders(),
      signal: controller.signal,
    })

    if (response.status === 401) {
      clearAuth()
      window.location.href = "index.html"
      throw new Error("Unauthorized")
    }

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || "Request failed")
    }

    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

function setSelectedActivity(activityId) {
  selectedActivity = activityId

  activityButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.activity === activityId)
  })

  if (!activityStartCta) return

  const activeButton = activityButtons.find((button) => button.dataset.activity === activityId)
  const label = activeButton?.dataset.label || "Breathing Patterns"
  activityStartCta.innerText = activityId === "journal" ? "Open Journal" : `Start ${label}`
}

function openActivityById(activityId) {
  if (activityId === "breathing") {
    toggleModal(breathingModal, true)
    startBreathingExercise()
    return
  }

  if (activityId === "forest") {
    toggleModal(forestModal, true)
    return
  }

  if (activityId === "ocean") {
    toggleModal(oceanModal, true)
    return
  }

  if (activityId === "journal") {
    toggleModal(journalModal, true)
    setJournalEditorState()
    loadJournalHistory()
  }
}

function formatJournalTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Just now"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function renderJournalEntry(entry) {
  const card = document.createElement("article")
  card.className = "journal-history-entry"
  card.dataset.entryId = entry.id || ""
  card.tabIndex = 0

  const row = document.createElement("div")
  row.className = "journal-history-row"

  const body = document.createElement("p")
  body.innerText = entry.content

  const actions = document.createElement("div")
  actions.className = "journal-history-item-actions"

  const deleteBtn = document.createElement("button")
  deleteBtn.type = "button"
  deleteBtn.className = "journal-entry-delete"
  deleteBtn.setAttribute("aria-label", "Delete journal entry")
  deleteBtn.innerHTML = "&#128465;"
  deleteBtn.addEventListener("click", async (event) => {
    event.stopPropagation()
    await deleteJournalEntry(entry.id)
  })

  const meta = document.createElement("div")
  meta.className = "journal-history-meta"
  meta.innerText = formatJournalTimestamp(entry.created_at)

  actions.appendChild(deleteBtn)
  row.appendChild(body)
  row.appendChild(actions)
  card.appendChild(row)
  card.appendChild(meta)
  card.addEventListener("click", () => openJournalEntry(entry))
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openJournalEntry(entry)
    }
  })
  return card
}

function setJournalEditorState(entryId = "", content = "") {
  currentJournalEntryId = entryId
  if (journalEntryInput) journalEntryInput.value = content
  if (journalSaveBtn) journalSaveBtn.innerText = entryId ? "Update Entry" : "Save Entry"
  if (journalStatus) {
    journalStatus.innerText = entryId ? "Editing an existing entry. Save to update it." : ""
  }
}

function openJournalEntry(entry) {
  if (!entry) return
  toggleModal(journalModal, true)
  setJournalEditorState(entry.id || "", entry.content || "")
  journalEntryInput?.focus()
}

function renderJournalHistory(entries, append = false) {
  if (!journalHistoryList) return

  if (!append) {
    journalHistoryList.innerHTML = ""
  }

  if (!entries.length) {
    if (append) return
    const empty = document.createElement("div")
    empty.className = "journal-history-empty"
    empty.innerText = "No journal entries yet. Write your first entry above."
    journalHistoryList.appendChild(empty)
    return
  }

  entries.forEach((entry) => {
    journalHistoryList.appendChild(renderJournalEntry(entry))
  })
}

function updateJournalLoadMoreState() {
  if (!loadMoreJournalBtn) return
  loadMoreJournalBtn.classList.toggle("hidden", !journalHistoryHasMore)
  loadMoreJournalBtn.innerText = journalHistoryHasMore ? "Load older records" : "No older records"
}

async function loadJournalHistory({ append = false } = {}) {
  if (!append) {
    journalHistoryOffset = 0
  }

  if (journalStatus) journalStatus.innerText = append ? "Loading older records..." : "Loading journal history..."

  try {
    const data = await apiGet(`/journal/history?limit=${JOURNAL_PAGE_SIZE}&offset=${journalHistoryOffset}`)
    const entries = data.entries || []
    renderJournalHistory(entries, append)
    journalHistoryOffset = data.next_offset ?? (journalHistoryOffset + entries.length)
    journalHistoryHasMore = Boolean(data.has_more)
    journalHistoryTotal = Number(data.total || 0)
    updateJournalLoadMoreState()
    if (journalStatus) journalStatus.innerText = journalHistoryTotal ? `Showing ${journalHistoryOffset} of ${journalHistoryTotal} records.` : ""
  } catch {
    if (!append) renderJournalHistory([])
    if (journalStatus) journalStatus.innerText = "Unable to load journal history right now."
  }
}

async function deleteJournalEntry(entryId) {
  if (!entryId) return

  const confirmDelete = window.confirm("Delete this journal entry?")
  if (!confirmDelete) return

  if (journalStatus) journalStatus.innerText = "Deleting entry..."

  try {
    await apiDelete(`/journal/${entryId}`)
    journalHistoryOffset = 0
    journalHistoryHasMore = false
    journalHistoryTotal = 0
    if (currentJournalEntryId === entryId) {
      setJournalEditorState()
    }
    await loadJournalHistory()
    if (journalStatus) journalStatus.innerText = "Journal entry deleted."
  } catch {
    if (journalStatus) journalStatus.innerText = "Could not delete that entry right now."
  }
}

async function saveJournalEntry() {
  const content = (journalEntryInput?.value || "").trim()
  if (!content) {
    if (journalStatus) journalStatus.innerText = "Write something before saving."
    journalEntryInput?.focus()
    return
  }

  const editingEntryId = currentJournalEntryId
  if (journalStatus) journalStatus.innerText = "Saving entry..."

  try {
    if (editingEntryId) {
      await apiPut(`/journal/${editingEntryId}`, { content })
      if (journalStatus) journalStatus.innerText = "Journal entry updated."
    } else {
      await apiPost("/journal", { content })
      if (journalStatus) journalStatus.innerText = "Saved to your journal."
    }
    if (journalEntryInput) journalEntryInput.value = ""
    setJournalEditorState()
    journalHistoryOffset = 0
    journalHistoryHasMore = false
    journalHistoryTotal = 0
    await loadJournalHistory()
  } catch {
    if (journalStatus) journalStatus.innerText = "Could not save your journal entry right now."
  }
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function createNoiseBuffer(ctx, durationSeconds = 2) {
  const length = Math.floor(ctx.sampleRate * durationSeconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

function formatRemaining(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} remaining`
}

function closeAllActivityAudio() {
  stopForestAudio()
  stopOceanAudio()
}

function startForestAudio() {
  const ctx = ensureAudioContext()
  stopForestAudio()

  const durationSeconds = Math.max(1, Number(forestTimerInput?.value || 60)) * 60
  const volume = Math.max(0, Math.min(1, Number(forestVolumeInput?.value || 75) / 100))

  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, 2)
  source.loop = true

  const band = ctx.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = 1000
  band.Q.value = 0.6

  const gain = ctx.createGain()
  gain.gain.value = 0.0

  const targetGain = volume * 0.35
  gain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 1.2)

  source.connect(band)
  band.connect(gain)
  gain.connect(ctx.destination)
  source.start()

  let remaining = durationSeconds
  if (forestRemaining) forestRemaining.innerText = formatRemaining(remaining)

  const timer = setInterval(() => {
    remaining -= 1
    if (forestRemaining) forestRemaining.innerText = formatRemaining(Math.max(0, remaining))
    if (remaining <= 0) {
      stopForestAudio()
    }
  }, 1000)

  forestSession = { source, gain, timer, paused: false, remaining }
}

function pauseForestAudio() {
  if (!forestSession) return
  forestSession.gain.gain.setTargetAtTime(0.0001, ensureAudioContext().currentTime, 0.18)
  forestSession.paused = true
}

function stopForestAudio() {
  if (!forestSession) return
  clearInterval(forestSession.timer)
  try { forestSession.source.stop() } catch {}
  forestSession = null
  if (forestRemaining) {
    const fallback = Math.max(1, Number(forestTimerInput?.value || 60)) * 60
    forestRemaining.innerText = formatRemaining(fallback)
  }
}

function startOceanAudio() {
  const ctx = ensureAudioContext()
  stopOceanAudio()

  const durationSeconds = Math.max(1, Number(oceanTimerInput?.value || 60)) * 60
  const volume = Math.max(0, Math.min(1, Number(oceanVolumeInput?.value || 75) / 100))

  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, 2)
  source.loop = true

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = "lowpass"
  lowpass.frequency.value = 420

  const gain = ctx.createGain()
  gain.gain.value = volume * 0.24

  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.type = "sine"
  lfo.frequency.value = 0.18
  lfoGain.gain.value = volume * 0.08

  source.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(ctx.destination)
  lfo.connect(lfoGain)
  lfoGain.connect(gain.gain)

  source.start()
  lfo.start()

  let remaining = durationSeconds
  if (oceanRemaining) oceanRemaining.innerText = formatRemaining(remaining)

  const timer = setInterval(() => {
    remaining -= 1
    if (oceanRemaining) oceanRemaining.innerText = formatRemaining(Math.max(0, remaining))
    if (remaining <= 0) {
      stopOceanAudio()
    }
  }, 1000)

  oceanSession = { source, lfo, timer, gain, paused: false, remaining }
}

function pauseOceanAudio() {
  if (!oceanSession) return
  oceanSession.gain.gain.setTargetAtTime(0.0001, ensureAudioContext().currentTime, 0.2)
  oceanSession.paused = true
}

function stopOceanAudio() {
  if (!oceanSession) return
  clearInterval(oceanSession.timer)
  try { oceanSession.source.stop() } catch {}
  try { oceanSession.lfo.stop() } catch {}
  oceanSession = null
  if (oceanRemaining) {
    const fallback = Math.max(1, Number(oceanTimerInput?.value || 60)) * 60
    oceanRemaining.innerText = formatRemaining(fallback)
  }
}

function resetBreathingState() {
  breathingState = {
    running: false,
    paused: false,
    round: 1,
    phaseIndex: 0,
    phaseStartedAt: 0,
    elapsedInPhase: 0,
  }
  if (breathingPhase) breathingPhase.innerText = "Breathe In"
  if (breathingRound) breathingRound.innerText = "Round 1 of 5"
  if (breathingProgressFill) breathingProgressFill.style.width = "0%"
  if (breathingPauseBtn) breathingPauseBtn.innerText = "Pause"
}

function stopBreathingExercise() {
  if (breathingTimer) {
    clearTimeout(breathingTimer)
    breathingTimer = null
  }
  if (breathingTick) {
    clearInterval(breathingTick)
    breathingTick = null
  }
  breathingState.running = false
}

function runBreathingPhase() {
  if (!breathingState.running || breathingState.paused) return
  const phase = breathingPhases[breathingState.phaseIndex]
  breathingState.phaseStartedAt = Date.now() - breathingState.elapsedInPhase * 1000

  if (breathingPhase) breathingPhase.innerText = phase.label
  if (breathingRound) breathingRound.innerText = `Round ${breathingState.round} of ${TOTAL_ROUNDS}`

  if (breathingTick) clearInterval(breathingTick)
  breathingTick = setInterval(() => {
    const elapsed = (Date.now() - breathingState.phaseStartedAt) / 1000
    breathingState.elapsedInPhase = Math.min(phase.seconds, elapsed)
    const progress = (breathingState.elapsedInPhase / phase.seconds) * 100
    if (breathingProgressFill) breathingProgressFill.style.width = `${progress}%`
  }, 100)

  if (breathingTimer) clearTimeout(breathingTimer)
  breathingTimer = setTimeout(() => {
    breathingState.elapsedInPhase = 0
    breathingState.phaseIndex += 1
    if (breathingState.phaseIndex >= breathingPhases.length) {
      breathingState.phaseIndex = 0
      breathingState.round += 1
    }
    if (breathingState.round > TOTAL_ROUNDS) {
      stopBreathingExercise()
      if (breathingPhase) breathingPhase.innerText = "Complete"
      if (breathingRound) breathingRound.innerText = `Round ${TOTAL_ROUNDS} of ${TOTAL_ROUNDS}`
      if (breathingProgressFill) breathingProgressFill.style.width = "100%"
      if (breathingPauseBtn) breathingPauseBtn.innerText = "Restart"
      return
    }
    runBreathingPhase()
  }, (phase.seconds - breathingState.elapsedInPhase) * 1000)
}

function startBreathingExercise() {
  stopBreathingExercise()
  resetBreathingState()
  breathingState.running = true
  runBreathingPhase()
}

function toggleModal(modal, open) {
  if (!modal) return
  modal.classList.toggle("show", open)
  modal.setAttribute("aria-hidden", open ? "false" : "true")
}

function setupModals() {
  document.getElementById("startTherapyBtn")?.addEventListener("click", () => {
    window.location.href = "chat.html"
  })

  document.getElementById("checkinBtn")?.addEventListener("click", () => {
    toggleModal(checkinModal, true)
  })

  document.getElementById("trackMoodBtn")?.addEventListener("click", () => {
    toggleModal(moodModal, true)
  })

  activityButtons.forEach((button) => {
    button.addEventListener("click", () => setSelectedActivity(button.dataset.activity))
  })

  document.getElementById("breathingBtn")?.addEventListener("click", () => setSelectedActivity("breathing"))
  document.getElementById("journalBtn")?.addEventListener("click", () => setSelectedActivity("journal"))
  document.getElementById("forestBtn")?.addEventListener("click", () => setSelectedActivity("forest"))
  document.getElementById("oceanBtn")?.addEventListener("click", () => setSelectedActivity("ocean"))

  activityStartCta?.addEventListener("click", () => openActivityById(selectedActivity))

  document.getElementById("closeCheckinModal")?.addEventListener("click", () => toggleModal(checkinModal, false))
  document.getElementById("cancelCheckin")?.addEventListener("click", () => toggleModal(checkinModal, false))
  document.getElementById("closeMoodModal")?.addEventListener("click", () => toggleModal(moodModal, false))
  document.getElementById("closeBreathingModal")?.addEventListener("click", () => {
    toggleModal(breathingModal, false)
    stopBreathingExercise()
  })
  document.getElementById("closeForestModal")?.addEventListener("click", () => {
    toggleModal(forestModal, false)
    stopForestAudio()
  })
  document.getElementById("closeOceanModal")?.addEventListener("click", () => {
    toggleModal(oceanModal, false)
    stopOceanAudio()
  })
  document.getElementById("closeJournalModal")?.addEventListener("click", () => toggleModal(journalModal, false))
  journalForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    await saveJournalEntry()
  })
  loadMoreJournalBtn?.addEventListener("click", async () => {
    if (!journalHistoryHasMore) return
    await loadJournalHistory({ append: true })
  })
  document.getElementById("clearJournalBtn")?.addEventListener("click", () => {
    if (journalEntryInput) journalEntryInput.value = ""
    setJournalEditorState()
    if (journalStatus) journalStatus.innerText = ""
    journalEntryInput?.focus()
  })

  checkinModal?.addEventListener("click", (event) => {
    if (event.target === checkinModal) toggleModal(checkinModal, false)
  })

  moodModal?.addEventListener("click", (event) => {
    if (event.target === moodModal) toggleModal(moodModal, false)
  })

  breathingModal?.addEventListener("click", (event) => {
    if (event.target === breathingModal) {
      toggleModal(breathingModal, false)
      stopBreathingExercise()
    }
  })

  forestModal?.addEventListener("click", (event) => {
    if (event.target === forestModal) {
      toggleModal(forestModal, false)
      stopForestAudio()
    }
  })

  oceanModal?.addEventListener("click", (event) => {
    if (event.target === oceanModal) {
      toggleModal(oceanModal, false)
      stopOceanAudio()
    }
  })

  journalModal?.addEventListener("click", (event) => {
    if (event.target === journalModal) toggleModal(journalModal, false)
  })

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    toggleModal(checkinModal, false)
    toggleModal(moodModal, false)
    toggleModal(breathingModal, false)
    toggleModal(forestModal, false)
    toggleModal(oceanModal, false)
    toggleModal(journalModal, false)
    stopBreathingExercise()
    closeAllActivityAudio()
  })

  breathingPauseBtn?.addEventListener("click", () => {
    if (!breathingState.running && breathingPauseBtn.innerText === "Restart") {
      startBreathingExercise()
      return
    }

    if (!breathingState.running) return

    if (!breathingState.paused) {
      breathingState.paused = true
      if (breathingTimer) {
        clearTimeout(breathingTimer)
        breathingTimer = null
      }
      if (breathingTick) {
        clearInterval(breathingTick)
        breathingTick = null
      }
      breathingPauseBtn.innerText = "Resume"
      return
    }

    breathingState.paused = false
    breathingPauseBtn.innerText = "Pause"
    runBreathingPhase()
  })

  forestVolumeInput?.addEventListener("input", () => {
    if (!forestSession) return
    const vol = Math.max(0, Math.min(1, Number(forestVolumeInput.value) / 100))
    forestSession.gain.gain.setTargetAtTime(vol * 0.35, ensureAudioContext().currentTime, 0.15)
  })

  oceanVolumeInput?.addEventListener("input", () => {
    if (!oceanSession) return
    const vol = Math.max(0, Math.min(1, Number(oceanVolumeInput.value) / 100))
    oceanSession.gain.gain.setTargetAtTime(vol * 0.24, ensureAudioContext().currentTime, 0.15)
  })

  document.getElementById("forestStartBtn")?.addEventListener("click", startForestAudio)
  document.getElementById("forestPauseBtn")?.addEventListener("click", pauseForestAudio)
  document.getElementById("forestStopBtn")?.addEventListener("click", stopForestAudio)

  document.getElementById("oceanStartBtn")?.addEventListener("click", startOceanAudio)
  document.getElementById("oceanPauseBtn")?.addEventListener("click", pauseOceanAudio)
  document.getElementById("oceanStopBtn")?.addEventListener("click", stopOceanAudio)

  document.getElementById("checkinForm")?.addEventListener("submit", (event) => {
    event.preventDefault()
    if (reminderBanner) reminderBanner.innerText = "Check-in saved."
    toggleModal(checkinModal, false)
  })

  moodSlider?.addEventListener("input", () => {
    const value = Number(moodSlider.value)
    const mood = sliderMoodMap[value]
    if (moodEmoji) moodEmoji.textContent = mood.emoji
    if (moodLabel) moodLabel.textContent = mood.label
  })

  document.getElementById("saveMoodBtn")?.addEventListener("click", async () => {
    const value = Number(moodSlider?.value || 3)
    const mood = sliderMoodMap[value]
    const note = (document.getElementById("moodPopupNote")?.value || "").trim()

    try {
      await apiPost("/mood", { mood: mood.key, note })
      toggleModal(moodModal, false)
      await loadDashboard()
    } catch {
      if (reminderBanner) reminderBanner.innerText = "Could not save mood right now."
    }
  })
}

async function loadDashboard() {
  if (dashboardDate) dashboardDate.innerText = formatTodayFull()
  if (overviewDateInline) overviewDateInline.innerText = formatTodayShort()

  const cached = readDashboardCache()
  if (cached) {
    renderSummaryCards(cached.timeline)
    renderMoodGraph(cached.timeline)
    renderInsights([])
    if (reminderBanner) reminderBanner.innerText = "Showing last saved dashboard while refreshing..."
  }

  try {
    if (!cached && reminderBanner) {
      reminderBanner.innerText = "Loading latest dashboard data..."
    }

    const data = await fetchDashboardDataWithTimeout()
    const timeline = data.timeline || []
    renderSummaryCards(timeline)
    renderMoodGraph(timeline)
    renderInsights(data.reminders || [])
    writeDashboardCache(timeline)
    if (reminderBanner) reminderBanner.innerText = `Last updated: ${new Date().toLocaleTimeString()}`
  } catch {
    if (cached) {
      if (reminderBanner) reminderBanner.innerText = "Network is slow. Showing your last saved dashboard."
      return
    }

    if (reminderBanner) reminderBanner.innerText = "Unable to load dashboard right now."
    renderSummaryCards([])
    renderMoodGraph([])
    renderInsights([])
  }
}

document.getElementById("logoutBtn").onclick = () => {
  clearAuth()
  window.location.href = "index.html"
}

setupModals()
setSelectedActivity("journal")
loadDashboard()
loadJournalHistory()
