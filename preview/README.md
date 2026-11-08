# JOA GAMERs — Preview

Esta carpeta contiene una interfaz de presentación independiente. No modifica la página raíz ni la APK existente.

## Estructura
- `index.html`: página y secciones principales.
- `styles.css`: diseño responsive, motion y navegación móvil.
- `app.js`: interacciones, búsqueda de categorías y lector opcional del JSON.
- `config.js`: configuración pública del cliente Supabase y URL opcional del catálogo.
- `../supabase/joa-social-schema.sql`: esquema social inicial con RLS.

## Publicación
GitHub Pages sirve esta vista en:
`https://junior18cubano-hash.github.io/mi-catalogo/preview/`

## Activar Supabase con seguridad
1. Abre el proyecto Supabase y entra en SQL Editor.
2. Revisa el archivo `supabase/joa-social-schema.sql` y ejecútalo en el proyecto correcto.
3. En Authentication configura los proveedores y las URLs permitidas de GitHub Pages.
4. Comprueba las políticas RLS antes de permitir usuarios reales.
5. Cambia `enableSupabase` a `true` en `config.js` solo después de probar autenticación y políticas.

La clave publishable es apta para frontend con RLS. Nunca publiques una clave `service_role`, contraseñas o secretos administrativos.

## Catálogo XAMPP
Cuando exista una URL pública HTTPS para el JSON exportado por el panel local, colócala en `catalogJsonUrl`. El export debe incluir `items[]` con `title`, `type`, `synopsis` y opcionalmente `cover`. Para imágenes externas conviene validar dominios y configurar CORS. No se conecta directamente a MySQL desde el navegador.

## Módulos contemplados
Perfiles, feed, comentarios, reacciones, amistades, grupos, mensajería privada, reseñas y favoritos. La interfaz actual es una preview visual: el esquema SQL prepara las tablas y políticas, pero las pantallas sociales conectadas, moderación, notificaciones, chat realtime y panel administrativo requieren una siguiente fase de implementación y pruebas.

## No incluido todavía
- No se modificó la página de descarga APK ni el contenido de la raíz.
- No se importaron ni alteraron tablas existentes.
- No se activó login social automáticamente.
- No se expone ningún secreto privado.
