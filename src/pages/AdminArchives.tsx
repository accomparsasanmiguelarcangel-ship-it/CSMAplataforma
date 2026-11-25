import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Banner, SectionCard } from '../components/ui'

export function AdminParticipantArchives() {
 const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('')
 useEffect(()=>{let alive=true; (async()=>{if(!supabase){setError('Supabase no está conectado.');setLoading(false);return} const {data,error}=await supabase.rpc('admin_list_participant_archives'); if(!alive)return; if(error)setError(error.message);else setRows(data||[]);setLoading(false)})();return()=>{alive=false}},[])
 return <div className="page"><div className="page-head"><div><h1>Expedientes de bajas</h1><p className="lead">Archivo histórico de participantes dados de baja.</p></div></div>{error&&<Banner tone="bad" title="No se pudo cargar el archivo">{error}</Banner>}<SectionCard pad0>{loading?<p style={{padding:16}}>Cargando expedientes…</p>:rows.length===0?<p style={{padding:16}}>No hay expedientes archivados.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Código</th><th>DNI</th><th>Correo</th><th>Expediente</th></tr></thead><tbody>{rows.map(r=><tr key={r.archive_id}><td className="tiny">{r.archived_at?new Date(r.archived_at).toLocaleString('es-PE'):''}</td><td className="mono">{r.participant_code||'—'}</td><td className="mono">{r.dni||'—'}</td><td>{r.email||'—'}</td><td><details><summary>Ver datos archivados</summary><pre style={{whiteSpace:'pre-wrap',maxWidth:700,overflowX:'auto'}}>{JSON.stringify(r.dossier,null,2)}</pre></details></td></tr>)}</tbody></table></div>}</SectionCard></div>
}
