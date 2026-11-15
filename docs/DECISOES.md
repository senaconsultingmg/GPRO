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

## Fase 2 — OPs, rodadas e apontamento (15/11/2026)

### Respostas do usuário às dúvidas do plano

| #   | Dúvida                                                | Decisão                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Etiquetas na Fase 2                                   | Os conjuntos (número, quantidade, marca de avulso) ficam gravados no evento de saída; etiqueta e código são gerados na Fase 3 a partir deles. **Mudança na seção 8 (P15): sem QR Code; o código da etiqueta usa código de barras GS1-128 (EAN-128).** (confirmada) |
| 2   | Matéria-prima, semiacabado, devolução e transferência | Lançados com material e lote digitados e quantidade (kg; semiacabado em peças), sem movimentar estoque. A Fase 3 liga aos lotes e etiquetas. (confirmada)                                                                                                          |
| 3   | Paradas programadas previstas (RN-04)                 | Novo campo "parada programada prevista (min)" no horário de turno. Horas disponíveis = do início da máquina (ou do início nominal) ao fim nominal − essa previsão; o apontador pode ajustar. Dados de exemplo: 60 min. (confirmada)                                |
| 4   | Período válido da hora da ocorrência (RN-08)          | Do início nominal do horário (ou da abertura, se antes) ao fim nominal, estendido até o fechamento real (ou até agora, com o turno aberto). (confirmada)                                                                                                           |
| 5   | OEE e PH no relatório                                 | Tempos, produção esperada, OEE e PH implementados em `packages/shared` e usados no relatório; a Fase 5 reaproveita para os painéis. (confirmada)                                                                                                                   |
| 6   | Cavidades da OP na rodada                             | Cada cavidade atribuída deve produzir o produto da OP (quando o molde define), nenhuma cavidade em duas OPs e a quantidade igual às cavidades da ficha vigente. (confirmada)                                                                                       |
| 7   | Encerrar rodada e OP                                  | O PCP encerra manualmente. A meta nunca passa do saldo; produção além do saldo é aceita com aviso. (confirmada)                                                                                                                                                    |
| 8   | Parada aberta no fechamento                           | É encerrada pela hora do fechamento (para os tempos). Se a máquina segue rodando, o próximo turno oferece iniciar já parada com o mesmo motivo. (confirmada)                                                                                                       |
| 9   | Pendências do líder                                   | Criadas e exibidas no relatório (peso fora da tolerância, lançamento fora de hora); decisão na Fase 4. (confirmada)                                                                                                                                                |
| 10  | Parada que gera manutenção                            | A parada guarda a marca `geraSolicitacaoManutencao`; as solicitações são criadas na Fase 6. (confirmada)                                                                                                                                                           |
| 11  | Vários apontadores                                    | Um turno aberto por apontador; cada máquina em um único turno aberto; o apontador só lança no próprio turno. (confirmada)                                                                                                                                          |

### Ordens e rodadas

- OP de produção exige produto acabado ou semiacabado; OP de extrusão exige produto em kg (extrusado). A unidade da OP é a do produto.
- Código da divisão: número do ERP + "-" + sequencial de 2 dígitos; OP de extrusão sem número do ERP usa o número interno.
- OP só é alterada ou cancelada enquanto estiver aberta e sem divisão; a primeira divisão muda a OP para "em produção". OP encerrada ou cancelada recusa novos lançamentos.
- Uma OP não entra em duas rodadas não encerradas ao mesmo tempo.
- A rodada passa a "em andamento" quando a máquina é ligada com ela; o PCP só encerra a rodada fora de turno aberto. A máquina não aceita outra rodada em andamento.
- A produção acumulada da OP é sempre calculada dos eventos (saídas + saldo deixado − saldo recebido), nunca guardada.

### Importação de Excel

- Biblioteca `exceljs`. A primeira planilha do arquivo é lida; a linha 1 é o cabeçalho, comparado sem diferenciar maiúsculas e acentos.
- Aceita unidade PC/PÇ/UN/PEÇA/KG, tipos e embalagens pelo código ou pelo rótulo, datas dd/mm/aaaa ou data do Excel, números em pt-BR ("1.500,5"). Data inexistente (31/02) é recusada.
- A importação de OPs cria somente OPs de produção. Produtos podem ser importados pelo PCP e pelo superusuário; o conjunto padrão informado é criado ou atualizado.
- "Validar" simula sem gravar. Toda importação efetiva fica registrada com usuário, data, arquivo original (baixável) e resultado; as recusadas também.
- O modelo baixado formata as colunas de código como texto (zeros à esquerda). Número digitado como número no Excel perde os zeros à esquerda — orientar o uso do modelo.

### Apontamento

- **Hora do registro** é a do servidor no momento do recebimento (online). A hora do dispositivo para lançamentos offline entra na Fase 7.
- O campo de hora mostra dd/mm/aaaa hh:mm (24 h) com botões −10/−1/Agora/+1/+10 min. Sem edição, o lançamento usa a hora exata (com segundos); eventos no mesmo instante são ordenados pela ordem de registro.
- Validações de sequência por máquina e turno: início → (parada → reinício)* → fim; paradas não se sobrepõem; saída de produção só com a máquina ligada e fora de parada (inclusive para lançamentos retroativos, que não podem "engolir" uma saída já lançada).
- Bloqueios de cavidade pertencem à rodada e atravessam turnos; desbloqueio só de cavidade bloqueada.
- Saída em injetora/sopradora: conjunto padrão do produto (escolhido automaticamente quando há um só), N conjuntos padrão + conjuntos avulsos (confirmação obrigatória), peso médio obrigatório. Extrusora: volumes com peso digitado e operador obrigatório.
- Perda: tipo + kg e/ou peças. Refugo (tipos marcados) entra na Qualidade do OEE.
- Transferência: o destino é uma divisão de outra máquina em turno aberto; sai do consumo da OP de origem e entra no da de destino.
- Saldo solto: informado no fechamento (só OP em peças); na divisão seguinte da mesma OP o novo apontador confirma a quantidade recebida (pode diferir do deixado).
- Ligar máquina que seguia rodando sugere a hora exata de fechamento do turno anterior.
- O identificador de cada evento é gerado no dispositivo; reenviar o mesmo identificador devolve o registro existente ("duplicado").
- Produção esperada: horas produzindo × PH da ficha congelada na rodada × (cavidades ativas ÷ cavidades da OP) em cada trecho.
- Consumo teórico: g/peça × produção total (boas + refugadas); percentual sobre o peso produzido.

## Fase 3 — Etiquetas, matéria-prima e estoque (15/11/2026)

### Respostas do usuário às dúvidas do plano (todas confirmadas)

| #   | Dúvida                                  | Decisão                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Conteúdo do código de barras            | **GS1-128** (sem QR Code), sem depender de prefixo GS1: (21) nº de série = código da etiqueta; (240) código do produto; (37) quantidade em peças **ou** (310n) peso líquido em kg; (11) data de produção; (10) lote. O texto legível com os AIs entre parênteses sai abaixo das barras; o código da etiqueta sai grande. |
| 2   | Sequência por posto                     | Cada tablet/PC é vinculado a um dispositivo do cadastro na tela "Configurar este posto"; o servidor mantém o contador por dispositivo (cabeçalho `x-posto`). Na Fase 7 o dispositivo passará a reservar blocos de números.                                                                                               |
| 3   | Quem imprime                            | O navegador envia o ZPL ao agente de impressão da rede local. O agente aceita HTTPS opcional (`AGENTE_TLS_CERT`/`AGENTE_TLS_KEY`), necessário quando a aplicação está na nuvem com HTTPS.                                                                                                                                |
| 4   | Número do lote                          | Interno e automático para todo lote: `L` + AAMMDD + `-` + sequência do dia (ex.: L261115-003). O lote do fornecedor fica em campo próprio.                                                                                                                                                                               |
| 5   | Extrusão                                | O setor de matéria-prima cria OP de extrusão (sem número do ERP) e rodada de extrusora. Cada volume gera etiqueta; os volumes da mesma divisão formam um lote de extrusado; o saldo entra quando o setor lê a etiqueta e escolhe o local.                                                                                |
| 6   | Devolução e transferência               | Devolução gera etiqueta e só volta ao saldo do lote quando o setor de matéria-prima lê a etiqueta. Transferência entre máquinas gera etiqueta e não passa pelo estoque (sai do consumo da OP de origem e entra na de destino).                                                                                           |
| 7   | Entrada na produção                     | O apontador lê a etiqueta do lote/mistura (ou digita o número do lote) e informa os kg; o estoque é baixado dos locais do lote (maior saldo primeiro); saldo insuficiente é recusado. Semiacabado: lê a etiqueta; ela fica **CONSUMIDA** (situação nova) e, se estava recebida, sai do estoque.                          |
| 8   | Lançamentos da Fase 2 com lote digitado | Permanecem como histórico; a partir da Fase 3 a entrada exige etiqueta ou lote cadastrado.                                                                                                                                                                                                                               |
| 9   | Testes sem impressora                   | Impressora simulada (servidor TCP que grava o ZPL) e modo simulação do agente; nenhum serviço externo de pré-visualização.                                                                                                                                                                                               |

### Etiquetas

- Código `PP-NNNNNNN` único no banco (índice único também em dispositivo + sequência), nunca reutilizado.
- Geradas na mesma transação do lançamento: uma por conjunto (com "n de N" e destaque AVULSO), uma por volume de extrusão, uma por perda, devolução e transferência; uma por entrada de lote comprado, moído/reciclado e mistura.
- A leitura aceita o código de barras completo (com ou sem `]C1`, com separador GS ou parênteses) e o código legível digitado, com minúsculas e sem zeros à esquerda (`t3-1245` = `T3-0001245`).
- Impressão: a API monta o ZPL (layout ativo do tipo — o primeiro por nome — ou o escolhido; impressora padrão do layout ou a escolhida), registra a tentativa e devolve ao dispositivo; o dispositivo envia ao agente e informa o resultado. Falha mantém "impressão pendente"; a tela de etiquetas reenvia as pendentes.
- Etiqueta que já teve impressão com sucesso sai como "2ª VIA"; cada reimpressão conta em `reimpressoes` e é auditada.
- Modelos ZPL usam `{{campo}}` e seções `{{#campo}}...{{/campo}}` (só aparecem com valor, como AVULSO e 2ª VIA). Valores têm `^` e `~` removidos. `{{larguraPontos}}`/`{{alturaPontos}}` são calculados pelo tamanho do layout e pela resolução da impressora. Os modelos iniciais (12) são para 203 dpi e editáveis.
- Peso no GS1-128: (3103) até 999,999 kg; acima disso a precisão cai (3102, 3101, 3100) para caber nos 6 dígitos.

### Matéria-prima e estoque

- Saldo é sempre a soma dos movimentos (entrada no local de destino − saída do local de origem), por lote e local (matéria-prima) ou por produto e local (produto acabado/semiacabado).
- Mistura exige ao menos dois componentes, escolhidos por lote **e local**; percentuais calculados sobre o total, com 2 casas.
- Devolução e transferência não podem passar do consumo líquido daquele lote pela OP.
- Recebimento no estoque só aceita etiqueta de produto (acabado/semiacabado) emitida, em local de produto acabado; recusa inexistente (404), cancelada ou já recebida (409, com data, usuário e local do recebimento) e etiqueta de outro tipo (422).
- A tela de recebimento lista os últimos 30 dias, conforme o parâmetro `visao_recebimento`. A baixa do estoque de produto acontece na exportação (Fase 4).
- O setor de matéria-prima recebe etiquetas de devolução e de extrusão; lotes podem ser transferidos entre locais de matéria-prima.

### Agente de impressão

- Node sem dependências: `POST /imprimir` com `{ host, porta, zpl }` e cabeçalho `x-token`; `GET /saude`. Valida token, porta permitida (`AGENTE_PORTAS`, padrão 9100), hosts permitidos opcionais (`AGENTE_HOSTS`) e ZPL (`^XA`). CORS configurável e cabeçalho de acesso à rede privada do Chrome.
- Entra no `docker-compose.yml` (porta 9180). Em implantação na nuvem, deve rodar em um computador da rede da fábrica.

### Correções encontradas durante os testes

- Na abertura da página, uma falha de rede na checagem da sessão (ou uma navegação que interrompe a requisição) apagava os tokens e deslogava o usuário; o mesmo ocorria quando a renovação do token falhava por rede. Agora só uma recusa do servidor (401/403) encerra a sessão; falha de rede mantém a sessão com os dados do usuário guardados no dispositivo.

## Fase 4 — Correções, aprovações, apuração e exportação (15/11/2026)

### Respostas do usuário às dúvidas do plano (todas confirmadas)

| #   | Dúvida                             | Decisão                                                                                                                                                                                                                                                      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Tipos de correção                  | **Corrigir** (novo lançamento do mesmo tipo com os valores certos, validado como se fosse lançado agora, ligado ao original) e **Anular** (marca como incorreto sem substituto). Valem para todos os tipos de lançamento.                                    |
| 2   | Quem solicita e quem aprova        | O apontador solicita nos turnos que abriu, até a apuração; o líder solicita em qualquer turno não apurado. Correção pedida por um líder é aprovada por outro líder.                                                                                          |
| 3   | Divergência na apuração            | O PCP "devolve ao líder" com parecer: o turno volta de aprovado/apurado para fechado, com uma pendência para o líder.                                                                                                                                        |
| 4   | Etiquetas na correção              | Na aprovação, as etiquetas do original ficam CANCELADAS (continuam consultáveis) e as novas saem com o prefixo do mesmo posto, com impressão pendente. Etiqueta já recebida bloqueia a aprovação até o estoque estornar o recebimento.                       |
| 5   | Rejeitar pendência de horário/peso | Só registra o parecer; conta como decidida.                                                                                                                                                                                                                  |
| 6   | Produção exportada                 | Por divisão: soma das etiquetas recebidas e ainda não exportadas (conjuntos e avulsos). Não recebidas aparecem em aviso e vão em lote posterior. Saldo solto não é exportado. Refugo, perdas e consumo vão uma única vez, na primeira exportação da divisão. |
| 7   | Arquivos                           | 4 arquivos .xlsx por lote, baixados separadamente e regeráveis pelo número do lote.                                                                                                                                                                          |
| 8   | Baixa                              | Etiquetas de produto exportadas saem do estoque do local onde foram recebidas; matéria-prima não muda (já baixada no apontamento).                                                                                                                           |

### Correções e aprovações

- A solicitação simula a aplicação numa transação desfeita: valores inválidos ou impossíveis (saldo, linha do tempo, OP encerrada) são recusados na hora, e não só na aprovação. Etiqueta recebida não bloqueia a solicitação, só a aprovação.
- Na aprovação, o corretivo é registrado em nome de quem solicitou; a hora padrão é a do original. Lançamentos corretivos não geram nova pendência de horário retroativo.
- Pendências de horário/peso do lançamento corrigido são encerradas automaticamente com parecer "lançamento corrigido/anulado".
- Estorno do original: movimentos de estoque do lançamento são revertidos (`ESTORNO_CORRECAO`); semiacabado consumido volta a RECEBIDO/EMITIDO; lote de extrusão tem a quantidade reduzida. Etiqueta já consumida ou exportada impede a correção.
- Posto das etiquetas novas: o das etiquetas do original; senão, de outra etiqueta do turno; senão, o posto configurado no dispositivo de quem aprova (cabeçalho `x-posto`).
- O apontador não aprova o relatório do turno que apontou; o líder não decide pendência que ele mesmo gerou.

### Apuração e exportação

- Turnos: FECHADO → (líder) APROVADO → (PCP) APURADO → (exportação) EXPORTADO. Só ABERTO/FECHADO/APROVADO aceitam correção; nada muda depois de apurado, exceto a devolução ao líder, e nada muda depois de exportado.
- O perfil PCP (sem perfil de líder, apontador ou superusuário) só enxerga turnos aprovados, apurados ou exportados — inclusive na lista geral e no relatório.
- Exportação sob trava (`pg_advisory_xact_lock`): duas exportações simultâneas não pegam os mesmos itens. Sem novidade (nenhum turno apurado nem etiqueta recebida pendente), devolve 422.
- As linhas de cada lote ficam gravadas (`item_exportacao`); o arquivo é gerado a cada download com o mapeamento de colunas atual. Colunas de código saem como texto.
- OP de extrusão: produção em kg (soma das saídas) vai na primeira exportação da divisão, pois não há etiqueta de produto.
- Transferência no arquivo de consumo: positiva = enviada a outra máquina; negativa = recebida.

### Estorno de recebimento

- Estoque (etiqueta de produto) e matéria-prima (devolução/extrusão), com motivo obrigatório. O recebimento fica marcado como estornado (data, usuário, motivo), o saldo é revertido (`ESTORNO_RECEBIMENTO`) e a etiqueta volta a EMITIDA. Recusado para etiqueta exportada ou para lote cujo saldo no local já foi usado.
