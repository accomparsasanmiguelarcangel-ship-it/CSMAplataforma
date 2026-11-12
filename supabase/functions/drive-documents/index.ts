import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const URL=Deno.env.get('SUPABASE_URL')!, KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ROOT=Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!, EMAIL=Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!, PEM=(Deno.env.get('GOOGLE_PRIVATE_KEY')||'').replace(/\\n/g,'\n'), DRIVE=Deno.env.get('GOOGLE_DRIVE_SHARED_DRIVE_ID')||''
const db=createClient(URL,KEY,{auth:{persistSession:false}})
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const enc=new TextEncoder()
const b64=(s:string)=>btoa(s).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_')
async function token(){
 const now=Math.floor(Date.now()/1000), unsigned=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify({iss:EMAIL,scope:'https://www.googleapis.com/auth/drive.readonly',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now}))
 const pem=PEM.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\s/g,'')
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(unsigned))
 const assertion=unsigned+'.'+btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_')
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})})
 const j=await r.json(); if(!j.access_token) throw new Error('Falló la autenticación con Google Drive.'); return j.access_token as string
}
async function children(t:string,parent:string){
 const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',`'${parent}' in parents and trashed=false`);u.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,modifiedTime)');u.searchParams.set('pageSize','1000');u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');if(DRIVE){u.searchParams.set('corpora','drive');u.searchParams.set('driveId',DRIVE)}
 const out:any[]=[];let page='';do{if(page)u.searchParams.set('pageToken',page);const r=await fetch(u,{headers:{Authorization:`Bearer ${t}`}}),j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Error leyendo Drive');out.push(...(j.files||[]));page=j.nextPageToken||''}while(page);return out
}
async function findFolder(t:string,parent:string,name:string){const a=await children(t,parent);return a.find(x=>x.name===name&&x.mimeType==='application/vnd.google-apps.folder')?.id as string|undefined}
async function uuid(v:string){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)));const s=Array.from(h.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-5'+s.slice(13,16)+'-a'+s.slice(17,20)+'-'+s.slice(20,32)}
const cats:Record<string,string>={ESTATUTOS:'Estatutos',REGLAMENTOS:'Reglamentos internos',COMUNICADOS:'Comunicados',CRONOGRAMAS:'Cronogramas'}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');const {data:u,error}=await db.auth.getUser(jwt);if(error||!u.user)return new Response(JSON.stringify({error:'No autorizado'}),{status:401,headers:cors})
  const {data:p}=await db.from('profiles').select('role,active').eq('id',u.user.id).maybeSingle();if(!p?.active)return new Response(JSON.stringify({error:'Cuenta inactiva'}),{status:403,headers:cors})
  const b=await req.json(),t=await token()
  if(b.action==='sync'){
   if(!['admin','superadmin'].includes(p.role))return new Response(JSON.stringify({error:'Solo la directiva puede sincronizar'}),{status:403,headers:cors})
   const assoc=await findFolder(t,ROOT,'ASOCIACION');if(!assoc)throw new Error('No se encontró ASOCIACION en Drive')
   const root=await findFolder(t,assoc,'03_DOCUMENTACION');if(!root)throw new Error('No se encontró 03_DOCUMENTACION')
   const files:any[]=[]
   const add=async(parent:string,folder:string):Promise<void>=>{for(const x of await children(t,parent)){if(x.mimeType==='application/vnd.google-apps.folder')await add(x.id,x.name);else files.push({id:await uuid('drive:'+x.id),title:x.name.replace(/\\.[^.]+$/,''),category:cats[folder]||'Otros documentos',description:'Documento incorporado desde Google Drive.',drive_file_id:x.id,file_url:null,requires_payment:true,published:true,published_at:x.modifiedTime||new Date().toISOString(),size_label:x.size?Math.max(1,Math.round(Number(x.size)/1024))+' KB':''})}}
   await add(root,'');if(files.length){const {error}=await db.from('documents').upsert(files,{onConflict:'id'});if(error)throw new Error('Error registrando documentos: '+error.message)}
   return new Response(JSON.stringify({ok:true,count:files.length,documents:files}),{headers:{...cors,'Content-Type':'application/json'}})
  }
  if(b.action==='download'){
   const id=String(b.fileId||'');const {data:d}=await db.from('documents').select('drive_file_id,title,published').eq('drive_file_id',id).maybeSingle();if(!d?.published)return new Response(JSON.stringify({error:'Documento no disponible'}),{status:404,headers:cors})
   if(!['admin','superadmin'].includes(p.role)){const {data:part}=await db.from('participants').select('id,status').eq('profile_id',u.user.id).maybeSingle();if(!part||!['inscrito','activo','observado'].includes(part.status))return new Response(JSON.stringify({error:'Debes estar inscrito'}),{status:403,headers:cors});const {count}=await db.from('payments').select('id',{count:'exact',head:true}).eq('participant_id',part.id).eq('status','validado');if(!count||count<1)return new Response(JSON.stringify({error:'Necesitas al menos un pago validado'}),{status:403,headers:cors})}
   const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${t}`}});if(!r.ok)throw new Error('Google Drive no pudo entregar el archivo')
   const h=new Headers(cors);h.set('Content-Type',r.headers.get('Content-Type')||'application/octet-stream');h.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(d.title)}`);h.set('Cache-Control','private, no-store');return new Response(r.body,{headers:h})
  }
  return new Response(JSON.stringify({error:'Acción inválida'}),{status:400,headers:cors})
 }catch(e){const m=e instanceof Error?e.message:String(e);console.error('drive-documents',m);return new Response(JSON.stringify({error:m}),{status:500,headers:{...cors,'Content-Type':'application/json'}})}
})