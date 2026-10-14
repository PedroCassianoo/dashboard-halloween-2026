/**
 * SERVIÇO DE AUTENTICAÇÃO E CONTROLE DE ACESSO (LGPD)
 * Protege os dados de menores com PIN de acesso da equipe e bloqueio por inatividade/tentativas.
 */

const KEY_SESSION = 'rb_hllwn_auth_session';
const KEY_REMEMBER = 'rb_hllwn_auth_remember';
const KEY_LOCKOUT = 'rb_hllwn_auth_lockout';
const KEY_ATTEMPTS = 'rb_hllwn_auth_attempts';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 segundos de bloqueio após 5 erros
const REMEMBER_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

// Armazenamento em memória caso localStorage/sessionStorage não estejam disponíveis
const memoryStorage = new Map();

function getStorage(type = 'local') {
  try {
    if (typeof window !== 'undefined') {
      const store = type === 'session' ? window.sessionStorage : window.localStorage;
      if (store) return store;
    }
  } catch {
    // fallback
  }
  return {
    getItem: (k) => memoryStorage.get(k) || null,
    setItem: (k, v) => memoryStorage.set(k, String(v)),
    removeItem: (k) => memoryStorage.delete(k)
  };
}

function getEnv(key) {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
}

/**
 * Retorna o PIN oficial configurado (padrão: 2810 para o evento em 28/10)
 */
export function getExpectedPin() {
  const pin = getEnv('VITE_ACCESS_PIN');
  return (pin && String(pin).trim()) || '2810';
}

/**
 * Verifica se o usuário já está autenticado nesta sessão ou dispositivo
 */
export function isUnlocked() {
  const session = getStorage('session');
  const local = getStorage('local');

  try {
    // 1. Verifica sessão ativa na aba atual
    if (session.getItem(KEY_SESSION) === 'true') {
      return true;
    }

    // 2. Verifica token de lembrança no dispositivo (até 24 horas)
    const rememberRaw = local.getItem(KEY_REMEMBER);
    if (rememberRaw) {
      const timestamp = parseInt(rememberRaw, 10);
      if (!isNaN(timestamp) && Date.now() - timestamp < REMEMBER_DURATION_MS) {
        // Renova a sessão atual
        session.setItem(KEY_SESSION, 'true');
        return true;
      } else {
        local.removeItem(KEY_REMEMBER);
      }
    }
  } catch (err) {
    console.warn('[Auth] Erro ao verificar estado de autenticação:', err);
  }

  return false;
}

/**
 * Verifica se o acesso está temporariamente bloqueado por excesso de tentativas
 */
export function checkLockout() {
  const local = getStorage('local');
  try {
    const lockoutUntil = parseInt(local.getItem(KEY_LOCKOUT) || '0', 10);
    const now = Date.now();
    if (lockoutUntil > now) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }
  } catch (err) {
    console.warn('[Auth] Erro ao verificar bloqueio:', err);
  }
  return { locked: false, remainingSeconds: 0 };
}

/**
 * Valida o PIN inserido pelo usuário
 * @param {string} inputPin PIN digitado
 * @param {boolean} remember Se deve lembrar por 24h neste dispositivo
 */
export function verifyPin(inputPin, remember = false) {
  const lockoutStatus = checkLockout();
  if (lockoutStatus.locked) {
    return {
      success: false,
      locked: true,
      remainingSeconds: lockoutStatus.remainingSeconds,
      message: `Muitas tentativas incorretas. Aguarde ${lockoutStatus.remainingSeconds}s.`
    };
  }

  const expected = getExpectedPin();
  const digitado = String(inputPin || '').trim();
  const session = getStorage('session');
  const local = getStorage('local');

  if (digitado === expected) {
    // Sucesso: limpa tentativas e grava sessão
    try {
      local.removeItem(KEY_ATTEMPTS);
      local.removeItem(KEY_LOCKOUT);
      session.setItem(KEY_SESSION, 'true');
      if (remember) {
        local.setItem(KEY_REMEMBER, Date.now().toString());
      } else {
        local.removeItem(KEY_REMEMBER);
      }
    } catch (e) {
      console.warn('[Auth] Falha ao persistir sessão:', e);
    }

    return { success: true };
  }

  // Falha: computa tentativas restantes
  let attempts = 1;
  try {
    attempts = parseInt(local.getItem(KEY_ATTEMPTS) || '0', 10) + 1;
    local.setItem(KEY_ATTEMPTS, attempts.toString());

    if (attempts >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      local.setItem(KEY_LOCKOUT, lockUntil.toString());
      return {
        success: false,
        locked: true,
        remainingSeconds: 30,
        message: 'Acesso bloqueado por 30s devido a 5 tentativas incorretas.'
      };
    }
  } catch (e) {
    console.warn('[Auth] Falha ao computar tentativas:', e);
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
  return {
    success: false,
    locked: false,
    remainingAttempts: remaining,
    message: `PIN incorreto. Você tem mais ${remaining} ${remaining === 1 ? 'tentativa' : 'tentativas'}.`
  };
}

/**
 * Bloqueia o painel imediatamente (limpa credenciais da sessão)
 */
export function lock() {
  const session = getStorage('session');
  const local = getStorage('local');
  try {
    session.removeItem(KEY_SESSION);
    local.removeItem(KEY_REMEMBER);
  } catch (err) {
    console.warn('[Auth] Falha ao bloquear sessão:', err);
  }
  return true;
}
