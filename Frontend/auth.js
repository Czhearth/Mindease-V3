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

// ✅ FINAL PRODUCTION BACKEND (NO LOCALHOST)
const API_URL = "https://mindease-v3.onrender.com/api"

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
headerSignIn.onclick = showAuthModal
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
const endpoint = mode === "signup" ? "/auth/register" : "/auth/login"

const body = mode === "signup"
  ? { full_name: fullName, email, password }
  : { email, password }

console.log("API CALL →", `${API_URL}${endpoint}`)

const res = await fetch(`${API_URL}${endpoint}`, {
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

beginBtn.onclick = () => {
const token = localStorage.getItem("mindease_token") || ""

if (token) {
window.location.href = "dashboard.html"
} else {
showAuthModal()
}
}

closeAuth.onclick = hideAuthModal

authModal.addEventListener("click", (e) => {
if (e.target === authModal) hideAuthModal()
})

updateHomeAuthButton()