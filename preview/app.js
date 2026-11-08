(() => {
 "use strict";
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 const dialog=$("#auth-dialog"), toastEl=$("#toast");
 let authMode="signin", supabase=null, currentUser=null;
 const toast=(message)=>{if(!toastEl)return;toastEl.textContent=message;toastEl.classList.add("show");clearTimeout(window.__joaToast);window.__joaToast=setTimeout(()=>toastEl.classList.remove("show"),3600)};
 $("#year").textContent=new Date().getFullYear();
 const openAuth=()=>{if(currentUser){openCommunity();return}communityRequested=true;if(dialog&&!dialog.open)dialog.showModal();renderAuthMode()};
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
 function itemDate(item){const value=item.updated_at||item.created_at||item.added_at||item.release_date||item.fecha||item.date||itemYear(item);const n=Date.parse(value);return Number.isFinite(n)?n:(Number(value)||0)}
 function sortedItems(){
   const filtered=catalogItems.filter(item=>{
     const group=categoryFor(itemCategoryValue(item));
     const categoryOk=!activeCategory||group===activeCategory;
     const subOk=!activeSubcategory||itemSubcategory(item)===activeSubcategory;
     const platformOk=!activePlatform||itemPlatform(item)===activePlatform;
     const text=[itemTitle(item),itemDescription(item),itemType(item),item.subcategory,item.subcategoria,item.genre,item.genres,item.generos,itemPlatform(item)].flat().join(" ").toLocaleLowerCase("es");
     return categoryOk&&subOk&&platformOk&&(!searchTerm||text.includes(searchTerm));
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
     const remoteFingerprint=[remoteVersion.version||"",remoteVersion.hash||"",remoteVersion.generated_at||"",remoteVersion.item_count||""].join("|");
     const savedVersion=localStorage.getItem(versionKey);
     let data=null;
     if(!force&&savedVersion===remoteFingerprint)data=await readCachedCatalog();
     if(!data){
       setCatalogStatus("Descargando catálogo actualizado…","loading");
       const response=await fetch(CATALOG_DATA_URL,{cache:"no-store"});
       if(!response.ok)throw new Error("No se pudo descargar Update.json");
       data=await response.json();
     }
     if(!data||!Array.isArray(data.items))throw new Error("El JSON no contiene la lista esperada «items».");
     const expectedCount=Number(remoteVersion.item_count||0);
     if(expectedCount>0&&data.items.length!==expectedCount)throw new Error("El catálogo recibido está incompleto: se esperaban "+expectedCount+" elementos y llegaron "+data.items.length+".");
     if(savedVersion!==remoteFingerprint||force){
       await cacheCatalog(data);
       localStorage.setItem(versionKey,remoteFingerprint);
     }
     catalogItems=data.items;
     catalogMeta=data;
     updateSubcategoryControls();
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

 let currentSession=null,communityProfile=null,communityTab="feed",communityRequested=false,activeConversationId=null,activeChatChannel=null,selectedReviewItem=null;
 function openCommunity(){
   if(!currentUser){openAuth();return}
   const workspace=$("#community-workspace"),layout=$(".community-layout");
   if(workspace)workspace.hidden=false;if(layout)layout.hidden=true;
   $("#community-user-name").textContent=communityProfile?.display_name||currentUser.email?.split("@")[0]||"jugador";
   $("#community-account-email").textContent=currentUser.email||"Cuenta JOA";
   $("#community-profile-name").value=communityProfile?.display_name||"";
   $("#community-profile-username").value=communityProfile?.username||"";
   $("#community-profile-bio").value=communityProfile?.bio||"";
   $("#community-avatar").textContent=(communityProfile?.display_name||"JG").slice(0,2).toUpperCase();
   loadCommunityFeed();loadCommunityFriends();loadCommunityGroups();loadCommunityChats();loadCommunityReviews();
   $("#community").scrollIntoView({behavior:"smooth",block:"start"});
 }
 function closeCommunity(){
   const workspace=$("#community-workspace"),layout=$(".community-layout");
   if(workspace)workspace.hidden=true;if(layout)layout.hidden=false;
 }
 function communityError(error){console.error("JOA Social:",error);return error?.message||"No se pudo completar la operación."}
 async function ensureCommunityProfile(user){
   if(!user||!supabase)return null;
   const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
   if(error)throw error;
   if(data)return data;
   const meta=user.user_metadata||{},display=meta.full_name||meta.name||user.email?.split("@")[0]||"Jugador JOA";
   const username="joa_"+user.id.replace(/-/g,"").slice(0,10);
   const {data:created,error:insertError}=await supabase.from("profiles").insert({id:user.id,username,display_name:display,avatar_url:meta.avatar_url||meta.picture||null}).select().single();
   if(insertError)throw insertError;return created;
 }
 function communityInitials(name){return String(name||"JG").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"JG"}
 async function loadCommunityFeed(){
   const host=$("#community-feed-list");if(!host||!supabase)return;
   host.innerHTML='<p class="community-loading">Cargando publicaciones…</p>';
   try{
     const {data:posts,error}=await supabase.from("posts").select("id,author_id,body,media_url,created_at").order("created_at",{ascending:false}).limit(40);
     if(error)throw error;
     if(!posts?.length){host.innerHTML='<div class="community-empty"><span>✦</span><h3>El feed está esperando su primera historia</h3><p>Publica algo y abre la conversación en JOA.</p></div>';return}
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
   }catch(error){host.innerHTML='<div class="community-empty"><h3>No se pudo cargar el feed</h3><p></p></div>';host.querySelector("p").textContent=communityError(error)}
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
 $("#community-signout").addEventListener("click",async()=>{
   if(!supabase)return;const {error}=await supabase.auth.signOut({scope:"local"});if(error){toast(communityError(error));return}
   closeCommunity();communityRequested=false;toast("Sesión cerrada en este dispositivo.");
 });
 $("#community-profile-form").addEventListener("submit",async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   const username=$("#community-profile-username").value.trim().replace(/^@/,"");
   try{
     const {data,error}=await supabase.from("profiles").update({username,display_name:$("#community-profile-name").value.trim(),bio:$("#community-profile-bio").value.trim(),updated_at:new Date().toISOString()}).eq("id",currentUser.id).select().single();
     if(error)throw error;communityProfile=data;$("#community-user-name").textContent=data.display_name;$("#community-avatar").textContent=communityInitials(data.display_name);$("#community-profile-status").textContent="Perfil actualizado correctamente.";toast("Perfil guardado.");
   }catch(error){$("#community-profile-status").textContent=communityError(error)}finally{button.disabled=false}
 });
 $("[data-community-tab]").forEach(button=>button.addEventListener("click",()=>{
   communityTab=button.dataset.communityTab;$("[data-community-tab]").forEach(b=>b.classList.toggle("active",b===button));
   ["feed","friends","messages","groups","reviews","profile"].forEach(tab=>$("#community-"+tab+"-panel").hidden=tab!==communityTab);if(communityTab==="messages")loadCommunityChats();if(communityTab==="reviews")loadCommunityReviews();
 }));
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
 $("#community-friend-search").addEventListener("submit",async e=>{
   e.preventDefault();const host=$("#community-friend-results");host.textContent="Buscando…";
   const query=$("#community-friend-query").value.trim().replace(/^@/,"");
   const {data,error}=await supabase.from("profiles").select("id,username,display_name").ilike("username","%"+query+"%").neq("id",currentUser.id).limit(12);
   if(error){host.textContent=communityError(error);return}host.innerHTML="";
   if(!data?.length){host.textContent="No encontramos jugadores con ese nombre.";return}
   data.forEach(profile=>{const row=document.createElement("div");row.className="community-list-row";const label=document.createElement("span");label.textContent=(profile.display_name||profile.username)+" · @"+profile.username;const add=document.createElement("button");add.textContent="Añadir";add.addEventListener("click",async()=>{const {error}=await supabase.from("friendships").insert({requester_id:currentUser.id,addressee_id:profile.id,status:"pending"});if(error)toast(communityError(error));else{add.disabled=true;add.textContent="Enviada";loadCommunityFriends()}});row.append(label,add);host.append(row)})
 });

 async function startDirectChat(friendId,friendName){
   try{
     const found=await supabase.from("conversations").select("id").or("and(created_by.eq."+currentUser.id+",direct_user_id.eq."+friendId+"),and(created_by.eq."+friendId+",direct_user_id.eq."+currentUser.id+")").limit(1).maybeSingle();
     if(found.error)throw found.error;let conversationId=found.data?.id;
     if(!conversationId){
       const created=await supabase.from("conversations").insert({created_by:currentUser.id,direct_user_id:friendId,title:friendName}).select("id").single();
       if(created.error)throw created.error;conversationId=created.data.id;
       const members=await supabase.from("conversation_members").insert([{conversation_id:conversationId,user_id:currentUser.id},{conversation_id:conversationId,user_id:friendId}]);
       if(members.error)throw members.error;
     }
     activeConversationId=conversationId;communityTab="messages";
     $("[data-community-tab]").forEach(b=>b.classList.toggle("active",b.dataset.communityTab==="messages"));
     ["feed","friends","messages","groups","reviews","profile"].forEach(tab=>$("#community-"+tab+"-panel").hidden=tab!=="messages");
     await loadCommunityChats();await openCommunityChat(conversationId,friendName);
   }catch(error){toast(communityError(error))}
 }
 async function loadCommunityChats(){
   const host=$("#community-chat-list");if(!host||!currentUser||!supabase)return;
   const memberships=await supabase.from("conversation_members").select("conversation_id").eq("user_id",currentUser.id);
   if(memberships.error){host.textContent=communityError(memberships.error);return}
   const ids=(memberships.data||[]).map(x=>x.conversation_id);
   if(!ids.length){host.textContent="Todavía no tienes chats. Añade a un amigo para comenzar.";return}
   const conv=await supabase.from("conversations").select("id,title,direct_user_id,created_at").in("id",ids).order("created_at",{ascending:false});
   if(conv.error){host.textContent=communityError(conv.error);return}
   const peerIds=[...new Set((conv.data||[]).map(x=>x.direct_user_id).filter(Boolean))];
   const profiles=peerIds.length?await supabase.from("profiles").select("id,display_name,username").in("id",peerIds):{data:[]};
   const profileMap=new Map((profiles.data||[]).map(p=>[p.id,p]));host.innerHTML="";
   for(const item of conv.data||[]){
     const peer=profileMap.get(item.direct_user_id),row=document.createElement("button");row.type="button";row.className="community-chat-entry";row.textContent=peer?.display_name||peer?.username||item.title||"Conversación JOA";row.classList.toggle("active",item.id===activeConversationId);
     row.addEventListener("click",()=>openCommunityChat(item.id,row.textContent));host.append(row);
   }
 }
 async function openCommunityChat(conversationId,title){
   activeConversationId=conversationId;$("#community-chat-title").textContent=title||"Chat JOA";
   const host=$("#community-chat-messages");host.innerHTML='<p class="community-loading">Cargando mensajes…</p>';
   const {data,error}=await supabase.from("messages").select("id,sender_id,body,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(200);
   if(error){host.textContent=communityError(error);return}
   host.innerHTML="";
   if(!data?.length)host.innerHTML='<p class="community-empty">Saluda y empieza la conversación.</p>';
   data?.forEach(message=>{const bubble=document.createElement("div");bubble.className="community-message"+(message.sender_id===currentUser.id?" mine":"");const body=document.createElement("p");body.textContent=message.body;const time=document.createElement("small");time.textContent=new Date(message.created_at).toLocaleString("es",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"});bubble.append(body,time);host.append(bubble)});
   host.scrollTop=host.scrollHeight;
   if(activeChatChannel)supabase.removeChannel(activeChatChannel);
   activeChatChannel=supabase.channel("joa-chat-"+conversationId).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+conversationId},()=>openCommunityChat(conversationId,title)).subscribe();
 }
 $("#community-chat-form").addEventListener("submit",async e=>{
   e.preventDefault();if(!activeConversationId){toast("Selecciona primero un chat.");return}
   const input=$("#community-chat-input"),button=e.submitter,body=input.value.trim();if(!body)return;button.disabled=true;
   try{const {error}=await supabase.from("messages").insert({conversation_id:activeConversationId,sender_id:currentUser.id,body});if(error)throw error;input.value="";await openCommunityChat(activeConversationId,$("#community-chat-title").textContent)}
   catch(error){toast(communityError(error))}finally{button.disabled=false}
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
   const host=$("#community-group-list");if(!host||!supabase)return;
   const {data,error}=await supabase.from("community_groups").select("id,name,slug,description,created_by,is_public,created_at").eq("is_public",true).order("created_at",{ascending:false}).limit(30);
   if(error){host.textContent=communityError(error);return}host.innerHTML="";
   if(!data?.length){host.textContent="Todavía no hay grupos públicos. ¡Crea el primero!";return}
   const {data:members}=await supabase.from("group_members").select("group_id,user_id").eq("user_id",currentUser.id);
   const joined=new Set((members||[]).map(x=>x.group_id));
   data.forEach(group=>{const row=document.createElement("div");row.className="community-list-row";const label=document.createElement("span");label.textContent=group.name+" — "+(group.description||"Grupo JOA");const action=document.createElement("button");action.textContent=joined.has(group.id)?"Miembro":"Unirme";action.disabled=joined.has(group.id);action.addEventListener("click",async()=>{const {error}=await supabase.from("group_members").insert({group_id:group.id,user_id:currentUser.id,role:"member"});if(error)toast(communityError(error));else loadCommunityGroups()});row.append(label,action);host.append(row)})
 }
 $("#community-group-form").addEventListener("submit",async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   try{const name=$("#community-group-name").value.trim(),slug=name.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,6);
     const {error}=await supabase.from("community_groups").insert({name,slug,description:$("#community-group-description").value.trim(),created_by:currentUser.id,is_public:true});if(error)throw error;
     $("#community-group-name").value="";$("#community-group-description").value="";toast("Grupo creado.");loadCommunityGroups()
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
 function updateHeader(user,session=null){
   currentUser=user;currentSession=session||currentSession;
   const btn=$("#login-open");
   if(user){btn.innerHTML='<span class="user-status">● '+escapeHtml(user.email||"Mi cuenta")+'</span>';btn.title="Abrir comunidad y cuenta";$("#community-join").textContent="Ir a mi comunidad";$("#community-join").querySelector("b")?.remove()}
   else{btn.innerHTML='Entrar <span>↗</span>';btn.title="Iniciar sesión";$("#community-join").textContent="Entrar a la comunidad";closeCommunity();communityProfile=null}
   renderAuthMode();
   if(user){Promise.resolve().then(async()=>{try{communityProfile=await ensureCommunityProfile(user);if(communityRequested)openCommunity()}catch(error){console.warn("No se pudo preparar el perfil social",error);toast("Tu sesión está activa, pero no se pudo cargar el perfil.")}})}
 }
 function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 async function initSupabase(){
   if(!window.JOA_CONFIG?.enableSupabase||!window.JOA_CONFIG.supabaseUrl||!window.JOA_CONFIG.supabasePublishableKey)return;
   try{
     const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";script.async=true;
     script.onload=async()=>{
       try{
         supabase=window.supabase.createClient(window.JOA_CONFIG.supabaseUrl,window.JOA_CONFIG.supabasePublishableKey,{
           auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}
         });
         window.joaSupabase=supabase;
         const {data:{session},error:sessionError}=await supabase.auth.getSession();
         if(sessionError)throw sessionError;
         currentSession=session||null;updateHeader(session?.user||null,session||null);
         supabase.auth.onAuthStateChange((event,newSession)=>{
           currentSession=newSession||null;
           updateHeader(newSession?.user||null,newSession||null);
           if(event==="SIGNED_IN"&&newSession?.user)toast("Sesión activa. ¡Bienvenido a JOA!");
         });
         document.documentElement.dataset.supabase="ready";
       }catch(error){console.error("JOA Auth:",error);document.documentElement.dataset.supabase="error"}
     };
     script.onerror=()=>{document.documentElement.dataset.supabase="error";toast("No se pudo cargar el servicio de autenticación.")};
     document.head.append(script);
   }catch(error){console.error(error)}
 }
 loadCatalog();initSupabase();
})();