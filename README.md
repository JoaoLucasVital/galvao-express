# Galvão Express

Sistema financeiro e operacional mobile-first para gestão pessoal de fretes, comissões, voltas vazias e despesas de viagem.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Production-000000?logo=vercel)](https://vercel.com/)

![Visão do Galvão Express](public/og-v2.png)

## Visão geral

O Galvão Express reúne em uma única aplicação:

- cadastro e acompanhamento de fretes;
- comissão automática por tipo de equipamento;
- registro de ajuda de custo para volta vazia com valor informado por viagem;
- controle de despesas por categoria;
- indicadores mensais de entradas, gastos e saldo;
- transportadoras editáveis;
- relatórios por período em PDF e XLSX;
- temas claro e escuro com interface otimizada para celular.

## Regras operacionais

| Equipamento | Comissão sobre o frete |
| --- | ---: |
| Bitrem 30 metros | 13% |
| Carreta LS | 15% |

A volta vazia não possui preço fixo: o valor recebido é informado no momento do cadastro da viagem.

## Arquitetura

- **Aplicação:** Next.js App Router e React.
- **Linguagem:** TypeScript.
- **Banco:** PostgreSQL no Supabase.
- **Backend:** Route Handlers do Next.js executados no servidor.
- **Autorização:** PIN validado no servidor e sessão em cookie assinado, `HttpOnly`, `Secure` e `SameSite=Strict`.
- **Relatórios:** jsPDF, AutoTable e `write-excel-file`.
- **Animações:** Motion e GSAP.
- **Hospedagem:** Vercel.

O navegador chama apenas rotas relativas da própria aplicação, como `/api/freights`. A chave administrativa do Supabase nunca é enviada ao frontend.

## Segurança

- Rotas de fretes, despesas e transportadoras exigem uma sessão válida antes de acessar o banco.
- PIN, segredo de sessão e chave do Supabase usam variáveis exclusivas do servidor.
- Erros internos do banco são registrados no servidor e convertidos em mensagens genéricas para o cliente.
- O projeto envia cabeçalhos contra framing, sniffing de conteúdo e acesso indevido a câmera, microfone ou localização.
- `.env.local`, `.vercel`, `.netlify`, builds, dependências e documentos internos são ignorados pelo Git.
- A suíte `npm run security:check` verifica automaticamente a fronteira entre cliente, servidor e arquivos privados.

> Caminhos de API não são segredos: qualquer navegador consegue observar as requisições que realiza. A proteção está na autenticação da rota e em manter credenciais somente no servidor.

## Pré-requisitos

- Node.js 20.9 ou superior;
- npm;
- projeto Supabase;
- conta Vercel para hospedagem.

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie o arquivo de exemplo:

   ```bash
   cp .env.example .env.local
   ```

   No PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Configure `.env.local`:

   ```dotenv
   GALVAO_ACCESS_PIN=seu-pin
   GALVAO_SESSION_SECRET=um-segredo-longo-e-aleatorio
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_sua-chave-secreta
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_DRIVER_NAME=Motorista Galvão Express
   ```

4. No SQL Editor do Supabase, execute primeiro `supabase/schema.sql`. Para bancos existentes, aplique os arquivos de `supabase/migrations/` em ordem cronológica.

5. Inicie o projeto:

   ```bash
   npm run dev
   ```

6. Acesse `http://localhost:3000`.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | inicia o ambiente local |
| `npm run lint` | valida o código com ESLint |
| `npm test` | executa os testes de segurança |
| `npm run security:check` | audita a fronteira pública do projeto |
| `npm run build` | gera a compilação de produção |
| `npm start` | executa a compilação gerada |

## Deploy na Vercel

1. Importe este repositório na Vercel.
2. Cadastre as variáveis de `.env.example` em **Project Settings → Environment Variables**.
3. Use `npm run build` como comando de build.
4. Publique e valide o login, os CRUDs e a geração de relatórios.

Nunca copie os valores reais das variáveis para o GitHub, para o README ou para variáveis iniciadas por `NEXT_PUBLIC_`.

## Estrutura principal

```text
app/
  api/                 rotas protegidas executadas no servidor
  Dashboard.tsx        dashboard, fretes, transportadoras e relatórios
  ExpensesModule.tsx   controle de despesas
lib/
  pin-auth.ts          assinatura e validação da sessão
  supabase-admin.ts    cliente administrativo exclusivo do servidor
  freight-types.ts     regras de fretes e comissões
  expense-types.ts     categorias e tipos de despesas
supabase/
  schema.sql           esquema inicial
  migrations/          evoluções do banco
tests/security/        verificações da fronteira pública
```

## Escopo

Este projeto foi criado para uso interno e compartilhado por PIN. Não inclui cadastro público, múltiplos usuários, cobrança ou pagamentos.
