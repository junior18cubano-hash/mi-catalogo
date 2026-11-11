(() => {
 "use strict";
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 const dialog=$("#auth-dialog"), toastEl=$("#toast");
 let authMode="signin", supabase=null, currentUser=null, authReadyPromise=Promise.resolve(false), authInitError=null, oauthInProgress=false;
 let communityProfilePromise=null,communityProfilePromiseUserId=null,authEventVersion=0;
 const COMMUNITY_INTENT_KEY="joa_community_requested";
 function readCommunityIntent(){
   try{return localStorage.getItem(COMMUNITY_INTENT_KEY)==="1"||safeSessionGet(COMMUNITY_INTENT_KEY)==="1"}catch(error){return safeSessionGet(COMMUNITY_INTENT_KEY)==="1"}
 }
 function setCommunityIntent(value){
   communityRequested=!!value;
   try{if(value)localStorage.setItem(COMMUNITY_INTENT_KEY,"1");else localStorage.removeItem(COMMUNITY_INTENT_KEY)}catch(error){}
   if(value)safeSessionSet(COMMUNITY_INTENT_KEY,"1");else safeSessionRemove(COMMUNITY_INTENT_KEY);
 }
 const OAUTH_PENDING_KEY="joa_google_oauth_pending";
 function readOAuthPending(){
   try{const raw=localStorage.getItem(OAUTH_PENDING_KEY);return raw?JSON.parse(raw):null}catch(error){return null}
 }
 function writeOAuthPending(){
   try{localStorage.setItem(OAUTH_PENDING_KEY,JSON.stringify({startedAt:Date.now()}));return true}catch(error){return false}
 }
 function clearOAuthPending(){
   try{localStorage.removeItem(OAUTH_PENDING_KEY)}catch(error){}
 }
 // Registrar el clic desde el inicio del script, antes de inicializar el resto de la comunidad.
 // Así el botón de Google sigue respondiendo aunque falle algún módulo secundario.
 document.addEventListener("click",event=>{
   const button=event.target?.closest?.("#auth-google,#auth-google-other");
   if(!button)return;
   event.preventDefault();
   event.stopPropagation();
   if(typeof oauth==="function")oauth("google",button.id==="auth-google-other");
   else{
     const message=$("#auth-message");
     if(message)message.textContent="El acceso todavía no terminó de inicializarse. Recarga la página.";
   }
 },true);
 window.addEventListener("pageshow",event=>{
   if(!event.persisted)return;
   oauthInProgress=false;
   clearOAuthPending();
   const button=$("#auth-google");
   if(button){button.disabled=false;button.textContent="Continuar con Google"}
 });
 // Si el usuario cancela Google y vuelve a JOA sin completar el callback,
 // liberar el bloqueo temporal para que pueda volver a intentarlo.
 document.addEventListener("visibilitychange",()=>{
   if(document.visibilityState!=="visible")return;
   const params=new URLSearchParams(window.location.search);
   if(params.has("code")||params.has("error")||params.has("error_description"))return;
   const pending=readOAuthPending();
   if(!pending?.startedAt||Date.now()-pending.startedAt<5000)return;
   clearOAuthPending();oauthInProgress=false;
   const button=$("#auth-google");
   if(button){button.disabled=false;button.textContent="Continuar con Google"}
 });
 const toast=(message)=>{if(!toastEl)return;toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(window.__joaToast);window.__joaToast=setTimeout(()=>toastEl.classList.remove("show"),3600)};
 function safeSessionGet(key){try{return window.sessionStorage?.getItem(key)||null}catch(error){console.warn("JOA: sessionStorage no disponible",error);return null}}
 function safeSessionSet(key,value){try{window.sessionStorage?.setItem(key,value);return true}catch(error){console.warn("JOA: no se pudo guardar el estado temporal",error);return false}}
 function safeSessionRemove(key){try{window.sessionStorage?.removeItem(key)}catch(error){console.warn("JOA: no se pudo limpiar el estado temporal",error)}}
 $("#year").textContent=new Date().getFullYear();
 const openAuth=()=>{setCommunityIntent(true);if(currentUser){openCommunity();return}if(dialog&&!dialog.open)dialog.showModal();renderAuthMode()};
 $("#login-open").addEventListener("click",openAuth);
 $("#community-join").addEventListener("click",openAuth);
 dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
 $("#search-toggle").addEventListener("click",()=>{$("#search-panel").scrollIntoView({behavior:"smooth",block:"center"});$("#catalog-search").focus()});
 const cards=$$(".category-card");
 const CATALOG_VERSION_URL="https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/version.json";
 const CATALOG_DATA_URL=window.JOA_CONFIG?.catalogJsonUrl||"https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/Update.json";
 const CATALOG_CACHE="joa-web-catalog-v1";
 let catalogItems=[],catalogMeta={},activeCategory="",activeSubcategory="",activePlatform="",searchTerm="",sortMode="name",pageSize=20,currentPage=1;
  let catalogFavorites=[],catalogFavoritesByKey=new Map();
 const categoryAliases={
 juego:["juego","juego_emulado","game","games","videojuego","videojuegos"],
 pelicula:["pelicula","pelicula_animada","movie","movies","film"],
 serie:["serie","serie_animada","series","serie_tv","tv","show"],
 anime:["anime","anime_movie","anime_series"],
 novela:["novela_tv","telenovela","telenovelas","novelas_tv","novela-tv"],
 software:["software","app","apps","programa","programas"],musica:["musica","music","audio"],otros:["otros","other","misc"]
 };
 const subtypeLabels={juego:{juego:"Juegos",juego_emulado:"Juegos emulados"},pelicula:{pelicula:"Películas",pelicula_animada:"Películas animadas"},serie:{serie:"Series de TV",serie_animada:"Series animadas"},anime:{anime:"Series anime",anime_movie:"Películas anime"},novela:{novela_tv:"Telenovelas"}};
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
 for(const [key,values] of Object.entries(categoryAliases))if(values.map(normalizeType).includes(t))return key;
 if(t.includes("novela")||t.includes("telenovela"))return "novela";
 if(t.includes("anime"))return "anime";
 if(t.includes("pelicula")||t.includes("movie"))return "pelicula";
 if(t.includes("serie"))return "serie";
 if(t.includes("juego")||t.includes("game"))return "juego";
 if(t.includes("software"))return "software";
 if(t.includes("music")||t.includes("musica"))return "musica";
 return "otros";
 }
 function itemSubcategory(item){
 const raw=normalizeType(item.type||item.tipo||"");
 const explicit=normalizeType(item.subcategory||item.subcategoria||item.sub_type||item.subtipo||item.category||item.categoria||"");
 const group=categoryFor(raw||explicit);
 if(subtypeLabels[group]&&subtypeLabels[group][explicit])return explicit;
 if(subtypeLabels[group]&&subtypeLabels[group][raw])return raw;
 if(explicit.includes("anim"))return group==="serie"?"serie_animada":"pelicula_animada";
 if(explicit.includes("movie")||explicit.includes("pelicula"))return group==="anime"?"anime_movie":"pelicula";
 if(explicit.includes("serie"))return group==="anime"?"anime":"serie";
 if(group==="novela")return "novela_tv";
 return raw||explicit;
 }
 function itemPlatform(item){return String(item.console||item.consola||item.platform||item.plataforma||item.emulator||item.emulador||"").trim()}
 function itemCategoryValue(item){return normalizeType(item.type||item.tipo||item.category||item.categoria||"otros")}
 function updateSubcategoryControls(){
 const sub=$("#catalog-subcategory-filter"),wrap=$("#catalog-platform-wrap"),platform=$("#catalog-platform-filter");
 if(!sub||!platform)return;
 const group=activeCategory,options=[];
 if(group==="juego")options.push(["juego","Juegos"],["juego_emulado","Juegos emulados"]);
 else if(subtypeLabels[group])Object.entries(subtypeLabels[group]).forEach(([key,label])=>options.push([key,label]));
 sub.innerHTML='<option value="">Todas las subcategorías</option>';
 options.forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;sub.append(option)});
 sub.disabled=!group||!options.length;
 if(!options.some(option=>option[0]===activeSubcategory))activeSubcategory="";
 sub.value=activeSubcategory;
 const showPlatforms=group==="juego"&&activeSubcategory==="juego_emulado";wrap.hidden=!showPlatforms;
 const previous=activePlatform;platform.innerHTML='<option value="">Todas las plataformas</option>';
 if(showPlatforms){
 const platforms=[...new Set(catalogItems.filter(item=>categoryFor(itemCategoryValue(item))==="juego"&&itemSubcategory(item)==="juego_emulado").map(itemPlatform).filter(Boolean))].sort((x,y)=>x.localeCompare(y,"es"));
 platforms.forEach(value=>{const option=document.createElement("option");option.value=value;option.textContent=value;platform.append(option)});
 }
 activePlatform=showPlatforms&&[...platform.options].some(option=>option.value===previous)?previous:"";platform.value=activePlatform;
 }
 function setCatalogStatus(message,state=""){
   const el=$("#catalog-status");if(!el)return;
   el.textContent=message;el.dataset.state=state;
 }
 function itemYear(item){return Number(item.year||item.ano||item.año||item.release_year||0)||0}
 function itemViews(item){return Number(item.views||item.view_count||item.visitas||item.vistos||item.popularity_count||0)||0}
 function itemRating(item){return Number(item.rating||item.vote_average||item.valoracion||item.puntuacion||0)||0}
 function itemDate(item){const value=item.added_at||item.date_added||item.fecha_agregado||item.imported_at||item.created_at||item.updated_at||item.fecha||item.date||item.timestamp||"";const n=Date.parse(value);return Number.isFinite(n)?n:(Number(value)||0)}
 function sortedItems(){
   const filtered=catalogItems.filter(item=>{
     const group=categoryFor(itemCategoryValue(item));
     const categoryOk=!activeCategory||group===activeCategory;
     const subOk=!activeSubcategory||itemSubcategory(item)===activeSubcategory;
     const platformOk=!activePlatform||itemPlatform(item)===activePlatform;
     const text=[itemTitle(item),itemDescription(item),itemType(item),item.subcategory,item.subcategoria,item.genre,item.genres,item.generos,itemPlatform(item)].flat().join(" ").toLocaleLowerCase("es");
     return categoryOk&&subOk&&platformOk&&(!searchTerm||text.includes(searchTerm));
   });
   const catalogOrder=new Map(catalogItems.map((item,index)=>[item,index]));
   return filtered.sort((a,b)=>{
     if(sortMode==="added")return (catalogOrder.get(b)??-1)-(catalogOrder.get(a)??-1);
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
   const tag=document.createElement("small");
   const group=categoryFor(itemCategoryValue(item)),sub=itemSubcategory(item);
   tag.textContent=(subtypeLabels[group]?.[sub]||sub.replace(/_/g," ")||"CATÁLOGO").toUpperCase();
   const title=document.createElement("h2");title.textContent=itemTitle(item);
   const description=document.createElement("p");description.className="detail-description";description.textContent=itemDescription(item);
   info.append(tag,title,description);
   addDetailLine(info,"Subcategoría",subtypeLabels[group]?.[sub]||sub.replace(/_/g," "));
   addDetailLine(info,"Año",item.year||item.ano||item.año||item.release_year);
   addDetailLine(info,"Género",item.genre||item.genres||item.generos||item.genero);
   addDetailLine(info,"Consola / plataforma",itemPlatform(item));
   addDetailLine(info,"Valoración",item.rating||item.vote_average||item.valoracion);
   addDetailLine(info,"Vistas",item.views||item.view_count||item.visitas||item.vistos);
   addDetailLine(info,"Temporadas",item.seasons||item.temporadas);
   addDetailLine(info,"Episodios",item.episodes||item.capitulos||item.episodios);
   addDetailLine(info,"Duración",item.duration||item.duracion||item.runtime);
   addDetailLine(info,"Director",item.director);
   addDetailLine(info,"Precio",item.price||item.precio);
   content.append(hero,info);
  const reviews=document.createElement("section");reviews.className="catalog-item-reviews";reviews.dataset.itemKey=reviewItemKey(item);
  const heading=document.createElement("div");heading.className="catalog-reviews-heading";
  const headingTitle=document.createElement("h3");headingTitle.textContent="Opiniones de la comunidad";
  const summary=document.createElement("div");summary.className="catalog-review-summary";summary.textContent="Cargando valoraciones…";
  heading.append(headingTitle,summary);
  const formHost=document.createElement("div");formHost.className="catalog-review-form-host";
  const feed=document.createElement("div");feed.className="catalog-item-review-feed";feed.textContent="Cargando reseñas…";
  reviews.append(heading,formHost,feed);content.append(reviews);dialog.showModal();
  loadCatalogItemReviews(item,reviews);
 }
   async function loadCatalogReviewSummaries(items){
    if(!supabase||!items?.length)return;
    const keys=[...new Set(items.map(reviewItemKey))];
    const {data,error}=await supabase.from("catalog_reviews").select("external_item_id,rating").in("external_item_id",keys);
    if(error){console.warn("JOA catalog reviews:",error);return}
    const sums=new Map();
    (data||[]).forEach(row=>{const value=sums.get(row.external_item_id)||{total:0,count:0};value.total+=Number(row.rating)||0;value.count++;sums.set(row.external_item_id,value)});
    $$(".catalog-review-compact").forEach(el=>{const value=sums.get(el.dataset.reviewKey)||{total:0,count:0};el.textContent=value.count?"★ "+(value.total/value.count).toFixed(1)+" · "+value.count+(value.count===1?" reseña":" reseñas"):"☆ Sin reseñas";el.classList.toggle("has-reviews",value.count>0)});
  }
  async function loadCatalogItemReviews(item,host){
    if(!supabase){host.querySelector(".catalog-review-summary").textContent="Las reseñas estarán disponibles cuando se conecte el servicio.";return}
    const key=reviewItemKey(item),summary=host.querySelector(".catalog-review-summary"),feed=host.querySelector(".catalog-item-review-feed"),formHost=host.querySelector(".catalog-review-form-host");
    const {data,error}=await supabase.from("catalog_reviews").select("id,user_id,rating,body,created_at").eq("external_item_id",key).order("created_at",{ascending:false}).limit(50);
    if(host.dataset.itemKey!==key)return;
    if(error){summary.textContent="No se pudieron cargar las valoraciones.";feed.textContent=communityError(error);return}
    const reviews=data||[],count=reviews.length,average=count?reviews.reduce((sum,row)=>sum+Number(row.rating),0)/count:0;
    summary.innerHTML="";
    const score=document.createElement("strong");score.textContent=count?average.toFixed(1)+"/5":"—";
    const stars=document.createElement("span");stars.className="catalog-review-stars";stars.textContent=count?"★".repeat(Math.round(average))+"☆".repeat(5-Math.round(average)):"☆☆☆☆☆";
    const total=document.createElement("small");total.textContent=count?count+(count===1?" reseña":" reseñas"):"Sé el primero en valorar";summary.append(score,stars,total);
    formHost.innerHTML="";const own=currentUser?reviews.find(row=>row.user_id===currentUser.id):null;
    if(currentUser){
      const form=document.createElement("form");form.className="catalog-item-review-form";
      const label=document.createElement("label");label.textContent=own?"Actualiza tu reseña":"Deja tu reseña";
      const picker=document.createElement("div");picker.className="catalog-review-picker";picker.setAttribute("role","group");picker.setAttribute("aria-label","Clasificación de 1 a 5 estrellas");
      let rating=Number(own?.rating)||5;
      const updateStars=()=>picker.querySelectorAll("button").forEach((button,index)=>{button.classList.toggle("selected",index<rating);button.setAttribute("aria-pressed",String(index+1===rating))});
      for(let i=1;i<=5;i++){const star=document.createElement("button");star.type="button";star.textContent="★";star.setAttribute("aria-label",i+" de 5 estrellas");star.addEventListener("click",()=>{rating=i;updateStars()});picker.append(star)}updateStars();
      const textarea=document.createElement("textarea");textarea.maxLength=3000;textarea.required=true;textarea.rows=3;textarea.placeholder="¿Qué te pareció este contenido?";textarea.value=own?.body||"";
      const submit=document.createElement("button");submit.type="submit";submit.className="button button-primary";submit.textContent=own?"Guardar cambios":"Publicar reseña";
      form.append(label,picker,textarea,submit);form.addEventListener("submit",async event=>{
        event.preventDefault();const body=textarea.value.trim();if(!body){toast("Escribe tu opinión antes de publicarla.");return}
        submit.disabled=true;submit.textContent="Publicando…";
        const payload={external_item_id:key,item_title:itemTitle(item).slice(0,300),item_type:itemType(item),cover_url:resolveCover(itemCover(item))||null,user_id:currentUser.id,rating,body,updated_at:new Date().toISOString()};
        try{const result=await supabase.from("catalog_reviews").upsert(payload,{onConflict:"external_item_id,user_id"});if(result.error)throw result.error;toast(own?"Reseña actualizada.":"¡Gracias por compartir tu reseña!");await loadCatalogItemReviews(item,host);loadCatalogReviewSummaries([item])}
        catch(err){toast(communityError(err))}finally{submit.disabled=false;submit.textContent=own?"Guardar cambios":"Publicar reseña"}
      });formHost.append(form);
    }else{const login=document.createElement("button");login.type="button";login.className="catalog-review-login";login.textContent="Inicia sesión para escribir una reseña";login.addEventListener("click",openAuth);formHost.append(login)}
    feed.innerHTML="";
    if(!reviews.length){const empty=document.createElement("p");empty.className="catalog-review-empty";empty.textContent="Todavía no hay opiniones. ¡Puedes ser el primero!";feed.append(empty);return}
    const ids=[...new Set(reviews.map(row=>row.user_id))],profiles=ids.length?await supabase.from("profiles").select("id,display_name,username").in("id",ids):{data:[]},names=new Map((profiles.data||[]).map(profile=>[profile.id,profile]));
    reviews.forEach(review=>{const row=document.createElement("article");row.className="catalog-item-review";const top=document.createElement("div");top.className="catalog-item-review-top";const name=document.createElement("b"),profile=names.get(review.user_id);name.textContent=profile?.display_name||profile?.username||"Jugador JOA";const stars=document.createElement("span");stars.className="catalog-review-stars";stars.textContent="★".repeat(review.rating)+"☆".repeat(5-review.rating);const body=document.createElement("p");body.textContent=review.body;const date=document.createElement("small");date.textContent=new Date(review.created_at).toLocaleDateString("es",{day:"numeric",month:"short",year:"numeric"});top.append(name,stars);row.append(top,body,date);feed.append(row)});
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
 function cardTypeLabel(item){
   const group=categoryFor(itemCategoryValue(item)),sub=itemSubcategory(item),platform=itemPlatform(item).toLocaleLowerCase("es");
   if(group==="juego"){
     if(sub==="juego_emulado")return "JUEGO EMULADO";
     if(/(^|[^a-z])(pc|windows|computer|computadora)([^a-z]|$)/i.test(platform))return "JUEGO DE PC";
     return "VIDEOJUEGO";
   }
   if(group==="pelicula")return sub==="pelicula_animada"?"PELÍCULA ANIMADA":"PELÍCULA";
   if(group==="serie")return sub==="serie_animada"?"SERIE ANIMADA":"SERIE";
   if(group==="anime")return sub==="anime_movie"?"PELÍCULA ANIME":"ANIME";
   if(group==="novela")return "TELENOVELA";
   if(group==="software")return "SOFTWARE";
   if(group==="musica")return "MÚSICA";
   return "OTROS";
 }
 function renderCatalog(){
   const grid=$("#content-grid");if(!grid)return;
   const filtered=sortedItems(),totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
   currentPage=Math.min(currentPage,totalPages);
   const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
   grid.innerHTML="";
   shown.forEach(item=>{
     const wrap=document.createElement("div");wrap.className="catalog-card-wrap";
     const article=document.createElement("button");article.type="button";article.className="content-card catalog-live-card";article.setAttribute("aria-label","Ver detalles de "+itemTitle(item));
     const poster=document.createElement("div");poster.className="poster";const cover=resolveCover(itemCover(item));
     if(cover){const img=document.createElement("img");img.src=cover;img.alt="";img.loading="lazy";img.decoding="async";img.onerror=()=>{img.remove();if(!poster.querySelector(".catalog-type-badge"))poster.textContent=itemTitle(item).slice(0,32)};poster.append(img)}else poster.textContent=itemTitle(item).slice(0,32);
     const badge=document.createElement("span");badge.className="catalog-type-badge type-"+categoryFor(itemCategoryValue(item));badge.textContent=cardTypeLabel(item);poster.append(badge);
     const body=document.createElement("div"),title=document.createElement("b");title.textContent=itemTitle(item);const reviewSummary=document.createElement("small");reviewSummary.className="catalog-review-compact";reviewSummary.dataset.reviewKey=reviewItemKey(item);reviewSummary.textContent="☆ Cargando reseñas…";body.append(title,reviewSummary);article.append(poster,body);article.addEventListener("click",()=>openCatalogDetail(item));
     const favorite=document.createElement("button");favorite.type="button";favorite.className="favorite-toggle";favorite.dataset.favoriteKey=reviewItemKey(item);favorite.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();toggleCatalogFavorite(item,favorite)});
     wrap.append(article,favorite);grid.append(wrap);
   });
   const labels={juego:"Juegos",pelicula:"Películas",serie:"Series TV",anime:"Anime",novela:"Telenovelas",software:"Software",musica:"Música",otros:"Otros"};
   $("#results-title").textContent=activeCategory?(labels[activeCategory]||"Catálogo"):searchTerm?"Resultados de búsqueda":"Catálogo JOA";
   const tag=$(".demo-tag");if(tag)tag.textContent=filtered.length.toLocaleString("es")+" ELEMENTOS";
   if(!shown.length)grid.innerHTML='<p class="catalog-empty">No encontramos contenido con esos criterios.</p>';
   const count=$("#catalog-count");if(count)count.textContent=filtered.length.toLocaleString("es")+" resultados · Página "+currentPage+" de "+totalPages;
   renderPagination(totalPages);renderFavoriteButtons();loadCatalogReviewSummaries(shown);
 }

  function favoriteSnapshot(item){return {id:item.id??item.external_id??item.igdb_id??item.tmdb_id??null,slug:item.slug||null,year:item.year||item.ano||item.año||item.release_year||null,platform:item.platform||item.platforms||item.consola||null,genre:item.genre||item.genres||item.generos||item.genero||null,description:itemDescription(item)}}
  function renderFavoriteButtons(){$$(".favorite-toggle").forEach(button=>{const active=catalogFavoritesByKey.has(button.dataset.favoriteKey);button.classList.toggle("is-favorite",active);button.setAttribute("aria-pressed",String(active));button.textContent=active?"♥":"♡";button.setAttribute("aria-label",active?"Quitar de favoritos":"Añadir a favoritos")})}
  async function loadCatalogFavorites(){
    if(!currentUser||!supabase){catalogFavorites=[];catalogFavoritesByKey.clear();renderFavoriteButtons();return}
    const userId=currentUser.id,{data,error}=await supabase.from("catalog_favorites").select("user_id,item_key,item_title,item_type,cover_url,item_data,created_at").eq("user_id",userId).order("created_at",{ascending:false});
    if(currentUser?.id!==userId)return;if(error){console.warn("JOA favorites:",error);const host=$("#community-favorites-list");if(host)host.textContent="No se pudieron cargar tus favoritos: "+communityError(error);return}
    catalogFavorites=data||[];catalogFavoritesByKey=new Map(catalogFavorites.map(row=>[row.item_key,row]));renderFavoriteButtons();
    if($("#community-favorites-panel")&&!$("#community-favorites-panel").hidden){renderCommunityFavorites();loadCommunityFavoriteFriends()}
  }
  async function toggleCatalogFavorite(item,button){
    if(!currentUser||!supabase){openAuth();toast("Inicia sesión para guardar tus favoritos.");return}
    const key=reviewItemKey(item),existing=catalogFavoritesByKey.get(key);if(button)button.disabled=true;
    try{
      if(existing){const result=await supabase.from("catalog_favorites").delete().eq("user_id",currentUser.id).eq("item_key",key).select("item_key").maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error("No se pudo quitar este elemento de favoritos.");catalogFavorites=catalogFavorites.filter(row=>row.item_key!==key);catalogFavoritesByKey.delete(key);toast("Se quitó de tu lista de favoritos.")}
      else{const result=await supabase.from("catalog_favorites").insert({user_id:currentUser.id,item_key:key,item_title:itemTitle(item).slice(0,300),item_type:itemType(item),cover_url:resolveCover(itemCover(item))||null,item_data:favoriteSnapshot(item)}).select("user_id,item_key,item_title,item_type,cover_url,item_data,created_at").single();if(result.error)throw result.error;catalogFavorites.unshift(result.data);catalogFavoritesByKey.set(key,result.data);toast("Añadido a tu lista de favoritos.")}
      renderFavoriteButtons();if($("#community-favorites-panel")&&!$("#community-favorites-panel").hidden)renderCommunityFavorites();
    }catch(error){toast(communityError(error))}finally{if(button)button.disabled=false}
  }
  async function removeCatalogFavorite(itemKey,button){
    if(!currentUser||!supabase)return;if(button)button.disabled=true;
    try{
      const result=await supabase.from("catalog_favorites").delete().eq("user_id",currentUser.id).eq("item_key",itemKey).select("item_key").maybeSingle();
      if(result.error)throw result.error;if(!result.data)throw new Error("No se pudo quitar este elemento de favoritos.");
      catalogFavorites=catalogFavorites.filter(row=>row.item_key!==itemKey);catalogFavoritesByKey.delete(itemKey);
      renderFavoriteButtons();renderCommunityFavorites();toast("Se quitó de tu lista de favoritos.");
    }catch(error){toast(communityError(error))}finally{if(button)button.disabled=false}
  }
  function favoriteItemFromRow(row){return {...(row.item_data||{}),id:row.item_data?.id||row.item_key,title:row.item_title,type:row.item_type,cover:row.cover_url||""}}
  function renderCommunityFavorites(){
    const host=$("#community-favorites-list"),count=$("#community-favorites-count"),share=$("#favorites-share-whatsapp");if(!host)return;if(count)count.textContent=String(catalogFavorites.length);if(share)share.disabled=!catalogFavorites.length;host.innerHTML="";
    if(!catalogFavorites.length){const empty=document.createElement("div");empty.className="community-empty";empty.innerHTML="<h3>Tu lista está esperando</h3><p>Explora el catálogo y pulsa el corazón de los contenidos que quieras guardar.</p>";host.append(empty);return}
    catalogFavorites.forEach(row=>{const item=favoriteItemFromRow(row),card=document.createElement("article");card.className="favorite-list-item";const cover=document.createElement("img");cover.alt="";cover.loading="lazy";cover.src=row.cover_url||"assets/ioa-multiverso-icon.svg";cover.onerror=()=>{cover.src="assets/ioa-multiverso-icon.svg"};const info=document.createElement("div"),title=document.createElement("b"),meta=document.createElement("small");title.textContent=row.item_title;meta.textContent=String(row.item_type||"otros").replace(/_/g," ").toLocaleUpperCase("es");info.append(title,meta);const actions=document.createElement("div");actions.className="favorite-list-actions";const detail=document.createElement("button");detail.type="button";detail.textContent="Ver";detail.addEventListener("click",()=>openCatalogDetail(item));const remove=document.createElement("button");remove.type="button";remove.className="danger";remove.textContent="Quitar";remove.addEventListener("click",()=>removeCatalogFavorite(row.item_key,remove));actions.append(detail,remove);card.append(cover,info,actions);host.append(card)});
  }
  function buildFavoritesShareText(rows,ownerName){const heading="⭐ LISTA DE FAVORITOS DE "+(ownerName||"UN JUGADOR JOA")+"\n",footer="\nDescubre más en JOA GAMERs: https://junior18cubano-hash.github.io/mi-catalogo/#catalog";let text=heading+"\n",shown=0;for(const row of rows){const line="• "+row.item_title+" ("+String(row.item_type||"otros").replace(/_/g," ")+")\n";if((text+line+footer).length>4700)break;text+=line;shown++}if(shown<rows.length)text+="\n… y "+(rows.length-shown)+" elementos más en mi lista.\n";return text+footer}
  function shareFavoritesWhatsApp(){if(!catalogFavorites.length){toast("Añade primero algún elemento a tus favoritos.");return}const text=buildFavoritesShareText(catalogFavorites,communityProfile?.display_name||communityProfile?.username||"Jugador JOA"),link=document.createElement("a");link.href="https://wa.me/?text="+encodeURIComponent(text);link.target="_blank";link.rel="noopener noreferrer";document.body.append(link);link.click();link.remove()}

 const CATALOG_DB_NAME="joa-catalog-db",CATALOG_DB_VERSION=1,CATALOG_STORE="catalogs",CATALOG_RECORD_KEY="main";
 let catalogLoadPromise=null;
 function openCatalogDB(){
   return new Promise((resolve,reject)=>{
     if(!("indexedDB" in window)){reject(new Error("IndexedDB no disponible"));return}
     const request=indexedDB.open(CATALOG_DB_NAME,CATALOG_DB_VERSION);
     request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(CATALOG_STORE))db.createObjectStore(CATALOG_STORE,{keyPath:"id"})};
     request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("No se pudo abrir la base local"));
   });
 }
 async function readCachedRecord(){
   try{const db=await openCatalogDB();return await new Promise((resolve,reject)=>{const tx=db.transaction(CATALOG_STORE,"readonly"),req=tx.objectStore(CATALOG_STORE).get(CATALOG_RECORD_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error)}})}catch(error){console.warn("JOA: no se pudo leer IndexedDB",error);return null}
 }
 async function saveCachedRecord(record){
   const db=await openCatalogDB();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction(CATALOG_STORE,"readwrite");
     tx.objectStore(CATALOG_STORE).put({id:CATALOG_RECORD_KEY,...record});
     tx.oncomplete=()=>{db.close();resolve(true)};
     tx.onerror=tx.onabort=()=>{const error=tx.error||new Error("No se pudo guardar el catálogo");db.close();reject(error)};
   });
 }
 async function readLegacyCatalog(){
   if(!("caches" in window))return null;
   try{const cache=await caches.open(CATALOG_CACHE),response=await cache.match(CATALOG_DATA_URL);return response?await response.json():null}catch(_){return null}
 }
 function catalogFingerprint(v){return [v.version||"",v.hash||"",v.generated_at||"",v.item_count||""].join("|")}
 function validateCatalog(data,remoteVersion){
   if(!data||!Array.isArray(data.items))throw new Error("El JSON no contiene la lista esperada «items».");
   const expected=Number(remoteVersion?.item_count||0);
   if(expected>0&&data.items.length!==expected)throw new Error("El catálogo recibido está incompleto: se esperaban "+expected+" elementos y llegaron "+data.items.length+".");
 }
 function applyCatalog(data,remoteVersion,offline=false){
   catalogItems=data.items;catalogMeta=data;updateSubcategoryControls();
   catalogMeta.version=remoteVersion?.version||data.version||"";
   const generated=data.generated_at||remoteVersion?.generated_at;
   const date=generated?new Date(generated).toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"}):"fecha no disponible";
   setCatalogStatus((offline?"Copia local · ":"Catálogo sincronizado · ")+catalogItems.length.toLocaleString("es")+" elementos · "+date,offline?"offline":"ready");
   renderCatalog();
 }
 async function loadCatalog(force=false){
   if(catalogLoadPromise&&!force)return catalogLoadPromise;
   const task=(async()=>{
     let record=await readCachedRecord();
     if(!record){
       const legacy=await readLegacyCatalog();
       if(legacy&&Array.isArray(legacy.items)){
         const oldVersion=localStorage.getItem("joa_web_catalog_version")||"";
         record={fingerprint:oldVersion,data:legacy,cachedAt:Date.now()};
         try{await saveCachedRecord(record)}catch(error){console.warn("JOA: migración de caché no disponible",error)}
       }
     }
     if(record?.data&&Array.isArray(record.data.items)&&!force){
       catalogMeta=record.data;catalogItems=record.data.items;updateSubcategoryControls();renderCatalog();
       setCatalogStatus("Catálogo guardado en este dispositivo · comprobando versión…","loading");
     }else if(!record&&!force){
       setCatalogStatus("Preparando la primera descarga del catálogo…","loading");
     }else setCatalogStatus(force?"Actualizando catálogo manualmente…":"Comprobando actualizaciones…","loading");
     try{
       const versionResponse=await fetch(CATALOG_VERSION_URL,{cache:"no-cache"});
       if(!versionResponse.ok)throw new Error("No se pudo consultar version.json");
       const remoteVersion=await versionResponse.json();
       const fingerprint=catalogFingerprint(remoteVersion);
       if(!force&&record&&record.fingerprint===fingerprint&&Array.isArray(record.data?.items)){
         applyCatalog(record.data,remoteVersion,false);
         setCatalogStatus("Al día · "+catalogItems.length.toLocaleString("es")+" elementos · no fue necesario descargar el JSON","ready");
         return;
       }
       setCatalogStatus(force?"Descargando catálogo solicitado…":"Hay una versión nueva · descargando catálogo…","loading");
       const response=await fetch(CATALOG_DATA_URL+"?v="+encodeURIComponent(remoteVersion.hash||remoteVersion.version||Date.now()),{cache:"no-store"});
       if(!response.ok)throw new Error("No se pudo descargar Update.json");
       const data=await response.json();validateCatalog(data,remoteVersion);
       const nextRecord={fingerprint,data,cachedAt:Date.now()};
       try{await saveCachedRecord(nextRecord);localStorage.setItem("joa_web_catalog_version",fingerprint)}catch(cacheError){console.warn("JOA: catálogo actualizado, pero no se pudo persistir en este dispositivo",cacheError)}
       applyCatalog(data,remoteVersion,false);
     }catch(error){
       console.error("JOA catalog:",error);
       const fallback=record?.data&&Array.isArray(record.data.items)?record.data:await readLegacyCatalog();
       if(fallback&&Array.isArray(fallback.items)){
         if(!catalogItems.length){catalogItems=fallback.items;catalogMeta=fallback;updateSubcategoryControls();renderCatalog()}
         setCatalogStatus("Sin conexión · mostrando catálogo guardado ("+catalogItems.length.toLocaleString("es")+" elementos)","offline");
       }else setCatalogStatus("No se pudo conectar con el catálogo. Intenta actualizar.","error");
     }
   })();
   catalogLoadPromise=task;
   try{return await task}finally{if(catalogLoadPromise===task)catalogLoadPromise=null}
 }
 $("#catalog-refresh")?.addEventListener("click",()=>{const b=$("#catalog-refresh");b.disabled=true;loadCatalog(true).finally(()=>{b.disabled=false})});
 $("#catalog-sort")?.addEventListener("change",e=>{sortMode=e.target.value;currentPage=1;renderCatalog()});
 $("#catalog-type-filter")?.addEventListener("change",e=>{activeCategory=e.target.value;activeSubcategory="";activePlatform="";cards.forEach(c=>c.classList.toggle("selected",c.dataset.category===activeCategory));updateSubcategoryControls();currentPage=1;renderCatalog()});
 $("#catalog-subcategory-filter")?.addEventListener("change",e=>{activeSubcategory=e.target.value;activePlatform="";updateSubcategoryControls();currentPage=1;renderCatalog()});
 $("#catalog-platform-filter")?.addEventListener("change",e=>{activePlatform=e.target.value;currentPage=1;renderCatalog()});
 $("#catalog-page-size")?.addEventListener("change",e=>{pageSize=Number(e.target.value)||20;currentPage=1;renderCatalog()});
 $("#catalog-detail-close")?.addEventListener("click",()=>$("#catalog-detail-dialog").close());
 $("#catalog-detail-dialog")?.addEventListener("click",e=>{if(e.target.id==="catalog-detail-dialog")e.currentTarget.close()});
 cards.forEach(card=>card.addEventListener("click",()=>{
   cards.forEach(c=>c.classList.remove("selected"));card.classList.add("selected");
   activeCategory=card.dataset.category||"";activeSubcategory="";activePlatform="";currentPage=1;$("#catalog-type-filter").value=activeCategory;updateSubcategoryControls();renderCatalog();
   $("#catalog-results").scrollIntoView({behavior:"smooth",block:"nearest"});
 }));
 $("#catalog-search").addEventListener("input",e=>{
   searchTerm=e.target.value.trim().toLocaleLowerCase("es");currentPage=1;renderCatalog();
   if(!catalogItems.length){const q=searchTerm;cards.forEach(card=>{card.hidden=!!q&&!card.innerText.toLocaleLowerCase("es").includes(q)})}
 });

 let currentSession=null,communityProfile=null,communityTab="feed",communityRequested=readCommunityIntent(),activeConversationId=null,activeConversationIds=[],activeChatChannel=null,communityChatListChannel=null,activeGroupChatChannel=null,activeGroupChatId=null,selectedReviewItem=null,activeCommunityGroupId=null,communityGroupsCache=[];

 let notificationsChannel=null,notificationsUserId=null,notificationRows=[];
 function notificationTime(value){
   const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";
   const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));
   if(seconds<60)return "Ahora";
   if(seconds<3600)return "Hace "+Math.floor(seconds/60)+" min";
   if(seconds<86400)return "Hace "+Math.floor(seconds/3600)+" h";
   return date.toLocaleDateString("es",{day:"2-digit",month:"short"});
 }
 function renderNotifications(rows){
   const host=$("#notification-list"),badge=$("#notification-count");
   if(!host||!badge)return;
   notificationRows=rows||[];
   const unread=notificationRows.filter(x=>!x.read_at).length;
   badge.textContent=unread>99?"99+":String(unread);
   badge.hidden=unread===0;
   host.innerHTML="";
   if(!notificationRows.length){
     const empty=document.createElement("div");empty.className="notification-empty";
     empty.textContent="Todavía no tienes notificaciones. Cuando alguien interactúe contigo, aparecerá aquí.";
     host.append(empty);return;
   }
   notificationRows.forEach(item=>{
     const button=document.createElement("button");button.type="button";
     button.className="notification-item"+(item.read_at?"":" unread");
     const dot=document.createElement("i");dot.className="notification-dot";
     const content=document.createElement("span");content.className="notification-copy";
     const title=document.createElement("b");title.textContent=item.title||"Notificación";
     const body=document.createElement("span");body.textContent=item.body||"Hay una novedad en JOA.";
     const time=document.createElement("small");time.textContent=notificationTime(item.created_at);
     content.append(title,body,time);button.append(dot,content);
     button.addEventListener("click",()=>openNotification(item));
     host.append(button);
   });
 }
 async function loadNotifications(){
   if(!currentUser||!supabase)return;
   const host=$("#notification-list");if(!host)return;
   const [rows,count]=await Promise.all([
     supabase.from("notifications").select("id,user_id,type,title,body,data,read_at,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(30),
     supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",currentUser.id).is("read_at",null)
   ]);
   if(rows.error||count.error){console.warn("JOA notifications:",rows.error||count.error);return}
   renderNotifications(rows.data||[]);
   const badge=$("#notification-count");
   const unread=count.count||0;
   badge.textContent=unread>99?"99+":String(unread);
   badge.hidden=unread===0;
 }
 function startNotificationRealtime(){
   if(!supabase||!currentUser)return;
   if(notificationsChannel&&notificationsUserId===currentUser.id)return;
   if(notificationsChannel)supabase.removeChannel(notificationsChannel);
   notificationsUserId=currentUser.id;
   notificationsChannel=supabase.channel("joa-notifications-"+currentUser.id)
     .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+currentUser.id},payload=>{
       loadNotifications().then(()=>{
         const panel=$("#notification-panel");
         if(document.visibilityState==="visible"&&panel&&!panel.open){
           panel.showModal();
           $("#notifications-toggle")?.setAttribute("aria-expanded","true");
         }else if(document.visibilityState!=="visible"){
           toast(payload.new?.title||"Tienes una nueva notificación.");
         }
       });
     }).subscribe();
 }
 function stopNotificationRealtime(){
   if(notificationsChannel&&supabase)supabase.removeChannel(notificationsChannel);
   notificationsChannel=null;notificationsUserId=null;notificationRows=[];
   const badge=$("#notification-count"),host=$("#notification-list");
   if(badge){badge.hidden=true;badge.textContent="0"}
   if(host)host.innerHTML='<div class="notification-empty">Inicia sesión para ver tus notificaciones.</div>';
   const panel=$("#notification-panel");if(panel?.open)panel.close();
   $("#notifications-toggle")?.setAttribute("aria-expanded","false");
 }
 async function markAllNotificationsRead(){
   if(!currentUser||!supabase)return;
   const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",currentUser.id).is("read_at",null);
   if(error){toast(communityError(error));return}
   await loadNotifications();toast("Notificaciones marcadas como leídas.");
 }


 async function loadPublicRewardShowcase(){
   const host=$("#reward-public-campaign-list");if(!host||!supabase)return;
   const {data,error}=await supabase.from("reward_campaigns").select("id,title,description,image_url,reward_type,reward_details,group_id,starts_at,ends_at,min_days_member,min_posts,min_comments,min_messages,min_reactions,min_merit_points").eq("status","published").order("created_at",{ascending:false}).limit(6);
   if(error){host.textContent="Las recompensas estarán disponibles cuando el servicio se conecte.";return}
   host.innerHTML="";
   if(!data?.length){host.innerHTML='<p class="community-hint">Próximamente publicaremos los primeros paquetes de regalo.</p>';return}
   data.forEach(c=>{const card=document.createElement("article");card.className="reward-campaign-card";if(c.image_url){const im=document.createElement("img");im.src=c.image_url;im.alt="";im.loading="lazy";im.referrerPolicy="no-referrer";card.append(im)}const body=document.createElement("div");body.className="reward-campaign-body";const badge=document.createElement("span");badge.className="reward-state";badge.textContent="RECOMPENSA ABIERTA";const title=document.createElement("h4");title.textContent=c.title;const desc=document.createElement("p");desc.textContent=c.description||"Únete a la comunidad y participa.";const prize=document.createElement("b");prize.textContent="🎁 "+(c.reward_details||c.reward_type);const req=document.createElement("small");req.textContent="Requisitos: "+rewardRequirements(c);const btn=document.createElement("button");btn.className="button button-primary";btn.textContent="Entrar y participar";btn.addEventListener("click",()=>{if(!currentUser){openAuth();return}openCommunity();if(communityProfile?.id===currentUser.id)activateCommunityTab("rewards")});body.append(badge,title,desc,prize,req,btn);card.append(body);host.append(card)})
 }

 function rewardAdmin(){return currentUser?.app_metadata?.role==="admin"}
 async function loadRewardGroups(){const s=$("#reward-group");if(!s||!supabase)return;const r=await supabase.from("community_groups").select("id,name").order("name").limit(300);if(r.error){toast(communityError(r.error));return}s.innerHTML='<option value="">Toda la comunidad</option>';(r.data||[]).forEach(g=>{const o=document.createElement("option");o.value=g.id;o.textContent=g.name;s.append(o)})}
 function rewardDate(v){return v?new Date(v).toLocaleString("es",{dateStyle:"medium",timeStyle:"short"}):"Sin fecha límite"}
 function rewardRequirements(c){const a=[];if(c.group_id)a.push("Miembros del grupo");if(c.min_days_member)a.push(c.min_days_member+" días en el grupo");if(c.min_posts)a.push(c.min_posts+" publicaciones");if(c.min_comments)a.push(c.min_comments+" comentarios");if(c.min_messages)a.push(c.min_messages+" mensajes");if(c.min_reactions)a.push(c.min_reactions+" reacciones");if(c.min_merit_points)a.push(c.min_merit_points+" puntos de mérito");return a.join(" · ")||"Sin requisitos adicionales"}
 async function loadRewardCampaigns(){
  const host=$("#reward-campaign-list");if(!host||!supabase)return;host.innerHTML='<p class="community-loading">Cargando recompensas…</p>';
  const r=await supabase.from("reward_campaigns").select("*").order("created_at",{ascending:false}).limit(100);if(r.error){host.textContent=communityError(r.error);return}
  const gr=await supabase.from("community_groups").select("id,name").limit(300),gm=new Map((gr.data||[]).map(g=>[g.id,g.name]));
  const rows=(r.data||[]).filter(c=>rewardAdmin()||c.status==="published");host.innerHTML="";
  if(!rows.length){host.innerHTML='<div class="community-empty"><span>🎁</span><h3>No hay campañas disponibles</h3><p>Vuelve pronto para descubrir nuevos regalos.</p></div>';return}
  rows.forEach(c=>{const card=document.createElement("article");card.className="reward-campaign-card";if(c.image_url){const im=document.createElement("img");im.src=c.image_url;im.alt="";im.loading="lazy";im.referrerPolicy="no-referrer";card.append(im)}
   const b=document.createElement("div");b.className="reward-campaign-body";const st=document.createElement("span");st.className="reward-state";st.textContent=c.status==="published"?"ABIERTA":c.status.toUpperCase();
   const t=document.createElement("h4");t.textContent=c.title;const d=document.createElement("p");d.textContent=c.description||"Participa y demuestra tu compromiso con JOA.";
   const prize=document.createElement("b");prize.textContent="🎁 "+(c.reward_details||c.reward_type);const group=document.createElement("small");group.textContent=c.group_id?"Grupo: "+(gm.get(c.group_id)||"Grupo JOA"):"Toda la comunidad";
   const req=document.createElement("small");req.textContent="Requisitos: "+rewardRequirements(c);const end=document.createElement("small");end.textContent="Finaliza: "+rewardDate(c.ends_at);const acts=document.createElement("div");acts.className="reward-card-actions";
   if(c.status==="published"){const btn=document.createElement("button");btn.className="button button-primary";btn.textContent="Participar";btn.addEventListener("click",()=>claimReward(c.id,btn));acts.append(btn)}
   if(rewardAdmin()){if(c.selection_mode!=="manual"){const draw=document.createElement("button");draw.className="catalog-refresh";draw.textContent=c.selection_mode==="raffle"?"Sortear ganadores":"Elegir por mérito";draw.addEventListener("click",()=>drawRewardWinners(c));acts.append(draw)}const edit=document.createElement("button");edit.className="catalog-refresh";edit.textContent="Editar";edit.addEventListener("click",()=>fillRewardForm(c));const toggle=document.createElement("button");toggle.className="catalog-refresh";toggle.textContent=c.status==="published"?"Pausar":"Publicar";toggle.addEventListener("click",()=>changeRewardStatus(c,c.status==="published"?"paused":"published"));const del=document.createElement("button");del.className="catalog-refresh reward-danger";del.textContent="Eliminar";del.addEventListener("click",()=>deleteReward(c));acts.append(edit,toggle,del)}
   b.append(st,t,d,prize,group,req,end,acts);card.append(b);host.append(card)
  })
 }
 async function claimReward(id,btn){if(!currentUser){openAuth();return}btn.disabled=true;const r=await supabase.rpc("claim_reward_campaign",{p_campaign_id:id});btn.disabled=false;if(r.error){toast(r.error.message);return}toast("Participación registrada; queda pendiente de revisión.");await loadMyRewardClaims()}
 async function loadMyRewardClaims(){const host=$("#reward-my-claims");if(!host||!currentUser||!supabase)return;const r=await supabase.from("reward_claims").select("id,status,merit_points_snapshot,created_at,reward_campaigns(title)").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(50);if(r.error){host.textContent=communityError(r.error);return}host.innerHTML="";if(!r.data?.length){host.textContent="Todavía no has participado.";return}r.data.forEach(x=>{const row=document.createElement("div");row.className="reward-claim-row";const b=document.createElement("b");b.textContent=x.reward_campaigns?.title||"Recompensa JOA";const s=document.createElement("span");s.textContent=({pending:"Pendiente",approved:"Seleccionado",rejected:"No seleccionado",delivered:"Entregado"})[x.status]||x.status;const m=document.createElement("small");m.textContent=x.merit_points_snapshot+" puntos · "+rewardDate(x.created_at);row.append(b,s,m);host.append(row)})}
 async function loadRewardAdminClaims(){const host=$("#reward-admin-claims");if(!host||!rewardAdmin()||!supabase)return;const r=await supabase.from("reward_claims").select("id,status,merit_points_snapshot,created_at,user_id,campaign_id,admin_note,reward_campaigns(title)").order("created_at",{ascending:false}).limit(200);if(r.error){host.textContent=communityError(r.error);return}const ids=[...new Set((r.data||[]).map(x=>x.user_id))],p=ids.length?await supabase.from("profiles").select("id,display_name,username").in("id",ids):{data:[]},pm=new Map((p.data||[]).map(x=>[x.id,x]));host.innerHTML="";if(!r.data?.length){host.textContent="No hay solicitudes todavía.";return}r.data.forEach(x=>{const row=document.createElement("article");row.className="reward-admin-claim";const who=pm.get(x.user_id)||{};const title=document.createElement("b");title.textContent=(who.display_name||who.username||"Jugador")+" · "+(x.reward_campaigns?.title||"Campaña");const meta=document.createElement("small");meta.textContent=x.status+" · "+x.merit_points_snapshot+" puntos · "+rewardDate(x.created_at);const actions=document.createElement("div");actions.className="reward-card-actions";[["approved","Aprobar"],["rejected","Rechazar"],["delivered","Entregado"]].forEach(([s,label])=>{const b=document.createElement("button");b.className="catalog-refresh";b.textContent=label;b.disabled=x.status===s||x.status==="delivered";b.addEventListener("click",()=>reviewRewardClaim(x,s));actions.append(b)});row.append(title,meta,actions);host.append(row)})}
 async function reviewRewardClaim(x,status){if(!rewardAdmin())return;const note=prompt("Nota administrativa (opcional):",x.admin_note||"");if(note===null)return;const patch={status,admin_note:note,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()};if(status==="delivered")patch.delivered_at=new Date().toISOString();const r=await supabase.from("reward_claims").update(patch).eq("id",x.id);if(r.error){toast(communityError(r.error));return}toast("Solicitud actualizada.");await loadRewardAdminClaims();await loadMyRewardClaims()}
 function fillRewardForm(c){$("#reward-edit-id").value=c.id;$("#reward-title").value=c.title;$("#reward-description").value=c.description||"";$("#reward-image").value=c.image_url||"";$("#reward-type").value=c.reward_type;$("#reward-details").value=c.reward_details||"";$("#reward-group").value=c.group_id||"";$("#reward-start").value=c.starts_at?new Date(c.starts_at).toISOString().slice(0,16):"";$("#reward-end").value=c.ends_at?new Date(c.ends_at).toISOString().slice(0,16):"";$("#reward-status").value=c.status;$("#reward-winners").value=c.max_winners;$("#reward-mode").value=c.selection_mode;$("#reward-days").value=c.min_days_member;$("#reward-posts").value=c.min_posts;$("#reward-comments").value=c.min_comments;$("#reward-messages").value=c.min_messages;$("#reward-reactions").value=c.min_reactions;$("#reward-points").value=c.min_merit_points;$("#reward-save").textContent="Guardar cambios";$("#reward-title").focus()}
 async function saveRewardCampaign(e){e.preventDefault();if(!rewardAdmin()||!supabase)return;const btn=$("#reward-save");btn.disabled=true;const id=$("#reward-edit-id").value,dt=v=>v?new Date(v).toISOString():null,p={title:$("#reward-title").value.trim(),description:$("#reward-description").value.trim(),image_url:$("#reward-image").value.trim()||null,reward_type:$("#reward-type").value,reward_details:$("#reward-details").value.trim(),group_id:$("#reward-group").value||null,starts_at:dt($("#reward-start").value)||new Date().toISOString(),ends_at:dt($("#reward-end").value),status:$("#reward-status").value,max_winners:+$("#reward-winners").value,selection_mode:$("#reward-mode").value,min_days_member:+$("#reward-days").value||0,min_posts:+$("#reward-posts").value||0,min_comments:+$("#reward-comments").value||0,min_messages:+$("#reward-messages").value||0,min_reactions:+$("#reward-reactions").value||0,min_merit_points:+$("#reward-points").value||0,updated_at:new Date().toISOString()};if(!id)p.created_by=currentUser.id;const r=id?await supabase.from("reward_campaigns").update(p).eq("id",id):await supabase.from("reward_campaigns").insert(p);btn.disabled=false;if(r.error){toast(communityError(r.error));return}$("#reward-form").reset();$("#reward-edit-id").value="";$("#reward-save").textContent="Crear campaña";toast(id?"Campaña actualizada.":"Campaña creada.");await loadRewardCampaigns()}
 async function drawRewardWinners(c){if(!rewardAdmin()||!confirm(c.selection_mode==="raffle"?"¿Realizar el sorteo ahora? Los ganadores aprobados quedarán registrados.":"¿Seleccionar ahora a los participantes con mayor mérito?"))return;const r=await supabase.rpc("draw_reward_winners",{p_campaign_id:c.id});if(r.error){toast(communityError(r.error));return}toast("Selección completada: "+(r.data?.selected_now||0)+" ganador(es).");await loadRewardCampaigns();await loadRewardAdminClaims()}
 async function changeRewardStatus(c,status){const r=await supabase.from("reward_campaigns").update({status,updated_at:new Date().toISOString()}).eq("id",c.id);if(r.error){toast(communityError(r.error));return}await loadRewardCampaigns()}
 async function deleteReward(c){if(!rewardAdmin()||!confirm("¿Eliminar esta campaña y todas sus solicitudes?"))return;const r=await supabase.from("reward_campaigns").delete().eq("id",c.id);if(r.error){toast(communityError(r.error));return}await loadRewardCampaigns();await loadRewardAdminClaims()}
 async function loadRewardAudit(){const h=$("#reward-audit-list");if(!h||!rewardAdmin()||!supabase)return;const r=await supabase.from("reward_audit_log").select("id,actor_id,action,entity_type,entity_id,created_at").order("created_at",{ascending:false}).limit(40);if(r.error){h.textContent=communityError(r.error);return}h.innerHTML="";(r.data||[]).forEach(x=>{const d=document.createElement("div");d.className="reward-audit-row";d.textContent=rewardDate(x.created_at)+" · "+x.action+" · "+x.entity_type+" · "+x.entity_id;h.append(d)});if(!r.data?.length)h.textContent="Sin movimientos registrados."}
 async function loadRewardsWorkspace(){await loadRewardCampaigns();await loadMyRewardClaims();if(rewardAdmin()){await loadRewardGroups();await loadRewardAdminClaims();await loadRewardAudit()}}
 $("#reward-form")?.addEventListener("submit",saveRewardCampaign);
 $("#reward-reset")?.addEventListener("click",()=>{ $("#reward-form")?.reset();$("#reward-edit-id").value="";$("#reward-save").textContent="Crear campaña" });

 function activateCommunityTab(tab){
   communityTab=tab;
   if(tab==="admin"&&!rewardAdmin()){toast("No tienes permisos para abrir este panel.");return}
   document.querySelectorAll("[data-community-tab]").forEach(button=>button.classList.toggle("active",button.dataset.communityTab===tab));
   ["feed","friends","messages","groups","reviews","favorites","profile","rewards","admin"].forEach(name=>{
     const panel=$("#community-"+name+"-panel");if(panel)panel.hidden=name!==tab;
   });
   if(tab==="messages")loadCommunityChats();
   if(tab==="friends")loadCommunityDirectory();
   if(tab==="groups")loadCommunityGroups();
   if(tab==="reviews")loadCommunityReviews();
   if(tab==="favorites"){renderCommunityFavorites();loadCommunityFavoriteFriends();}
   if(tab==="rewards"||tab==="admin")loadRewardsWorkspace();
 }
 async function openNotification(item){
   const panel=$("#notification-panel");if(panel?.open)panel.close();$("#notifications-toggle")?.setAttribute("aria-expanded","false");
   if(!currentUser||!supabase)return;
   if(!item.read_at){
     const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",item.id).eq("user_id",currentUser.id);
     if(error)console.warn("No se pudo marcar la notificación",error);
     item.read_at=new Date().toISOString();await loadNotifications();
   }
   const data=item.data||{},target=data.target||"feed";
   openCommunity();
   if(target==="friends"){activateCommunityTab("friends");loadCommunityFriends();return}
   if(target==="groups"){
     activateCommunityTab("groups");
     await loadCommunityGroups();
     if(data.group_id)openCommunityGroup(data.group_id);
     return;
   }
   if(target==="messages"&&data.conversation_id){
     activateCommunityTab("messages");
     const {data:conv,error}=await supabase.from("conversations").select("id,created_by,direct_user_id,group_id").eq("id",data.conversation_id).maybeSingle();
     if(error||!conv)return;
     if(conv.group_id){activateCommunityTab("groups");await loadCommunityGroups();openCommunityGroup(conv.group_id);return}
     const peerId=conv.created_by===currentUser.id?conv.direct_user_id:conv.created_by;
     const profile=await supabase.from("profiles").select("display_name,username").eq("id",peerId).maybeSingle();
     const title=profile.data?.display_name||profile.data?.username||"Chat JOA";
     openCommunityChat(conv.id,title,[conv.id]);
     return;
   }
   activateCommunityTab("feed");
   await loadCommunityFeed();
   if(data.post_id){const post=$(`[data-community-post-id="${data.post_id}"]`);if(post){post.scrollIntoView({behavior:"smooth",block:"center"});post.classList.add("notification-highlight");setTimeout(()=>post.classList.remove("notification-highlight"),2400)}}
 }
 function openCommunity(){
   if(!currentUser){openAuth();return}
   // Esperar al perfil social antes de abrir las funciones que dependen de él.
   if(!communityProfile||communityProfile.id!==currentUser.id){
     setCommunityIntent(true);
     toast("Tu cuenta está conectada. Estamos preparando tu comunidad…");
     return;
   }
   setCommunityIntent(false);
   const workspace=$("#community-workspace"),layout=$(".community-layout");
   if(workspace)workspace.hidden=false;if(layout)layout.hidden=true;
   $("#community-user-name").textContent=communityProfile?.display_name||currentUser.email?.split("@")[0]||"jugador";
   $("#community-account-email").textContent=currentUser.email||"Cuenta JOA";
   $("#community-profile-name").value=communityProfile?.display_name||"";
   $("#community-profile-username").value=communityProfile?.username||"";
   $("#community-profile-bio").value=communityProfile?.bio||"";
   $("#community-profile-games").value=communityProfile?.game_preferences||"";
   $("#community-avatar").textContent=(communityProfile?.display_name||"JG").slice(0,2).toUpperCase();
   loadCommunityFeed();loadCommunityFriends();loadCommunityDirectory();loadCommunityGroups();loadCommunityChats();ensureCommunityChatListRealtime();loadCommunityReviews();
   $("#community").scrollIntoView({behavior:"smooth",block:"start"});
 }
 function closeCommunity(){
   const workspace=$("#community-workspace"),layout=$(".community-layout");
   if(workspace)workspace.hidden=true;if(layout)layout.hidden=false;
 }
 function communityError(error){console.error("JOA Social:",error);return error?.message||"No se pudo completar la operación."}
 async function ensureCommunityProfile(user){
   if(!user||!supabase)return null;
   const meta=user.user_metadata||{};
   const display=meta.full_name||meta.name||user.email?.split("@")[0]||"Jugador JOA";
   const username="joa_"+user.id.replace(/-/g,"").slice(0,10);
   const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
   if(error)throw error;
   if(data){
     // El trigger crea la fila, pero no asigna username; completar solo campos vacíos.
     const patch={};
     if(!data.username)patch.username=username;
     if(!data.display_name)patch.display_name=display;
     if(!data.avatar_url&&(meta.avatar_url||meta.picture))patch.avatar_url=meta.avatar_url||meta.picture;
     if(!Object.keys(patch).length)return data;
     patch.updated_at=new Date().toISOString();
     const {data:updated,error:updateError}=await supabase.from("profiles").update(patch).eq("id",user.id).select().single();
     if(updateError)throw updateError;
     return updated;
   }
   const {data:created,error:insertError}=await supabase.from("profiles").insert({id:user.id,username,display_name:display,avatar_url:meta.avatar_url||meta.picture||null}).select().single();
   if(insertError)throw insertError;
   return created;
 }
 function communityInitials(name){return String(name||"JG").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"JG"}
 async function loadCommunityFeed(){
   const host=$("#community-feed-list");if(!host||!supabase)return;
   host.innerHTML='<p class="community-loading">Cargando publicaciones…</p>';
   try{
     const {data:posts,error}=await supabase.from("posts").select("id,author_id,body,media_url,created_at").order("created_at",{ascending:false}).limit(40);
     if(error)throw error;
     if(!posts?.length){host.innerHTML='<div class="community-empty"><span>✦</span><h3>La comunidad espera su primera publicación</h3><p>Publica algo y abre la conversación en JOA.</p></div>';return}
     const ids=[...new Set(posts.map(p=>p.author_id))],postIds=posts.map(p=>p.id);
     const [profilesRes,reactionsRes,commentsRes]=await Promise.all([
       supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",ids),
       supabase.from("post_reactions").select("post_id,user_id,reaction").in("post_id",postIds),
       supabase.from("post_comments").select("id,post_id,author_id,body,created_at").in("post_id",postIds).order("created_at",{ascending:true})
     ]);
     if(profilesRes.error)throw profilesRes.error;if(reactionsRes.error)throw reactionsRes.error;if(commentsRes.error)throw commentsRes.error;
     const profiles=new Map((profilesRes.data||[]).map(p=>[p.id,p]));
     const reactions=reactionsRes.data||[],comments=commentsRes.data||[];
     const commentAuthors=[...new Set(comments.map(c=>c.author_id))].filter(id=>!profiles.has(id));
     if(commentAuthors.length){const extra=await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",commentAuthors);if(!extra.error)(extra.data||[]).forEach(p=>profiles.set(p.id,p))}
     host.innerHTML="";
     posts.forEach(post=>{
       const profile=profiles.get(post.author_id)||{},mine=post.author_id===currentUser.id;
       const ownReaction=reactions.find(r=>r.post_id===post.id&&r.user_id===currentUser.id);
       const postReactions=reactions.filter(r=>r.post_id===post.id);
       const postComments=comments.filter(c=>c.post_id===post.id);
       const card=document.createElement("article");card.className="community-post-card";card.dataset.communityPostId=post.id;
       const head=document.createElement("div");head.className="community-post-head";
       const avatar=document.createElement("span");avatar.className="community-avatar";avatar.textContent=communityInitials(profile.display_name||profile.username);
       const who=document.createElement("div");who.className="community-post-author";
       const name=document.createElement("b");name.textContent=profile.display_name||profile.username||"Jugador JOA";
       const handle=document.createElement("small");handle.textContent="@"+(profile.username||"jugador")+" · "+new Date(post.created_at).toLocaleString("es",{dateStyle:"medium",timeStyle:"short"});
       who.append(name,handle);head.append(avatar,who);
       if(mine){const del=document.createElement("button");del.className="community-post-delete";del.textContent="Eliminar";del.addEventListener("click",()=>deleteCommunityPost(post.id));head.append(del)}
       const body=document.createElement("p");body.className="community-post-body";body.textContent=post.body;
       card.append(head,body);
       if(post.media_url){const link=document.createElement("a");link.href=post.media_url;link.target="_blank";link.rel="noopener";link.textContent="Ver contenido adjunto ↗";card.append(link)}
       const actions=document.createElement("div");actions.className="community-post-actions";
       const react=document.createElement("button");react.className=ownReaction?"is-reacted":"";react.textContent=(ownReaction?.reaction==="love"?"♥":"♡")+" Me gusta · "+postReactions.length;react.addEventListener("click",()=>toggleCommunityReaction(post.id,ownReaction));
       const commentToggle=document.createElement("button");commentToggle.textContent="▢ Comentar · "+postComments.length;
       actions.append(react,commentToggle);card.append(actions);
       const commentsBox=document.createElement("div");commentsBox.className="community-comments";commentsBox.hidden=true;
       postComments.forEach(comment=>{const line=document.createElement("p");const author=profiles.get(comment.author_id);const b=document.createElement("b");b.textContent=(author?.display_name||author?.username||"Jugador")+": ";line.append(b,document.createTextNode(comment.body));commentsBox.append(line)});
       const form=document.createElement("form");form.className="community-comment-form";const input=document.createElement("input");input.placeholder="Escribe un comentario…";input.maxLength=3000;input.required=true;const send=document.createElement("button");send.textContent="Enviar";form.append(input,send);form.addEventListener("submit",async e=>{e.preventDefault();send.disabled=true;try{const {error}=await supabase.from("post_comments").insert({post_id:post.id,author_id:currentUser.id,body:input.value.trim()});if(error)throw error;loadCommunityFeed()}catch(err){toast(communityError(err))}finally{send.disabled=false}});
       commentsBox.append(form);commentToggle.addEventListener("click",()=>{commentsBox.hidden=!commentsBox.hidden;if(!commentsBox.hidden)input.focus()});card.append(commentsBox);host.append(card);
     });
   }catch(error){host.innerHTML='<div class="community-empty"><h3>No se pudieron cargar las publicaciones</h3><p></p></div>';host.querySelector("p").textContent=communityError(error)}
 }
 async function toggleCommunityReaction(postId,existing){
   try{
     if(existing){const {error}=await supabase.from("post_reactions").delete().eq("post_id",postId).eq("user_id",currentUser.id);if(error)throw error}
     else{const {error}=await supabase.from("post_reactions").insert({post_id:postId,user_id:currentUser.id,reaction:"like"});if(error)throw error}
     loadCommunityFeed();
   }catch(error){toast(communityError(error))}
 }
 async function deleteCommunityPost(postId){
   if(!confirm("¿Eliminar esta publicación?"))return;
   const {error}=await supabase.from("posts").delete().eq("id",postId).eq("author_id",currentUser.id);
   if(error)toast(communityError(error));else{toast("Publicación eliminada.");loadCommunityFeed()}
 }
 $("#community-post-form").addEventListener("submit",async e=>{
   e.preventDefault();if(!currentUser)return;const field=$("#community-post-body"),button=e.submitter;const body=field.value.trim();if(!body)return;
   button.disabled=true;
   try{const {error}=await supabase.from("posts").insert({author_id:currentUser.id,body});if(error)throw error;field.value="";toast("¡Publicación compartida!");loadCommunityFeed()}
   catch(error){toast(communityError(error))}finally{button.disabled=false}
 });
 $("#community-feed-refresh").addEventListener("click",loadCommunityFeed);
 $("#notifications-toggle").addEventListener("click",async()=>{
   if(!currentUser){openAuth();return}
   const panel=$("#notification-panel");if(!panel)return;
   if(panel.open){panel.close();return}
   panel.showModal();
   $("#notifications-toggle").setAttribute("aria-expanded","true");
   await loadNotifications();
 });
 $("#notifications-close").addEventListener("click",()=>$("#notification-panel")?.close());
 $("#notification-panel").addEventListener("close",()=>$("#notifications-toggle")?.setAttribute("aria-expanded","false"));
 $("#notification-panel").addEventListener("click",event=>{
   if(event.target===$("#notification-panel"))$("#notification-panel").close();
 });
 $("#notifications-mark-all").addEventListener("click",markAllNotificationsRead);

 $("#community-signout").addEventListener("click",async()=>{
   if(!supabase)return;
   if(!window.confirm("¿Seguro que quieres cerrar tu sesión de JOA en este dispositivo?"))return;
   const button=$("#community-signout");if(button)button.disabled=true;
   try{
     const {error}=await supabase.auth.signOut({scope:"local"});
     if(error)throw error;
     closeCommunity();setCommunityIntent(false);toast("Sesión cerrada en este dispositivo.");
   }catch(error){toast(communityError(error))}
   finally{if(button)button.disabled=false}
 });
 $("#community-profile-form").addEventListener("submit",async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   const username=$("#community-profile-username").value.trim().replace(/^@/,"");
   try{
     const {data,error}=await supabase.from("profiles").update({username,display_name:$("#community-profile-name").value.trim(),bio:$("#community-profile-bio").value.trim(),game_preferences:$("#community-profile-games").value.trim(),updated_at:new Date().toISOString()}).eq("id",currentUser.id).select().single();
     if(error)throw error;communityProfile=data;$("#community-user-name").textContent=data.display_name;$("#community-avatar").textContent=communityInitials(data.display_name);$("#community-profile-status").textContent="Perfil actualizado correctamente.";toast("Perfil guardado.");
   }catch(error){$("#community-profile-status").textContent=communityError(error)}finally{button.disabled=false}
 });
 $$("[data-community-tab]").forEach(button=>button.addEventListener("click",()=>activateCommunityTab(button.dataset.communityTab)));
 $("#favorites-share-whatsapp").addEventListener("click",shareFavoritesWhatsApp);
 $("#favorites-refresh").addEventListener("click",async()=>{await loadCatalogFavorites();await loadCommunityFavoriteFriends()});
 function openPublicProfile(profile){
   const dialog=$("#community-public-profile-dialog"),host=$("#community-public-profile-content");
   if(!dialog||!host||!profile)return;
   host.innerHTML="";
   const card=document.createElement("div");card.className="public-profile-card";
   const avatar=document.createElement("div");avatar.className="public-profile-avatar";avatar.textContent=communityInitials(profile.display_name||profile.username);
   const name=document.createElement("h2");name.textContent=profile.display_name||profile.username||"Jugador JOA";
   const handle=document.createElement("p");handle.className="public-profile-handle";handle.textContent="@"+(profile.username||"jugador");
   card.append(avatar,name,handle);
   if(profile.bio){const bioTitle=document.createElement("h3");bioTitle.textContent="Sobre mí";const bio=document.createElement("p");bio.textContent=profile.bio;card.append(bioTitle,bio)}
   if(profile.game_preferences){const gamesTitle=document.createElement("h3");gamesTitle.textContent="Juegos y plataformas";const games=document.createElement("p");games.textContent=profile.game_preferences;card.append(gamesTitle,games)}
   host.append(card);
   if(!dialog.open)dialog.showModal();
 }
 $("#community-public-profile-close").addEventListener("click",()=>$("#community-public-profile-dialog")?.close());
 async function loadCommunityFriends(){
   if(!currentUser||!supabase)return;
   const host=$("#community-friend-list");if(!host)return;
   const {data,error}=await supabase.from("friendships").select("*")
     .or("requester_id.eq."+currentUser.id+",addressee_id.eq."+currentUser.id)
     .order("created_at",{ascending:false});
   if(error){host.textContent=communityError(error);return}
   if(!data?.length){host.textContent="Todavía no tienes amistades ni solicitudes.";return}
   const others=[...new Set(data.map(x=>x.requester_id===currentUser.id?x.addressee_id:x.requester_id))];
   const p=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,game_preferences").in("id",others);
   if(p.error){host.textContent=communityError(p.error);return}
   const map=new Map((p.data||[]).map(x=>[x.id,x]));host.innerHTML="";
   for(const row of data){
     const other=row.requester_id===currentUser.id?row.addressee_id:row.requester_id,profile=map.get(other)||{};
     const line=document.createElement("div");line.className="community-list-row";
     const label=document.createElement("span");label.textContent=(profile.display_name||profile.username||"Jugador")+" · "+row.status;line.append(label);
     const view=document.createElement("button");view.type="button";view.textContent="Ver perfil";view.addEventListener("click",()=>openPublicProfile(profile));line.append(view);
     const makeAction=(text,handler,kind="")=>{const button=document.createElement("button");button.type="button";button.textContent=text;if(kind)button.classList.add(kind);button.addEventListener("click",()=>handler(button));line.append(button);return button};
     const refresh=async()=>{await loadCommunityFriends();await loadCommunityDirectory()};
     if(row.status==="accepted"){
       makeAction("Mensaje",()=>startDirectChat(other,profile.display_name||profile.username||"Amigo"));
       if(row.requester_id===currentUser.id){
         makeAction("Eliminar amistad",async button=>{
           if(!confirm("¿Eliminar esta amistad?"))return;button.disabled=true;
           const result=await supabase.from("friendships").delete().eq("id",row.id).eq("requester_id",currentUser.id).select("id").maybeSingle();
           if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo eliminar la amistad.");return}
           toast("Amistad eliminada.");await refresh();
         },"danger");
       }else{
         makeAction("Bloquear",async button=>{
           if(!confirm("¿Bloquear a este jugador? La relación dejará de aparecer como amistad."))return;button.disabled=true;
           const result=await supabase.from("friendships").update({status:"blocked",updated_at:new Date().toISOString()}).eq("id",row.id).eq("addressee_id",currentUser.id).select("id").maybeSingle();
           if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo bloquear al jugador.");return}
           toast("Jugador bloqueado.");await refresh();
         },"danger");
       }
     }else if(row.status==="pending"&&row.addressee_id===currentUser.id){
       makeAction("Aceptar",async button=>{
         button.disabled=true;
         const result=await supabase.from("friendships").update({status:"accepted",updated_at:new Date().toISOString()}).eq("id",row.id).eq("addressee_id",currentUser.id).eq("status","pending").select("id").maybeSingle();
         if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"La solicitud ya no está disponible.");return}
         toast("¡Ahora son amigos!");await refresh();
       },"primary");
       makeAction("Rechazar",async button=>{
         button.disabled=true;
         const result=await supabase.from("friendships").update({status:"rejected",updated_at:new Date().toISOString()}).eq("id",row.id).eq("addressee_id",currentUser.id).eq("status","pending").select("id").maybeSingle();
         if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo rechazar la solicitud.");return}
         toast("Solicitud rechazada.");await refresh();
       },"danger");
     }else if(row.status==="pending"&&row.requester_id===currentUser.id){
       makeAction("Cancelar solicitud",async button=>{
         button.disabled=true;
         const result=await supabase.from("friendships").delete().eq("id",row.id).eq("requester_id",currentUser.id).select("id").maybeSingle();
         if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo cancelar la solicitud.");return}
         toast("Solicitud cancelada.");await refresh();
       },"danger");
     }else{
       const state=document.createElement("small");state.className="community-friend-state";state.textContent=row.status==="rejected"?"Solicitud rechazada":"Jugador bloqueado";line.append(state);
     }
     host.append(line);
   }
 }
 async function loadCommunityDirectory(){
   const host=$("#community-friend-results");if(!host||!currentUser||!supabase)return;
   host.innerHTML='<p class="community-loading">Cargando jugadores…</p>';
   const [people,relations]=await Promise.all([
     supabase.from("profiles").select("id,username,display_name,avatar_url,bio,game_preferences,updated_at").neq("id",currentUser.id).order("updated_at",{ascending:false}).limit(100),
     supabase.from("friendships").select("requester_id,addressee_id,status").or("requester_id.eq."+currentUser.id+",addressee_id.eq."+currentUser.id)
   ]);
   if(people.error){host.textContent=communityError(people.error);return}
   if(relations.error){host.textContent=communityError(relations.error);return}
   const profiles=people.data||[],friendships=relations.data||[];
   const input=$("#community-friend-query");
   const render=()=>{
     const q=(input?.value||"").trim().toLocaleLowerCase("es");
     const matches=profiles.filter(p=>[p.username,p.display_name,p.bio,p.game_preferences].some(v=>String(v||"").toLocaleLowerCase("es").includes(q))).slice(0,60);
     host.innerHTML="";
     if(!matches.length){host.innerHTML='<div class="community-empty"><h3>No encontramos jugadores</h3><p>Prueba con otro nombre, juego o plataforma.</p></div>';return}
     matches.forEach(profile=>{
       const relation=friendships.find(f=>(f.requester_id===currentUser.id&&f.addressee_id===profile.id)||(f.addressee_id===currentUser.id&&f.requester_id===profile.id));
       const row=document.createElement("article");row.className="community-player-card";
       const head=document.createElement("div");head.className="community-player-head";
       const avatar=document.createElement("span");avatar.className="community-avatar";avatar.textContent=communityInitials(profile.display_name||profile.username);
       const identity=document.createElement("div");identity.className="community-player-identity";
       const name=document.createElement("b");name.textContent=profile.display_name||profile.username||"Jugador JOA";
       const handle=document.createElement("small");handle.textContent="@"+(profile.username||"jugador");
       identity.append(name,handle);head.append(avatar,identity);row.append(head);
       if(profile.bio){const bio=document.createElement("p");bio.className="community-player-bio";bio.textContent=profile.bio;row.append(bio)}
       if(profile.game_preferences){const games=document.createElement("p");games.className="community-player-games";games.textContent="🎮 Busca jugar: "+profile.game_preferences;row.append(games)}
       const actions=document.createElement("div");actions.className="community-player-actions";
       const view=document.createElement("button");view.type="button";view.textContent="Ver perfil";view.addEventListener("click",()=>openPublicProfile(profile));actions.append(view);
       const addAction=(label,handler,kind="")=>{const button=document.createElement("button");button.type="button";button.textContent=label;if(kind)button.classList.add(kind);button.addEventListener("click",()=>handler(button));actions.append(button);return button};
       const refreshRelations=async()=>{await loadCommunityFriends();await loadCommunityDirectory()};
       if(relation?.status==="accepted"){
         addAction("Enviar mensaje",()=>startDirectChat(profile.id,profile.display_name||profile.username||"Amigo"));
       }else if(relation?.status==="pending"&&relation.requester_id===currentUser.id){
         addAction("Cancelar solicitud",async button=>{
           button.disabled=true;const result=await supabase.from("friendships").delete().eq("requester_id",currentUser.id).eq("addressee_id",profile.id).select("id").maybeSingle();
           if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo cancelar la solicitud.");return}
           toast("Solicitud cancelada.");await refreshRelations();
         },"danger");
       }else if(relation?.status==="pending"&&relation.addressee_id===currentUser.id){
         addAction("Aceptar",async button=>{
           button.disabled=true;const result=await supabase.from("friendships").update({status:"accepted",updated_at:new Date().toISOString()}).eq("requester_id",profile.id).eq("addressee_id",currentUser.id).eq("status","pending").select("id").maybeSingle();
           if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"La solicitud ya no está disponible.");return}
           toast("¡Ahora son amigos!");await refreshRelations();
         },"primary");
         addAction("Rechazar",async button=>{
           button.disabled=true;const result=await supabase.from("friendships").update({status:"rejected",updated_at:new Date().toISOString()}).eq("requester_id",profile.id).eq("addressee_id",currentUser.id).eq("status","pending").select("id").maybeSingle();
           if(result.error||!result.data){button.disabled=false;toast(communityError(result.error)||"No se pudo rechazar la solicitud.");return}
           toast("Solicitud rechazada.");await refreshRelations();
         },"danger");
       }else if(relation?.status){
         const state=document.createElement("small");state.textContent=relation.status==="rejected"?"Solicitud rechazada":"Jugador bloqueado";actions.append(state);
       }else{
         addAction("＋ Añadir amigo",async button=>{
           button.disabled=true;button.textContent="Enviando…";const {error}=await supabase.from("friendships").insert({requester_id:currentUser.id,addressee_id:profile.id,status:"pending"});
           if(error){button.disabled=false;button.textContent="＋ Añadir amigo";toast(communityError(error))}
           else{toast("Solicitud enviada.");await refreshRelations()}
         },"primary");
       }
       row.append(actions);host.append(row);
     });
   };
   if(input)input.oninput=render;
   render();
 }
 $("#community-friend-refresh").addEventListener("click",loadCommunityDirectory);


 async function getOrCreateDirectConversation(friendId,friendName){
   const found=await supabase.from("conversations").select("id,created_at").or("and(created_by.eq."+currentUser.id+",direct_user_id.eq."+friendId+"),and(created_by.eq."+friendId+",direct_user_id.eq."+currentUser.id+")").order("created_at",{ascending:false}).limit(1);
   if(found.error)throw found.error;let conversationId=found.data?.[0]?.id;
   if(!conversationId){
     const created=await supabase.from("conversations").insert({created_by:currentUser.id,direct_user_id:friendId,title:friendName}).select("id").single();
     if(created.error)throw created.error;conversationId=created.data.id;
     const members=await supabase.from("conversation_members").insert([{conversation_id:conversationId,user_id:currentUser.id},{conversation_id:conversationId,user_id:friendId}]);
     if(members.error)throw members.error;
   }
   return conversationId;
 }
 async function startDirectChat(friendId,friendName){
   try{
     const conversationId=await getOrCreateDirectConversation(friendId,friendName);
     activeConversationId=conversationId;communityTab="messages";
     $$("[data-community-tab]").forEach(b=>b.classList.toggle("active",b.dataset.communityTab==="messages"));
     ["feed","friends","messages","groups","reviews","favorites","profile","rewards","admin"].forEach(tab=>$("#community-"+tab+"-panel").hidden=tab!=="messages");
     await loadCommunityChats();await openCommunityChat(conversationId,friendName);return conversationId;
   }catch(error){toast(communityError(error));return null}
 }
 async function loadCommunityFavoriteFriends(){
   const host=$("#community-favorites-friends");if(!host||!currentUser||!supabase)return;
   host.innerHTML='<p class="community-loading">Buscando tus amigos…</p>';
   const relations=await supabase.from("friendships").select("requester_id,addressee_id,status").or("requester_id.eq."+currentUser.id+",addressee_id.eq."+currentUser.id).eq("status","accepted");
   if(relations.error){host.textContent=communityError(relations.error);return}
   const ids=[...new Set((relations.data||[]).map(row=>row.requester_id===currentUser.id?row.addressee_id:row.requester_id))];
   if(!ids.length){host.innerHTML='<p class="community-empty">Todavía no tienes amigos añadidos. Cuando aceptes una solicitud, podrás compartir tu lista aquí.</p>';return}
   const profiles=await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",ids);
   if(profiles.error){host.textContent=communityError(profiles.error);return}
   host.innerHTML="";
   (profiles.data||[]).forEach(profile=>{
     const row=document.createElement("div");row.className="favorite-friend-row";
     const name=document.createElement("span");name.textContent=profile.display_name||profile.username||"Jugador JOA";
     const send=document.createElement("button");send.type="button";send.className="primary";send.textContent="Enviar lista";send.disabled=!catalogFavorites.length;
     send.addEventListener("click",()=>shareFavoritesWithFriend(profile.id,profile.display_name||profile.username||"Amigo",send));
     row.append(name,send);host.append(row);
   });
 }
 async function shareFavoritesWithFriend(friendId,friendName,button){
   if(!catalogFavorites.length){toast("Añade primero algún elemento a tus favoritos.");return}
   if(button)button.disabled=true;
   try{
     const conversationId=await getOrCreateDirectConversation(friendId,friendName);
     const body=buildFavoritesShareText(catalogFavorites,communityProfile?.display_name||communityProfile?.username||"Jugador JOA");
     const sent=await supabase.from("messages").insert({conversation_id:conversationId,sender_id:currentUser.id,body}).select("id,conversation_id,sender_id,body,created_at").single();
     if(sent.error)throw sent.error;
     toast("Tu lista se envió a "+friendName+".");
     communityTab="messages";$$("[data-community-tab]").forEach(b=>b.classList.toggle("active",b.dataset.communityTab==="messages"));
     ["feed","friends","messages","groups","reviews","favorites","profile","rewards","admin"].forEach(tab=>$("#community-"+tab+"-panel").hidden=tab!=="messages");
     await loadCommunityChats();await openCommunityChat(conversationId,friendName);
   }catch(error){toast(communityError(error))}
   finally{if(button)button.disabled=false}
 }
 function ensureCommunityChatListRealtime(){
   if(communityChatListChannel||!supabase||!currentUser)return;
   communityChatListChannel=supabase.channel("joa-chat-list-"+currentUser.id)
     .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},()=>loadCommunityChats())
     .subscribe();
 }
 function showCommunityGeneral(){
   activeConversationId=null;activeConversationIds=[];
   $("#community-chat-title").textContent="General · Último mensaje de cada chat";
   $("#community-chat-form").hidden=true;
   $$(".community-chat-entry").forEach(row=>row.classList.toggle("active",row.dataset.general==="true"));
   loadCommunityChats();
 }
 async function renderCommunityGeneral(ids,conversations,profileMap,messages){
   const host=$("#community-chat-messages");if(!host)return;
   host.innerHTML="";
   const peerByConversation=new Map();
   conversations.forEach(c=>peerByConversation.set(c.id,c.created_by===currentUser.id?c.direct_user_id:c.created_by));
   const rows=(messages||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
   if(!rows.length){host.innerHTML='<p class="community-empty">Todavía no hay mensajes. Cuando alguien te escriba, aparecerá aquí.</p>';return}
   rows.forEach(message=>{
     const peerId=peerByConversation.get(message.conversation_id),peer=profileMap.get(peerId)||{};
     const peerName=peer.display_name||peer.username||"Jugador JOA";
     const mine=message.sender_id===currentUser.id;
     const card=document.createElement("article");card.className="community-general-message";
     const head=document.createElement("div");head.className="community-general-head";
     const name=document.createElement("strong");name.textContent=mine?"Tú → "+peerName:peerName+" → tú";
     const time=document.createElement("small");time.textContent=new Date(message.created_at).toLocaleString("es",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
     const body=document.createElement("p");body.textContent=message.body;
     const reply=document.createElement("button");reply.type="button";reply.textContent="Abrir chat";reply.addEventListener("click",()=>{
       const group=conversations.filter(c=>(c.created_by===currentUser.id?c.direct_user_id:c.created_by)===peerId);
       const primary=group.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
       openCommunityChat(primary.id,peerName,group.map(x=>x.id));
     });
     head.append(name,time);card.append(head,body,reply);host.append(card);
   });
   host.scrollTop=host.scrollHeight;
 }
 async function loadCommunityChats(){
   const host=$("#community-chat-list");if(!host||!currentUser||!supabase)return;
   const memberships=await supabase.from("conversation_members").select("conversation_id").eq("user_id",currentUser.id);
   if(memberships.error){host.textContent=communityError(memberships.error);return}
   const membershipIds=(memberships.data||[]).map(x=>x.conversation_id);
   if(!membershipIds.length){host.textContent="Todavía no tienes chats privados. Añade a un amigo para comenzar.";return}
   const conv=await supabase.from("conversations").select("id,title,created_by,direct_user_id,group_id,created_at").in("id",membershipIds).order("created_at",{ascending:false});
   if(conv.error){host.textContent=communityError(conv.error);return}
   const conversations=(conv.data||[]).filter(item=>!item.group_id);
   const ids=conversations.map(item=>item.id);
   if(!ids.length){host.innerHTML='<p class="community-empty">Tus chats grupales están dentro de cada grupo. Añade amigos para iniciar conversaciones privadas.</p>';return}
   const peerIds=[...new Set(conversations.map(x=>x.created_by===currentUser.id?x.direct_user_id:x.created_by).filter(Boolean))];
   const [profiles,messageResults]=await Promise.all([
     peerIds.length?supabase.from("profiles").select("id,display_name,username").in("id",peerIds):Promise.resolve({data:[]}),
     Promise.all(conversations.map(item=>supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",item.id).order("created_at",{ascending:false}).limit(1)))
   ]);
   if(profiles.error){host.textContent=communityError(profiles.error);return}
   const messageError=messageResults.find(result=>result.error)?.error;
   if(messageError){host.textContent=communityError(messageError);return}
   const latestMessages=messageResults.flatMap(result=>result.data||[]);
   const profileMap=new Map((profiles.data||[]).map(p=>[p.id,p]));
   const lastByConversation=new Map(latestMessages.map(message=>[message.conversation_id,message]));
   // Si quedaron chats duplicados de las primeras pruebas, se agrupan por amigo y se conserva como principal el más reciente.
   const groups=new Map();
   conversations.forEach(item=>{
     const peerId=item.created_by===currentUser.id?item.direct_user_id:item.created_by;
     if(!peerId)return;
     if(!groups.has(peerId))groups.set(peerId,[]);
     groups.get(peerId).push(item);
   });
   const rows=[...groups.entries()].map(([peerId,items])=>{
     items.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
     const primary=items[0],peer=profileMap.get(peerId)||{},allIds=items.map(x=>x.id);
     const latest=allIds.map(id=>lastByConversation.get(id)).filter(Boolean).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
     return {peerId,primary,peer,allIds,latest};
   }).sort((a,b)=>new Date(b.latest?.created_at||b.primary.created_at)-new Date(a.latest?.created_at||a.primary.created_at));
   host.innerHTML="";
   const general=document.createElement("button");general.type="button";general.className="community-chat-entry community-chat-general";general.dataset.general="true";
   const generalTitle=document.createElement("strong");generalTitle.textContent="▤ General";
   const generalPreview=document.createElement("span");generalPreview.className="community-chat-preview";generalPreview.textContent="Último mensaje de cada conversación";
   general.append(generalTitle,generalPreview);general.addEventListener("click",showCommunityGeneral);host.append(general);
   rows.forEach(item=>{
     const name=item.peer.display_name||item.peer.username||"Jugador JOA";
     const row=document.createElement("button");row.type="button";row.className="community-chat-entry";row.dataset.general="false";row.classList.toggle("active",item.primary.id===activeConversationId);
     const title=document.createElement("strong");title.textContent=name;
     const preview=document.createElement("span");preview.className="community-chat-preview";
     preview.textContent=item.latest?(item.latest.sender_id===currentUser.id?"Tú: ":"")+item.latest.body:"Empieza la conversación";
     const time=document.createElement("small");time.className="community-chat-time";time.textContent=item.latest?new Date(item.latest.created_at).toLocaleString("es",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"}):"Nuevo chat";
     row.append(title,preview,time);
     row.addEventListener("click",()=>openCommunityChat(item.primary.id,name,item.allIds));host.append(row);
   });
   if(!activeConversationId)await renderCommunityGeneral(ids,conversations,profileMap,latestMessages);
 }
 function appendCommunityMessage(message){
   const host=$("#community-chat-messages");if(!host||!message||host.querySelector('[data-message-id="'+message.id+'"]'))return;
   const empty=host.querySelector(".community-empty");if(empty)empty.remove();
   const bubble=document.createElement("div");bubble.className="community-message"+(message.sender_id===currentUser.id?" mine":"");bubble.dataset.messageId=message.id;
   const body=document.createElement("p");body.textContent=message.body;
   const time=document.createElement("small");time.textContent=new Date(message.created_at).toLocaleString("es",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"});
   bubble.append(body,time);host.append(bubble);host.scrollTop=host.scrollHeight;
 }
 async function openCommunityChat(conversationId,title,relatedIds){
   activeConversationId=conversationId;activeConversationIds=relatedIds?.length?relatedIds:[conversationId];
   $("#community-chat-form").hidden=false;
   $("#community-chat-title").textContent=title||"Chat JOA";
   const host=$("#community-chat-messages");host.innerHTML='<p class="community-loading">Cargando mensajes…</p>';
   const {data,error}=await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id",activeConversationIds).order("created_at",{ascending:false}).limit(300);
   if(error){host.textContent=communityError(error);return}
   host.innerHTML="";
   if(!data?.length)host.innerHTML='<p class="community-empty">Saluda y empieza la conversación.</p>';
   data?.slice().reverse().forEach(appendCommunityMessage);
   host.scrollTop=host.scrollHeight;
   if(activeChatChannel)supabase.removeChannel(activeChatChannel);
   let channel=supabase.channel("joa-chat-"+conversationId);
   activeConversationIds.forEach(id=>{
     channel=channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+id},payload=>{
       if(activeConversationIds.includes(payload.new.conversation_id))appendCommunityMessage(payload.new);
       loadCommunityChats();
     });
   });
   activeChatChannel=channel.subscribe();
   ensureCommunityChatListRealtime();
 }
 $("#community-chat-form").addEventListener("submit",async e=>{
   e.preventDefault();if(!activeConversationId){toast("Selecciona primero un chat.");return}
   const input=$("#community-chat-input"),button=e.submitter||e.currentTarget.querySelector("button"),body=input.value.trim();if(!body)return;
   button.disabled=true;button.textContent="Enviando…";
   try{
     const {data,error}=await supabase.from("messages").insert({conversation_id:activeConversationId,sender_id:currentUser.id,body}).select("id,conversation_id,sender_id,body,created_at").single();
     if(error)throw error;
     appendCommunityMessage(data);input.value="";await loadCommunityChats();input.focus();
   }catch(error){toast(communityError(error))}
   finally{button.disabled=false;button.textContent="Enviar"}
 });
 function reviewItemKey(item){const raw=item.id??item.external_id??item.igdb_id??item.tmdb_id??item.slug??itemTitle(item);return itemType(item)+":"+String(raw).trim().toLocaleLowerCase("es")}
 function showReviewMatches(query){
   const host=$("#community-review-matches");host.innerHTML="";if(!query)return;
   const matches=catalogItems.filter(item=>itemTitle(item).toLocaleLowerCase("es").includes(query)).slice(0,8);
   if(!matches.length){host.textContent="No encontramos ese título en el catálogo cargado.";return}
   matches.forEach(item=>{const b=document.createElement("button");b.type="button";b.className="community-review-match";b.textContent=itemTitle(item)+" · "+itemType(item);b.addEventListener("click",()=>selectReviewItem(item));host.append(b)})
 }
 async function selectReviewItem(item){
   selectedReviewItem=item;const selected=$("#community-review-selected");selected.hidden=false;selected.textContent="Reseñando: "+itemTitle(item);
   $("#community-review-form").hidden=false;$("#community-review-search").value=itemTitle(item);$("#community-review-matches").innerHTML="";
   const key=reviewItemKey(item),host=$("#community-review-feed");host.innerHTML="Cargando reseñas…";
   const {data,error}=await supabase.from("catalog_reviews").select("id,user_id,rating,body,created_at").eq("external_item_id",key).order("created_at",{ascending:false}).limit(30);
   if(error){host.textContent=communityError(error);return}
   const ids=[...new Set((data||[]).map(x=>x.user_id))],pr=ids.length?await supabase.from("profiles").select("id,display_name,username").in("id",ids):{data:[]},map=new Map((pr.data||[]).map(p=>[p.id,p]));
   host.innerHTML="";if(!data?.length){host.textContent="Todavía no hay reseñas. ¡Sé el primero en opinar!";return}
   data.forEach(review=>{const row=document.createElement("article");row.className="community-review-card";const title=document.createElement("b");title.textContent=map.get(review.user_id)?.display_name||map.get(review.user_id)?.username||"Jugador JOA";const stars=document.createElement("span");stars.className="community-review-stars";stars.textContent="★".repeat(review.rating)+"☆".repeat(5-review.rating);const body=document.createElement("p");body.textContent=review.body;row.append(title,stars,body);host.append(row)})
 }
 async function loadCommunityReviews(){
   const host=$("#community-review-feed");if(!host||!supabase)return;
   const {data,error}=await supabase.from("catalog_reviews").select("id,external_item_id,item_title,item_type,user_id,rating,body,created_at").order("created_at",{ascending:false}).limit(20);
   if(error){host.textContent=communityError(error);return}
   const ids=[...new Set((data||[]).map(x=>x.user_id))],pr=ids.length?await supabase.from("profiles").select("id,display_name,username").in("id",ids):{data:[]},map=new Map((pr.data||[]).map(p=>[p.id,p]));
   host.innerHTML="";if(!data?.length){host.textContent="Aún no hay reseñas publicadas. Busca un contenido y deja la primera.";return}
   data.forEach(review=>{const row=document.createElement("article");row.className="community-review-card";const title=document.createElement("b");title.textContent=review.item_title+" · "+(map.get(review.user_id)?.display_name||"Jugador JOA");const stars=document.createElement("span");stars.className="community-review-stars";stars.textContent="★".repeat(review.rating)+"☆".repeat(5-review.rating);const body=document.createElement("p");body.textContent=review.body;row.append(title,stars,body);host.append(row)})
 }
 $("#community-review-search").addEventListener("input",e=>showReviewMatches(e.target.value.trim().toLocaleLowerCase("es")));
 $("#community-review-form").addEventListener("submit",async e=>{
   e.preventDefault();if(!selectedReviewItem)return;const button=e.submitter;button.disabled=true;
   const payload={external_item_id:reviewItemKey(selectedReviewItem),item_title:itemTitle(selectedReviewItem),item_type:itemType(selectedReviewItem),cover_url:resolveCover(itemCover(selectedReviewItem))||null,user_id:currentUser.id,rating:Number($("#community-review-rating").value),body:$("#community-review-body").value.trim(),updated_at:new Date().toISOString()};
   try{const {error}=await supabase.from("catalog_reviews").upsert(payload,{onConflict:"external_item_id,user_id"});if(error)throw error;$("#community-review-body").value="";toast("¡Reseña publicada!");selectReviewItem(selectedReviewItem);loadCommunityReviews()}
   catch(error){toast(communityError(error))}finally{button.disabled=false}
 });
 async function loadCommunityGroups(){
   const host=$("#community-group-list");if(!host||!supabase||!currentUser)return;
   host.innerHTML='<p class="community-loading">Explorando grupos…</p>';
   const [publicResult,myMemberships]=await Promise.all([
     supabase.from("community_groups").select("id,name,slug,description,created_by,is_public,category,platform,tags,rules,created_at,updated_at").eq("is_public",true).order("created_at",{ascending:false}).limit(100),
     supabase.from("group_members").select("group_id,user_id,role").eq("user_id",currentUser.id)
   ]);
   if(publicResult.error){host.textContent=communityError(publicResult.error);return}
   if(myMemberships.error){host.textContent=communityError(myMemberships.error);return}
   const mine=myMemberships.data||[],privateIds=mine.map(x=>x.group_id);
   let privateGroups=[];
   if(privateIds.length){
     const r=await supabase.from("community_groups").select("id,name,slug,description,created_by,is_public,category,platform,tags,rules,created_at,updated_at").in("id",privateIds);
     if(r.error){host.textContent=communityError(r.error);return}privateGroups=r.data||[];
   }
   const map=new Map();[...(publicResult.data||[]),...privateGroups].forEach(g=>map.set(g.id,g));
   communityGroupsCache=[...map.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
   const ids=communityGroupsCache.map(g=>g.id);
   const [roster,owners]=await Promise.all([
     ids.length?supabase.from("group_members").select("group_id,user_id,role").in("group_id",ids):Promise.resolve({data:[]}),
     [...new Set(communityGroupsCache.map(g=>g.created_by))].length?supabase.from("profiles").select("id,display_name,username").in("id",[...new Set(communityGroupsCache.map(g=>g.created_by))]):Promise.resolve({data:[]})
   ]);
   if(roster.error){host.textContent=communityError(roster.error);return}
   if(owners.error){host.textContent=communityError(owners.error);return}
   const countMap=new Map(),myMap=new Map(mine.map(m=>[m.group_id,m]));
   (roster.data||[]).forEach(m=>countMap.set(m.group_id,(countMap.get(m.group_id)||0)+1));
   const ownerMap=new Map((owners.data||[]).map(p=>[p.id,p]));
   host.innerHTML="";
   const heading=document.createElement("div");heading.className="community-group-discovery-head";
   const info=document.createElement("p");info.textContent=communityGroupsCache.length+" grupos disponibles · "+mine.length+" en los que participas";
   const refresh=document.createElement("button");refresh.type="button";refresh.textContent="↻ Actualizar";refresh.addEventListener("click",loadCommunityGroups);heading.append(info,refresh);host.append(heading);
   if(!communityGroupsCache.length){const empty=document.createElement("p");empty.className="community-empty";empty.textContent="Todavía no hay grupos. ¡Crea el primero!";host.append(empty)}
   communityGroupsCache.forEach(group=>{
     const card=document.createElement("article");card.className="community-group-card";
     const top=document.createElement("div");top.className="community-group-card-top";
     const title=document.createElement("h4");title.textContent=group.name;
     const privacy=document.createElement("span");privacy.className="community-group-privacy";privacy.textContent=group.is_public?"PÚBLICO":"PRIVADO";
     top.append(title,privacy);
     const desc=document.createElement("p");desc.textContent=group.description||"Un espacio para jugadores JOA.";
     const meta=document.createElement("div");meta.className="community-group-meta";
     const creator=ownerMap.get(group.created_by)||{};const owner=document.createElement("span");owner.textContent="Creado por "+(creator.display_name||creator.username||"Jugador JOA");
     const count=document.createElement("span");count.textContent=(countMap.get(group.id)||0)+" miembros";
     const category=document.createElement("span");category.textContent=(group.category||"General")+" · "+(group.platform||"Todas");
     meta.append(owner,count,category);
     const tags=document.createElement("small");tags.className="community-group-tags";tags.textContent=group.tags||"";
     const actions=document.createElement("div");actions.className="community-group-actions";
     const detail=document.createElement("button");detail.type="button";detail.textContent="Ver grupo";detail.addEventListener("click",()=>openCommunityGroup(group.id));
     actions.append(detail);
     const membership=myMap.get(group.id);
     if(!membership&&group.is_public){const join=document.createElement("button");join.type="button";join.className="primary";join.textContent="Unirme";join.addEventListener("click",()=>joinCommunityGroup(group));actions.append(join)}
     else if(membership){const state=document.createElement("span");state.className="community-group-member-state";state.textContent=membership.role==="owner"?"★ Creador":membership.role==="moderator"?"Moderador":"Miembro";actions.append(state)}
     card.append(top,desc,meta);if(tags.textContent)card.append(tags);card.append(actions);host.append(card);
   });
   if(activeCommunityGroupId&&!communityGroupsCache.some(g=>g.id===activeCommunityGroupId))activeCommunityGroupId=null;
   if(activeCommunityGroupId)openCommunityGroup(activeCommunityGroupId,false);
 }
 async function joinCommunityGroup(group){
   const {error}=await supabase.from("group_members").insert({group_id:group.id,user_id:currentUser.id,role:"member"});
   if(error){toast(communityError(error));return}toast("¡Ya formas parte de "+group.name+"!");await loadCommunityGroups();await openCommunityGroup(group.id);
 }
 async function openCommunityGroup(groupId,scroll=true){
   const group=communityGroupsCache.find(g=>g.id===groupId);if(!group)return;
   if(activeGroupChatChannel&&activeGroupChatId!==groupId){supabase.removeChannel(activeGroupChatChannel);activeGroupChatChannel=null;activeGroupChatId=null}
   activeCommunityGroupId=groupId;
   const panel=$("#community-group-detail");panel.hidden=false;panel.innerHTML='<p class="community-loading">Cargando información del grupo…</p>';
   const [members,profiles,friends]=await Promise.all([
     supabase.from("group_members").select("user_id,role,joined_at").eq("group_id",groupId).order("joined_at",{ascending:true}),
     supabase.from("profiles").select("id,display_name,username,avatar_url").limit(200),
     supabase.from("friendships").select("requester_id,addressee_id").eq("status","accepted").or("requester_id.eq."+currentUser.id+",addressee_id.eq."+currentUser.id)
   ]);
   if(members.error||profiles.error||friends.error){panel.textContent=communityError(members.error||profiles.error||friends.error);return}
   const profileMap=new Map((profiles.data||[]).map(p=>[p.id,p]));
   const mine=(members.data||[]).find(m=>m.user_id===currentUser.id),manager=mine&&["owner","moderator"].includes(mine.role),owner=group.created_by===currentUser.id;
   const memberIds=new Set((members.data||[]).map(m=>m.user_id));
   const wrap=document.createElement("div");wrap.className="community-group-detail-card";
   const head=document.createElement("div");head.className="community-group-detail-head";
   const title=document.createElement("h3");title.textContent=group.name;
   const close=document.createElement("button");close.type="button";close.textContent="Cerrar";close.addEventListener("click",()=>{panel.hidden=true;activeCommunityGroupId=null;if(activeGroupChatChannel&&supabase){supabase.removeChannel(activeGroupChatChannel);activeGroupChatChannel=null;activeGroupChatId=null}});
   head.append(title,close);
   const about=document.createElement("p");about.textContent=group.description||"Sin descripción.";
   const facts=document.createElement("div");facts.className="community-group-meta";
   [group.category||"General",group.platform||"Todas las plataformas",group.is_public?"Grupo público":"Grupo privado","Creado "+new Date(group.created_at).toLocaleDateString("es")].forEach(v=>{const x=document.createElement("span");x.textContent=v;facts.append(x)});
   const rules=document.createElement("p");rules.className="community-group-rules";rules.textContent=group.rules?"Reglas: "+group.rules:"Este grupo todavía no tiene reglas publicadas.";
   wrap.append(head,about,facts,rules);
   const actions=document.createElement("div");actions.className="community-group-actions";
   if(!mine&&group.is_public){const join=document.createElement("button");join.className="primary";join.textContent="Unirme al grupo";join.addEventListener("click",()=>joinCommunityGroup(group));actions.append(join)}
   if(mine&&mine.role!=="owner"){const leave=document.createElement("button");leave.className="danger";leave.textContent="Salir del grupo";leave.addEventListener("click",async()=>{if(!confirm("¿Quieres salir de este grupo?"))return;const r=await supabase.from("group_members").delete().eq("group_id",groupId).eq("user_id",currentUser.id);if(r.error)toast(communityError(r.error));else{toast("Has salido del grupo.");panel.hidden=true;activeCommunityGroupId=null;loadCommunityGroups()}});actions.append(leave)}
   if(owner){const edit=document.createElement("button");edit.textContent="Editar grupo";edit.addEventListener("click",()=>showCommunityGroupEditor(group));actions.append(edit)}
   if(manager){const invite=document.createElement("button");invite.textContent="Invitar amigos";invite.addEventListener("click",()=>showCommunityGroupInviter(group,friends.data||[],memberIds,profileMap));actions.append(invite)}
   wrap.append(actions);
   const rosterTitle=document.createElement("h4");rosterTitle.textContent="Miembros · "+(members.data||[]).length;wrap.append(rosterTitle);
   const roster=document.createElement("div");roster.className="community-group-roster";
   (members.data||[]).forEach(m=>{
     const p=profileMap.get(m.user_id)||{},row=document.createElement("div");row.className="community-group-member";
     const name=document.createElement("span");name.textContent=(p.display_name||p.username||"Jugador JOA")+(m.user_id===currentUser.id?" (tú)":"");
     const role=document.createElement("small");role.textContent=m.role==="owner"?"CREADOR":m.role==="moderator"?"MODERADOR":"MIEMBRO";row.append(name,role);
     if(manager&&m.user_id!==currentUser.id&&m.role!=="owner"){const remove=document.createElement("button");remove.type="button";remove.textContent="Expulsar";remove.addEventListener("click",async()=>{if(!confirm("¿Expulsar a este miembro?"))return;const r=await supabase.from("group_members").delete().eq("group_id",groupId).eq("user_id",m.user_id);if(r.error)toast(communityError(r.error));else openCommunityGroup(groupId,false)});row.append(remove)}
     roster.append(row);
   });
   wrap.append(roster);
   if(mine){
   const chatCard=document.createElement("section");chatCard.className="community-group-chat-card";
   const chatHeading=document.createElement("div");chatHeading.className="community-group-chat-heading";
   const chatTitle=document.createElement("h4");chatTitle.textContent="Chat del grupo";
   const chatInfo=document.createElement("p");chatInfo.textContent="Conversa en tiempo real con todos los miembros de este grupo.";
   chatHeading.append(chatTitle,chatInfo);
   const chatLaunch=document.createElement("button");chatLaunch.type="button";chatLaunch.className="community-group-chat-launch";chatLaunch.id="community-group-chat-open";chatLaunch.textContent="Abrir chat grupal ↗";
   const chatRoom=document.createElement("div");chatRoom.className="community-group-chat-room";chatRoom.hidden=true;
   const chatMessages=document.createElement("div");chatMessages.className="community-group-chat-messages";
   const chatForm=document.createElement("form");chatForm.className="community-group-chat-form";
   const chatInput=document.createElement("input");chatInput.type="text";chatInput.maxLength=5000;chatInput.placeholder="Escribe al grupo…";chatInput.required=true;
   const chatSend=document.createElement("button");chatSend.type="submit";chatSend.textContent="Enviar";
   const chatClose=document.createElement("button");chatClose.type="button";chatClose.className="community-group-chat-close";chatClose.textContent="Cerrar chat";
   chatForm.append(chatInput,chatSend);chatRoom.append(chatMessages,chatForm,chatClose);
   chatLaunch.addEventListener("click",()=>{chatRoom.hidden=false;chatLaunch.hidden=true;openCommunityGroupChat(groupId,group.name,chatMessages,chatForm)});
   chatClose.addEventListener("click",()=>{chatRoom.hidden=true;chatLaunch.hidden=false;if(activeGroupChatChannel&&supabase){supabase.removeChannel(activeGroupChatChannel);activeGroupChatChannel=null;activeGroupChatId=null}});
   chatCard.append(chatHeading,chatLaunch,chatRoom);wrap.append(chatCard);
   }
   if(owner){
     const modTitle=document.createElement("h4");modTitle.textContent="Administración";wrap.append(modTitle);
     const candidates=(members.data||[]).filter(m=>m.role==="member");
     candidates.forEach(m=>{const p=profileMap.get(m.user_id)||{},row=document.createElement("div");row.className="community-group-member";const label=document.createElement("span");label.textContent=p.display_name||p.username||"Jugador";const promote=document.createElement("button");promote.type="button";promote.textContent="Hacer moderador";promote.addEventListener("click",async()=>{const del=await supabase.from("group_members").delete().eq("group_id",groupId).eq("user_id",m.user_id);if(del.error){toast(communityError(del.error));return}const ins=await supabase.from("group_members").insert({group_id:groupId,user_id:m.user_id,role:"moderator"});if(ins.error){const rollback=await supabase.from("group_members").insert({group_id:groupId,user_id:m.user_id,role:"member"});toast(rollback.error?"No se pudo promover al miembro ni restaurar su rol. Contacta con soporte.":"No se pudo promover al miembro; se restauró su rol anterior. "+communityError(ins.error));if(!rollback.error)openCommunityGroup(groupId,false)}else openCommunityGroup(groupId,false)});row.append(label,promote);wrap.append(row)});
   }
   panel.innerHTML="";panel.append(wrap);
   if(scroll)panel.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 async function openCommunityGroupChat(groupId,groupName,host,form){
   if(!currentUser||!supabase)return;
   if(activeGroupChatChannel&&activeGroupChatId!==groupId){supabase.removeChannel(activeGroupChatChannel);activeGroupChatChannel=null}
   const conversation=await supabase.from("conversations").select("id").eq("group_id",groupId).maybeSingle();
   if(conversation.error||!conversation.data){host.textContent=conversation.error?communityError(conversation.error):"El chat de este grupo todavía no está disponible.";return}
   const conversationId=conversation.data.id;activeGroupChatId=groupId;
   host.innerHTML='<p class="community-loading">Cargando mensajes del grupo…</p>';
   const result=await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(300);
   if(result.error){host.textContent=communityError(result.error);return}
   const senderIds=[...new Set((result.data||[]).map(m=>m.sender_id))];
   const profiles=senderIds.length?await supabase.from("profiles").select("id,display_name,username").in("id",senderIds):{data:[]};
   if(profiles.error){host.textContent=communityError(profiles.error);return}
   const profileMap=new Map((profiles.data||[]).map(p=>[p.id,p]));
   const renderMessage=(message,profile)=>{
     if(host.querySelector('[data-group-message-id="'+message.id+'"]'))return;
     const empty=host.querySelector(".community-empty");if(empty)empty.remove();
     const row=document.createElement("article");row.className="community-group-message";row.dataset.groupMessageId=message.id;
     const head=document.createElement("div");head.className="community-group-message-head";
     const author=document.createElement("strong");author.textContent=message.sender_id===currentUser.id?"Tú":(profile?.display_name||profile?.username||"Jugador JOA");
     const time=document.createElement("small");time.textContent=new Date(message.created_at).toLocaleString("es",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
     const body=document.createElement("p");body.textContent=message.body;head.append(author,time);row.append(head,body);host.append(row);host.scrollTop=host.scrollHeight;
   };
   host.innerHTML="";
   if(!result.data?.length){const empty=document.createElement("p");empty.className="community-empty";empty.textContent="Todavía no hay mensajes. ¡Saluda al grupo!";host.append(empty)}
   (result.data||[]).forEach(m=>renderMessage(m,profileMap.get(m.sender_id)));
   if(activeGroupChatChannel)supabase.removeChannel(activeGroupChatChannel);
   activeGroupChatChannel=supabase.channel("joa-group-chat-"+conversationId)
     .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+conversationId},async payload=>{
       const m=payload.new;let profile=profileMap.get(m.sender_id);
       if(!profile){const p=await supabase.from("profiles").select("id,display_name,username").eq("id",m.sender_id).maybeSingle();profile=p.data||{};profileMap.set(m.sender_id,profile)}
       renderMessage(m,profile);
     }).subscribe();
   form.onsubmit=async event=>{
     event.preventDefault();const input=form.querySelector("input"),button=form.querySelector('button[type="submit"]'),body=input.value.trim();if(!body)return;
     button.disabled=true;button.textContent="Enviando…";
     try{
       const sent=await supabase.from("messages").insert({conversation_id:conversationId,sender_id:currentUser.id,body}).select("id,conversation_id,sender_id,body,created_at").single();
       if(sent.error)throw sent.error;
       renderMessage(sent.data,communityProfile||{display_name:"Tú"});input.value="";input.focus();
     }catch(error){toast(communityError(error))}
     finally{button.disabled=false;button.textContent="Enviar"}
   };
   const title=$("#community-group-detail h3");if(title)title.setAttribute("aria-label","Chat grupal: "+groupName);
 }
 function showCommunityGroupEditor(group){
   const panel=$("#community-group-detail"),form=document.createElement("form");form.className="community-group-editor";
   const fields=[["Nombre","name",group.name,70],["Descripción","description",group.description||"",240],["Categoría","category",group.category||"General",50],["Plataforma","platform",group.platform||"Todas",70],["Etiquetas (separadas por comas)","tags",group.tags||"",180],["Reglas del grupo","rules",group.rules||"",800]];
   const inputs={};
   fields.forEach(([label,key,value,max])=>{const l=document.createElement("label");l.textContent=label;const input=key==="description"||key==="rules"?document.createElement("textarea"):document.createElement("input");input.value=value;input.maxLength=max;input.required=key==="name";l.append(input);form.append(l);inputs[key]=input});
   const privacy=document.createElement("label"),select=document.createElement("select");privacy.textContent="Visibilidad";select.innerHTML='<option value="true">Público · cualquiera puede encontrarlo y unirse</option><option value="false">Privado · solo por invitación</option>';select.value=String(group.is_public);privacy.append(select);form.append(privacy);
   const actions=document.createElement("div");actions.className="community-group-actions";const save=document.createElement("button");save.type="submit";save.className="primary";save.textContent="Guardar cambios";const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";cancel.addEventListener("click",()=>openCommunityGroup(group.id,false));actions.append(save,cancel);form.append(actions);
   form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;const payload={name:inputs.name.value.trim(),description:inputs.description.value.trim(),category:inputs.category.value.trim()||"General",platform:inputs.platform.value.trim()||"Todas",tags:inputs.tags.value.trim(),rules:inputs.rules.value.trim(),is_public:select.value==="true",updated_at:new Date().toISOString()};const r=await supabase.from("community_groups").update(payload).eq("id",group.id);save.disabled=false;if(r.error){toast(communityError(r.error));return}toast("Grupo actualizado.");await loadCommunityGroups();openCommunityGroup(group.id,false)});
   panel.innerHTML="";panel.append(form);form.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function showCommunityGroupInviter(group,friendRows,memberIds,profileMap){
   const panel=$("#community-group-detail"),box=document.createElement("div");box.className="community-group-inviter";
   const title=document.createElement("h4");title.textContent="Invitar amigos al grupo";const select=document.createElement("select");select.innerHTML='<option value="">Selecciona un amigo…</option>';
   const friendIds=[...new Set(friendRows.map(f=>f.requester_id===currentUser.id?f.addressee_id:f.requester_id))].filter(id=>id&&!memberIds.has(id));
   friendIds.forEach(id=>{const p=profileMap.get(id);if(!p)return;const option=document.createElement("option");option.value=id;option.textContent=p.display_name||p.username||"Jugador JOA";select.append(option)});
   const invite=document.createElement("button");invite.type="button";invite.className="primary";invite.textContent="Enviar invitación";invite.disabled=!friendIds.length;invite.addEventListener("click",async()=>{if(!select.value){toast("Selecciona un amigo.");return}invite.disabled=true;const r=await supabase.from("group_members").insert({group_id:group.id,user_id:select.value,role:"member"});invite.disabled=false;if(r.error)toast(communityError(r.error));else{toast("Jugador añadido al grupo.");openCommunityGroup(group.id,false);loadCommunityGroups()}});
   const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";cancel.addEventListener("click",()=>openCommunityGroup(group.id,false));box.append(title,select,invite,cancel);
   if(!friendIds.length){const note=document.createElement("p");note.textContent="Todos tus amigos ya están en el grupo o todavía no tienes amigos añadidos.";box.append(note)}
   panel.innerHTML="";panel.append(box);box.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 $("#community-group-form").addEventListener("submit",async e=>{
   e.preventDefault();const form=e.currentTarget,button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
   try{
     const name=$("#community-group-name").value.trim(),slug=name.toLocaleLowerCase("es").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,6);
     const payload={name,slug,description:$("#community-group-description").value.trim(),category:$("#community-group-category").value.trim()||"General",platform:$("#community-group-platform").value.trim()||"Todas",tags:$("#community-group-tags").value.trim(),rules:$("#community-group-rules").value.trim(),is_public:$("#community-group-visibility").value==="true",created_by:currentUser.id};
     const created=await supabase.from("community_groups").insert(payload).select("id").single();if(created.error)throw created.error;
     const member=await supabase.from("group_members").insert({group_id:created.data.id,user_id:currentUser.id,role:"owner"});if(member.error)throw member.error;
     form.reset();toast("Grupo creado. Ya apareces como su creador.");await loadCommunityGroups();openCommunityGroup(created.data.id);
   }catch(error){toast(communityError(error))}finally{button.disabled=false}
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
   e.preventDefault();
   const submit=$("#auth-submit");
   const email=$("#auth-email").value.trim(),password=$("#auth-password").value;
   if(!email||!password){$("#auth-message").textContent="Escribe tu correo y contraseña para continuar.";toast("Escribe tu correo y contraseña.");return}
   if(!$("#auth-email").checkValidity()){ $("#auth-email").reportValidity(); return; }
   if(password.length<6){$("#auth-message").textContent="La contraseña debe tener al menos 6 caracteres.";toast("La contraseña debe tener al menos 6 caracteres.");return}
   submit.disabled=true;submit.textContent="Conectando…";
   try{
     let ready=await authReadyPromise;
     if(!ready||!supabase){authInitError=null;ready=await initSupabase()}
     if(!ready||!supabase)throw authInitError||new Error("El servicio de acceso no está listo. Recarga la página e inténtalo otra vez.");
     submit.textContent="Procesando…";
     let result;
     if(authMode==="signup"){
       console.info("JOA Auth: enviando solicitud de registro por correo",{emailDomain:email.split("@")[1]||""});
       result=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.JOA_CONFIG.authRedirectUrl}});
       console.info("JOA Auth: respuesta de registro",{hasUser:!!result.data?.user,hasSession:!!result.data?.session,identityCount:result.data?.user?.identities?.length??null,hasError:!!result.error});
       if(result.error)throw result.error;
       const createdUser=result.data?.user||null,createdSession=result.data?.session||null;
       if(createdUser&&Array.isArray(createdUser.identities)&&createdUser.identities.length===0){
         $("#auth-message").textContent="Ese correo ya está asociado a una cuenta. Inicia sesión o continúa con el proveedor con el que te registraste.";
         toast("Ese correo ya tiene una cuenta. Inicia sesión.");
       }else if(!createdUser){
         throw new Error("Supabase no confirmó la creación de la cuenta. Comprueba el correo o intenta iniciar sesión.");
       }else if(createdSession){
         updateHeader(createdUser,createdSession);dialog.close();toast("¡Cuenta creada y sesión iniciada!");
       }else{
         $("#auth-message").textContent="Solicitud de registro recibida. Revisa la bandeja de entrada y el spam; confirma el correo para activar tu cuenta.";
         toast("Registro enviado. Revisa tu correo para confirmar la cuenta.");
       }
     }else{
       result=await supabase.auth.signInWithPassword({email,password});
       if(result.error)throw result.error;
       updateHeader(result.data.user,result.data.session);dialog.close();toast("¡Bienvenido de nuevo a JOA!");
     }
   }catch(error){
     console.error("JOA email auth:",error);
     $("#auth-message").textContent=authError(error);toast(authError(error));
   }finally{
     submit.disabled=false;renderAuthMode();
   }
 });
 $("#auth-forgot").addEventListener("click",async()=>{
   const email=$("#auth-email").value.trim();if(!email){toast("Escribe primero tu correo electrónico.");return}
   try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.JOA_CONFIG.authRedirectUrl});if(error)throw error;toast("Si el correo está registrado, recibirás instrucciones para recuperar el acceso.");$("#auth-message").textContent="Revisa tu correo para continuar con la recuperación."}
   catch(error){toast(authError(error))}
 });
 async function oauth(provider,chooseAccount=false){
   const button=$(chooseAccount?"#auth-google-other":"#auth-google");
   if(oauthInProgress)return;
   oauthInProgress=true;
   const originalText=button?.textContent||"Continuar";
   if(button){button.disabled=true;button.textContent="Conectando…"}
   $("#auth-message").textContent="Preparando el acceso seguro…";
   try{
     let ready=await authReadyPromise;
     if(!ready){authInitError=null;ready=await initSupabase();}
     if(!ready||!supabase)throw authInitError||new Error("El servicio de acceso no está listo. Recarga la página e inténtalo otra vez.");
     // Si la recuperación de sesión ya terminó con un usuario, no iniciar otro OAuth encima.
     if(currentUser){
       clearOAuthPending();
       oauthInProgress=false;
       if(button){button.disabled=false;button.textContent=originalText}
       if(dialog?.open)dialog.close();
       toast("Tu sesión ya está iniciada. No necesitas volver a conectar Google.");
       return;
     }
     // Evitar dos flujos PKCE simultáneos, incluso si el navegador duplica el toque
     // o hay otra pestaña de JOA abierta en el mismo dispositivo.
     const pending=readOAuthPending();
     if(pending?.startedAt&&Date.now()-pending.startedAt<90000){
       oauthInProgress=false;
       if(button){button.disabled=false;button.textContent=originalText}
       $("#auth-message").textContent="Ya hay un acceso de Google en curso. Espera a que termine y vuelve a JOA.";
       return;
     }
     clearOAuthPending();
     writeOAuthPending();
     // No liberar el bloqueo por tiempo: en Android Google puede seguir abierto
     // mientras esta pestaña permanece visible, lo que permitiría duplicar el flujo.
     const {data,error}=await supabase.auth.signInWithOAuth({
       provider,
       options:{
         redirectTo:window.JOA_CONFIG.authRedirectUrl,
         skipBrowserRedirect:true,
         ...(chooseAccount?{queryParams:{prompt:"select_account"}}:{})
       }
     });
     if(error)throw error;
     if(!data?.url)throw new Error("Google no devolvió la dirección de acceso.");
     $("#auth-message").textContent="Abriendo Google…";
     window.location.assign(data.url);
   }catch(error){
     clearOAuthPending();
     console.error("JOA OAuth:",error);
     const message=authError(error);
     $("#auth-message").textContent=message;
     toast(message);
     oauthInProgress=false;
     if(button){button.disabled=false;button.textContent=originalText}
   }
 }
 function authError(error){
   const msg=String(error?.message||"");
   if(/invalid login credentials/i.test(msg))return "Correo o contraseña incorrectos.";
   if(/email not confirmed/i.test(msg))return "Confirma tu correo electrónico antes de iniciar sesión.";
   if(/provider is not enabled|unsupported provider/i.test(msg))return "Este proveedor aún no está activado en Supabase.";
   if(/password should be at least/i.test(msg))return "La contraseña debe tener al menos 6 caracteres.";
   if(/user already registered/i.test(msg))return "Ese correo ya tiene una cuenta. Inicia sesión.";
   if(/email rate limit exceeded|over_email_send_rate_limit/i.test(msg))return "Se han enviado demasiados correos en poco tiempo. Espera unos minutos e inténtalo otra vez.";
   if(/signup is disabled/i.test(msg))return "El registro por correo está desactivado en este momento.";
   if(/network|failed to fetch|load failed/i.test(msg))return "No se pudo conectar con Supabase. Comprueba la conexión e inténtalo otra vez.";
   return msg||"No se pudo completar el acceso. Inténtalo de nuevo.";
 }
 function updateHeader(user,session=null){
   currentUser=user||null;currentSession=session||null;
   const btn=$("#login-open");
   if(user){
     const meta=user.user_metadata||{};
     const adminTab=$("#community-admin-tab");if(adminTab)adminTab.hidden=!rewardAdmin();
     const avatarUrl=communityProfile?.id===user.id?communityProfile.avatar_url:(meta.avatar_url||meta.picture);
     const accountLabel=communityProfile?.display_name||meta.full_name||meta.name||user.email||"Mi cuenta";
     const initials=communityInitials(accountLabel);
     btn.innerHTML='<span class="login-user-avatar" aria-hidden="true">'+initials+'</span><span class="login-user-indicator" aria-hidden="true"></span>';
     if(avatarUrl){
       const avatar=btn.querySelector(".login-user-avatar");
       const image=document.createElement("img");
       image.src=avatarUrl;image.alt="";image.referrerPolicy="no-referrer";
       image.addEventListener("error",()=>image.remove(),{once:true});
       avatar.append(image);
     }
     btn.title="Sesión iniciada: "+accountLabel+" · Abrir comunidad";
     btn.setAttribute("aria-label","Sesión iniciada. Abrir cuenta y comunidad");
     btn.classList.add("is-logged-in");
     $("#community-join").textContent="Ir a mi comunidad";$("#community-join").querySelector("b")?.remove();
   }else{
     const adminTab=$("#community-admin-tab");if(adminTab)adminTab.hidden=true;
     btn.classList.remove("is-logged-in");btn.removeAttribute("aria-label");
     btn.innerHTML='Entrar <span>↗</span>';btn.title="Iniciar sesión";
     $("#community-join").textContent="Entrar a la comunidad";closeCommunity();communityProfile=null;
     communityProfilePromise=null;communityProfilePromiseUserId=null;stopNotificationRealtime();
   }
   renderAuthMode();
   if(!user){catalogFavorites=[];catalogFavoritesByKey.clear();renderFavoriteButtons();return}
   loadCatalogFavorites();
   if(communityProfile?.id===user.id){
     startNotificationRealtime();loadNotifications();
     if(communityRequested)openCommunity();
     return;
   }
   if(communityProfilePromiseUserId!==user.id){
     communityProfilePromiseUserId=user.id;
     communityProfilePromise=ensureCommunityProfile(user);
   }
   const userId=user.id;
   Promise.resolve(communityProfilePromise).then(async profile=>{
     if(!profile||currentUser?.id!==userId)return;
     communityProfile=profile;startNotificationRealtime();await loadNotifications();
     if(currentUser?.id===userId&&communityRequested)openCommunity();
   }).catch(error=>{
     if(currentUser?.id!==userId)return;
     console.warn("No se pudo preparar el perfil social",error);
     toast("Tu sesión está activa, pero no se pudo cargar el perfil. Vuelve a abrir la comunidad.");
   });
 }
 function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 async function loadSupabaseSdk(){
   let lastError;
   const moduleSources=[
     "https://esm.sh/@supabase/supabase-js@2.119.0",
     "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm"
   ];
   for(const src of moduleSources){
     try{
       const mod=await Promise.race([
         import(src),
         new Promise((_,reject)=>setTimeout(()=>reject(new Error("Tiempo de espera agotado al cargar "+new URL(src).hostname)),15000))
       ]);
       const createClient=mod.createClient||mod.default?.createClient;
       if(typeof createClient!=="function")throw new Error("El módulo descargado no exporta createClient.");
       window.supabase={...mod,createClient};
       console.info("JOA Auth: SDK cargado como módulo desde",new URL(src).hostname);
       return true;
     }catch(error){lastError=error;console.warn("JOA Auth módulo:",src,error)}
   }
   // Cargar el bundle UMD explícito; la raíz del paquete puede resolver
   // a un archivo CommonJS que el navegador no puede ejecutar como script.
   const scriptSources=[
     "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js",
     "https://unpkg.com/@supabase/supabase-js@2.119.0/dist/umd/supabase.js",
     "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js"
   ];
   for(const src of scriptSources){
     try{
       await new Promise((resolve,reject)=>{
         const script=document.createElement("script");
         let settled=false;
         const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};
         const timer=setTimeout(()=>{script.remove();finish(reject,new Error("Tiempo de espera agotado al cargar "+new URL(src).hostname));},15000);
         script.src=src;script.async=true;
         script.onload=()=>window.supabase?.createClient?finish(resolve,true):finish(reject,new Error("El CDN respondió, pero no expuso supabase.createClient."));
         script.onerror=()=>finish(reject,new Error("No se pudo descargar el SDK desde "+new URL(src).hostname));
         document.head.append(script);
       });
       console.info("JOA Auth: SDK UMD cargado desde",new URL(src).hostname);
       return true;
     }catch(error){lastError=error;console.warn("JOA Auth UMD:",src,error)}
   }
   throw lastError||new Error("No se pudo descargar el SDK de Supabase desde los CDN disponibles.");
 }
 function initSupabase(){
   if(supabase){
     authReadyPromise=(async()=>{
       const {data:{session},error}=await supabase.auth.getSession();
       if(error)throw error;
       currentSession=session||null;
       updateHeader(session?.user||null,session||null);
       authInitError=null;
       document.documentElement.dataset.supabase="ready";
      loadCatalogReviewSummaries(sortedItems().slice((currentPage-1)*pageSize,currentPage*pageSize));
       return true;
     })().catch(error=>{
       authInitError=error;
       console.error("JOA Auth recovery:",error);
       return false;
     });
     return authReadyPromise;
   }
   authInitError=null;
   authReadyPromise=(async()=>{
     if(!window.JOA_CONFIG?.enableSupabase||!window.JOA_CONFIG.supabaseUrl||!window.JOA_CONFIG.supabasePublishableKey)throw new Error("Falta la configuración pública de Supabase.");
     await loadSupabaseSdk();
     supabase=window.supabase.createClient(window.JOA_CONFIG.supabaseUrl,window.JOA_CONFIG.supabasePublishableKey,{
       auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:"pkce"},
       global:{headers:{"X-Client-Info":"joa-gamers-web-auth/1.0.2"}}
     });
     window.joaSupabase=supabase;
     supabase.auth.onAuthStateChange((event,newSession)=>{
       if(event==="INITIAL_SESSION"&&!newSession)return;
       const eventVersion=++authEventVersion;
       currentSession=newSession||null;
       if(newSession?.user&&dialog?.open)dialog.close();
       if(event==="SIGNED_IN"&&newSession?.user)toast("Sesión activa. ¡Bienvenido a JOA!");
       window.setTimeout(()=>{
         if(authEventVersion!==eventVersion)return;
         updateHeader(newSession?.user||null,newSession||null);
       },0);
     });

     // Intercambiar el código PKCE al regresar de Google antes de leer la sesión.
     const callbackUrl=new URL(window.location.href);
     const callbackCode=callbackUrl.searchParams.get("code");
     const callbackError=callbackUrl.searchParams.get("error_description")||callbackUrl.searchParams.get("error");
     if(callbackError)throw new Error("Google no pudo completar el acceso: "+callbackError);
     if(callbackCode){
       const {data:callbackData,error:callbackExchangeError}=await supabase.auth.exchangeCodeForSession(callbackCode);
       if(callbackExchangeError)throw callbackExchangeError;
       if(!callbackData?.session?.user)throw new Error("Google devolvió el código, pero no se pudo recuperar la sesión.");
       currentSession=callbackData.session;
       updateHeader(callbackData.session.user,callbackData.session);
       clearOAuthPending();
       ["code","state","error","error_description"].forEach(key=>callbackUrl.searchParams.delete(key));
       history.replaceState(history.state,document.title,callbackUrl.pathname+callbackUrl.search+callbackUrl.hash);
     }

     const versionBeforeGetSession=authEventVersion;
     const {data:{session},error}=await supabase.auth.getSession();
     if(error)throw error;
     if(authEventVersion===versionBeforeGetSession){
       currentSession=session||null;
       updateHeader(session?.user||null,session||null);
     }
     if(session?.user)clearOAuthPending();
     if(session?.user&&dialog?.open)dialog.close();
     document.documentElement.dataset.supabase="ready";
      loadCatalogReviewSummaries(sortedItems().slice((currentPage-1)*pageSize,currentPage*pageSize));
     if(!session?.user&&!callbackCode)$("#auth-message").textContent="Servicio de acceso listo. Puedes iniciar sesión o crear una cuenta.";
     await loadPublicRewardShowcase();
     return true;
   })().catch(error=>{
     if(/[?&](code|error|error_description)=/.test(window.location.search)){
       clearOAuthPending();
       const failedUrl=new URL(window.location.href);
       ["code","state","error","error_description"].forEach(key=>failedUrl.searchParams.delete(key));
       history.replaceState(history.state,document.title,failedUrl.pathname+failedUrl.search+failedUrl.hash);
     }
     authInitError=error;
     console.error("JOA Auth initialization:",error);
     document.documentElement.dataset.supabase="error";
     $("#auth-message").textContent="No se pudo preparar el acceso: "+authError(error);
     toast("El servicio de acceso no pudo inicializarse: "+(error?.message||"error desconocido"));
     return false;
   });
   return authReadyPromise;
 }
 loadCatalog();initSupabase();
})();