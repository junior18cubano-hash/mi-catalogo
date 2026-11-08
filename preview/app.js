(() => {
 const $ = (s,root=document) => root.querySelector(s);
 const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 const toast = (message) => {const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(window.__joaToast);window.__joaToast=setTimeout(()=>el.classList.remove("show"),3000)};
 $("#year").textContent=new Date().getFullYear();
 const dialog=$("#auth-dialog");
 $("#login-open").addEventListener("click",()=>dialog.showModal());
 $("#community-join").addEventListener("click",()=>dialog.showModal());
 dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
 $("#auth-submit").addEventListener("click",e=>{e.preventDefault();toast("El acceso de usuarios se habilitará al activar Supabase Auth y sus proveedores.");});
 $("#search-toggle").addEventListener("click",()=>{$("#search-panel").scrollIntoView({behavior:"smooth",block:"center"});$("#catalog-search").focus()});
 const cards=$$(".category-card");
 cards.forEach(card=>card.addEventListener("click",()=>{cards.forEach(c=>c.classList.remove("selected"));card.classList.add("selected");$("#results-title").textContent=card.querySelector("b").textContent+" · próximamente";$("#catalog-results").scrollIntoView({behavior:"smooth",block:"nearest"});}));
 $("#catalog-search").addEventListener("input",e=>{const q=e.target.value.trim().toLocaleLowerCase("es");let count=0;cards.forEach(card=>{const match=card.innerText.toLocaleLowerCase("es").includes(q);card.hidden=!!q&&!match;if(match)count++});if(q)$("#results-title").textContent=count?("Categorías coincidentes: "+count):"No encontramos esa categoría";else $("#results-title").textContent="En el radar";});
 // Carga opcional de un JSON exportado por el panel local. No modifica ni elimina datos.
 async function loadCatalog(){const url=window.JOA_CONFIG?.catalogJsonUrl;if(!url)return;try{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error("No se pudo leer el catálogo");const data=await response.json();const items=Array.isArray(data)?data:(data.items||[]);if(!items.length)return;const grid=$("#content-grid");grid.innerHTML="";items.slice(0,12).forEach(item=>{const article=document.createElement("article");article.className="content-card";const poster=document.createElement("div");poster.className="poster";poster.textContent=(item.title||item.name||"JOA").slice(0,32);const body=document.createElement("div");const type=document.createElement("small");type.textContent=String(item.type||"CATÁLOGO").toUpperCase();const title=document.createElement("b");title.textContent=item.title||item.name||"Sin título";const desc=document.createElement("p");desc.textContent=item.synopsis||item.description||"Contenido del catálogo JOA";body.append(type,title,desc);article.append(poster,body);grid.append(article)});$("#results-title").textContent="Contenido del catálogo";}catch(error){console.warn("JOA catalog:",error)}}
 loadCatalog();
 // Supabase se inicializa únicamente cuando se active explícitamente en config.js.
 if(window.JOA_CONFIG?.enableSupabase && window.JOA_CONFIG.supabaseUrl && window.JOA_CONFIG.supabasePublishableKey){const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";script.onload=()=>{window.joaSupabase=window.supabase.createClient(window.JOA_CONFIG.supabaseUrl,window.JOA_CONFIG.supabasePublishableKey);document.documentElement.dataset.supabase="ready"};document.head.append(script)}
})();