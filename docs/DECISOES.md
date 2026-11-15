# Decisões tomadas

Registro das decisões de projeto. "Confirmada" indica decisão respondida pelo usuário; as demais foram tomadas sem pergunta, conforme a regra geral da seção 1, e podem ser revistas.

## Fase 1 — Fundação e cadastros (15/11/2026)

### Respostas do usuário às dúvidas do plano

| #   | Dúvida                                           | Decisão                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fase a implementar                               | Fase 1 (confirmada).                                                                                                                                                                                                                                                           |
| 2   | Idioma do código                                 | **Tudo em português**: interface, mensagens, documentação, tabelas, colunas, variáveis e rotas. Ficam em inglês apenas os nomes de pasta definidos na seção 4 (`apps/api`, `packages/shared`…) e nomes exigidos por bibliotecas (`main.ts`, `app.module.ts`, `onModuleInit`…). |
| 3   | Onde a alocação de molde incompatível é recusada | Na criação e na aprovação da ficha técnica (produto + molde + máquina). A Fase 2 reaproveita a mesma função na criação da rodada.                                                                                                                                              |
| 4   | Molde girado 90° entre as colunas                | Aceito, mas nem todo molde permite: o cadastro do molde tem o campo **"Pode ser montado girado 90°"**, informado pelo usuário (padrão: não).                                                                                                                                   |
| 5   | Modalidades de turno                             | Duas modalidades no cadastro de horário: **horário central** (ex.: 08:00 às 17:48, segunda a sexta) e **revezamento** por turnos de letra (ex.: A = 07–19, B = 19–07, C = 07–19, D = 19–07).                                                                                   |
| 6   | Acesso do superusuário                           | Só o que a seção 5 lista; quem precisar de mais acumula perfis.                                                                                                                                                                                                                |
| 7   | Leitura dos cadastros                            | Todos os perfis consultam; só o superusuário altera. Usuários, parâmetros e auditoria são exclusivos do superusuário.                                                                                                                                                          |
| 8   | Cadastro de dispositivo/posto                    | Incluído na Fase 1 (nome, prefixo de 2 caracteres único, descrição).                                                                                                                                                                                                           |
| 9   | Parâmetros iniciais                              | `tolerancia_horario_min` = 10, `visao_recebimento` = AMBAS, `alerta_diferenca_relogio_min` = 5.                                                                                                                                                                                |
| 10  | Primeiro acesso                                  | Usuário `admin@admin.com.br`, senha inicial `12345678910`. Com o cadastro de usuários vazio, esse login cria o superusuário e entra; havendo qualquer usuário, vale a regra normal.                                                                                            |

### Tecnologia

- **Versões** (estáveis em 11/2026): Node.js 22, TypeScript 6.0, NestJS 12 (ESM), Prisma 7.10, PostgreSQL 18, React 19, Vite 8, Mantine 9, TanStack Query 5, React Router 7, Zod 4, Vitest 5, Playwright 1.65.
  - TypeScript 7 (compilador nativo) acabou de sair e ainda não há garantia de suporte aos decorators do NestJS; ficamos no 6.0.
  - Prisma 8 está em versão candidata (RC); usamos a 7.10, a última estável.
- **Testes da API com Vitest** (em vez de Jest): o NestJS 12 é ESM puro e o Jest com ESM é frágil. O plugin SWC gera os metadados de decorators.
- **Biblioteca de componentes:** Mantine (bom suporte a toque, tema com controles em tamanho `md`).
- **Imagem Docker da API em `node:22-alpine`:** o Alpine já traz a libssl 3 que o motor de migrations do Prisma exige, sem precisar do `apt`.
- **Validação compartilhada:** os esquemas Zod de `packages/shared` são usados pela API (pipe `ValidacaoZod`) e pelos formulários, com mensagens em pt-BR (`z.locales.ptBR`).

### Autenticação e segurança

- Token de acesso JWT de 15 minutos e token de renovação opaco de 30 dias, guardado só como hash SHA-256. O token de renovação é trocado (rotação) a cada uso.
- **Sessão por dispositivo:** o navegador gera um identificador (cabeçalho `x-dispositivo`). Novo login no mesmo dispositivo revoga a sessão anterior dele; outros dispositivos continuam conectados.
- Senhas com argon2id. O login não diferencia maiúsculas de minúsculas.
- Usuário criado pelo superusuário, ou com senha redefinida, fica marcado para trocar a senha. A interface exige a troca antes de continuar. O admin inicial também nasce com essa marca.
- Inativar um usuário revoga as sessões dele na hora; o token de acesso ainda válido também para de funcionar, porque toda requisição confere se o usuário está ativo.
- O superusuário não pode inativar a si mesmo nem remover o próprio perfil de superusuário (evita ficar sem administrador).
- **Negar por padrão:** a guarda global recusa (403) qualquer rota sem `@Permissao`, `@ApenasAutenticado` ou `@Publico`. A matriz de permissões está em `packages/shared/src/permissoes.ts`.

### Auditoria

- Grava usuário, data/hora (UTC), entidade, identificador, ação e **somente os campos alterados** (anterior e novo). Senhas e hashes aparecem como `***`.
- Ações registradas: `CRIAR`, `ATUALIZAR`, `ATUALIZAR_CAVIDADES`, `ATUALIZAR_E_REDEFINIR_SENHA`, `TROCAR_SENHA`, `CRIAR_ADMIN_INICIAL`, `NOVA_VERSAO`, `APROVAR`, `REPROVAR`, `OBSOLETAR`, `GERAR` (escala), `CARGA_DADOS_EXEMPLO`.
- Login e logout não entram na auditoria (não são criação nem alteração de cadastro); as sessões ficam registradas na tabela `sessao_dispositivo`.

### Cadastros

- **Cadastros não são excluídos**, são inativados (`ativo`/`ativa`). Isso preserva o histórico e as referências das fases seguintes.
- Alterações via `PUT` com o registro completo, validado pelo mesmo esquema da criação.
- Medidas técnicas (dimensões, forças, pesos, ciclo, PH) são gravadas em ponto flutuante (`double precision`). As quantidades de produção, a partir da Fase 2, serão avaliadas para tipo decimal.
- Equipe: o campo "letra" aceita de 1 a 5 caracteres, para comportar equipes como `ADM` (horário central).
- Horário de turno: horas guardadas como texto `HH:MM` no horário local da fábrica (são horas civis, não instantes). O turno que atravessa a meia-noite tem fim menor que o início.
- Cavidade do molde só aceita produto medido em peças. O número de cavidades do molde não pode ficar abaixo do usado por ficha vigente ou em rascunho.
- O modelo de dados da Fase 1 tem só as tabelas de autenticação, auditoria, parâmetros e cadastros. As tabelas de produção, estoque e manutenção entram por novas migrations nas fases correspondentes.

### Compatibilidade molde × máquina (RN-02)

- A largura do molde é comparada à distância **horizontal** entre colunas, e o comprimento à **vertical**. Com "pode girar" marcado, a orientação girada também é aceita e o resultado avisa que o molde vai girado.
- Limites inclusivos: valor igual ao limite é compatível.
- Dado da máquina não cadastrado conta como falha do critério (a validação de injetora/sopradora já exige todos).
- Extrusora nunca recebe molde.
- Alterar as dimensões de um molde ou de uma máquina não invalida automaticamente as fichas vigentes; a compatibilidade é conferida de novo em cada nova versão aprovada e, na Fase 2, na criação da rodada.

### Fichas técnicas (RN-02 e P9)

- PCP cria e edita rascunhos; superusuário aprova ou reprova com parecer. Reprovada, a ficha continua em rascunho, com o parecer visível, para o PCP corrigir.
- **Um rascunho por combinação** (produto + molde + máquina). Uma nova versão parte de uma cópia da ficha escolhida, normalmente a vigente.
- Produto, molde e máquina não mudam depois de criada a ficha; outra combinação é outra ficha.
- Ao aprovar: a ficha vira vigente com aprovador e data, e a vigente anterior da mesma combinação vira obsoleta (com data), continuando consultável no histórico. A aprovação valida de novo a ficha (compatibilidade e cadastros ativos).
- PH padrão vazio é calculado: 3600 ÷ ciclo × cavidades, com 2 casas, e a ficha registra que foi calculado.
- Extrusão: sem molde, cavidades = 1, PH em kg/h obrigatório, produto em kg. Injetora/sopradora: molde obrigatório, produto em peças, cavidades ≤ cavidades do molde.
- Composição: materiais dos tipos matéria-prima, aditivo, extrusado, moído, reciclado, mistura ou semiacabado; consumo em g/peça e/ou percentual.
- Não há regra de separação de funções para fichas: quem tem os perfis PCP e superusuário pode aprovar a própria ficha.

### Escala

- Duas formas de geração: **revezamento**, com ciclo configurável de dias (botão "Padrão 12x36: A/B, C/D" preenche Dia = A, Noite = B no 1º dia e Dia = C, Noite = D no 2º); e **horário central**, nos dias da semana definidos no horário.
- O turno da noite pertence à data em que começa.
- Uma equipe por horário em cada data. A geração pode substituir a escala existente no período (padrão) ou manter o que já existe. Período máximo de 400 dias por geração.
- O superusuário pode trocar a equipe de um dia específico; a troca é auditada.

### Dados de exemplo e implantação

- A carga de exemplo é idempotente (pode rodar várias vezes) e cria também o admin inicial com a senha `12345678910`. Os demais usuários de exemplo usam a senha `Senha@123`.
- No Docker, a carga roda só na primeira subida (`CARREGAR_DADOS_EXEMPLO=true` e banco sem máquinas). Com `CARREGAR_DADOS_EXEMPLO=false`, o sistema sobe vazio e o primeiro acesso é pelo admin inicial.
- Os parâmetros do sistema são criados pela API na inicialização, se faltarem, sem alterar valores já definidos.
- O `docker-compose.yml` funciona sem `.env`, com valores padrão; em produção é obrigatório definir senha do banco e `JWT_SEGREDO` no `.env`.
- O front-end é servido por nginx, que repassa `/api` para a API. Sem CORS em produção.
- O agente de impressão e os modelos ZPL iniciais (100 × 150 e 100 × 50 mm) ficam para a Fase 3; na Fase 1 existe só o cadastro de layouts e impressoras.
