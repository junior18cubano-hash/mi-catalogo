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
 cards.forEach(card=>card.addEventListener("click",()=>{cards.forEach(c=>c.classList.remove("selected"));card.classList.add("selected");$("#results-title").textContent=card.querySelector("b").textContent+" · próximamente";$("#catalog-results").scrollIntoView({behavior:"smooth",block:"nearest"})}));
 $("#catalog-search").addEventListener("input",e=>{const q=e.target.value.trim().toLocaleLowerCase("es");let count=0;cards.forEach(card=>{const match=card.innerText.toLocaleLowerCase("es").includes(q);card.hidden=!!q&&!match;if(match)count++});$("#results-title").textContent=q?(count?("Categorías coincidentes: "+count):"No encontramos esa categoría"):"En el radar"});
 async function loadCatalog(){const url=window.JOA_CONFIG?.catalogJsonUrl;if(!url)return;try{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error("No se pudo leer el catálogo");const data=await response.json();const items=Array.isArray(data)?data:(data.items||[]);if(!items.length)return;const grid=$("#content-grid");grid.innerHTML="";items.slice(0,12).forEach(item=>{const article=document.createElement("article");article.className="content-card";const poster=document.createElement("div");poster.className="poster";poster.textContent=(item.title||item.name||"JOA").slice(0,32);const body=document.createElement("div");const type=document.createElement("small");type.textContent=String(item.type||"CATÁLOGO").toUpperCase();const title=document.createElement("b");title.textContent=item.title||item.name||"Sin título";const desc=document.createElement("p");desc.textContent=item.synopsis||item.description||"Contenido del catálogo JOA";body.append(type,title,desc);article.append(poster,body);grid.append(article)});$("#results-title").textContent="Contenido del catálogo"}catch(error){console.warn("JOA catalog:",error)}}
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