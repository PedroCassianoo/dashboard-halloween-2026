import { createClient } from '@supabase/supabase-js';

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

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
