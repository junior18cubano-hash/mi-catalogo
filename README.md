# JOA GAMERs · IOA Multiverso

Web estática del catálogo multimedia y la comunidad JOA, publicada mediante GitHub Pages.

## Estructura principal

- `index.html`: página principal, catálogo y comunidad.
- `styles.css`: diseño responsive, modales y estilos de la comunidad.
- `app.js`: catálogo, autenticación, perfiles, amigos, chats, grupos y notificaciones.
- `config.js`: configuración pública de Supabase y URL del catálogo JSON.
- `actualizacion/`: página pública para consultar y descargar la APK desde GitHub Releases.
- `assets/`: iconos y logotipos.
- `supabase/`: notas y scripts SQL históricos.

## Publicación

GitHub Pages utiliza la rama `main` y la carpeta raíz (`/ `). La página principal está en:

`https://junior18cubano-hash.github.io/mi-catalogo/`

La página de descarga de la APK está en:

`https://junior18cubano-hash.github.io/mi-catalogo/actualizacion/`

## Catálogo

La web lee el JSON remoto configurado en `config.js` mediante `catalogJsonUrl`. El catálogo se conserva localmente en IndexedDB para permitir que se muestre una copia cuando la conexión falle.

## Supabase y comunidad

La aplicación cliente usa una clave pública *publishable* y las tablas que ya existen en el proyecto Supabase: `profiles`, `friendships`, `conversations`, `conversation_members`, `messages`, `community_groups`, `group_members`, `notifications`, `posts`, `post_comments`, `post_reactions` y `catalog_reviews`.

No coloques nunca claves `service_role`, contraseñas ni secretos privados en `config.js` o en ningún archivo servido al navegador. El acceso a los datos debe seguir protegido por las políticas RLS de Supabase.

### Importante sobre los SQL

- `supabase/joa-social-schema.sql` es un archivo histórico que crea tablas paralelas `joa_*`. **No ejecutarlo en el proyecto actual**: la web no utiliza esas tablas.
- `supabase/fix-direct-chat-membership-recursion.sql` documenta una corrección RLS que ya fue aplicada al proyecto activo. No forma parte de la actualización de frontend.
- Esta versión de la web no ejecuta migraciones ni modifica tablas, políticas o datos de Supabase.

## Categorías

La categoría «Telenovelas» incluye novelas de televisión mexicanas, coreanas, turcas, brasileñas e internacionales; no se refiere a libros o novelas literarias.
