// ============================================================
// JOA GAMERs — CONFIGURACIÓN
// ============================================================
// Integración con GitHub Releases para la APK oficial.
// La página consulta automáticamente la última Release pública.
// ============================================================

const JOA_CONFIG = {
  // Repositorio real de la APK
  GITHUB_REPO: "junior18cubano-hash/Apk-JOA",

  // Nombre exacto del APK adjunto a la Release
  APK_ASSET_NAME: "Catalogo.Joa.apk.apk",

  // Respaldo dinámico: siempre descarga el asset de la última Release publicada.
  // Evita quedar anclado a una versión antigua cuando falla la consulta a la API.
  FALLBACK_APK_URL:
    "https://github.com/junior18cubano-hash/Apk-JOA/releases/latest/download/Catalogo.Joa.apk.apk",

  // URL pública de ESTA página. Vacía = URL actual del navegador.
  SITE_URL: "",

  APP_NAME: "JOA GAMERs",
  APP_TAGLINE: "Tu mundo digital en una sola app"
};
