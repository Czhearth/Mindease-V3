const tabLogin = document.getElementById("tabLogin")
const tabSignup = document.getElementById("tabSignup")
const nameFieldWrap = document.getElementById("nameFieldWrap")
const authSubmit = document.getElementById("authSubmit")
const authForm = document.getElementById("authForm")
const authMessage = document.getElementById("authMessage")
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn")

let mode = "login"
const params = new URLSearchParams(window.location.search)
const API_CANDIDATES = [
  `${window.location.origin}/api`,
  "http://127.0.0.1:8000/api",
  "http://localhost:8000/api",
  "https://mindease-v3.onrender.com/api",
]

async function resolveApiUrl() {
  const cached = localStorage.getItem("mindease_api_url") || ""
  if (cached) {
    try {
      const res = await fetch(`${cached}/health`, { method: "GET" })
      if (res.ok) return cached
    } catch {
      localStorage.removeItem("mindease_api_url")
    }
  }

  for (const candidate of API_CANDIDATES) {
    try {
      const res = await fetch(`${candidate}/health`, { method: "GET" })
      if (res.ok) {
        localStorage.setItem("mindease_api_url", candidate)
        return candidate
      }
    } catch {
      continue
    }
  }

  return API_CANDIDATES[API_CANDIDATES.length - 1]
}

function withTimeout(promise, timeoutMs = 12000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return Promise.race([
    promise(controller.signal).finally(() => clearTimeout(timeoutId)),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
    })
  ])
}

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
  forgotPasswordBtn.classList.toggle("hidden", signUp)
  authMessage.classList.remove("ok")
  authMessage.innerText = ""
}

function saveAuth(token, user) {
  localStorage.setItem("mindease_token", token)
  localStorage.setItem("mindease_user", JSON.stringify(user))
}

authForm.onsubmit = async (event) => {
  event.preventDefault()
  authMessage.classList.remove("ok")

  const fullName = document.getElementById("fullName").value.trim()
  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value

  if (mode === "signup" && fullName.length < 2) {
    authMessage.innerText = "Please enter your full name."
    return
  }

  try {
    const apiUrl = await resolveApiUrl()
    const endpoint = mode === "signup" ? "/auth/register" : "/auth/login"
    const body = mode === "signup"
      ? { full_name: fullName, email, password }
      : { email, password }

    const res = await withTimeout(async (signal) => fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal,
    }))

    let data
    try {
      data = await res.json()
    } catch {
      throw new Error("Invalid server response")
    }

    if (!res.ok) {
      if (res.status === 409) {
        authMessage.innerText = "Email already exists. Switch to Login or use another email."
        return
      }
      if (res.status === 401) {
        authMessage.innerText = "Invalid email or password."
        return
      }
      authMessage.innerText = data.detail || "Authentication failed."
      return
    }

    saveAuth(data.token, data.user)
    authMessage.classList.add("ok")
    authMessage.innerText = "Success! Redirecting..."

    setTimeout(() => {
      window.location.href = getRedirectTarget()
    }, 700)
  } catch (err) {
    console.error("AUTH ERROR:", err)
    authMessage.innerText = "Cannot connect to server. Try again."
  }
}

forgotPasswordBtn.onclick = async () => {
  const email = (document.getElementById("email").value || "").trim()
  authMessage.classList.remove("ok")

  if (!email) {
    authMessage.innerText = "Enter your email first, then click Forgot Password."
    return
  }

  try {
    const apiUrl = await resolveApiUrl()
    const res = await fetch(`${apiUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })

    if (!res.ok) {
      authMessage.innerText = "Could not send reset link. Please try again."
      return
    }

    const data = await res.json().catch(() => ({}))
    authMessage.classList.add("ok")
    if (data.reset_link) {
      authMessage.innerText = "Email is not configured on this environment, but the reset link is ready below."
      const link = document.createElement("a")
      link.href = data.reset_link
      link.textContent = "Open password reset link"
      link.target = "_blank"
      link.rel = "noreferrer"
      link.className = "reset-link"
      authMessage.appendChild(document.createElement("br"))
      authMessage.appendChild(link)
      return
    }

    authMessage.innerText = "If your email exists, a reset link has been sent."
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err)
    authMessage.innerText = "Could not send reset link. Please try again."
  }
}

tabLogin.onclick = () => setMode("login")
tabSignup.onclick = () => setMode("signup")

setMode("login")
