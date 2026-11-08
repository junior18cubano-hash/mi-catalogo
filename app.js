(() => {
 "use strict";
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 // Captura global temprana de los botones de acceso: evita depender de listeners tardíos.
 document.addEventListener("click",event=>{
   const target=event.target;
   const button=target&&target.closest?target.closest("#auth-google"):null;
   if(!button)return;
   event.preventDefault();
   event.stopImmediatePropagation();
   console.info("JOA Auth: clic detectado",button.id);
   oauth("google");
 },true);
 const dialog=$("#auth-dialog"), toastEl=$("#toast");
 let authMode="signin", supabase=null, currentUser=null, authReadyPromise=Promise.resolve(false), authInitError=null;
 const toast=(message)=>{if(!toastEl)return;toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(window.__joaToast);window.__joaToast=setTimeout(()=>toastEl.classList.remove("show"),3600)};
 function safeSessionGet(key){try{return window.sessionStorage?.getItem(key)||null}catch(error){console.warn("JOA: sessionStorage no disponible",error);return null}}
 function safeSessionSet(key,value){try{window.sessionStorage?.setItem(key,value);return true}catch(error){console.warn("JOA: no se pudo guardar el estado temporal",error);return false}}
 function safeSessionRemove(key){try{window.sessionStorage?.removeItem(key)}catch(error){console.warn("JOA: no se pudo limpiar el estado temporal",error)}}
 $("#year").textContent=new Date().getFullYear();
 const openAuth=()=>{communityRequested=true;safeSessionSet("joa_community_requested","1");if(currentUser){openCommunity();return}if(dialog&&!dialog.open)dialog.showModal();renderAuthMode()};
 $("#login-open").addEventListener("click",openAuth);
 $("#community-join").addEventListener("click",openAuth);
 dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
 $("#search-toggle").addEventListener("click",()=>{$("#search-panel").scrollIntoView({behavior:"smooth",block:"center"});$("#catalog-search").focus()});
 const cards=$$(".category-card");
 const CATALOG_VERSION_URL="https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/version.json";
 const CATALOG_DATA_URL="https://raw.githubusercontent.com/junior18cubano-hash/Actualizacion-Catalogo/main/Update.json";
 const CATALOG_CACHE="joa-web-catalog-v1";
 let catalogItems=[],catalogMeta={},activeCategory="",activeSubcategory="",activePlatform="",searchTerm="",sortMode="name",pageSize=18,currentPage=1;
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
     const article=document.createElement("button");article.type="button";article.className="content-card catalog-live-card";article.setAttribute("aria-label","Ver detalles de "+itemTitle(item));
     const poster=document.createElement("div");poster.className="poster";const cover=resolveCover(itemCover(item));
     if(cover){const img=document.createElement("img");img.src=cover;img.alt="";img.loading="lazy";img.decoding="async";img.onerror=()=>{img.remove();if(!poster.querySelector(".catalog-type-badge"))poster.textContent=itemTitle(item).slice(0,32)};poster.append(img)}else poster.textContent=itemTitle(item).slice(0,32);
     const badge=document.createElement("span");badge.className="catalog-type-badge type-"+categoryFor(itemCategoryValue(item));badge.textContent=cardTypeLabel(item);poster.append(badge);
     const body=document.createElement("div"),title=document.createElement("b");title.textContent=itemTitle(item);body.append(title);article.append(poster,body);
     article.addEventListener("click",()=>openCatalogDetail(item));grid.append(article);
   });
   const labels={juego:"Juegos",pelicula:"Películas",serie:"Series TV",anime:"Anime",novela:"Telenovelas",software:"Software",musica:"Música",otros:"Otros"};
   $("#results-title").textContent=activeCategory?(labels[activeCategory]||"Catálogo"):searchTerm?"Resultados de búsqueda":"Catálogo JOA";
   const tag=$(".demo-tag");if(tag)tag.textContent=filtered.length.toLocaleString("es")+" ELEMENTOS";
   if(!shown.length)grid.innerHTML='<p class="catalog-empty">No encontramos contenido con esos criterios.</p>';
   const count=$("#catalog-count");if(count)count.textContent=filtered.length.toLocaleString("es")+" resultados · Página "+currentPage+" de "+totalPages;
   renderPagination(totalPages);
 }
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
 $("#catalog-page-size")?.addEventListener("change",e=>{pageSize=Number(e.target.value)||18;currentPage=1;renderCatalog()});
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

 let currentSession=null,communityProfile=null,communityTab="feed",communityRequested=safeSessionGet("joa_community_requested")==="1",activeConversationId=null,activeConversationIds=[],activeChatChannel=null,communityChatListChannel=null,selectedReviewItem=null,activeCommunityGroupId=null,communityGroupsCache=[];

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
       loadNotifications();
       const panel=$("#notification-panel");
       if(panel?.hidden)toast(payload.new?.title||"Tienes una nueva notificación.");
     }).subscribe();
 }
 function stopNotificationRealtime(){
   if(notificationsChannel&&supabase)supabase.removeChannel(notificationsChannel);
   notificationsChannel=null;notificationsUserId=null;notificationRows=[];
   const badge=$("#notification-count"),host=$("#notification-list");
   if(badge){badge.hidden=true;badge.textContent="0"}
   if(host)host.innerHTML='<div class="notification-empty">Inicia sesión para ver tus notificaciones.</div>';
   const panel=$("#notification-panel");if(panel)panel.hidden=true;
 }
 async function markAllNotificationsRead(){
   if(!currentUser||!supabase)return;
   const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",currentUser.id).is("read_at",null);
   if(error){toast(communityError(error));return}
   await loadNotifications();toast("Notificaciones marcadas como leídas.");
 }
 function activateCommunityTab(tab){
   communityTab=tab;
   $("[data-community-tab]").forEach(button=>button.classList.toggle("active",button.dataset.communityTab===tab));
   ["feed","friends","messages","groups","reviews","profile"].forEach(name=>{
     const panel=$("#community-"+name+"-panel");if(panel)panel.hidden=name!==tab;
   });
   if(tab==="messages")loadCommunityChats();
   if(tab==="friends")loadCommunityDirectory();
   if(tab==="groups")loadCommunityGroups();
   if(tab==="reviews")loadCommunityReviews();
 }
 async function openNotification(item){
   const panel=$("#notification-panel");if(panel)panel.hidden=true;
   if(!currentUser||!supabase)return;
   if(!item.read_at){
     const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",item.id).eq("user_id",currentUser.id);
     if(error)console.warn("No se pudo marcar la notificación",error);
     item.read_at=new Date().toISOString();renderNotifications(notificationRows);
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
     const {data:conv,error}=await supabase.from("conversations").select("id,created_by,direct_user_id").eq("id",data.conversation_id).maybeSingle();
     if(error||!conv)return;
     const peerId=conv.created_by===currentUser.id?conv.direct_user_id:conv.created_by;
     const [profile,members]=await Promise.all([
       supabase.from("profiles").select("display_name,username").eq("id",peerId).maybeSingle(),
       supabase.from("conversation_members").select("user_id").eq("conversation_id",data.conversation_id)
     ]);
     const title=profile.data?.display_name||profile.data?.username||"Chat JOA";
     const related=(members.data||[]).map(x=>x.conversation_id).filter(Boolean);
     openCommunityChat(conv.id,title,[conv.id]);
     return;
   }
   activateCommunityTab("feed");
   await loadCommunityFeed();
 }
 function openCommunity(){
   if(!currentUser){openAuth();return}
   communityRequested=false;safeSessionRemove("joa_community_requested");
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
       const card=document.createElement("article");card.className="community-post-card";
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
   const panel=$("#notification-panel");panel.hidden=!panel.hidden;
   if(!panel.hidden)await loadNotifications();
 });
 $("#notifications-mark-all").addEventListener("click",markAllNotificationsRead);
 document.addEventListener("click",event=>{
   const wrap=$("#notifications-wrap");
   if(wrap&&!wrap.contains(event.target))$("#notification-panel").hidden=true;
 });

 $("#community-signout").addEventListener("click",async()=>{
   if(!supabase)return;const {error}=await supabase.auth.signOut({scope:"local"});if(error){toast(communityError(error));return}
   closeCommunity();communityRequested=false;safeSessionRemove("joa_community_requested");toast("Sesión cerrada en este dispositivo.");
 });
 $("#community-profile-form").addEventListener("submit",async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   const username=$("#community-profile-username").value.trim().replace(/^@/,"");
   try{
     const {data,error}=await supabase.from("profiles").update({username,display_name:$("#community-profile-name").value.trim(),bio:$("#community-profile-bio").value.trim(),game_preferences:$("#community-profile-games").value.trim(),updated_at:new Date().toISOString()}).eq("id",currentUser.id).select().single();
     if(error)throw error;communityProfile=data;$("#community-user-name").textContent=data.display_name;$("#community-avatar").textContent=communityInitials(data.display_name);$("#community-profile-status").textContent="Perfil actualizado correctamente.";toast("Perfil guardado.");
   }catch(error){$("#community-profile-status").textContent=communityError(error)}finally{button.disabled=false}
 });
 $("[data-community-tab]").forEach(button=>button.addEventListener("click",()=>activateCommunityTab(button.dataset.communityTab)));
 async function loadCommunityFriends(){
   if(!currentUser||!supabase)return;const host=$("#community-friend-list");if(!host)return;
   const {data,error}=await supabase.from("friendships").select("*").or("requester_id.eq."+currentUser.id+",addressee_id.eq."+currentUser.id).order("created_at",{ascending:false});
   if(error){host.textContent=communityError(error);return}
   if(!data?.length){host.textContent="Todavía no tienes amistades ni solicitudes.";return}
   const others=[...new Set(data.map(x=>x.requester_id===currentUser.id?x.addressee_id:x.requester_id))];
   const p=await supabase.from("profiles").select("id,username,display_name").in("id",others);const map=new Map((p.data||[]).map(x=>[x.id,x]));
   host.innerHTML="";data.forEach(row=>{const other=row.requester_id===currentUser.id?row.addressee_id:row.requester_id,profile=map.get(other)||{},line=document.createElement("div");line.className="community-list-row";const label=document.createElement("span");label.textContent=(profile.display_name||profile.username||"Jugador")+" · "+row.status;line.append(label);
     if(row.status==="accepted"){const chat=document.createElement("button");chat.textContent="Mensaje";chat.addEventListener("click",()=>startDirectChat(other,profile.display_name||profile.username||"Amigo"));line.append(chat)}
     if(row.status==="pending"&&row.addressee_id===currentUser.id){const accept=document.createElement("button");accept.textContent="Aceptar";accept.addEventListener("click",async()=>{const {error}=await supabase.from("friendships").update({status:"accepted",updated_at:new Date().toISOString()}).eq("id",row.id);if(error)toast(communityError(error));else loadCommunityFriends()});line.append(accept)}
     host.append(line);
   });
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
       const action=document.createElement("button");action.type="button";
       if(relation?.status==="accepted"){action.textContent="✓ Ya son amigos";action.disabled=true}
       else if(relation?.status==="pending"&&relation.requester_id===currentUser.id){action.textContent="Solicitud enviada";action.disabled=true}
       else if(relation?.status==="pending"){action.textContent="Responder solicitud";action.disabled=true}
       else{
         action.textContent="＋ Añadir amigo";
         action.addEventListener("click",async()=>{
           action.disabled=true;action.textContent="Enviando…";
           const {error}=await supabase.from("friendships").insert({requester_id:currentUser.id,addressee_id:profile.id,status:"pending"});
           if(error){action.disabled=false;action.textContent="＋ Añadir amigo";toast(communityError(error))}
           else{action.textContent="Solicitud enviada";friendships.push({requester_id:currentUser.id,addressee_id:profile.id,status:"pending"});loadCommunityFriends()}
         });
       }
       actions.append(action);row.append(actions);host.append(row);
     });
   };
   if(input&&!input.dataset.directoryBound){input.dataset.directoryBound="1";input.addEventListener("input",render)}
   render();
 }
 $("#community-friend-refresh").addEventListener("click",loadCommunityDirectory);


 async function startDirectChat(friendId,friendName){
   try{
     const found=await supabase.from("conversations").select("id,created_at").or("and(created_by.eq."+currentUser.id+",direct_user_id.eq."+friendId+"),and(created_by.eq."+friendId+",direct_user_id.eq."+currentUser.id+")").order("created_at",{ascending:false}).limit(1);
     if(found.error)throw found.error;let conversationId=found.data?.[0]?.id;
     if(!conversationId){
       const created=await supabase.from("conversations").insert({created_by:currentUser.id,direct_user_id:friendId,title:friendName}).select("id").single();
       if(created.error)throw created.error;conversationId=created.data.id;
       const members=await supabase.from("conversation_members").insert([{conversation_id:conversationId,user_id:currentUser.id},{conversation_id:conversationId,user_id:friendId}]);
       if(members.error)throw members.error;
     }
     activeConversationId=conversationId;communityTab="messages";
     $$("[data-community-tab]").forEach(b=>b.classList.toggle("active",b.dataset.communityTab==="messages"));
     ["feed","friends","messages","groups","reviews","profile"].forEach(tab=>$("#community-"+tab+"-panel").hidden=tab!=="messages");
     await loadCommunityChats();await openCommunityChat(conversationId,friendName);
   }catch(error){toast(communityError(error))}
 }
 function ensureCommunityChatListRealtime(){
   if(communityChatListChannel||!supabase||!currentUser)return;
   communityChatListChannel=supabase.channel("joa-chat-list-"+currentUser.id)
     .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},()=>loadCommunityChats())
     .subscribe();
 }
 function showCommunityGeneral(){
   activeConversationId=null;activeConversationIds=[];
   $("#community-chat-title").textContent="General · Todos tus mensajes";
   $("#community-chat-form").hidden=true;
   $(".community-chat-entry").forEach(row=>row.classList.toggle("active",row.dataset.general==="true"));
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
   const ids=(memberships.data||[]).map(x=>x.conversation_id);
   if(!ids.length){host.textContent="Todavía no tienes chats. Añade a un amigo para comenzar.";return}
   const conv=await supabase.from("conversations").select("id,title,created_by,direct_user_id,created_at").in("id",ids).order("created_at",{ascending:false});
   if(conv.error){host.textContent=communityError(conv.error);return}
   const conversations=conv.data||[];
   const peerIds=[...new Set(conversations.map(x=>x.created_by===currentUser.id?x.direct_user_id:x.created_by).filter(Boolean))];
   const [profiles,messages]=await Promise.all([
     peerIds.length?supabase.from("profiles").select("id,display_name,username").in("id",peerIds):Promise.resolve({data:[]}),
     supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id",ids).order("created_at",{ascending:false}).limit(150)
   ]);
   if(profiles.error){host.textContent=communityError(profiles.error);return}
   if(messages.error){host.textContent=communityError(messages.error);return}
   const profileMap=new Map((profiles.data||[]).map(p=>[p.id,p]));
   const lastByConversation=new Map();
   (messages.data||[]).forEach(m=>{if(!lastByConversation.has(m.conversation_id))lastByConversation.set(m.conversation_id,m)});
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
   const generalPreview=document.createElement("span");generalPreview.className="community-chat-preview";generalPreview.textContent="Todos los mensajes, en orden de llegada";
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
   if(!activeConversationId)await renderCommunityGeneral(ids,conversations,profileMap,messages.data||[]);
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
   const {data,error}=await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id",activeConversationIds).order("created_at",{ascending:true}).limit(300);
   if(error){host.textContent=communityError(error);return}
   host.innerHTML="";
   if(!data?.length)host.innerHTML='<p class="community-empty">Saluda y empieza la conversación.</p>';
   data?.forEach(appendCommunityMessage);
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
   const close=document.createElement("button");close.type="button";close.textContent="Cerrar";close.addEventListener("click",()=>{panel.hidden=true;activeCommunityGroupId=null});
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
   if(owner){
     const modTitle=document.createElement("h4");modTitle.textContent="Administración";wrap.append(modTitle);
     const candidates=(members.data||[]).filter(m=>m.role==="member");
     candidates.forEach(m=>{const p=profileMap.get(m.user_id)||{},row=document.createElement("div");row.className="community-group-member";const label=document.createElement("span");label.textContent=p.display_name||p.username||"Jugador";const promote=document.createElement("button");promote.type="button";promote.textContent="Hacer moderador";promote.addEventListener("click",async()=>{const del=await supabase.from("group_members").delete().eq("group_id",groupId).eq("user_id",m.user_id);if(del.error){toast(communityError(del.error));return}const ins=await supabase.from("group_members").insert({group_id:groupId,user_id:m.user_id,role:"moderator"});if(ins.error)toast(communityError(ins.error));else openCommunityGroup(groupId,false)});row.append(label,promote);wrap.append(row)});
   }
   panel.innerHTML="";panel.append(wrap);
   if(scroll)panel.scrollIntoView({behavior:"smooth",block:"nearest"});
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
   e.preventDefault();const button=e.submitter;button.disabled=true;
   try{
     const name=$("#community-group-name").value.trim(),slug=name.toLocaleLowerCase("es").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,6);
     const payload={name,slug,description:$("#community-group-description").value.trim(),category:$("#community-group-category").value.trim()||"General",platform:$("#community-group-platform").value.trim()||"Todas",tags:$("#community-group-tags").value.trim(),rules:$("#community-group-rules").value.trim(),is_public:$("#community-group-visibility").value==="true",created_by:currentUser.id};
     const created=await supabase.from("community_groups").insert(payload).select("id").single();if(created.error)throw created.error;
     const member=await supabase.from("group_members").insert({group_id:created.data.id,user_id:currentUser.id,role:"owner"});if(member.error)throw member.error;
     e.currentTarget.reset();toast("Grupo creado. Ya apareces como su creador.");await loadCommunityGroups();openCommunityGroup(created.data.id);
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
   submit.disabled=true;submit.textContent="Conectando…";
   try{
     const ready=await authReadyPromise;
     if(!ready||!supabase)throw new Error("El servicio de acceso no ha podido inicializarse. Comprueba tu conexión e inténtalo otra vez.");
   }catch(error){$("#auth-message").textContent=authError(error);toast(authError(error));submit.disabled=false;renderAuthMode();return}
   const email=$("#auth-email").value.trim(),password=$("#auth-password").value;
   if(!email||!password){toast("Escribe tu correo y contraseña.");return}
   submit.textContent="Procesando…";
   try{
     let result;
     if(authMode==="signup"){
       console.info("JOA Auth: enviando solicitud de registro por correo", {emailDomain:email.split("@")[1]||""});
       result=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.JOA_CONFIG.authRedirectUrl}});
       console.info("JOA Auth: respuesta de registro", {hasUser:!!result.data?.user,hasSession:!!result.data?.session,identityCount:result.data?.user?.identities?.length??null,hasError:!!result.error});
       if(result.error)throw result.error;
       const createdUser=result.data?.user||null;
       const createdSession=result.data?.session||null;
       const returnedIdentities=createdUser?.identities;
       // Supabase oculta si un correo ya existe: en ese caso devuelve un usuario ficticio sin identidades.
       if(createdUser && Array.isArray(returnedIdentities) && returnedIdentities.length===0){
         $("#auth-message").textContent="Ese correo ya está asociado a una cuenta. Inicia sesión con ese correo o continúa con el proveedor con el que te registraste (por ejemplo, Google).";
         toast("Ese correo ya tiene una cuenta. Inicia sesión.");
       }else if(!createdUser){
         $("#auth-message").textContent="No se pudo confirmar la creación de la cuenta. Si ese correo ya está registrado, inicia sesión o usa «¿Olvidaste tu contraseña?»."; 
         toast("No se confirmó el registro. Comprueba si ya tienes una cuenta.");
       }else if(createdSession){
         updateHeader(createdUser,createdSession);
         dialog.close();
         toast("¡Cuenta creada y sesión iniciada!");
       }else{
         $("#auth-message").textContent="La cuenta fue creada, pero todavía está pendiente de confirmar. Abre el correo de Supabase y pulsa el enlace de verificación. Después volverás aquí para iniciar sesión.";
         toast("Revisa tu correo y confirma la cuenta antes de entrar.");
       }
     }else{
       result=await supabase.auth.signInWithPassword({email,password});
       if(result.error)throw result.error;
       updateHeader(result.data.user,result.data.session);
       dialog.close();
       toast("¡Bienvenido de nuevo a JOA!");
     }
   }catch(error){
     console.error("JOA email auth:",error);
     $("#auth-message").textContent=authError(error);
     toast(authError(error));
   }finally{
     submit.disabled=false;
     renderAuthMode();
   }
 });
 $("#auth-forgot").addEventListener("click",async()=>{
   const email=$("#auth-email").value.trim();if(!email){toast("Escribe primero tu correo electrónico.");return}
   try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.JOA_CONFIG.authRedirectUrl});if(error)throw error;toast("Si el correo está registrado, recibirás instrucciones para recuperar el acceso.");$("#auth-message").textContent="Revisa tu correo para continuar con la recuperación."}
   catch(error){toast(authError(error))}
 });
 async function oauth(provider){
   const button=$("#auth-google");
   const originalText=button?.textContent||"Continuar";
   if(button){button.disabled=true;button.textContent="Conectando…"}
   $("#auth-message").textContent="Preparando el acceso seguro…";
   try{
     let ready=await authReadyPromise;
     // Recuperación defensiva: si algún error previo impidió iniciar Supabase,
     // el primer intento de acceso vuelve a lanzar la inicialización.
     if(!ready&&!authInitError){
       console.warn("JOA Auth: la inicialización no se había iniciado; reintentando ahora.");
       ready=await initSupabase();
     }
     if(!ready||!supabase)throw authInitError||new Error("La inicialización de Supabase no llegó a completarse. Revisa la consola del navegador para ver el error anterior.");
     // Navegación explícita: evita que algunos navegadores embebidos dejen el diálogo abierto
     // después de que Supabase haya generado correctamente la URL OAuth.
     const {data,error}=await supabase.auth.signInWithOAuth({
       provider,
       options:{
         redirectTo:window.JOA_CONFIG.authRedirectUrl,
         skipBrowserRedirect:true,
         queryParams:provider==="google"?{access_type:"offline",prompt:"select_account"}:undefined
       }
     });
     if(error)throw error;
     if(!data?.url)throw new Error("Supabase no devolvió la dirección de acceso del proveedor.");
     $("#auth-message").textContent="Abriendo el acceso seguro…";
     window.location.assign(data.url);
   }catch(error){
     console.error("JOA OAuth:",error);
     const message=authError(error);
     $("#auth-message").textContent=message;
     toast(message);
     if(button){button.disabled=false;button.textContent=originalText}
   }
 }
 // Los botones OAuth se atienden desde el listener global de captura.
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
   currentUser=user;currentSession=session||currentSession;
   const btn=$("#login-open");
   if(user){btn.innerHTML='<span class="user-status">● '+escapeHtml(user.email||"Mi cuenta")+'</span>';btn.title="Abrir comunidad y cuenta";$("#community-join").textContent="Ir a mi comunidad";$("#community-join").querySelector("b")?.remove()}
   else{btn.innerHTML='Entrar <span>↗</span>';btn.title="Iniciar sesión";$("#community-join").textContent="Entrar a la comunidad";closeCommunity();communityProfile=null;stopNotificationRealtime()}
   renderAuthMode();
   if(user){Promise.resolve().then(async()=>{try{communityProfile=await ensureCommunityProfile(user);startNotificationRealtime();await loadNotifications();if(communityRequested)openCommunity()}catch(error){console.warn("No se pudo preparar el perfil social",error);toast("Tu sesión está activa, pero no se pudo cargar el perfil.")}})}
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
   const scriptSources=[
     "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0",
     "https://unpkg.com/@supabase/supabase-js@2.119.0"
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
   authReadyPromise=(async()=>{
     if(!window.JOA_CONFIG?.enableSupabase||!window.JOA_CONFIG.supabaseUrl||!window.JOA_CONFIG.supabasePublishableKey)throw new Error("Falta la configuración pública de Supabase.");
     await loadSupabaseSdk();
     supabase=window.supabase.createClient(window.JOA_CONFIG.supabaseUrl,window.JOA_CONFIG.supabasePublishableKey,{
       auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"},
       global:{headers:{"X-Client-Info":"joa-gamers-web-auth/1.0.1"}}
     });
     window.joaSupabase=supabase;
     // Registrar primero el observador para no perder el evento de sesión durante la recuperación OAuth.
     supabase.auth.onAuthStateChange((event,newSession)=>{
       currentSession=newSession||null;
       updateHeader(newSession?.user||null,newSession||null);
       if(newSession?.user&&dialog?.open)dialog.close();
       if(event==="SIGNED_IN"&&newSession?.user)toast("Sesión activa. ¡Bienvenido a JOA!");
     });
     const {data:{session},error}=await supabase.auth.getSession();
     if(error)throw error;
     currentSession=session||null;
     updateHeader(session?.user||null,session||null);
     if(session?.user&&dialog?.open)dialog.close();
     document.documentElement.dataset.supabase="ready";
     if(!session?.user)$("#auth-message").textContent="Servicio de acceso listo. Puedes iniciar sesión o crear una cuenta.";
     return true;
   })().catch(error=>{
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