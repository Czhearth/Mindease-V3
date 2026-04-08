(function () {
  const THEME_KEY = "mindease_theme"

  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark")
  }

  function currentTheme() {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === "dark" || saved === "light") {
      return saved
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  function bindToggle() {
    const btn = document.getElementById("themeToggle")
    if (!btn) return

    const updateIcon = (theme) => {
      btn.textContent = theme === "dark" ? "☀" : "🌙"
    }

    let theme = currentTheme()
    applyTheme(theme)
    updateIcon(theme)

    btn.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark"
      localStorage.setItem(THEME_KEY, theme)
      applyTheme(theme)
      updateIcon(theme)
    })
  }

  document.addEventListener("DOMContentLoaded", bindToggle)
})()
