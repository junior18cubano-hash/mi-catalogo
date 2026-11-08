let latestRelease = null;
const $ = (s) => document.querySelector(s);

function isConfigured() {
  return JOA_CONFIG.GITHUB_REPO &&
    !JOA_CONFIG.GITHUB_REPO.includes("TU-USUARIO");
}

function siteUrl() {
  return JOA_CONFIG.SITE_URL || window.location.href.split("#")[0];
}

async function getLatestRelease() {
  if (!isConfigured()) return null;
  const response = await fetch(
    `https://api.github.com/repos/${JOA_CONFIG.GITHUB_REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!response.ok) throw new Error("GitHub API: " + response.status);
  return response.json();
}

function findApkAsset(release) {
  if (!release?.assets?.length) return null;
  return release.assets.find(a => a.name === JOA_CONFIG.APK_ASSET_NAME)
      || release.assets.find(a => a.name.toLowerCase().endsWith(".apk"));
}

function setDownloadLinks(url) {
  ["hero-download","cta-download","mobile-download","modal-download"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = url || "#";
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function loadRelease() {
  try {
    const release = await getLatestRelease();

    if (!release) {
      setText("nav-version", "CONFIGURA APK");
      setText("release-version", "CONFIGURA GITHUB");
      setText("hero-version", "CONFIGURA TU APK");
      setText("cta-version", "CONFIGURA TU APK");
      return;
    }

    latestRelease = release;
    const asset = findApkAsset(release);
    const version = release.tag_name || "Última";
    const downloadUrl = asset?.browser_download_url || JOA_CONFIG.FALLBACK_APK_URL;

    setText("nav-version", version);
    setText("release-version", version);
    setText("hero-version", version);
    setText("cta-version", version);
    setText("mobile-version", version);
    setText("download-count", `Descargas: ${asset ? asset.download_count.toLocaleString("es-ES") : "—"}`);

    setDownloadLinks(downloadUrl);
    setText("release-badge", "ONLINE");
  } catch (error) {
    console.warn(error);
    setText("nav-version", "ONLINE");
    setText("release-version", "NO DISPONIBLE");
    setDownloadLinks(JOA_CONFIG.FALLBACK_APK_URL || "#");
  }
}

function createQR() {
  const box = document.getElementById("qrcode");
  if (!box || typeof QRCode === "undefined") return;
  box.innerHTML = "";
  new QRCode(box, {
    text: siteUrl(),
    width: 70,
    height: 70,
    colorDark: "#03060d",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

function showUpdateModal(title, text, download = false) {
  setText("modal-title", title);
  setText("modal-text", text);
  const link = $("#modal-download");
  link.style.display = download ? "inline-flex" : "none";
  $("#update-modal").classList.add("open");
  $("#update-modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#update-modal").classList.remove("open");
  $("#update-modal").setAttribute("aria-hidden", "true");
}

async function checkForUpdate() {
  if (!isConfigured()) {
    showUpdateModal("Configuración pendiente", "Abre config.js y coloca tu repositorio de GitHub para activar la detección automática de versiones.");
    return;
  }
  try {
    const release = await getLatestRelease();
    if (!release) throw new Error("No release");
    const version = release.tag_name || "nueva versión";
    const asset = findApkAsset(release);
    const url = asset?.browser_download_url || JOA_CONFIG.FALLBACK_APK_URL;
    setDownloadLinks(url);
    latestRelease = release;
    showUpdateModal(
      `Versión disponible: ${version}`,
      `GitHub confirma que esta es la última Release publicada. ${asset ? "El APK está listo para descargar." : "Publica el APK como asset de la Release."}`,
      Boolean(url)
    );
  } catch {
    showUpdateModal("No se pudo comprobar", "GitHub no respondió en este momento. Puedes intentarlo nuevamente en unos segundos.");
  }
}

// Descargar: si no está configurado, informa sin romper la página.
["hero-download","cta-download","mobile-download"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", (e) => {
    const href = e.currentTarget.getAttribute("href");
    if (!href || href === "#") {
      e.preventDefault();
      showToast("Configura tu repositorio/APK en config.js");
    }
  });
});

$("#check-update")?.addEventListener("click", checkForUpdate);
$("#modal-close")?.addEventListener("click", closeModal);
$("#modal-ok")?.addEventListener("click", closeModal);
$("#update-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "update-modal") closeModal();
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
}, { threshold: .12 });
document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

$(".menu-btn")?.addEventListener("click", () => $(".nav-links").classList.toggle("mobile-open"));

const glow = $(".cursor-glow");
window.addEventListener("pointermove", e => {
  if (window.innerWidth > 900) {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
  }
});

// Partículas muy ligeras.
const particleBox = $(".particles");
for (let i = 0; i < 35; i++) {
  const p = document.createElement("i");
  p.className = "particle";
  p.style.left = Math.random() * 100 + "%";
  p.style.animationDuration = (8 + Math.random() * 15) + "s";
  p.style.animationDelay = (-Math.random() * 15) + "s";
  particleBox.appendChild(p);
}

createQR();
loadRelease();
