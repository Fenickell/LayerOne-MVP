# LayerOne MVP

Aplicação web local para gestão de filamentos, estoque visual e precificação de impressão 3D.

## Como iniciar

Opção mais simples:

```text
Clique duas vezes em Iniciar-LayerOne.bat
```

O navegador será aberto automaticamente em:

```text
http://127.0.0.1:8791
```

Mantenha a janela do servidor aberta enquanto estiver usando o sistema. Para encerrar, pressione `Ctrl+C`.

## Alternativa via PowerShell

```powershell
.\start-layerone.ps1
```

## Publicação

O projeto está pronto para o fluxo GitHub + Vercel + Supabase.

1. Rode o SQL `supabase-layerone.sql` no SQL Editor do Supabase.
2. Copie `config.example.js` para `config.js` no uso local e preencha `supabaseUrl` e `supabaseKey`.
3. Na Vercel, configure as variáveis:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

4. Publique o diretório `LayerOne-MVP` na Vercel.

## Observação

Os dados continuam salvos no navegador via `localStorage` quando o Supabase não está configurado. Com Supabase configurado, os filamentos passam a sincronizar com a tabela `layerone_filaments`.
