import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { ALUNOS_OFICIAIS, MAPA_ALUNOS_OFICIAIS, OFICIAIS_POR_ESTAGIO } from '../src/data/alunosOficiais.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Carrega variáveis de ambiente de .env.local ou .env se não estiverem no process.env
function carregarEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const f of envFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    if (fs.existsSync(fullPath)) {
      const conteudo = fs.readFileSync(fullPath, 'utf8');
      for (const linha of conteudo.split(/\r?\n/)) {
        const trimmed = linha.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  }
}
carregarEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\x1b[31m[ERRO] Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas.\x1b[0m');
  console.error('Certifique-se de que o arquivo .env.local existe na raiz do projeto.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ESTAGIOS = ['K1', 'K2', 'J', 'J1', 'J2', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const ESTAGIOS_VALIDOS = new Set(ESTAGIOS);
const BASE_POR_ESTAGIO = {
  K1: 8, K2: 22, J: 24, J1: 27, J2: 30, T1: 24, T2: 24, T3: 26, T4: 7, T5: 7, T6: 5
};
const BASE_TOTAL = 204;

function semAcentos(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarNome(nome) {
  return semAcentos(nome).toLowerCase().replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizarEstagio(txt) {
  return semAcentos(txt).toUpperCase().replace(/[\s\-–—_.]/g, '');
}

const oficialNorms = ALUNOS_OFICIAIS.map(([n, e]) => ({ nome: n, estagio: e, chave: normalizarNome(n) }));

function buscarFuzzyOficial(nomeOuChave) {
  const chave = normalizarNome(nomeOuChave);
  if (MAPA_ALUNOS_OFICIAIS.has(chave)) {
    const ofc = MAPA_ALUNOS_OFICIAIS.get(chave);
    return { nome: ofc.nome, estagio: ofc.estagio, chaveNome: chave };
  }

  const tokens = chave.split(' ').filter(t => t.length > 1);
  if (tokens.length >= 2) {
    const fuzzy = oficialNorms.filter(o => {
      return tokens.every(t => o.chave.includes(t)) || o.chave.includes(chave) || chave.includes(o.chave);
    });
    if (fuzzy.length === 1) return { nome: fuzzy[0].nome, estagio: fuzzy[0].estagio, chaveNome: fuzzy[0].chave };

    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const flMatch = oficialNorms.filter(o => o.chave.startsWith(first) && o.chave.endsWith(last));
    if (flMatch.length === 1) return { nome: flMatch[0].nome, estagio: flMatch[0].estagio, chaveNome: flMatch[0].chave };
  }

  return null;
}

function dividirLinha(linha) {
  if (linha.includes('\t')) return linha.split('\t');
  if (linha.includes(';')) return linha.split(';');
  if (linha.includes(',')) return linha.split(',');
  if (/\s[-–—]\s/.test(linha)) return linha.split(/\s+[-–—]\s+/);

  // Suporte a espaço quando a última ou primeira palavra for um estágio válido
  const partesEspaco = linha.trim().split(/\s+/);
  if (partesEspaco.length >= 2) {
    const ultimo = normalizarEstagio(partesEspaco[partesEspaco.length - 1]);
    const primeiro = normalizarEstagio(partesEspaco[0]);
    if (ESTAGIOS_VALIDOS.has(ultimo)) {
      return [partesEspaco.slice(0, -1).join(' '), partesEspaco[partesEspaco.length - 1]];
    }
    if (ESTAGIOS_VALIDOS.has(primeiro)) {
      return [partesEspaco[0], partesEspaco.slice(1).join(' ')];
    }
  }

  return null;
}

function interpretarLinha(original) {
  const linha = original.replace(/^\uFEFF/, '').trim();
  if (!linha) return null;

  // 1. Tenta identificar diretamente na base oficial da escola (exato ou fuzzy)
  const matchOficial = buscarFuzzyOficial(linha);
  if (matchOficial) {
    return { ok: true, nome: matchOficial.nome, estagio: matchOficial.estagio, chaveNome: matchOficial.chaveNome };
  }

  // 2. Linhas com separadores ou com estágio no final/início
  const partesBrutas = dividirLinha(linha);
  if (!partesBrutas) {
    return { ok: false, linha, motivo: 'Formato não reconhecido (use Nome;Estágio ou nome completo)' };
  }

  const partes = partesBrutas.map(p => p.trim().replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
  if (partes.length < 2) {
    const p0Oficial = buscarFuzzyOficial(partes[0]);
    if (p0Oficial) {
      return { ok: true, nome: p0Oficial.nome, estagio: p0Oficial.estagio, chaveNome: p0Oficial.chaveNome };
    }
    return { ok: false, linha, motivo: 'Falta o nome ou o estágio' };
  }

  const ultimo = normalizarEstagio(partes[partes.length - 1]);
  const primeiro = normalizarEstagio(partes[0]);
  let nome, estagio;

  if (ESTAGIOS_VALIDOS.has(ultimo)) {
    estagio = ultimo;
    nome = partes.slice(0, -1).join(' ');
  } else if (ESTAGIOS_VALIDOS.has(primeiro)) {
    estagio = primeiro;
    nome = partes.slice(1).join(' ');
  } else {
    const t1Oficial = buscarFuzzyOficial(partes.slice(0, -1).join(' '));
    const t2Oficial = buscarFuzzyOficial(partes.slice(1).join(' '));
    if (t1Oficial) {
      return { ok: true, nome: t1Oficial.nome, estagio: t1Oficial.estagio, chaveNome: t1Oficial.chaveNome };
    }
    if (t2Oficial) {
      return { ok: true, nome: t2Oficial.nome, estagio: t2Oficial.estagio, chaveNome: t2Oficial.chaveNome };
    }
    return { ok: false, linha, motivo: `Estágio inválido: "${partes[partes.length - 1]}"` };
  }

  // Se o nome informado bater na base oficial com ligeira variação, adota o nome canônico
  const ofc = buscarFuzzyOficial(nome);
  if (ofc) {
    return { ok: true, nome: ofc.nome, estagio: ofc.estagio || estagio, chaveNome: ofc.chaveNome };
  }

  nome = nome.replace(/\s+/g, ' ').trim();
  const chave = normalizarNome(nome);
  return { ok: true, nome, estagio, chaveNome: chave };
}

async function carregarMapaEstagios() {
  const { data, error } = await supabase.from('stages').select('id, code');
  if (error) {
    throw new Error(`Falha ao obter estágios do banco: ${error.message}`);
  }
  return Object.fromEntries(data.map(s => [s.code, s.id]));
}

async function listarInscritos() {
  console.log('\n\x1b[36m============================================================\x1b[0m');
  console.log('\x1b[1m🎃 RED BALLOON PAULÍNIA · LISTA OFICIAL DE INSCRITOS NA NUVEM\x1b[0m');
  console.log('\x1b[36m============================================================\x1b[0m\n');

  const { data: inscritos, error } = await supabase
    .from('registrations')
    .select(`
      id,
      student_name,
      normalized_name,
      created_at,
      stages:stage_id (code, name, sort_order)
    `)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('\x1b[31m[ERRO] Falha ao consultar inscritos:\x1b[0m', error.message);
    return;
  }

  const total = inscritos.length;
  const pctGeral = ((total / BASE_TOTAL) * 100).toFixed(1);

  console.log(`📊 Total de inscritos: \x1b[1m\x1b[32m${total} de ${BASE_TOTAL} alunos (${pctGeral}%)\x1b[0m`);
  console.log(`🎯 Oportunidades restantes: \x1b[33m${Math.max(0, BASE_TOTAL - total)} alunos\x1b[0m\n`);

  const porEstagio = Object.fromEntries(ESTAGIOS.map(e => [e, []]));
  for (const reg of inscritos) {
    const cod = reg.stages?.code;
    if (cod && porEstagio[cod]) {
      porEstagio[cod].push(reg);
    }
  }

  for (const est of ESTAGIOS) {
    const lista = porEstagio[est] || [];
    const base = BASE_POR_ESTAGIO[est];
    const pctEst = base > 0 ? ((lista.length / base) * 100).toFixed(1) : '0.0';
    const tagCritica = lista.length <= 3 ? ' \x1b[31m[Turma Crítica]\x1b[0m' : '';

    console.log(`\x1b[1m${est}\x1b[0m (${lista.length}/${base} alunos · ${pctEst}%)${tagCritica}`);
    if (lista.length === 0) {
      console.log('   \x1b[90m(Nenhum aluno inscrito ainda)\x1b[0m');
    } else {
      lista.forEach((aluno, i) => {
        console.log(`   ${i + 1}. ${aluno.student_name}`);
      });
    }
    console.log('');
  }
}

async function adicionarInscritos(linhas, substituir = false) {
  if (!linhas || linhas.length === 0) {
    console.log('\x1b[33m[AVISO] Nenhuma linha ou aluno fornecido para inclusão.\x1b[0m');
    return;
  }

  const stageMap = await carregarMapaEstagios();
  const validos = [];
  const erros = [];
  const vistos = new Set();

  for (const raw of linhas) {
    const r = interpretarLinha(raw);
    if (!r) continue;
    if (!r.ok) {
      erros.push(r);
      continue;
    }
    const chaveUnica = `${r.chaveNome}|${r.estagio}`;
    if (vistos.has(chaveUnica)) {
      continue;
    }
    vistos.add(chaveUnica);

    const stageId = stageMap[r.estagio];
    if (!stageId) {
      erros.push({ linha: raw, motivo: `Estágio ${r.estagio} não encontrado no banco` });
      continue;
    }

    validos.push({
      student_name: r.nome,
      normalized_name: r.chaveNome,
      stage_id: stageId
    });
  }

  if (erros.length > 0) {
    console.log(`\n\x1b[33m⚠️ Linhas não reconhecidas (${erros.length}):\x1b[0m`);
    erros.forEach(e => console.log(`   - "${e.linha}": ${e.motivo}`));
  }

  if (validos.length === 0) {
    console.log('\x1b[31m[ERRO] Nenhum aluno válido pôde ser preparado para inserção.\x1b[0m');
    return;
  }

  if (substituir) {
    console.log('\x1b[33m[1/2] Limpando inscrições anteriores para substituição completa...\x1b[0m');
    const { error: delError } = await supabase
      .from('registrations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (delError) {
      console.error('\x1b[31m[ERRO] Falha ao limpar inscrições no banco:\x1b[0m', delError.message);
      return;
    }
  }

  console.log(`\x1b[36m[2/2] Enviando ${validos.length} alunos para o Supabase...\x1b[0m`);
  const LOTE = 100;
  let inseridos = 0;

  for (let i = 0; i < validos.length; i += LOTE) {
    const chunk = validos.slice(i, i + LOTE);
    const { data, error } = await supabase
      .from('registrations')
      .upsert(chunk, {
        onConflict: 'normalized_name,stage_id',
        ignoreDuplicates: true
      })
      .select('id');

    if (error) {
      console.error('\x1b[31m[ERRO] Falha ao inserir lote no Supabase:\x1b[0m', error.message);
      return;
    }
    inseridos += data ? data.length : 0;
  }

  console.log(`\n\x1b[32m✔ SUCESSO! ${inseridos} alunos salvos no Supabase com sucesso.\x1b[0m`);
  console.log('\x1b[90mO dashboard web atualizará automaticamente via Realtime.\x1b[0m\n');
  await listarInscritos();
}

async function removerAluno(nomeOuTermo) {
  if (!nomeOuTermo || !nomeOuTermo.trim()) {
    console.log('\x1b[33m[AVISO] Informe o nome do aluno para remoção.\x1b[0m');
    return;
  }

  const chave = normalizarNome(nomeOuTermo);
  const { data: encontrados, error: searchError } = await supabase
    .from('registrations')
    .select('id, student_name, stages:stage_id(code)')
    .ilike('normalized_name', `%${chave}%`);

  if (searchError) {
    console.error('\x1b[31m[ERRO] Falha ao pesquisar aluno:\x1b[0m', searchError.message);
    return;
  }

  if (!encontrados || encontrados.length === 0) {
    console.log(`\x1b[33mNenhum aluno encontrado com o termo "${nomeOuTermo}".\x1b[0m`);
    return;
  }

  console.log(`\x1b[33mRemovendo ${encontrados.length} registro(s):\x1b[0m`);
  for (const item of encontrados) {
    console.log(` - ${item.student_name} (${item.stages?.code})`);
  }

  const ids = encontrados.map(e => e.id);
  const { error: delError } = await supabase
    .from('registrations')
    .delete()
    .in('id', ids);

  if (delError) {
    console.error('\x1b[31m[ERRO] Falha ao excluir do banco:\x1b[0m', delError.message);
    return;
  }

  console.log('\x1b[32m✔ Aluno(s) removido(s) com sucesso!\x1b[0m\n');
  await listarInscritos();
}

async function limparTodos(confirmado = false) {
  if (!confirmado) {
    console.log('\x1b[31m[ATENÇÃO] Para apagar todos os inscritos na nuvem, passe a flag --confirmar:\x1b[0m');
    console.log('Exemplo: node scripts/gerenciar-inscritos.js --limpar --confirmar');
    return;
  }

  console.log('\x1b[33mLimpando todos os registros na nuvem...\x1b[0m');
  const { error } = await supabase
    .from('registrations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('\x1b[31m[ERRO] Falha ao limpar inscrições:\x1b[0m', error.message);
    return;
  }

  console.log('\x1b[32m✔ Base de inscritos zerada com sucesso no Supabase!\x1b[0m');
}

async function modoInterativo() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n\x1b[35m=== MODO DE ENTRADA MANUAL DE ALUNOS (TERMINAL) ===\x1b[0m');
  console.log('Digite ou cole os alunos inscritos (um por linha).');
  console.log('Formatos aceitos: "Nome do Aluno;Estágio" ou apenas "Nome do Aluno" se estiver na lista da escola.');
  console.log('Pressione ENTER em uma linha vazia (ou digite "salvar") para concluir e enviar à nuvem.\n');

  const linhas = [];

  const perguntar = () => {
    rl.question(`Aluno #${linhas.length + 1} > `, (resposta) => {
      const trimmed = resposta.trim();
      if (!trimmed || trimmed.toLowerCase() === 'salvar' || trimmed.toLowerCase() === 'fim') {
        rl.close();
        if (linhas.length > 0) {
          adicionarInscritos(linhas, false);
        } else {
          console.log('\x1b[33mNenhum aluno informado. Operação cancelada.\x1b[0m');
        }
        return;
      }
      linhas.push(trimmed);
      perguntar();
    });
  };

  perguntar();
}

function exibirAjuda() {
  console.log(`
\x1b[1m🎃 GERENCIADOR DE INSCRITOS · HALLOWEEN PARTY 2026\x1b[0m
Uso direto no terminal:

\x1b[36m1. Listar inscritos atuais na nuvem:\x1b[0m
   node scripts/gerenciar-inscritos.js --listar

\x1b[36m2. Adicionar alunos diretamente pelo terminal:\x1b[0m
   node scripts/gerenciar-inscritos.js --adicionar "Maria Souza;K2" "João Lima;T4"
   (Se o aluno estiver na lista da escola, pode passar só o nome: "Maria Souza")

\x1b[36m3. Modo interativo (digitar linha a linha):\x1b[0m
   node scripts/gerenciar-inscritos.js --interativo

\x1b[36m4. Importar de um arquivo TXT ou CSV:\x1b[0m
   node scripts/gerenciar-inscritos.js --arquivo caminho/lista.txt

\x1b[36m5. Substituir toda a base por um arquivo:\x1b[0m
   node scripts/gerenciar-inscritos.js --substituir --arquivo caminho/lista.txt

\x1b[36m6. Remover um aluno específico:\x1b[0m
   node scripts/gerenciar-inscritos.js --remover "Nome do Aluno"

\x1b[36m7. Limpar todos os inscritos:\x1b[0m
   node scripts/gerenciar-inscritos.js --limpar --confirmar
`);
}

// ========================================================
// Execução dos Comandos
// ========================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--listar') || args.includes('-l')) {
    await listarInscritos();
    exibirAjuda();
    return;
  }

  if (args.includes('--ajuda') || args.includes('-h') || args.includes('--help')) {
    exibirAjuda();
    return;
  }

  if (args.includes('--interativo') || args.includes('-i')) {
    await modoInterativo();
    return;
  }

  if (args.includes('--limpar')) {
    await limparTodos(args.includes('--confirmar'));
    return;
  }

  if (args.includes('--remover') || args.includes('-r')) {
    const idx = args.findIndex(a => a === '--remover' || a === '-r');
    const nome = args[idx + 1];
    await removerAluno(nome);
    return;
  }

  let linhasParaProcessar = [];
  const substituir = args.includes('--substituir') || args.includes('-s');

  const idxArquivo = args.findIndex(a => a === '--arquivo' || a === '-f');
  if (idxArquivo !== -1 && args[idxArquivo + 1]) {
    const filePath = path.resolve(process.cwd(), args[idxArquivo + 1]);
    if (!fs.existsSync(filePath)) {
      console.error(`\x1b[31m[ERRO] Arquivo não encontrado: ${filePath}\x1b[0m`);
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    linhasParaProcessar = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  }

  const idxAdicionar = args.findIndex(a => a === '--adicionar' || a === '-a');
  if (idxAdicionar !== -1) {
    const argsAlunos = args.slice(idxAdicionar + 1).filter(a => !a.startsWith('-'));
    linhasParaProcessar = linhasParaProcessar.concat(argsAlunos);
  }

  if (linhasParaProcessar.length > 0) {
    await adicionarInscritos(linhasParaProcessar, substituir);
    return;
  }

  exibirAjuda();
}

main().catch(err => {
  console.error('\x1b[31m[ERRO INESPERADO]:\x1b[0m', err);
});
