import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Cuando no existen credenciales de Supabase la aplicación arranca en
 * MODO DEMOSTRACIÓN: misma interfaz, datos semilla en el navegador.
 * La lógica de negocio (estados, saldos, duplicados, QR) es idéntica;
 * las reglas duras viven además en PostgreSQL (ver /supabase/migrations).
 */
export const isDemo = !url || !anonKey || url.includes('TU-PROYECTO')
 console.log(
  'ESTADO DE CONEXIÓN:',
  isDemo ? 'MODO DEMOSTRACIÓN' : 'SUPABASE CONFIGURADO'
 )

export const supabase: SupabaseClient | null = isDemo
  ? null
  : createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

export const uploadsBucket = 'private-files'


if (import.meta.env.DEV && supabase) {
  supabase
    .from('settings')
    .select('id, association_name, code_prefix')
    .eq('id', 'global')
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.error('ERROR CONSULTANDO SUPABASE:', error)
      } else {
        console.log('DATOS RECIBIDOS DE SUPABASE:', data)
      }
    })
}

export async function edgeCall<T>(fn: string, body: FormData | Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(error.message || `Error llamando a ${fn}`)
  return data as T
}
