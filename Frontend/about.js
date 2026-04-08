requireAuth()

const listWrap = document.getElementById("featureList")
const dataNote = document.getElementById("datasetNote")

async function loadAbout() {
  try {
    const data = await apiGet("/about", false)
    listWrap.innerHTML = ""
    data.highlights.forEach((item) => {
      const div = document.createElement("div")
      div.className = "feature-item"
      div.innerText = item
      listWrap.appendChild(div)
    })
    dataNote.innerText = data.dataset_note
  } catch {
    dataNote.innerText = "Unable to load feature brief."
  }
}

document.getElementById("logoutBtn").onclick = () => {
  clearAuth()
  window.location.href = "index.html"
}

loadAbout()
