requireAuth()

const user = getUser()
const welcomeUser = document.getElementById("welcomeUser")
const chatMessages = document.getElementById("chatMessages")
const messageInput = document.getElementById("messageInput")
const sendBtn = document.getElementById("sendBtn")
const moodButtons = document.querySelectorAll(".mood-btn")
const moodNote = document.getElementById("moodNote")
const chatError = document.getElementById("chatError")
const typingStatus = document.getElementById("typingStatus")
const recentChats = document.getElementById("recentChats")
const newChatBtn = document.getElementById("newChatBtn")
const deleteCurrentBtn = document.getElementById("deleteCurrentBtn")
const chatControls = document.querySelector(".chat-controls")
const moodInfoBtn = document.getElementById("moodInfoBtn")

const recentsKey = `mindease_recents_${user?.email || "guest"}`
const activeSessionKey = `mindease_active_chat_${user?.email || "guest"}`

let sessions = []
let activeSessionId = ""
let isSending = false

if (user) {
  welcomeUser.innerText = `Welcome back, ${user.full_name}.`
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatMessage(text) {
  const safe = escapeHtml(text || "")
  const withBold = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  const blocks = withBold.split(/\n\s*\n/).filter(Boolean)
  if (!blocks.length) return ""
  return blocks.map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`).join("")
}

function addMessage(role, text) {
  const box = document.createElement("div")
  box.className = `message ${role === "user" ? "user" : "ai"}`
  box.innerHTML = formatMessage(text)
  chatMessages.appendChild(box)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

function renderEmptyState() {
  chatMessages.innerHTML = "<div class='chat-empty-state'>Start a conversation. Your new messages will appear here.</div>"
}

function addTypingIndicator() {
  const box = document.createElement("div")
  box.className = "message ai typing-indicator"
  box.innerHTML = "<span class='typing-label'>MindEase is typing</span><span class='typing-dots'><span></span><span></span><span></span></span>"
  chatMessages.appendChild(box)
  chatMessages.scrollTop = chatMessages.scrollHeight
  return box
}

function setTypingStatus(visible) {
  if (!typingStatus) return
  typingStatus.classList.toggle("hidden", !visible)
}

function setChatBusy(visible) {
  isSending = visible
  if (sendBtn) {
    sendBtn.disabled = visible
    sendBtn.classList.toggle("is-loading", visible)
  }
  if (messageInput) {
    messageInput.disabled = visible
    messageInput.classList.toggle("chat-input-disabled", visible)
  }
  if (chatControls) {
    chatControls.classList.toggle("is-busy", visible)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadSessions() {
  const raw = localStorage.getItem(recentsKey)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSessions() {
  localStorage.setItem(recentsKey, JSON.stringify(sessions))
}

function makeSessionTitle(message) {
  const compact = (message || "New conversation").replace(/\s+/g, " ").trim()
  if (compact.length <= 42) return compact
  return `${compact.slice(0, 39)}...`
}

function makePreview(text) {
  const compact = (text || "").replace(/\s+/g, " ").trim()
  if (!compact) return "No messages yet"
  if (compact.length <= 58) return compact
  return `${compact.slice(0, 55)}...`
}

function inferFeelingFromUserText(text) {
  const msg = (text || "").toLowerCase()
  if (!msg.trim()) return { mood: "", summary: "" }

  if (/(kill myself|end my life|suicide|die|can't go on|cant go on|self harm|hurt myself)/.test(msg)) {
    return { mood: "anxious", summary: "Suicidal burden support" }
  }
  if (/(anxious|anxiety|panic|overthinking|nervous)/.test(msg)) {
    return { mood: "anxious", summary: "Anxiety support" }
  }
  if (/(stressed|pressure|deadline|burnout|overloaded)/.test(msg)) {
    return { mood: "stressed", summary: "Stress support" }
  }
  if (/(sad|empty|hopeless|lonely|cry|down)/.test(msg)) {
    return { mood: "sad", summary: "Low mood support" }
  }
  if (/(tired|drained|exhausted|sleepy)/.test(msg)) {
    return { mood: "tired", summary: "Fatigue support" }
  }
  if (/(grateful|thankful|appreciate)/.test(msg)) {
    return { mood: "grateful", summary: "Gratitude support" }
  }
  if (/(happy|good|better|calm|peaceful|fine)/.test(msg)) {
    return { mood: "happy", summary: "Positive mood support" }
  }

  const supportTopics = [
    { regex: /(relationship|breakup|partner|family|friend)/, label: "relationship strain" },
    { regex: /(work|job|office|boss|career)/, label: "work stress" },
    { regex: /(study|exam|college|school|assignment)/, label: "academic pressure" },
    { regex: /(sleep|insomnia|night|rest)/, label: "sleep difficulties" },
    { regex: /(money|debt|rent|financial|bills)/, label: "financial stress" }
  ]

  const matchedTopic = supportTopics.find((topic) => topic.regex.test(msg))
  if (matchedTopic) {
    return {
      mood: "neutral",
      summary: `${matchedTopic.label} support`
    }
  }

  return { mood: "neutral", summary: "Emotional support" }
}

function makeFeelingLabel(summary, mood) {
  const cleanSummary = (summary || "").trim()
  const cleanMood = (mood || "").trim()
  if (cleanSummary) return cleanSummary
  if (cleanMood) return `Seems ${cleanMood}`
  return ""
}

function getActiveSession() {
  return sessions.find((item) => item.id === activeSessionId)
}

function createSession(initialTitle = "New conversation") {
  const session = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: initialTitle,
    updatedAt: Date.now(),
    messages: []
  }
  sessions.unshift(session)
  activeSessionId = session.id
  localStorage.setItem(activeSessionKey, activeSessionId)
  saveSessions()
  return session
}

function renderSessionMessages() {
  const session = getActiveSession()
  chatMessages.innerHTML = ""
  if (!session || !session.messages.length) {
    renderEmptyState()
    return
  }

  session.messages.forEach((item) => addMessage(item.role, item.content))
}

function renderRecents() {
  if (!recentChats) return
  recentChats.innerHTML = ""

  if (!sessions.length) {
    recentChats.innerHTML = "<div class='recent-empty'>No chats yet</div>"
    return
  }

  sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((session) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = `recent-item ${session.id === activeSessionId ? "active" : ""}`
      const moodSummary = makeFeelingLabel(session.feelingSummary, session.inferredMood)
      const displaySummary = moodSummary || "Support check-in"
      btn.innerHTML = `<span class='recent-feeling'>${escapeHtml(displaySummary)}</span><span class='recent-time'>${new Date(session.updatedAt).toLocaleDateString()}</span><span class='recent-delete' title='Delete chat'>×</span>`
      btn.onclick = () => {
        activeSessionId = session.id
        localStorage.setItem(activeSessionKey, activeSessionId)
        renderRecents()
        renderSessionMessages()
      }
      const deleteIcon = btn.querySelector(".recent-delete")
      if (deleteIcon) {
        deleteIcon.onclick = (e) => {
          e.stopPropagation()
          deleteSession(session.id)
        }
      }
      recentChats.appendChild(btn)
    })
}

function deleteSession(sessionId) {
  sessions = sessions.filter((item) => item.id !== sessionId)

  if (!sessions.length) {
    const created = createSession("New conversation")
    activeSessionId = created.id
  } else if (activeSessionId === sessionId) {
    activeSessionId = sessions[0].id
  }

  localStorage.setItem(activeSessionKey, activeSessionId)
  saveSessions()
  renderRecents()
  renderSessionMessages()
}

function addToActiveSession(role, content) {
  let session = getActiveSession()
  if (!session) {
    session = createSession(makeSessionTitle(content))
  }

  if (!session.messages.length && role === "user") {
    session.title = makeSessionTitle(content)
    const firstFeeling = inferFeelingFromUserText(content)
    session.inferredMood = firstFeeling.mood
    session.feelingSummary = firstFeeling.summary
    session.feelingLockedFromFirstUser = true
  }

  session.messages.push({
    role,
    content,
    createdAt: Date.now()
  })
  session.updatedAt = Date.now()

  sessions = sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  saveSessions()
  renderRecents()
}

function updateActiveSessionFeeling(analysis) {
  const session = getActiveSession()
  if (!session || !analysis) return

  if (session.feelingLockedFromFirstUser) {
    saveSessions()
    renderRecents()
    return
  }

  session.inferredMood = analysis.inferred_mood || session.inferredMood || ""
  session.feelingSummary = analysis.feeling_summary || session.feelingSummary || ""
  session.updatedAt = Date.now()
  saveSessions()
  renderRecents()
}

async function bootstrapHistory() {
  sessions = loadSessions()
  activeSessionId = localStorage.getItem(activeSessionKey) || ""

  if (!sessions.length) {
    try {
      const data = await apiGet("/chat/history?limit=40")
      if (data.messages && data.messages.length) {
        const initial = createSession(makeSessionTitle(data.messages[0].content || "Previous chat"))
        initial.messages = data.messages.map((item) => ({
          role: item.role,
          content: item.content,
          createdAt: Date.now()
        }))
        initial.updatedAt = Date.now()
        saveSessions()
      }
    } catch {
      createSession("New conversation")
    }
  }

  if (!activeSessionId && sessions.length) {
    activeSessionId = sessions[0].id
    localStorage.setItem(activeSessionKey, activeSessionId)
  }

  if (!sessions.length) {
    createSession("New conversation")
  }

  renderRecents()
  renderSessionMessages()
}

async function sendMessage() {
  const message = messageInput.value.trim()
  if (!message) return
  if (isSending) return

  const emptyState = chatMessages.querySelector(".chat-empty-state")
  if (emptyState) {
    emptyState.remove()
  }

  chatError.innerText = ""
  addMessage("user", message)
  addToActiveSession("user", message)

  messageInput.value = ""
  setChatBusy(true)
  setTypingStatus(true)
  const typingBox = addTypingIndicator()
  const startedAt = Date.now()

  try {
    const data = await apiPost("/chat", { message })
    addMessage("assistant", data.reply)
    addToActiveSession("assistant", data.reply)
    updateActiveSessionFeeling(data.analysis)
  } catch (err) {
    chatError.innerText = err.message || "Unable to connect to server."
  } finally {
    const elapsed = Date.now() - startedAt
    const minVisibleMs = 1100
    if (elapsed < minVisibleMs) {
      await sleep(minVisibleMs - elapsed)
    }
    typingBox.remove()
    setTypingStatus(false)
    setChatBusy(false)
    messageInput.focus()
  }
}

async function logMood(mood) {
  try {
    await apiPost("/mood", {
      mood,
      note: moodNote.value.trim()
    })
    moodNote.value = ""
    const note = `Mood saved: ${mood}. You can view trends in dashboard.`
    addMessage("assistant", note)
    addToActiveSession("assistant", note)
  } catch (err) {
    chatError.innerText = err.message
  }
}

newChatBtn.onclick = () => {
  createSession("New conversation")
  saveSessions()
  renderRecents()
  renderSessionMessages()
}

if (deleteCurrentBtn) {
  deleteCurrentBtn.onclick = () => {
    if (!activeSessionId) return
    deleteSession(activeSessionId)
  }
}

sendBtn.onclick = sendMessage
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage()
  }
})

moodButtons.forEach((btn) => {
  btn.onclick = () => logMood(btn.dataset.mood)
})

moodInfoBtn?.addEventListener("mouseenter", () => {})

moodInfoBtn?.addEventListener("focus", () => {})

document.getElementById("logoutBtn").onclick = () => {
  clearAuth()
  window.location.href = "index.html"
}

bootstrapHistory()
