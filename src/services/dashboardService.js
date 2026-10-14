import { supabase } from '../lib/supabaseClient.js';

/**
 * Retorna se o cliente Supabase está configurado e ativo
 */
export function isCloudConnected() {
  return Boolean(supabase);
}

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
    console.error('[Supabase] Erro ao buscar v_dashboard_summary:', error.message);
    throw new Error('Falha ao carregar métricas do dashboard na nuvem.');
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
    console.error('[Supabase] Erro ao buscar registrations:', error.message);
    throw new Error('Falha ao carregar lista de inscritos da nuvem.');
  }
  return data;
}

/**
 * Busca a lista de estágios com IDs para mapeamento de UUID
 */
export async function getStagesMap() {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('stages')
    .select('id, code');

  if (error) {
    console.error('[Supabase] Erro ao buscar estágios:', error.message);
    throw new Error(`Falha ao obter estágios do banco: ${error.message}`);
  }

  return Object.fromEntries(data.map(s => [s.code, s.id]));
}

/**
 * Limpa completamente a tabela de inscrições no Supabase
 */
export async function clearRegistrations() {
  if (!supabase) return { count: 0, offline: true };

  const { data, error } = await supabase
    .from('registrations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('id');

  if (error) {
    console.error('[Supabase] Erro ao limpar inscrições:', error.message);
    throw new Error(`Erro ao limpar inscrições na nuvem: ${error.message}`);
  }

  return { count: data ? data.length : 0 };
}

/**
 * Substitui o lote completo de inscritos na nuvem:
 * 1. Limpa todas as inscrições atuais da tabela
 * 2. Insere a nova lista em lotes seguros
 */
export async function replaceRegistrationsBatch(inscritos, stageMap = null) {
  if (!supabase) return { count: 0, offline: true };

  // Se stageMap não foi passado ou estiver vazio, busca do banco
  if (!stageMap || Object.keys(stageMap).length === 0) {
    stageMap = await getStagesMap();
  }

  if (!stageMap || Object.keys(stageMap).length === 0) {
    throw new Error('Tabela de estágios vazia ou inacessível no banco de dados.');
  }

  const payload = (inscritos || []).map(item => ({
    student_name: item.nome,
    normalized_name: item.chaveNome,
    stage_id: stageMap[item.estagio]
  })).filter(item => Boolean(item.stage_id));

  if (inscritos && inscritos.length > 0 && payload.length === 0) {
    throw new Error('Nenhuma das inscrições pôde ser vinculada às turmas cadastradas no Supabase.');
  }

  // 1. Apaga os registros existentes
  await clearRegistrations();

  // 2. Se a lista nova estiver vazia, encerra com sucesso (base limpa)
  if (payload.length === 0) {
    return { count: 0 };
  }

  // 3. Insere em chunks de até 100 para evitar limites de requisição
  const TAMANHO_LOTE = 100;
  let totalInseridos = 0;

  for (let i = 0; i < payload.length; i += TAMANHO_LOTE) {
    const chunk = payload.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await supabase
      .from('registrations')
      .insert(chunk)
      .select('id');

    if (error) {
      console.error('[Supabase] Erro ao inserir novo lote substituído:', error.message);
      throw new Error(`Falha ao inserir inscrições no banco: ${error.message}`);
    }

    totalInseridos += data ? data.length : 0;
  }

  return { count: totalInseridos };
}

/**
 * Persiste novos inscritos no Supabase em lote (Batch Upsert incremental)
 */
export async function saveRegistrationsBatch(inscritos, stageMap = null) {
  if (!supabase) return { count: 0, offline: true };
  if (!inscritos || inscritos.length === 0) return { count: 0 };

  if (!stageMap || Object.keys(stageMap).length === 0) {
    stageMap = await getStagesMap();
  }

  if (!stageMap || Object.keys(stageMap).length === 0) {
    throw new Error('Tabela de estágios vazia ou inacessível no banco de dados.');
  }

  const payload = inscritos.map(item => ({
    student_name: item.nome,
    normalized_name: item.chaveNome,
    stage_id: stageMap[item.estagio]
  })).filter(item => Boolean(item.stage_id));

  if (payload.length === 0) {
    throw new Error('Nenhum aluno válido pôde ser associado aos estágios cadastrados no banco.');
  }

  const TAMANHO_LOTE = 100;
  let totalInseridos = 0;

  for (let i = 0; i < payload.length; i += TAMANHO_LOTE) {
    const chunk = payload.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await supabase
      .from('registrations')
      .upsert(chunk, { 
        onConflict: 'normalized_name,stage_id', 
        ignoreDuplicates: true 
      })
      .select('id');

    if (error) {
      console.error('[Supabase] Erro ao persistir lote no Supabase:', error.message);
      throw new Error(`Erro ao salvar dados no Supabase: ${error.message}`);
    }

    totalInseridos += data ? data.length : 0;
  }

  return { count: totalInseridos };
}

/**
 * Assina o canal de tempo real para atualizações na tabela registrations
 * @param {Function} onEvent Callback executado a cada alteração (INSERT, UPDATE, DELETE)
 * @returns {Object|null} Canal do Supabase
 */
export function subscribeToRegistrations(onEvent) {
  if (!supabase) return null;

  const channel = supabase
    .channel('registrations-live-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'registrations' },
      (payload) => {
        if (typeof onEvent === 'function') {
          onEvent(payload);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Supabase Realtime] Canal ativo e sincronizado em tempo real.');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Supabase Realtime] Erro na inscrição do canal:', error);
      }
    });

  return channel;
}

/**
 * Cancela a assinatura do canal Realtime
 */
export function unsubscribeRegistrations(channel) {
  if (!supabase || !channel) return;
  supabase.removeChannel(channel);
}
