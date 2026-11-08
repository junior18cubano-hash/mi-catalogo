(() => {
 "use strict";
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 const dialog=$("#auth-dialog"), toastEl=$("#toast");
 let authMode="signin", supabase=null, currentUser=null;
 const toast=(message)=>{if(!toastEl)return;toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(window.__joaToast);window.__joaToast=setTimeout(()=>toastEl.classList.remove("show"),3600)};
 $("#year").textContent=new Date().getFullYear();
 const openAuth=()=>{if(dialog&&!dialog.open)dialog.showModal();renderAuthMode()};
 $("#login-open").addEventListener("click",openAuth);
 $("#community-join").addEventListener("click",openAuth);
 dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
 $("#search-toggle").addEventListener("click",()=>{$("#search-panel").scrollIntoView({behavior:"smooth",block:"center"});$("#catalog-search").focus()});
 const cards=$$(".category-card");
 const CATALOG_VERSION_URL="https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/version.json";
 const CATALOG_DATA_URL="https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/Update.json";
 const CATALOG_CACHE="joa-web-catalog-v1";
 let catalogItems=[],catalogMeta={},activeCategory="",searchTerm="",sortMode="name",pageSize=18,currentPage=1;
 const categoryAliases={
   juego:["juego","game","games","videojuego","videojuegos"],
   pelicula:["pelicula","película","peliculas","películas","movie","movies","film","pelicula_animada"],
   serie:["serie","series","serie_tv","tv","show"],
   anime:["anime","anime_movie","anime_series"],
   novela:["novela","novelas","novela_tv","novelas_tv","telenovela","telenovelas"],
   software:["software","app","apps","programa","programas"],
   musica:["musica","música","music","audio"],
   otros:["otros","other","misc"]
 };
 const normalizeType=value=>String(value||"").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[ -]/g,"_");
 const itemType=item=>normalizeType(item.type||item.tipo||item.category||item.categoria||"otros");
 const itemTitle=item=>String(item.title||item.name||item.titulo||item.nombre||item.game||"Contenido JOA");
 const itemDescription=item=>String(item.synopsis||item.sinopsis||item.description||item.descripcion||item.overview||item.summary||item.resumen||item.details||"Descubre este contenido en JOA GAMERs.");
 const itemCover=item=>item.cover||item.image||item.poster||item.caratula||item.img||item.thumbnail||item.image_url||item.poster_url||"";
 function resolveCover(value){
   if(!value)return "";
   if(typeof value==="object")value=value.url||value.src||value.path||"";
   const raw=String(value).trim();if(!raw)return "";
   if(/^(https?:|data:|blob:)/i.test(raw))return raw;
   const base=catalogMeta.source_url||"";
   try{return base?new URL(raw,base).href:raw}catch(_){return raw}
 }
 function categoryFor(type){
   const t=normalizeType(type);
   for(const [key,aliases] of Object.entries(categoryAliases))if(aliases.map(normalizeType).includes(t))return key;
   if(t.includes("novela")||t.includes("telenovela"))return "novela";
   if(t.includes("anime"))return "anime";
   if(t.includes("pelicula")||t.includes("movie"))return "pelicula";
   if(t.includes("serie"))return "serie";
   if(t.includes("juego")||t.includes("game"))return "juego";
   if(t.includes("software"))return "software";
   if(t.includes("music")||t.includes("musica"))return "musica";
   return "otros";
 }
 function setCatalogStatus(message,state=""){
   const el=$("#catalog-status");if(!el)return;
   el.textContent=message;el.dataset.state=state;
 }
 function itemYear(item){return Number(item.year||item.ano||item.año||item.release_year||0)||0}
 function itemViews(item){return Number(item.views||item.view_count||item.visitas||item.vistos||item.popularity_count||0)||0}
 function itemRating(item){return Number(item.rating||item.vote_average||item.valoracion||item.puntuacion||0)||0}
 function itemDate(item){const value=item.updated_at||item.created_at||item.added_at||item.release_date||item.fecha||item.date||itemYear(item);const n=Date.parse(value);return Number.isFinite(n)?n:(Number(value)||0)}
 function sortedItems(){
   const filtered=catalogItems.filter(item=>{
     const categoryOk=!activeCategory||categoryFor(itemType(item))===activeCategory;
     const text=[itemTitle(item),itemDescription(item),itemType(item),item.genre,item.genres,item.generos,item.console,item.consola,item.platform,item.plataforma].flat().join(" ").toLocaleLowerCase("es");
     return categoryOk&&(!searchTerm||text.includes(searchTerm));
   });
   return filtered.sort((a,b)=>{
     if(sortMode==="recent")return itemDate(b)-itemDate(a)||itemTitle(a).localeCompare(itemTitle(b),"es");
     if(sortMode==="views")return itemViews(b)-itemViews(a)||itemTitle(a).localeCompare(itemTitle(b),"es");
     if(sortMode==="rating")return itemRating(b)-itemRating(a)||itemTitle(a).localeCompare(itemTitle(b),"es");
     if(sortMode==="year")return itemYear(b)-itemYear(a)||itemTitle(a).localeCompare(itemTitle(b),"es");
     return itemTitle(a).localeCompare(itemTitle(b),"es",{sensitivity:"base"});
   });
 }
 function addDetailLine(parent,label,value){
   if(value===undefined||value===null||value==="")return;
   const p=document.createElement("p");p.className="detail-meta-line";
   const strong=document.createElement("b");strong.textContent=label+": ";
   p.append(strong,document.createTextNode(Array.isArray(value)?value.join(", "):String(value)));parent.append(p);
 }
 function openCatalogDetail(item){
   const dialog=$("#catalog-detail-dialog"),content=$("#catalog-detail-content");if(!dialog||!content)return;
   content.innerHTML="";
   const cover=resolveCover(itemCover(item)),hero=document.createElement("div");hero.className="detail-hero";
   if(cover){const img=document.createElement("img");img.src=cover;img.alt="Portada de "+itemTitle(item);img.onerror=()=>img.remove();hero.append(img)}
   const info=document.createElement("div");info.className="detail-info";
   const tag=document.createElement("small");tag.textContent=String(item.type||item.tipo||item.category||item.categoria||"CATÁLOGO").replace(/_/g," ").toUpperCase();
   const title=document.createElement("h2");title.textContent=itemTitle(item);
   const description=document.createElement("p");description.className="detail-description";description.textContent=itemDescription(item);
   info.append(tag,title,description);
   addDetailLine(info,"Año",item.year||item.ano||item.año||item.release_year);
   addDetailLine(info,"Género",item.genre||item.genres||item.generos||item.genero);
   addDetailLine(info,"Plataforma",item.console||item.consola||item.platform||item.plataforma);
   addDetailLine(info,"Valoración",item.rating||item.vote_average||item.valoracion);
   addDetailLine(info,"Vistas",item.views||item.view_count||item.visitas||item.vistos);
   addDetailLine(info,"Temporadas",item.seasons||item.temporadas);
   addDetailLine(info,"Episodios",item.episodes||item.capitulos||item.episodios);
   addDetailLine(info,"Duración",item.duration||item.duracion||item.runtime);
   addDetailLine(info,"Director",item.director);
   addDetailLine(info,"Precio",item.price||item.precio);
   content.append(hero,info);dialog.showModal();
 }
 function renderPagination(totalPages){
   ["#catalog-pagination","#catalog-pagination-bottom"].forEach(selector=>{
     const host=$(selector);if(!host)return;host.innerHTML="";
     if(totalPages<=1)return;
     const add=(label,page,disabled=false,active=false)=>{
       const b=document.createElement("button");b.type="button";b.textContent=label;b.disabled=disabled;if(active)b.classList.add("active");
       b.addEventListener("click",()=>{currentPage=page;renderCatalog();$("#catalog-results").scrollIntoView({behavior:"smooth",block:"start"})});host.append(b);
     };
     add("‹",Math.max(1,currentPage-1),currentPage===1);
     let first=Math.max(1,currentPage-2),last=Math.min(totalPages,first+4);first=Math.max(1,last-4);
     if(first>1){add("1",1);if(first>2){const dots=document.createElement("span");dots.textContent="…";host.append(dots)}}
     for(let p=first;p<=last;p++)add(String(p),p,false,p===currentPage);
     if(last<totalPages){if(last<totalPages-1){const dots=document.createElement("span");dots.textContent="…";host.append(dots)}add(String(totalPages),totalPages)}
     add("›",Math.min(totalPages,currentPage+1),currentPage===totalPages);
   });
 }
 function renderCatalog(){
   const grid=$("#content-grid");if(!grid)return;
   const filtered=sortedItems(),totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
   currentPage=Math.min(currentPage,totalPages);
   const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
   grid.innerHTML="";
   shown.forEach(item=>{
     const article=document.createElement("button");article.type="button";article.className="content-card catalog-live-card";article.setAttribute("aria-label","Ver detalles de "+itemTitle(item));
     const poster=document.createElement("div");poster.className="poster";
     const cover=resolveCover(itemCover(item));
     if(cover){const img=document.createElement("img");img.src=cover;img.alt="";img.loading="lazy";img.decoding="async";img.onerror=()=>{img.remove();poster.textContent=itemTitle(item).slice(0,32)};poster.append(img)}
     else poster.textContent=itemTitle(item).slice(0,32);
     const body=document.createElement("div"),title=document.createElement("b");title.textContent=itemTitle(item);body.append(title);article.append(poster,body);
     article.addEventListener("click",()=>openCatalogDetail(item));grid.append(article);
   });
   $("#results-title").textContent=activeCategory?({juego:"Juegos",pelicula:"Películas",serie:"Series TV",anime:"Anime",novela:"Telenovelas",software:"Software",musica:"Música",otros:"Otros"}[activeCategory]||"Catálogo"):searchTerm?"Resultados de búsqueda":"Catálogo JOA";
   const tag=$(".demo-tag");if(tag)tag.textContent=filtered.length.toLocaleString("es")+" ELEMENTOS";
   if(!shown.length)grid.innerHTML='<p class="catalog-empty">No encontramos contenido con esos criterios.</p>';
   const count=$("#catalog-count");if(count)count.textContent=filtered.length.toLocaleString("es")+" resultados · Página "+currentPage+" de "+totalPages;
   renderPagination(totalPages);
 }
 async function readCachedCatalog(){
   if(!("caches" in window))return null;
   try{const cache=await caches.open(CATALOG_CACHE),response=await cache.match(CATALOG_DATA_URL);if(!response)return null;return await response.json()}catch(_){return null}
 }
 async function cacheCatalog(data){
   if(!("caches" in window))return;
   try{const cache=await caches.open(CATALOG_CACHE);await cache.put(CATALOG_DATA_URL,new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}}))}catch(error){console.warn("No se pudo guardar el catálogo localmente",error)}
 }
 async function loadCatalog(force=false){
   const versionKey="joa_web_catalog_version";
   try{
     setCatalogStatus("Comprobando actualizaciones del catálogo…","loading");
     const versionResponse=await fetch(CATALOG_VERSION_URL,{cache:"no-store"});
     if(!versionResponse.ok)throw new Error("No se pudo consultar version.json");
     const remoteVersion=await versionResponse.json();
     const savedVersion=localStorage.getItem(versionKey);
     let data=null;
     if(!force&&savedVersion===remoteVersion.version)data=await readCachedCatalog();
     if(!data){
       setCatalogStatus("Descargando catálogo actualizado…","loading");
       const response=await fetch(CATALOG_DATA_URL,{cache:"no-store"});
       if(!response.ok)throw new Error("No se pudo descargar Update.json");
       data=await response.json();
       if(!data||!Array.isArray(data.items))throw new Error("El JSON no contiene la lista esperada «items».");
       await cacheCatalog(data);
       localStorage.setItem(versionKey,remoteVersion.version||data.version||"");
     }
     if(!data||!Array.isArray(data.items))throw new Error("El catálogo no tiene el formato esperado.");
     catalogItems=data.items;
     catalogMeta=data;
     catalogMeta.version=remoteVersion.version||data.version||"";
     const generated=data.generated_at||remoteVersion.generated_at;
     const date=generated?new Date(generated).toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"}):"fecha no disponible";
     setCatalogStatus("Catálogo sincronizado · "+catalogItems.length.toLocaleString("es")+" elementos · "+date,"ready");
     const sync=$("#catalog-refresh");if(sync)sync.disabled=false;
     renderCatalog();
   }catch(error){
     console.error("JOA catalog:",error);
     const cached=await readCachedCatalog();
     if(cached&&Array.isArray(cached.items)){
       catalogItems=cached.items;catalogMeta=cached;setCatalogStatus("Mostrando copia guardada · "+catalogItems.length.toLocaleString("es")+" elementos","offline");renderCatalog();
     }else setCatalogStatus("No se pudo conectar con el catálogo. Intenta actualizar.","error");
   }
 }
 $("#catalog-refresh")?.addEventListener("click",()=>{const b=$("#catalog-refresh");b.disabled=true;loadCatalog(true).finally(()=>{b.disabled=false})});
 $("#catalog-sort")?.addEventListener("change",e=>{sortMode=e.target.value;currentPage=1;renderCatalog()});
 $("#catalog-type-filter")?.addEventListener("change",e=>{activeCategory=e.target.value;cards.forEach(c=>c.classList.toggle("selected",c.dataset.category===activeCategory));currentPage=1;renderCatalog()});
 $("#catalog-page-size")?.addEventListener("change",e=>{pageSize=Number(e.target.value)||18;currentPage=1;renderCatalog()});
 $("#catalog-detail-close")?.addEventListener("click",()=>$("#catalog-detail-dialog").close());
 $("#catalog-detail-dialog")?.addEventListener("click",e=>{if(e.target.id==="catalog-detail-dialog")e.currentTarget.close()});
 cards.forEach(card=>card.addEventListener("click",()=>{
   cards.forEach(c=>c.classList.remove("selected"));card.classList.add("selected");
   activeCategory=card.dataset.category||"";currentPage=1;$("#catalog-type-filter").value=activeCategory;renderCatalog();
   $("#catalog-results").scrollIntoView({behavior:"smooth",block:"nearest"});
 }));
 $("#catalog-search").addEventListener("input",e=>{
   searchTerm=e.target.value.trim().toLocaleLowerCase("es");currentPage=1;renderCatalog();
   if(!catalogItems.length){const q=searchTerm;cards.forEach(card=>{card.hidden=!!q&&!card.innerText.toLocaleLowerCase("es").includes(q)})}
 });
 function renderAuthMode(){
   $("#auth-title").innerHTML=authMode==="signin"?'Entra en tu <span>universo.</span>':'Crea tu <span>cuenta JOA.</span>';
   $("#auth-description").textContent=authMode==="signin"?"Accede para participar en la comunidad JOA.":"Regístrate para crear tu perfil y conectar con otros jugadores.";
   $("#auth-submit").textContent=authMode==="signin"?"Iniciar sesión":"Crear cuenta";
   $("#auth-switch").textContent=authMode==="signin"?"¿No tienes cuenta? Regístrate":"¿Ya tienes cuenta? Inicia sesión";
   $("#auth-password").autocomplete=authMode==="signin"?"current-password":"new-password";
   $("#auth-forgot").hidden=authMode!=="signin";
   if(currentUser)$("#auth-message").textContent="Sesión iniciada como "+(currentUser.email||"usuario JOA")+". Puedes cerrar esta ventana.";
 }
 $("#auth-switch").addEventListener("click",()=>{authMode=authMode==="signin"?"signup":"signin";renderAuthMode();$("#auth-message").textContent=""});
 $("#auth-form").addEventListener("submit",async e=>{
   e.preventDefault();if(!supabase){toast("No se pudo conectar con el servicio de acceso. Recarga la página e inténtalo de nuevo.");return}
   const email=$("#auth-email").value.trim(),password=$("#auth-password").value;
   if(!email||!password){toast("Escribe tu correo y contraseña.");return}
   const submit=$("#auth-submit");submit.disabled=true;submit.textContent="Procesando…";
   try{
     let result;
     if(authMode==="signup"){
       result=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.JOA_CONFIG.authRedirectUrl}});
       if(result.error)throw result.error;
       if(result.data.session){toast("¡Cuenta creada! Bienvenido a JOA.");dialog.close()}
       else{$("#auth-message").textContent="Te enviamos un correo para confirmar tu cuenta. Revisa también la carpeta de spam.";toast("Registro iniciado. Confirma tu correo para entrar.")}
     }else{
       result=await supabase.auth.signInWithPassword({email,password});
       if(result.error)throw result.error;
       toast("¡Bienvenido de nuevo a JOA!");dialog.close();
     }
   }catch(error){$("#auth-message").textContent=authError(error);toast(authError(error))}
   finally{submit.disabled=false;renderAuthMode()}
 });
 $("#auth-forgot").addEventListener("click",async()=>{
   const email=$("#auth-email").value.trim();if(!email){toast("Escribe primero tu correo electrónico.");return}
   try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.JOA_CONFIG.authRedirectUrl});if(error)throw error;toast("Si el correo está registrado, recibirás instrucciones para recuperar el acceso.");$("#auth-message").textContent="Revisa tu correo para continuar con la recuperación."}
   catch(error){toast(authError(error))}
 });
 async function oauth(provider){
   if(!supabase){toast("El servicio de acceso aún no está disponible.");return}
   try{const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:window.JOA_CONFIG.authRedirectUrl,queryParams:provider==="google"?{access_type:"offline",prompt:"consent"}:undefined}});if(error)throw error}
   catch(error){$("#auth-message").textContent=authError(error);toast(authError(error))}
 }
 $("#auth-google").addEventListener("click",()=>oauth("google"));
 $("#auth-facebook").addEventListener("click",()=>oauth("facebook"));
 function authError(error){
   const msg=String(error?.message||"");
   if(/invalid login credentials/i.test(msg))return "Correo o contraseña incorrectos.";
   if(/email not confirmed/i.test(msg))return "Confirma tu correo electrónico antes de iniciar sesión.";
   if(/provider is not enabled|unsupported provider/i.test(msg))return "Este proveedor aún no está activado en Supabase.";
   if(/password should be at least/i.test(msg))return "La contraseña debe tener al menos 6 caracteres.";
   if(/user already registered/i.test(msg))return "Ese correo ya tiene una cuenta. Inicia sesión.";
   return msg||"No se pudo completar el acceso. Inténtalo de nuevo.";
 }
 function updateHeader(user){
   currentUser=user;
   const btn=$("#login-open");
   if(user){btn.innerHTML='<span class="user-status">● '+escapeHtml(user.email||"Mi cuenta")+'</span>';btn.title="Abrir tu cuenta";$("#community-join").textContent="Ir a mi comunidad"}
   else{btn.innerHTML='Entrar <span>↗</span>';btn.title="Iniciar sesión";$("#community-join").textContent="Entrar a la comunidad"}
   renderAuthMode();
 }
 function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 async function initSupabase(){
   if(!window.JOA_CONFIG?.enableSupabase||!window.JOA_CONFIG.supabaseUrl||!window.JOA_CONFIG.supabasePublishableKey)return;
   try{
     const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";script.async=true;
     script.onload=async()=>{
       try{
         supabase=window.supabase.createClient(window.JOA_CONFIG.supabaseUrl,window.JOA_CONFIG.supabasePublishableKey);
         window.joaSupabase=supabase;
         const {data:{session}}=await supabase.auth.getSession();updateHeader(session?.user||null);
         supabase.auth.onAuthStateChange((_event,newSession)=>updateHeader(newSession?.user||null));
         document.documentElement.dataset.supabase="ready";
       }catch(error){console.error("JOA Auth:",error);document.documentElement.dataset.supabase="error"}
     };
     script.onerror=()=>{document.documentElement.dataset.supabase="error";toast("No se pudo cargar el servicio de autenticación.")};
     document.head.append(script);
   }catch(error){console.error(error)}
 }
 loadCatalog();initSupabase();
})();