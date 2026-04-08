const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
const API_CANDIDATES = isLocalHost
  ? [
      `${window.location.origin}/api`,
      "http://127.0.0.1:8000/api",
      "http://localhost:8000/api",
      "https://mindease-v3.onrender.com/api",
    ]
  : ["https://mindease-v3.onrender.com/api"]

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

async function apiBaseUrl() {
  return resolveApiUrl()
}

const REQUEST_TIMEOUT_MS = 15000

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function apiRequest(path, method, body, useAuth = true) {
  const baseUrl = await apiBaseUrl()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: useAuth ? authHeaders() : { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const data = await safeJson(res)

    if (res.status === 401) {
      clearAuth()
      window.location.href = "index.html"
      throw new Error("Unauthorized")
    }

    if (!res.ok) {
      if (res.status >= 500) {
        throw new Error("Server is temporarily unavailable")
      }
      throw new Error(data.detail || "Request failed")
    }

    return data
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out")
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

function getToken() {
  return localStorage.getItem("mindease_token") || ""
}

function getUser() {
  const raw = localStorage.getItem("mindease_user")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveAuth(token, user) {
  localStorage.setItem("mindease_token", token)
  localStorage.setItem("mindease_user", JSON.stringify(user))
}

function clearAuth() {
  localStorage.removeItem("mindease_token")
  localStorage.removeItem("mindease_user")
}

function authHeaders() {
  const token = getToken()
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }
}

function requireAuth() {
  const token = getToken()
  if (!token) {
    window.location.href = "index.html"
  }
}

function bindBrandRedirect() {
  const brandWrap = document.querySelector(".brand-wrap")
  if (!brandWrap) return

  brandWrap.style.cursor = "pointer"
  brandWrap.onclick = () => {
    window.location.href = getToken() ? "dashboard.html" : "index.html"
  }
}

function bindHeaderAuthLink() {
  const authLink = document.getElementById("headerAuthLink")
  if (!authLink) return

  const token = getToken()
  if (token) {
    authLink.textContent = "Dashboard"
    authLink.setAttribute("href", "dashboard.html")
  } else {
    authLink.textContent = "Sign In"
    authLink.setAttribute("href", "auth.html?redirect=dashboard")
  }
}

async function apiGet(path, useAuth = true) {
  return apiRequest(path, "GET", undefined, useAuth)
}

async function apiPost(path, body, useAuth = true) {
  return apiRequest(path, "POST", body, useAuth)
}

async function apiPut(path, body, useAuth = true) {
  return apiRequest(path, "PUT", body, useAuth)
}

async function apiDelete(path, useAuth = true) {
  return apiRequest(path, "DELETE", undefined, useAuth)
}

document.addEventListener("DOMContentLoaded", () => {
  bindBrandRedirect()
  bindHeaderAuthLink()
})
