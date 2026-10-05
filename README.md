# JOA GAMERs — Landing Page V2

Página estática futurista para descargar la APK de JOA GAMERs.

## Archivos

- `index.html` — estructura completa.
- `styles.css` — diseño, responsive y animaciones.
- `config.js` — configuración de GitHub/APK.
- `script.js` — detección de versiones, descarga, QR y UI.
- `assets/logo.svg` — logo.

## Configuración de GitHub Releases

Abre `config.js` y cambia:

```js
GITHUB_REPO: "TU-USUARIO/joa-gamers-apk",
APK_ASSET_NAME: "JOA-GAMERs.apk",
```

Ejemplo:

```js
GITHUB_REPO: "junior18cubano-hash/joa-gamers-apk",
APK_ASSET_NAME: "JOA-GAMERs.apk",
```

Luego crea una Release en ese repositorio y adjunta el APK como asset.

La página consulta automáticamente:

`https://api.github.com/repos/USUARIO/REPOSITORIO/releases/latest`

y obtiene:

- número/tag de versión;
- enlace del APK;
- cantidad de descargas del asset;
- última Release disponible.

## GitHub Pages

1. Crea un repositorio para la web.
2. Sube todo el contenido.
3. GitHub → Settings → Pages.
4. Source: Deploy from a branch.
5. Branch: `main`.
6. Folder: `/ (root)`.
7. Guardar.

## QR

El QR apunta automáticamente a la URL actual de la web. En PC, un usuario puede escanearlo con su Android y abrir la página en el teléfono.

## Importante

La API pública de GitHub tiene límites de consulta. Para una página normal con visitas moderadas funciona bien. No requiere servidor propio.


## Categoría NOVELAS TV

En JOA GAMERs, **Novelas TV** significa telenovelas y novelas de televisión,
no libros ni novelas literarias. Incluye contenido mexicano, turco, coreano,
brasileño e internacional.
