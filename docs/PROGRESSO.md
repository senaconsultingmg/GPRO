# Progresso

| Fase                                             | Situação     | Data       |
| ------------------------------------------------ | ------------ | ---------- |
| 1 — Fundação e cadastros                         | Concluída    | 15/11/2026 |
| 2 — OPs, rodadas e apontamento                   | Não iniciada |            |
| 3 — Etiquetas, matéria-prima e estoque           | Não iniciada |            |
| 4 — Correções, aprovações, apuração e exportação | Não iniciada |            |
| 5 — Painéis e indicadores                        | Não iniciada |            |
| 6 — Manutenção                                   | Não iniciada |            |
| 7 — Offline e implantação                        | Não iniciada |            |

## Fase 1 — Fundação e cadastros

### O que foi feito

**Estrutura**

- Monorepo pnpm: `apps/api` (NestJS + Prisma), `apps/web` (React + Vite + Mantine), `packages/shared` (esquemas Zod, permissões, compatibilidade, PH, escala, datas).
- `docker-compose.yml` com `db` (PostgreSQL 18), `api` e `web` (nginx com proxy para `/api`). A API aplica as migrations ao subir e carrega os dados de exemplo na primeira subida.
- Migration inicial versionada em `apps/api/prisma/migrations`.
- ESLint, Prettier, typecheck e testes em todos os pacotes.

**API** (`/api`, documentação OpenAPI em `/api/docs`)

- Autenticação: login, renovação com rotação, saída, `/eu`, troca de senha, sessão por dispositivo, admin inicial com cadastro vazio.
- Guarda global que nega por padrão + matriz de permissões por perfil (seção 5).
- Auditoria com valor anterior e novo em todas as criações e alterações; consulta com filtros.
- Parâmetros do sistema editáveis, validados pelo tipo.
- CRUD auditado de: horários de turno, equipes, máquinas, moldes (com cavidades), produtos, conjuntos padrão, motivos de parada, tipos de perda, locais de estoque, impressoras, layouts de etiqueta, dispositivos (postos) e usuários.
- Compatibilidade molde × máquina (RN-02): rota `GET /moldes/:id/compatibilidade` com o critério que falhou.
- Fichas técnicas versionadas: rascunho → aprovação (superusuário) → vigente; a anterior fica obsoleta; nova versão, reprovação com parecer, histórico; PH calculado.
- Escala: geração 12x36 (ciclo configurável) e de horário central, troca de equipe por dia.
- Carga de dados de exemplo: 3 injetoras, 1 sopradora, 1 extrusora, 4 moldes, 13 produtos, conjuntos, 7 fichas vigentes, usuários de cada perfil, motivos de parada, tipos de perda, locais, impressoras, dispositivos e escala de 60 dias.

**Front-end**

- Login, troca obrigatória da senha inicial, menu filtrado pelo perfil, rotas protegidas.
- Telas de todos os cadastros (lista com busca, inativos, formulário com validação compartilhada).
- Molde: cavidades com o produto de cada uma e tabela de máquinas compatíveis/incompatíveis com o critério.
- Fichas técnicas: filtros, formulário com aviso imediato de incompatibilidade e PH sugerido, detalhes, histórico de versões, nova versão, aprovar/reprovar.
- Escala mensal por horário e equipe, geração (revezamento ou central) e troca de equipe por dia.
- Parâmetros e auditoria (filtros por entidade, usuário e período; anterior → novo).

### Critérios de aceite

| Critério                                                                          | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker compose up` sobe o sistema completo em uma máquina limpa                  | Imagens construídas e `docker compose up` com volume vazio: banco saudável, migrations aplicadas, dados de exemplo carregados, API saudável, front-end respondendo em `http://localhost:8080` (inclusive rota interna `/fichas-tecnicas`), `/api/docs` disponível, login funcionando. Ao reiniciar, a carga não se repete. Com `CARREGAR_DADOS_EXEMPLO=false`, o sistema sobe vazio e o admin inicial entra. **Ressalva:** nesta sandbox de desenvolvimento os containers não acessam a internet diretamente; o build foi feito com uma configuração temporária de proxy fora do repositório. Os Dockerfiles do projeto não foram alterados para isso. |
| Cada perfil só acessa o que a seção 5 permite; rota sem permissão retorna erro    | `apps/api/src/comum/permissoes.test.ts`: os 7 perfis × todas as rotas de leitura (200); as rotas restritas devolvem 403 para cada perfil não autorizado e passam da guarda para o autorizado; perfis acumulados somam permissões; uma rota sem permissão declarada devolve 403 até para o superusuário (negar por padrão); sem token, 401. Teste de ponta a ponta: o PCP não vê Usuários/Auditoria no menu e é redirecionado ao abrir `/usuarios`.                                                                                                                                                                                                     |
| Alocar molde em máquina incompatível é recusado, com o critério que falhou        | `packages/shared/src/compatibilidade.test.ts` (cada critério isolado, limites, giro permitido/não permitido, extrusora, dado ausente); `apps/api/src/fichas/fichas.test.ts` (ficha MES-0010 + MOL-MES-1 + INJ-01 → 422 com os critérios COLUNAS, ALTURA_MOLDE, PESO_MOLDE, FORCA_FECHAMENTO, CAPACIDADE_INJECAO; tela do molde lista compatíveis e incompatíveis); ponta a ponta: a gaveta do molde mostra o critério, e o formulário da ficha avisa e mostra a recusa da API.                                                                                                                                                                         |
| Alterar ficha vigente cria nova versão; a anterior fica consultável como obsoleta | `fichas.test.ts`: editar a vigente → 409; "nova versão" cria v2 em rascunho (segundo rascunho → 409); edição do rascunho; PCP não aprova (403); superusuário aprova → v2 vigente, v1 obsoleta com data e consultável; histórico `2:VIGENTE, 1:OBSOLETA`; auditoria `NOVA_VERSAO, ATUALIZAR, OBSOLETAR, APROVAR`.                                                                                                                                                                                                                                                                                                                                       |
| Toda alteração de cadastro aparece na auditoria                                   | `apps/api/src/cadastros/cadastros.test.ts`: para os 12 cadastros genéricos, criar e alterar geram `CRIAR`/`ATUALIZAR` com usuário e campo anterior/novo, também pela rota `/api/auditoria`. Cobertos também usuários (senha mascarada), parâmetros, escala, cavidades do molde e fichas. Ponta a ponta: produto criado na tela aparece na página de auditoria.                                                                                                                                                                                                                                                                                         |

### Resultado das verificações finais

- Migrations: `pnpm migrate` → nenhuma pendente (banco de desenvolvimento); aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 29/29, API 47/47 (integração com PostgreSQL), web 3/3, ponta a ponta 4/4 (Playwright, perfil tablet).
- Lint: ESLint sem problemas (75 arquivos); Prettier sem diferenças; typecheck sem erros nos 3 pacotes.

### Pendências e observações

- O build Docker em uma máquina realmente limpa, com acesso direto à internet, não pôde ser feito nesta sandbox (ver ressalva acima). Vale rodar `docker compose up --build` uma vez no servidor de destino.
- Modelos ZPL iniciais (100 × 150 e 100 × 50 mm por tipo), impressão de teste e agente de impressão: **Fase 3** (a Fase 1 entrega só os cadastros de impressora e layout).
- PWA instalável, rotina de backup e guias de instalação: **Fase 7**.
- Sugestão automática de horário/equipe pela escala na abertura do turno: **Fase 2** (RN-04); a escala já está cadastrada e pode ser consultada.
- Importação de produtos e OPs por Excel com mapeamento de colunas: **Fase 2**.
- O pacote JS do front-end tem cerca de 1 MB (aviso do Vite); a divisão de código por rota pode entrar quando houver mais telas.
- Mantenha o `JWT_SEGREDO` e as senhas do banco no `.env` em produção (o compose tem valores padrão só para a primeira subida).
