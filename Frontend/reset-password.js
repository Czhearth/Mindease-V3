const resetForm = document.getElementById("resetForm")
const resetMessage = document.getElementById("resetMessage")
const newPasswordInput = document.getElementById("newPassword")
const confirmPasswordInput = document.getElementById("confirmPassword")

const params = new URLSearchParams(window.location.search)
const token = (params.get("token") || "").trim()

if (!token) {
  resetMessage.innerText = "This reset link is invalid. Request a new one from Sign In."
  resetForm.querySelector("button[type='submit']").disabled = true
}

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault()

  resetMessage.classList.remove("ok")
  const newPassword = newPasswordInput.value
  const confirmPassword = confirmPasswordInput.value

  if (newPassword.length < 8) {
    resetMessage.innerText = "Password must be at least 8 characters."
    return
  }

  if (newPassword !== confirmPassword) {
    resetMessage.innerText = "Passwords do not match."
    return
  }

  if (!token) {
    resetMessage.innerText = "This reset link is invalid."
    return
  }

  try {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token,
        new_password: newPassword
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      resetMessage.innerText = data.detail || "Unable to reset password."
      return
    }

    clearAuth()
    resetMessage.classList.add("ok")
    resetMessage.innerText = "Password updated. Redirecting to sign in..."

    setTimeout(() => {
      window.location.href = "auth.html?redirect=dashboard"
    }, 1200)
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err)
    resetMessage.innerText = "Unable to reset password right now."
  }
})
