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
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn")
const passwordInput = document.getElementById("password")
const showPasswordToggle = document.getElementById("showPasswordToggle")
const AUTH_PAGE = "auth.html"

let mode = "login"
const params = new URLSearchParams(window.location.search)
const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
const API_CANDIDATES = isLocalHost
? [
window.location.origin + "/api",
"http://127.0.0.1:8000/api",
"http://localhost:8000/api",
"https://mindease-v3.onrender.com/api"
]
: ["https://mindease-v3.onrender.com/api"]

async function resolveApiUrl() {
const cached = localStorage.getItem("mindease_api_url") || ""
if (cached) {
  try {
    const res = await fetch(cached + "/health", { method: "GET" })
    if (res.ok) return cached
  } catch {
    localStorage.removeItem("mindease_api_url")
  }
}

for (const candidate of API_CANDIDATES) {
  try {
    const res = await fetch(candidate + "/health", { method: "GET" })
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
if (forgotPasswordBtn) {
forgotPasswordBtn.classList.toggle("hidden", signUp)
}
}

function showAuthModal() {
if (!authModal) {
window.location.href = `${AUTH_PAGE}?redirect=dashboard`
return
}
authModal.classList.remove("hidden")
document.body.style.overflow = "hidden"
}

function hideAuthModal() {
authModal.classList.add("hidden")
document.body.style.overflow = "auto"
authForm.reset()
authMessage.innerText = ""
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
} else {
headerSignIn.innerText = "Sign In"
headerSignIn.onclick = () => {
window.location.href = `${AUTH_PAGE}?redirect=dashboard`
}
}
}

// ================= AUTH LOGIC =================

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
const apiUrl = await resolveApiUrl()
const endpoint = mode === "signup" ? "/auth/register" : "/auth/login"

const body = mode === "signup"
  ? { full_name: fullName, email, password }
  : { email, password }

const res = await fetch(`${apiUrl}${endpoint}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
})

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

// ================= EVENTS =================

tabLogin.onclick = () => setMode("login")
tabSignup.onclick = () => setMode("signup")

if (showPasswordToggle && passwordInput) {
showPasswordToggle.addEventListener("change", () => {
passwordInput.type = showPasswordToggle.checked ? "text" : "password"
})
}

beginBtn.onclick = () => {
const token = localStorage.getItem("mindease_token") || ""

if (token) {
window.location.href = "dashboard.html"
} else {
window.location.href = `${AUTH_PAGE}?redirect=dashboard`
}
}

closeAuth.onclick = hideAuthModal

if (forgotPasswordBtn) {
forgotPasswordBtn.onclick = async () => {
const emailInput = document.getElementById("email")
const email = (emailInput?.value || "").trim()

if (!email) {
authMessage.classList.remove("ok")
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
authMessage.classList.remove("ok")
authMessage.innerText = "Could not send reset link. Please try again."
return
}

authMessage.classList.add("ok")
authMessage.innerText = "If your email exists, a reset link has been sent."
} catch (err) {
console.error("FORGOT PASSWORD ERROR:", err)
authMessage.classList.remove("ok")
authMessage.innerText = "Could not send reset link. Please try again."
}
}
}

authModal.addEventListener("click", (e) => {
if (e.target === authModal) hideAuthModal()
})

updateHomeAuthButton()
setMode("login")