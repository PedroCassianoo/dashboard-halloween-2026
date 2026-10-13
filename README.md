# 🎃 Halloween Party 2026 · Dashboard de Inscrições

Dashboard analítico de alta performance para monitoramento em tempo real das inscrições e metas da **Halloween Party 2026** (Red Balloon Paulínia).

Desenvolvido para ambiente de produção utilizando **Vite**, **Supabase (PostgreSQL)**, **Chart.js** e hospedado com CI/CD contínuo na **Vercel**.

---

## 🚀 Tecnologias

- **Frontend:** Vanilla JS (ES Modules) com [Vite](https://vitejs.dev/)
- **Visualização de Dados:** [Chart.js](https://www.chartjs.org/)
- **Banco de Dados & Autenticação:** [Supabase](https://supabase.com/) (PostgreSQL + Row Level Security)
- **Hospedagem & CI/CD:** [Vercel](https://vercel.com/)
- **Versionamento:** Git & GitHub

---

## 📋 Funcionalidades

- **Monitoramento em Tempo Real:** Total de inscritos, taxa de adesão por turma e identificação imediata de **Turmas Críticas** (<= 3 inscritos).
- **Base Oficial de Alunos:** Acompanhamento automático das metas por estágio (K1 a T6, totalizando 204 alunos).
- **Parser Inteligente:** Importação rápida de listas coladas em múltiplos formatos (`Nome;Estágio`, vírgula, tabulação ou correspondência automática pela base oficial da escola).
- **Deduplicação Automática:** Prevenção de duplicidades no mesmo estágio e sinalização de nomes repetidos em estágios distintos.
- **Privacidade & Conformidade:** Mascaramento de nomes sensíveis de alunos (`Al••• A.`) na interface com botão de alternância.
- **Modo Offline & Resiliente:** Fallback local inteligente para garantir funcionamento ininterrupto mesmo com oscilações de rede.

---

## 🛠️ Configuração do Ambiente Local

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [Git](https://git-scm.com/)

### 1. Clonar o repositório
```bash
git clone https://github.com/PedroCassianoo/dashboard-halloween-2026.git
cd dashboard-halloween-2026
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Copie o arquivo `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```

Preencha com as credenciais do seu projeto Supabase:
```ini
VITE_SUPABASE_URL=https://txchtfztgxlwzkxxkdnc.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_public_key_aqui
```

### 4. Executar em modo de desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

### 5. Build de Produção
```bash
npm run build
```
Os arquivos otimizados serão gerados na pasta `dist/`.

---

## 🔒 Segurança

- **Row Level Security (RLS):** As tabelas no Supabase possuem políticas granulares ativas que protegem os dados contra alterações não autorizadas.
- **Proteção de Credenciais:** As chaves de serviço de administrador (`service_role`) nunca são expostas no código do cliente; utiliza-se exclusivamente a chave pública restrita (`anon`).
- **Content Security Policy (CSP):** Cabeçalhos rigorosos configurados no `index.html` e `vercel.json` para prevenção de injeção e acessos indevidos.

---

## 📄 Licença
Uso interno — Red Balloon Paulínia · 2026.
