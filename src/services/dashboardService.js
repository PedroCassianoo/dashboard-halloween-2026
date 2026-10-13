import { supabase } from '../lib/supabaseClient.js';

/**
 * Busca todas as métricas agregadas da View SQL em tempo real
 */
export async function getDashboardSummary() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('v_dashboard_summary')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Erro ao buscar v_dashboard_summary:', error.message);
    throw new Error('Falha ao carregar métricas do dashboard.');
  }
  return data;
}

/**
 * Busca a lista completa de inscritos com dados de turma
 */
export async function getRegistrations() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('registrations')
    .select(`
      id,
      student_name,
      normalized_name,
      created_at,
      stages:stage_id (code, name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar registrations:', error.message);
    throw new Error('Falha ao carregar lista de inscritos.');
  }
  return data;
}

/**
 * Persiste novos inscritos no Supabase em lote (Batch Upsert)
 */
export async function saveRegistrationsBatch(inscritos, stageMap) {
  if (!supabase) return { count: 0, offline: true };
  if (!inscritos || inscritos.length === 0) return { count: 0 };

  const payload = inscritos.map(item => ({
    student_name: item.nome,
    normalized_name: item.chaveNome,
    stage_id: stageMap[item.estagio]
  })).filter(item => Boolean(item.stage_id));

  const { data, error } = await supabase
    .from('registrations')
    .upsert(payload, { 
      onConflict: 'normalized_name,stage_id', 
      ignoreDuplicates: true 
    })
    .select('id');

  if (error) {
    console.error('Erro ao persistir lote no Supabase:', error.message);
    throw new Error(`Erro ao salvar dados: ${error.message}`);
  }

  return { count: data ? data.length : 0 };
}

/**
 * Busca a lista de estágios com IDs para mapeamento rápido de UUID
 */
export async function getStagesMap() {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('stages')
    .select('id, code');

  if (error) throw error;
  return Object.fromEntries(data.map(s => [s.code, s.id]));
}
