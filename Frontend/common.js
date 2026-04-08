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
  const baseUrl = await apiBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: useAuth ? authHeaders() : { "Content-Type": "application/json" }
  })
  if (res.status === 401) {
    clearAuth()
    window.location.href = "index.html"
    throw new Error("Unauthorized")
  }
  return res.json()
}

async function apiPost(path, body, useAuth = true) {
  const baseUrl = await apiBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: useAuth ? authHeaders() : { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (res.status === 401) {
    clearAuth()
    window.location.href = "index.html"
    throw new Error("Unauthorized")
  }
  if (!res.ok) {
    throw new Error(data.detail || "Request failed")
  }
  return data
}

async function apiPut(path, body, useAuth = true) {
  const baseUrl = await apiBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: useAuth ? authHeaders() : { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (res.status === 401) {
    clearAuth()
    window.location.href = "index.html"
    throw new Error("Unauthorized")
  }
  if (!res.ok) {
    throw new Error(data.detail || "Request failed")
  }
  return data
}

async function apiDelete(path, useAuth = true) {
  const baseUrl = await apiBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: useAuth ? authHeaders() : { "Content-Type": "application/json" }
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearAuth()
    window.location.href = "index.html"
    throw new Error("Unauthorized")
  }
  if (!res.ok) {
    throw new Error(data.detail || "Request failed")
  }
  return data
}

document.addEventListener("DOMContentLoaded", () => {
  bindBrandRedirect()
  bindHeaderAuthLink()
})
