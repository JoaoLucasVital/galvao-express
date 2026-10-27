# Publicação da Galvão Express

O projeto usa Next.js no frontend e nas rotas de backend, com Supabase para o banco PostgreSQL. A mesma base pode ser publicada na Vercel ou na Netlify.

## 1. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie a URL do projeto e a chave secreta do servidor.

## 2. Variáveis obrigatórias

Configure estas variáveis na Vercel ou na Netlify:

- `GALVAO_ACCESS_PIN`: o PIN privado escolhido para entrar
- `GALVAO_SESSION_SECRET`: um texto aleatório longo, com pelo menos 32 caracteres
- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_SECRET_KEY`: chave secreta do Supabase

Nunca use o prefixo `NEXT_PUBLIC_` nessas chaves. Elas devem existir somente no servidor. Não publique seus valores em repositório ou documentação.

## 3. Vercel

1. Envie a pasta para um repositório Git.
2. Importe o repositório na Vercel.
3. Adicione as quatro variáveis em Project Settings > Environment Variables.
4. Faça o deploy. A Vercel detecta o Next.js automaticamente.

## 4. Netlify

1. Envie a pasta para um repositório Git.
2. Importe o repositório na Netlify.
3. Adicione as quatro variáveis em Project configuration > Environment variables.
4. Use `npm run build` como comando de build.
5. Faça o deploy. A Netlify detecta o Next.js e usa seu adaptador oficial.

## Segurança do PIN

O PIN é conferido apenas no backend. Após a entrada correta, o servidor grava um cookie assinado, seguro e inacessível ao JavaScript por 30 dias. As rotas de transportadoras e fretes também verificam esse cookie.
