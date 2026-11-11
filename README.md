# Vendas CRM (Kind Connect)

CRM de vendas das lojas **Incoplim**, **Bem Limp** e **Cometa**. Serve para cadastrar clientes, registrar visitas e ligações, agendar retornos, registrar vendas e fazer o pós-venda.

- **Vendedor:** vê só os próprios clientes.
- **Administrador** (rudneybozo@gmail.com): vê tudo, filtra por loja e por vendedor, libera e exclui usuários e gerencia as lojas.

O app roda no navegador (computador ou celular). Os dados ficam no **Supabase** e o site fica hospedado na **Vercel**. Os planos gratuitos dos dois bastam para começar.

---

## Colocar no ar (uma vez só, uns 20 minutos)

### 1. Criar o banco de dados (Supabase)

1. Entre em <https://supabase.com> e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New project**:
   - Nome: `vendas-crm`
   - Senha do banco: crie uma forte e **guarde**
   - Região: **South America (São Paulo)**
3. Espere o projeto ficar pronto (1–2 minutos).
4. No menu da esquerda, abra **SQL Editor → New query**.
5. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste repositório, copie **tudo**, cole no editor e clique em **Run**. Deve aparecer "Success".
   - Isso cria as tabelas, as 3 lojas e todas as regras de segurança.
   - Pode rodar de novo sem problema, porque o script não duplica nada.
6. Em **Project Settings → API** (ou **Data API**), copie dois valores:
   - **Project URL**, algo como `https://abcd.supabase.co`
   - **anon public key** (ou **publishable key**)

**Recomendado:** em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. Como você já libera cada vendedor manualmente, a confirmação por email só atrapalha. O plano gratuito também só envia poucos emails por hora.

### 2. Publicar o site (Vercel)

1. Entre em <https://vercel.com> com a sua conta do GitHub.
2. Clique em **Add New → Project** e importe o repositório `kind-connect-21`.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione:

   | Nome                            | Valor                    |
   | ------------------------------- | ------------------------ |
   | `VITE_SUPABASE_URL`             | o Project URL do passo 1 |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | a chave anon/publishable |

4. Clique em **Deploy**. Em cerca de 1 minuto você recebe o endereço, algo como `https://kind-connect-21.vercel.app`.

### 3. Ligar o endereço do site ao Supabase

No Supabase, abra **Authentication → URL Configuration**:

- **Site URL:** o endereço da Vercel, por exemplo `https://kind-connect-21.vercel.app`
- **Redirect URLs:** adicione `https://kind-connect-21.vercel.app/**`

Sem isso, os links de "esqueci minha senha" não funcionam.

### 4. Primeiro acesso

1. Abra o site e vá em **Criar conta** com **rudneybozo@gmail.com**. Essa conta já nasce como **Administrador** e liberada.
2. Peça para cada vendedor abrir o site e clicar em **Criar conta**, informando nome e loja.
3. Os vendedores aparecem em **Equipe e lojas** como "Aguardando liberação". Confira a loja e clique em **Liberar acesso**.

Dica: no celular, abra o site no Chrome e use **Adicionar à tela inicial**. Ele passa a funcionar como um aplicativo.

---

## Como funciona

| Tela                 | Quem vê    | O que faz                                                                                                                           |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Painel**           | Todos      | Retornos atrasados e próximos, pós-vendas pendentes, total vendido no mês. O admin filtra por loja e vendedor.                      |
| **Clientes**         | Todos      | Lista, busca, ordenação e cadastro. O admin vê a loja e o vendedor de cada cliente.                                                 |
| **Ficha do cliente** | Todos      | Dados, WhatsApp e mapa com um toque, visitas e contatos, vendas, editar e excluir.                                                  |
| **Equipe e lojas**   | Só o admin | Liberar e bloquear usuários, trocar loja e papel, excluir (com opção de transferir os clientes), criar, renomear e desativar lojas. |

**Regras de segurança.** Ficam no banco de dados, então valem mesmo se alguém tentar burlar o site:

- Um vendedor não vê nem altera clientes, visitas ou vendas de outro vendedor.
- Uma conta nova não acessa nada até o admin liberar.
- Só o admin altera usuários e lojas. O admin não consegue remover o próprio acesso por engano.

---

## Mudanças em relação à versão do Lovable

- O app não depende mais do Lovable. É um site comum (Vite + React) que funciona em qualquer hospedagem.
- **Corrigido:** o botão "Novo cliente" e o link "Clientes" mostravam o Painel. A estrutura de páginas estava errada.
- **Corrigido:** problemas de login causados pela renderização no servidor, que foi removida.
- **Novo:** lojas (departamentos), papéis de administrador e vendedor, liberação de novos usuários, filtros por loja e vendedor, tela Equipe e lojas, edição de cliente, exclusão de visitas e vendas, "esqueci minha senha", valores em R$, botões de WhatsApp e mapa, total vendido no mês.
- O arquivo `.env` com chaves saiu do repositório.

> Os dados que estavam no banco do Lovable Cloud **não** vêm junto. O novo Supabase começa vazio.

---

## Para desenvolvedores

```bash
npm install
cp .env.example .env   # preencha com os dados do Supabase
npm run dev            # http://localhost:5173
npm run build          # gera a pasta dist/
npm run typecheck
```

- Rotas: `src/routes` (TanStack Router, baseado em arquivos; `routeTree.gen.ts` é gerado automaticamente)
- Banco: `supabase/schema.sql` (tabelas, RLS e funções `admin_*`); tipos em `src/integrations/supabase/types.ts`
- Componentes de interface: shadcn/ui em `src/components/ui`
