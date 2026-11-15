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

## Fase 2 — OPs, rodadas e apontamento

### O que foi feito

**`packages/shared`**

- Regras puras com testes de valores conhecidos: marca de horário e período válido (RN-08), conferência de peso (RN-07), código da divisão, horas disponíveis e meta (RN-04), conjuntos e produção do turno (RN-06), linha do tempo da máquina (RN-05), bloqueios de cavidade, tempos, produção esperada ponderada pelas cavidades ativas, OEE, PH real e consumo teórico (seção 10).
- Esquemas Zod de OP, rodada, abertura, divisão, cada tipo de evento e fechamento; layouts de Excel e leitura de valores (datas, números pt-BR, unidades).

**API**

- Migration `fase2_producao`: ordem de produção, rodada, OP da rodada, turno, máquina no turno, divisão, evento, aprovação (pendências), importação e mapeamento de colunas; campo de parada programada prevista no horário de turno.
- OPs (RN-01): digitação, alteração/cancelamento sem apontamento, encerramento, produção acumulada e saldo.
- Importação de OPs e produtos por Excel: modelo para baixar, mapeamento de colunas (superusuário), validação do arquivo inteiro com erros por linha, tudo ou nada, simulação, histórico com arquivo original.
- Rodadas (RN-02/RN-03): compatibilidade, ficha vigente congelada, cavidades por OP, uma única OP na extrusão, encerramento.
- Turnos (RN-04 a RN-08, RN-11, RN-13): abertura com sugestão da escala, ligar máquinas (com herança do turno anterior), divisões com proposta de código/meta e saldo solto, todos os eventos com validação de sequência, NC de peso e marca de horário com pendências, fechamento com decisão por máquina e saldo solto, relatório do turno.
- Dados de exemplo: 7 OPs e 4 rodadas (inclusive a rodada de 3 OPs no MOL-CAD-3 da INJ-01).

**Front-end**

- Ordens de produção, importação de Excel (validar/importar/histórico/mapeamento) e rodadas (cavidades por OP com o produto de cada cavidade).
- **Apontamento para tablet:** abrir turno, cartões por máquina (verde/vermelho/cinza, parada com cronômetro, cavidades bloqueadas, realizado × meta), botões grandes por lançamento, ligar máquina por lista, divisões, fechamento, lista de lançamentos com marcas (retroativo/antecipado, peso NC, AVULSO).
- Turnos e relatório do turno (imprimível).

### Critérios de aceite

| Critério                                                                                                                      | Como foi verificado                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Um turno completo pode ser lançado do início ao fim em tablet, com uma rodada de 3 OPs no mesmo molde                         | Teste de ponta a ponta `apps/web/e2e/fase2.spec.ts` (perfil Galaxy Tab S4): abre o turno, liga a INJ-01, cria as 3 divisões, lança produção, avulso, peso NC, parada/reinício, perda, bloqueio de cavidade, matéria-prima com hora divergente, fecha o turno e confere o relatório. Integração: `apps/api/src/turnos/turnos.test.ts` (18 testes, dois turnos completos). |
| A divisão recebe o código `número do ERP-NN` e a meta calculada                                                               | `turnos.test.ts`: proposta `04508401001-01`, 10 h disponíveis (11 h − 60 min previstos) × PH 60 = 600; segundo turno `04508401001-02`; ajuste de horas recalcula a meta; extrusão sem ERP usa o número interno. Testes puros em `apontamento.test.ts`. Na tela, os botões "Criar divisão 04508401001-01…" mostram código e meta.                                         |
| 3 conjuntos de 30 registram 90 peças; conjunto avulso exige confirmação e aparece destacado                                   | `turnos.test.ts` (90 peças, conjuntos 1–3; avulso sem confirmação → 422, com confirmação marcado como avulso) e ponta a ponta ("Total: 90 peças em 3 conjunto(s)", aviso de confirmação, selo AVULSO na lista e no relatório).                                                                                                                                           |
| O saldo solto deixado em um turno é oferecido na abertura do seguinte, e a produção de cada turno fecha pela fórmula da RN-06 | `turnos.test.ts`: turno 1 deixa 12 → produção 168 + 12 = 180; turno 2 recebe a oferta de 12 (sem confirmar → 422), confirma, etiqueta 30 → produção 30 + 0 − 12 = 18; OP acumulada 198. Ponta a ponta: o segundo apontador vê "O turno anterior deixou 12 peça(s)".                                                                                                      |
| Peso fora da tolerância marca NC e exige justificativa                                                                        | `turnos.test.ts` (400 g contra 383,33 g ± 3% → 422 sem justificativa; com justificativa, NC e pendência PESO) e ponta a ponta (aviso NC, justificativa obrigatória, selo "Peso NC").                                                                                                                                                                                     |
| Lançamento com hora divergente fica marcado como retroativo ou antecipado                                                     | Testes puros (tolerância parametrizável) e `turnos.test.ts` (no momento, antecipado +30 min, início retroativo, pendências HORARIO, fora do período → 422); ponta a ponta com o ajuste de ±20 min.                                                                                                                                                                       |
| Bloquear uma cavidade reduz a produção esperada da OP correspondente                                                          | Teste puro (2 cavidades, 3 h com 1 bloqueada: 2280 → 1920) e `turnos.test.ts` (relatório: esperada da OP com cavidade bloqueada ≈ 90 peças menor, 1,5 h × 60 pç/h; OP de outra cavidade não muda).                                                                                                                                                                       |

### Resultado das verificações finais

- Migrations: `pnpm migrate` sem pendências; aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 61/61, API 81/81, web 3/3, ponta a ponta 7/7 (Fases 1 e 2).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker: imagens reconstruídas e `docker compose up` com volume vazio (duas migrations, dados de exemplo, login, OPs, rodadas, modelo de Excel e tela de apontamento respondendo). Mesma ressalva de rede da sandbox da Fase 1.

### Pendências e observações

- Etiquetas (com código GS1-128, sem QR Code), impressão Zebra, lotes e estoque: **Fase 3**. Os conjuntos e volumes já ficam no evento de saída para gerar as etiquetas.
- Decisão das pendências do líder, correções e aprovação do relatório: **Fase 4**.
- Painel em tempo real e indicadores por período: **Fase 5** (as fórmulas já estão em `packages/shared`).
- Solicitações de manutenção a partir das paradas marcadas: **Fase 6**.
- Lançamento offline e hora do dispositivo: **Fase 7**.
- O OEE de um turno de poucos minutos fica distorcido (produção esperada perto de zero); em turnos reais não ocorre. Performance acima de 100% aparece com alerta (P8).

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
