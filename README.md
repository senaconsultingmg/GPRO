# App de Apontamento de Produção

Sistema web de apontamento de produção para fábrica de transformação de plásticos (injetoras, sopradoras e extrusoras). Especificação completa em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md); andamento em [`docs/PROGRESSO.md`](docs/PROGRESSO.md); decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## Subir com Docker

```bash
cp .env.example .env   # troque senhas e JWT_SEGREDO
docker compose up -d --build
```

Acesse `http://localhost:8080` (porta em `PORTA_WEB`). A documentação da API fica em `http://localhost:8080/api/docs`.

Na primeira subida, com `CARREGAR_DADOS_EXEMPLO=true`, o sistema carrega os dados de exemplo. Com `false`, sobe vazio e o primeiro acesso é feito com o usuário inicial abaixo.

## Usuários

| Login                                                    | Senha                                          | Perfil            |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------- |
| `admin@admin.com.br`                                     | `12345678910` (troca obrigatória no 1º acesso) | Superusuário      |
| `pcp@exemplo.com.br`                                     | `Senha@123`                                    | PCP               |
| `apontador@exemplo.com.br` / `apontador2@exemplo.com.br` | `Senha@123`                                    | Apontador         |
| `lider@exemplo.com.br`                                   | `Senha@123`                                    | Líder de produção |
| `estoque@exemplo.com.br`                                 | `Senha@123`                                    | Estoque           |
| `materiaprima@exemplo.com.br`                            | `Senha@123`                                    | Matéria-prima     |
| `manutencao@exemplo.com.br`                              | `Senha@123`                                    | Manutenção        |

Os usuários `@exemplo.com.br` só existem com os dados de exemplo. O `admin@admin.com.br` com a senha inicial também funciona com o cadastro de usuários vazio.

## Desenvolvimento

Requisitos: Node.js 22.12+, pnpm 10 e PostgreSQL.

```bash
pnpm install
```

```bash
echo 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/apontamento' > apps/api/.env
```

```bash
pnpm migrate && pnpm seed
```

```bash
pnpm dev:api    # API em http://localhost:3000/api
```

```bash
pnpm dev:web    # front-end em http://localhost:5173 (proxy para a API)
```

Verificações:

```bash
pnpm test       # unitários e integração (usa o banco apontamento_teste)
```

```bash
pnpm test:e2e   # ponta a ponta com Playwright (usa o banco apontamento_e2e; requer pnpm build antes)
```

```bash
pnpm lint && pnpm typecheck
```

Os bancos de teste podem ser trocados com `DATABASE_URL_TESTE` e `DATABASE_URL_E2E`. Para usar um Chromium já instalado no Playwright, defina `PW_CHROMIUM_PATH`.

## Estrutura

```
apps/api         API NestJS + Prisma (PostgreSQL)
apps/web         front-end React + Vite + Mantine
packages/shared  esquemas Zod, permissões e regras puras (compatibilidade, PH, escala)
docs/            especificação, progresso e decisões
```
