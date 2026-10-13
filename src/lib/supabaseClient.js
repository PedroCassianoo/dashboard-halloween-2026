import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey.includes('cole_aqui')) {
  console.warn(
    'AVISO: Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local para ativar a persistência em nuvem.'
  );
}

export const supabase = (supabaseUrl && supabaseAnonKey && !supabaseAnonKey.includes('cole_aqui'))
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;
