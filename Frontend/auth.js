const tabLogin = document.getElementById("tabLogin")
const tabSignup = document.getElementById("tabSignup")
const nameFieldWrap = document.getElementById("nameFieldWrap")
const authSubmit = document.getElementById("authSubmit")
const authForm = document.getElementById("authForm")
const authMessage = document.getElementById("authMessage")
const authModal = document.getElementById("authModal")
const beginBtn = document.getElementById("beginBtn")
const headerSignIn = document.getElementById("headerSignIn")
const closeAuth = document.getElementById("closeAuth")

let mode = "login"
const params = new URLSearchParams(window.location.search)

const API_URL = window.ME_API_URL || "http://127.0.0.1:8000/api"

function getRedirectTarget() {
  const redirect = (params.get("redirect") || "").trim().toLowerCase()
  if (redirect === "dashboard") return "dashboard.html"
  if (redirect === "chat") return "chat.html"
  return "chat.html"
}

function setMode(nextMode) {
  mode = nextMode
  const signUp = mode === "signup"
  tabLogin.classList.toggle("active", !signUp)
  tabSignup.classList.toggle("active", signUp)
  nameFieldWrap.classList.toggle("hidden", !signUp)
  authSubmit.innerText = signUp ? "Create Account" : "Login"
  authMessage.innerText = ""
}

function showAuthModal() {
  authModal.classList.remove("hidden")
  document.body.style.overflow = "hidden"
}

function hideAuthModal() {
  authModal.classList.add("hidden")
  document.body.style.overflow = "auto"
  authForm.reset()
  authMessage.innerText = ""
}

async function safeIntro() {
  const token = localStorage.getItem("mindease_token") || ""
  if (!token) return
  try {
    const res = await fetch(`${API_URL}/intro`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (!res.ok) return
    const data = await res.json()
  } catch {
    // Silently fail
  }
}

function saveAuth(token, user) {
  localStorage.setItem("mindease_token", token)
  localStorage.setItem("mindease_user", JSON.stringify(user))
}

function clearAuthLocal() {
  localStorage.removeItem("mindease_token")
  localStorage.removeItem("mindease_user")
}

function updateHomeAuthButton() {
  if (!headerSignIn) return

  const token = localStorage.getItem("mindease_token") || ""
  if (token) {
    headerSignIn.innerText = "Logout"
    headerSignIn.onclick = () => {
      clearAuthLocal()
      window.location.href = "index.html"
    }
    return
  }

  headerSignIn.innerText = "Sign In"
  headerSignIn.onclick = showAuthModal
}

let landingMoodSliderFrame = null

function updateLandingMoodSelection(slider) {
  const moodOptions = Array.from(document.querySelectorAll(".mood-option"))
  if (!moodOptions.length || !slider) return

  const min = Number(slider.min || 1)
  const max = Number(slider.max || 5)
  const value = Number(slider.value || min)
  const activeIndex = Math.max(0, Math.min(moodOptions.length - 1, Math.round(value - min)))

  moodOptions.forEach((option, index) => {
    option.classList.toggle("active", index === activeIndex)
  })
}

function buildLandingMoodSliderBackground(percent) {
  const clamped = Math.max(0, Math.min(100, percent))
  const fill = "rgba(149, 215, 196, 0.95)"
  const track = "rgba(79, 123, 152, 0.55)"
  return `linear-gradient(90deg, ${fill} 0%, ${fill} ${clamped}%, ${track} ${clamped}%, ${track} 100%)`
}

function updateLandingMoodSliderFill(slider, animated = true) {
  if (!slider) return

  const min = Number(slider.min || 1)
  const max = Number(slider.max || 5)
  const value = Number(slider.value || min)
  const percent = ((value - min) / (max - min)) * 100

  if (!animated) {
    slider.style.background = buildLandingMoodSliderBackground(percent)
    slider.dataset.fillPercent = String(percent)
    return
  }

  if (landingMoodSliderFrame) {
    cancelAnimationFrame(landingMoodSliderFrame)
  }

  const startPercent = Number(slider.dataset.fillPercent || percent)
  const startTime = performance.now()
  const duration = 160

  const animate = (now) => {
    const progress = Math.min((now - startTime) / duration, 1)
    const eased = progress * progress * (3 - 2 * progress)
    const nextPercent = startPercent + (percent - startPercent) * eased
    slider.style.background = buildLandingMoodSliderBackground(nextPercent)

    if (progress < 1) {
      landingMoodSliderFrame = requestAnimationFrame(animate)
    } else {
      slider.dataset.fillPercent = String(percent)
    }
  }

  landingMoodSliderFrame = requestAnimationFrame(animate)
}

function initLandingMoodSlider() {
  const slider = document.getElementById("landingMoodSlider")
  if (!slider) return

  updateLandingMoodSliderFill(slider, false)
  updateLandingMoodSelection(slider)
  slider.addEventListener("input", () => {
    updateLandingMoodSliderFill(slider, true)
    updateLandingMoodSelection(slider)
  })
}

// Event Listeners
tabLogin.onclick = () => setMode("login")
tabSignup.onclick = () => setMode("signup")
beginBtn.onclick = () => {
  const token = localStorage.getItem("mindease_token") || ""
  if (token) {
    window.location.href = "dashboard.html"
    return
  }
  showAuthModal()
}
closeAuth.onclick = hideAuthModal

updateHomeAuthButton()
initLandingMoodSlider()

if (params.get("auth") === "1") {
  showAuthModal()
}

if (params.get("mode") === "signup") {
  setMode("signup")
}

authForm.onsubmit = async (e) => {
  e.preventDefault()
  authMessage.classList.remove("ok")

  const fullName = document.getElementById("fullName").value.trim()
  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value

  if (mode === "signup" && fullName.length < 2) {
    authMessage.innerText = "Please enter your full name."
    return
  }

  try {
    const endpoint = mode === "signup" ? "/auth/register" : "/auth/login"
    const body = mode === "signup"
      ? { full_name: fullName, email, password }
      : { email, password }

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    const data = await res.json()
    if (!res.ok) {
      authMessage.innerText = data.detail || "Authentication failed."
      return
    }

    saveAuth(data.token, data.user)
    authMessage.classList.add("ok")
    authMessage.innerText = "Authentication successful. Redirecting..."
    await safeIntro()

    setTimeout(() => {
      window.location.href = getRedirectTarget()
    }, 700)
  } catch {
    authMessage.innerText = "Network error. Please try again."
  }
}

// Close modal when clicking outside
authModal.addEventListener("click", (e) => {
  if (e.target === authModal) {
    hideAuthModal()
  }
})
