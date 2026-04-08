(function () {
  const startJourneyBtn = document.getElementById("startJourneyBtn")
  if (!startJourneyBtn) return

  startJourneyBtn.addEventListener("click", () => {
    const token = localStorage.getItem("mindease_token") || ""
    if (token) {
      window.location.href = "dashboard.html"
      return
    }

    window.location.href = "index.html?auth=1&redirect=dashboard"
  })
})()
