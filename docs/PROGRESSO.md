# Progresso

| Fase                                             | Situação  | Data       |
| ------------------------------------------------ | --------- | ---------- |
| 1 — Fundação e cadastros                         | Concluída | 15/11/2026 |
| 2 — OPs, rodadas e apontamento                   | Concluída | 15/11/2026 |
| 3 — Etiquetas, matéria-prima e estoque           | Concluída | 15/11/2026 |
| 4 — Correções, aprovações, apuração e exportação | Concluída | 15/11/2026 |
| 5 — Painéis e indicadores                        | Concluída | 15/11/2026 |
| 6 — Manutenção                                   | Concluída | 15/11/2026 |
| 7 — Offline e implantação                        | Concluída | 16/11/2026 |

## Fase 7 — Offline e implantação

### O que foi feito

**`packages/shared`**: estado da máquina, cálculo das etiquetas de cada lançamento e valores impressos passaram a ser funções compartilhadas (servidor e tablet usam as mesmas); regras dos blocos de numeração; campos opcionais de identificador e hora do tablet nos esquemas; esquemas de estado da fila, recusados e impressões offline; parâmetro `tamanho_bloco_etiquetas`; permissões novas.

**API**

- Migration `fase7_offline`: blocos de numeração por posto e tablet, lançamentos recusados, estado da fila por tablet e turno, alertas de relógio e liberação de troca de tablet no turno.
- Abrir turno, ligar máquina, criar divisão, lançar e fechar aceitam o identificador e a hora do tablet e não duplicam no reenvio; etiquetas usam os números do bloco do tablet (conferidos) e a data do tablet.
- `GET /offline/pacote` (tudo para trabalhar sem servidor), `POST /offline/blocos`, `POST /offline/estado-fila`, recusados (registrar, listar, descartar, ligar ao relançamento), `POST /offline/impressoes`, alertas de relógio (verificação em toda requisição do tablet).
- Um turno, um dispositivo: troca automática quando o tablet anterior informou fila vazia; senão, só com liberação do líder. Relatório bloqueado enquanto houver fila pendente do turno (P17).

**Front-end**

- Aplicativo instalável (PWA) com telas guardadas no aparelho; ícones e manifesto.
- Banco local no tablet (IndexedDB/Dexie): pacote, numeração, fila de envio, etiquetas emitidas offline e resultados de impressão.
- O apontamento grava primeiro no tablet e envia em seguida; sem conexão, o turno é projetado com os itens da fila (máquinas, divisões com código provisório, lançamentos "Aguardando envio", estado das máquinas) e as etiquetas são montadas e impressas pelo agente local.
- Indicador sempre visível: conectado/sem conexão, quantos aguardam envio e recusados.
- Telas novas: Lançamentos recusados (relançar corrigido ou descartar) e Alertas de relógio; botão "Liberar troca de tablet" no relatório do turno aberto.

**Implantação**: serviço `backup` no compose (diário, retenção configurável), `scripts/backup.sh` e `scripts/restaurar.sh`, rota de tempo real sem buffer no nginx, guia `docs/INSTALACAO.md` (servidor local, nuvem com HTTPS, agente, tablets, backup, restauração, problemas comuns) e `docs/MANUAL.md` (manual rápido por perfil).

### Critérios de aceite

| Critério                                                                                                                     | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Com a rede do servidor desligada, o apontador lança um turno inteiro e imprime etiquetas; ao religar, tudo sobe sem duplicar | Ponta a ponta (`fase7.spec.ts`): com a API bloqueada no navegador, o apontador abre o turno, liga a INJ-01, cria as 3 divisões (códigos provisórios), lança produção (2 etiquetas chegam à impressora simulada pelo agente), parada e reinício e fecha o turno; a fila mostra 9 itens. Ao religar, a fila sobe sozinha; no servidor: turno fechado com 1 início, 1 saída, 1 fim e 3 divisões; as 2 etiquetas impressas existem com o mesmo código, ligadas ao turno, e sem impressão pendente. Integração (`fase7.test.ts`): reenvio de abertura, ligação, divisão, lançamento e fechamento não duplica; horas do tablet gravadas como hora do registro e da etiqueta, com a hora de recebimento do servidor à parte. Todos os testes ponta a ponta anteriores passam com o novo fluxo (gravar no tablet e enviar). |
| Dois tablets offline emitem etiquetas sem código repetido                                                                    | Ponta a ponta: dois navegadores (apontadores diferentes) configurados **no mesmo posto T1**, ambos offline, emitem 6 etiquetas intercaladas: 6 códigos distintos, todos subiram ao religar. Integração: cada tablet usa o seu bloco; número fora do bloco do tablet ou já usado é recusado; o servidor emite fora dos blocos reservados. Unitários: sequência dentro dos blocos e pedido de novo bloco abaixo de 20%.                                                                                                                                                                                                                                                                                                                                                                                               |
| Evento recusado na sincronização aparece na lista de recusados                                                               | Ponta a ponta: com o tablet offline, o PCP encerra a OP; a produção lançada nessa OP é recusada ao sincronizar, aparece o aviso "1 recusado(s)" e o item está em Lançamentos recusados com o motivo; o descarte exige justificativa e fica em "Descartados". Integração: registro idempotente, visibilidade (apontador só os seus, líder todos), descarte auditado.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| O backup é restaurado com sucesso em uma instalação limpa, seguindo apenas o guia                                            | Docker, seguindo `docs/INSTALACAO.md`: OP marcadora criada, backup gerado com `docker compose exec backup /scripts/backup.sh agora`; `docker compose down -v` (banco apagado), subida limpa sem dados de exemplo (login recusado: banco vazio), `sh scripts/restaurar.sh backups/…dump`: login volta a funcionar, a OP marcadora está lá e não há migrations pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Resultado das verificações finais

- Migrations sem pendências; aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 92/92, API 121/121, agente 4/4, web 5/5, ponta a ponta 24/24 (Fases 1 a 7).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker: 5 serviços (banco, API, web, agente, backup); manifesto e service worker servidos pela imagem web; o aplicativo abre com a rede desligada (verificado no navegador).

### Pendências e observações

- O tablet precisa ter ficado online ao menos uma vez antes de trabalhar offline (para baixar o pacote e reservar números); sem isso, lançamentos com etiqueta são recusados no próprio tablet com mensagem clara.
- Correção e relançamento de recusados exigem conexão (decisões do líder e do servidor).
- O aviso de troca automática de aparelho depende do último estado de fila informado; tablets sem informação (anteriores à Fase 7) são tratados como fila vazia.
- Impressão HTTPS do agente com a aplicação na nuvem exige certificado confiável nos tablets (ver guia).
- Envio do repositório para um servidor remoto (GitHub) ainda não foi feito: os commits estão só no ambiente de desenvolvimento.

## Fase 6 — Manutenção

### O que foi feito

Além do escopo da RN-14, a pedido do usuário a ordem de serviço é feita em **etapas por especialidade** (Elétrica, Mecânica, Hidráulica, Ferramentaria, Setup, Predial), em sequência e com etapas em paralelo, e há um **controlador de manutenção** que aprova e conduz a OS.

**`packages/shared`**: especialidades e situações (solicitação, OS, etapa); regras puras de sequência (liberada/aguardando), de quem executa a etapa, tempo até o atendimento, tempo de reparo e horas por especialidade; esquemas de solicitação, recusa, conversão com etapas, inclusão/ajuste/cancelamento, início/conclusão, encerramento e modelos; permissões `manutencao.ler`, `manutencao.solicitar`, `manutencao.executar`; usuário com especialidades e marca de controlador.

**API**

- Migration `fase6_manutencao`: especialidades e controlador no usuário; solicitação de manutenção, ordem de serviço, etapas da OS e modelos de sequência.
- Parada com motivo "gera solicitação de manutenção" cria a solicitação na mesma transação do lançamento (descrição com máquina, motivo e observação do apontador).
- Solicitações (automáticas e manuais, com máquina ou local), triagem, recusa com justificativa e aprovação pelo controlador com a sequência de etapas; inclusão, ajuste e cancelamento de etapas; início e conclusão de etapa pela especialidade responsável quando liberada; encerramento da OS sem lançar nenhum evento; "minhas etapas" do técnico; modelos de sequência; indicadores do módulo.
- Painel de acompanhamento: aviso de manutenção aberta por máquina, atualizado em tempo real.
- Dados de exemplo: controlador (`manutencao@`), técnicos `eletrica@`, `mecanica@` (mecânica e hidráulica), `ferramentaria@`, `setup@`, `predial@` e o modelo "Troca de câmara quente".

**Front-end**: cadastro de usuário com especialidades e controlador; tela Manutenção com Minhas etapas (cartões com botões grandes), Solicitações (filtros, avisos de duplicidade e de parada anulada, triagem, recusa, aprovação com editor de etapas e modelos), Ordens de serviço (sequência em colunas por ordem, etapas paralelas empilhadas, iniciar/concluir/cancelar, incluir etapas, encerrar), Modelos de sequência e Indicadores com exportação para Excel; selo "Manutenção aberta" no cartão do painel.

### Critérios de aceite

| Critério                                                                                      | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parada com motivo de manutenção cria a solicitação sem ação extra do apontador                | Integração (`manutencao/fase6.test.ts`): parada REF (programada) não cria; parada MEC cria a solicitação aberta ligada à parada, com hora da ocorrência e descrição "INJ-01: MEC — Quebra mecânica — Vazamento na câmara quente". Ponta a ponta (`fase6.spec.ts`): o apontador lança a parada "MOL" no tablet e a solicitação aparece na fila da manutenção.                                                                                                                                                                                                                                                                                                             |
| A solicitação pode ser recusada com justificativa ou convertida em OS corretiva ou preventiva | Integração: recusa só pelo controlador (técnico 403), justificativa obrigatória (400), segunda decisão 409; conversão em OS corretiva com as 8 etapas do modelo, responsável sem a especialidade recusado (422). Ponta a ponta: o controlador recusa as duplicadas da INJ-01 com justificativa e aprova a nossa com o modelo "Troca de câmara quente" (8 etapas, duas em paralelo na ordem 4).                                                                                                                                                                                                                                                                           |
| Encerrar a ordem de serviço não reinicia a máquina                                            | Integração: OS encerrada (início 1 h após a parada, reparo 1,9 h) sem nenhum evento novo no turno; o painel continua mostrando a INJ-01 parada; o reinício segue sendo lançado pelo apontador. Ponta a ponta: após encerrar, o cartão continua vermelho (parada).                                                                                                                                                                                                                                                                                                                                                                                                        |
| O painel de acompanhamento indica máquina com solicitação aberta                              | Integração: `manutencaoAberta` = 1 após a parada e 0 após recusa/encerramento. Ponta a ponta: o selo "Manutenção aberta" aparece no cartão e some quando a OS é encerrada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Etapas por especialidade, em sequência e em paralelo (pedido do usuário)                      | Unitários: liberação por ordem, paralelas juntas, cancelada conta como finalizada, quem pode executar, tempos e horas por especialidade com valores conhecidos. Integração: etapa não liberada 409, outra especialidade/outro responsável 403, as duas etapas da ordem 4 em execução ao mesmo tempo, a ordem 5 só libera com as duas concluídas, inclusão de etapa antes da sequência recusada, cancelamento com justificativa, encerramento só com tudo finalizado. Ponta a ponta: técnico de setup executa a sua etapa pela tela "Minhas etapas" e a ferramentaria passa a ver a seguinte; o controlador conclui o restante e vê as etapas paralelas liberadas juntas. |

### Resultado das verificações finais

- Migrations sem pendências; aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 86/86, API 114/114, agente 4/4, web 3/3, ponta a ponta 21/21 (Fases 1 a 6).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker com volume novo: 4 serviços saudáveis, técnicos, controlador e modelo de sequência carregados.

### Pendências e observações

- Plano de manutenção preventiva por calendário e estoque de peças continuam fora do escopo (seção 2); OS preventiva nasce de uma solicitação.
- Notificações (e-mail/push) para técnicos quando uma etapa é liberada não foram pedidas; a tela "Minhas etapas" atualiza a cada 30 s.
- Offline e implantação: **Fase 7**.

## Fase 5 — Painéis e indicadores

### O que foi feito

**`packages/shared`**: soma de fatos por período e grupo (`agregarFatos`, `agregarPor`), sempre somando tempos e quantidades antes de dividir; granularidade automática da evolução (dia até 62 dias, mês acima); esquemas dos filtros e da exportação de tabela; permissão `paineis.ler` (todos os perfis).

**API**

- O cálculo do relatório do turno virou um cálculo em lote (`calcularTurnos`), usado pelo relatório, pelo painel e pelos indicadores: as mesmas fórmulas em todos.
- Aviso interno de alteração (lançamento, abertura, divisão, fechamento, correção aprovada), que alimenta o tempo real e limpa o cache dos indicadores.
- `GET /painel/acompanhamento` (cartão por máquina) e `GET /painel/fluxo` (Server-Sent Events, autenticado pelo cabeçalho, com pulso a cada 25 s).
- `GET /indicadores` com filtros de período, máquina, tipo de máquina, molde, produto, horário de turno e equipe; `POST /indicadores/exportar` gera o .xlsx de qualquer tabela.
- nginx: rota do fluxo sem buffer e com conexão longa.

**Front-end**: Painel de acompanhamento (verde/vermelho/cinza com rótulo e ícone, OPs com os dois números, demanda, produzido e %, meta × realizado do turno, OEE, PH real × padrão, cavidades bloqueadas, motivo e tempo parado em contagem, indicador "Ao vivo", modo TV em tela cheia sem menu); Painel de indicadores (filtros, atalhos Hoje/Mês/Ano, OEE por tipo de unidade, gráficos de OEE por máquina e de evolução, tabelas de OEE, evolução, produção, PH, paradas, perdas, consumo e comparação entre equipes e horários, cada uma com botão Excel).

### Critérios de aceite

| Critério                                                                                                                                       | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Testes com valores conhecidos conferem Disponibilidade, Performance, Qualidade, OEE e PH, incluindo rodada com várias OPs e cavidade bloqueada | Unitários (`indicadores.test.ts`): rodada de 3 OPs em molde de 4 cavidades com a cavidade 2 bloqueada por 3 h → esperada 960 + 570 + 570 = 2100; Disponibilidade 9,5/11, Performance 1960/2100, Qualidade 1930/1960, OEE = produto dos três, PH real 96,84; extrusora em kg/h. Integração (`fase5.test.ts`): turno real com 12 h ligado e 1 h de parada programada → 12/11/11 h, Disponibilidade 100%, Performance = peças ÷ (11 × PH da ficha). |
| Ao lançar uma parada, o cartão da máquina fica vermelho com motivo e tempo em contagem, sem recarregar a página                                | Integração: o fluxo SSE entrega `event: alteracao` com o turno; o painel mostra PARADA com motivo, hora de início e equipe. Ponta a ponta (`fase5.spec.ts`): um navegador no painel e outro no tablet; a parada lançada no tablet deixa o cartão vermelho com "MEC — Quebra mecânica" e o cronômetro andando, sem navegação da página; o reinício volta a verde. Também conferido o fluxo através do nginx no Docker.                            |
| O OEE do mês é calculado sobre tempos e quantidades somados, não como média dos dias                                                           | Unitário: dia de 100% + dia de 25% → mês 92,9% × 96,2% (≈ 89,3%), não 62,5%. Integração: dois turnos de outubro → mês com 14/13/12 h e OEE igual ao da soma dos fatos, diferente da média dos dois pontos diários; por mês, um ponto só com o mesmo valor.                                                                                                                                                                                       |
| Filtros por equipe e por horário de turno funcionam; tabelas exportam para Excel                                                               | Integração: filtro da equipe B e do horário Noite trazem só o turno correspondente; comparação entre equipes A e B e entre horários Dia e Noite; .xlsx com cabeçalhos e formato de percentual. Ponta a ponta: filtrar por equipe e por horário deixa só as linhas daquele valor; o botão Excel baixa `oee-por-maquina.xlsx` (arquivo .xlsx válido).                                                                                              |

### Resultado das verificações finais

- Migrations: nenhuma nova nesta fase; banco atualizado.
- Testes: shared 76/76, API 107/107, agente 4/4, web 3/3, ponta a ponta 17/17 (Fases 1 a 5).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker: 4 serviços saudáveis; painel, indicadores e fluxo em tempo real respondendo pela web (nginx). Telas conferidas por captura.

### Pendências e observações

- Indicação de solicitação de manutenção aberta no cartão: **Fase 6**.
- Os indicadores são calculados na hora a partir dos eventos, com cache em memória dos turnos não abertos. Se ficar lento com anos de dados, criar consolidação em tabela sem mudar as fórmulas.
- O cache e o tempo real são por processo da API; com mais de uma instância da API seria preciso um barramento compartilhado (ex.: notificações do PostgreSQL).

## Fase 4 — Correções, aprovações, apuração e exportação

### O que foi feito

**`packages/shared`**: layouts de exportação (produção apurada, consumo, perdas, etiquetas e recebimento) no mesmo mapeamento de colunas da importação; tipos de correção (corrigir/anular); esquemas de solicitação de correção, decisão, rejeição e estorno; permissões novas (`correcoes.solicitar`, `aprovacoes.ler`, `aprovacoes.decidir`, `apuracao.executar`, `exportacao.executar`, `exportacao.ler`).

**API**

- Migration `fase4_correcoes_exportacao`: dados da correção na aprovação (tipo, justificativa, valores, lançamento corretivo), estorno de recebimento (o recebimento não some), cancelamento de etiqueta, marcos do turno (aprovado, apurado, exportado, devolvido com parecer), lote e itens de exportação, movimentos de estorno e de baixa por exportação.
- Correções (RN-09): `POST /correcoes` (corrigir com os valores certos, validados como um lançamento novo, ou anular). A viabilidade é simulada na hora da solicitação. Na aprovação: original fica INCORRETO e sai dos cálculos; etiquetas do original são canceladas e novas saem com o prefixo do mesmo posto; estoque do original é estornado; o corretivo fica ligado ao original (`corrigeEventoId`).
- Aprovações: fila do líder (`GET /aprovacoes`), aprovar/rejeitar com parecer; quem solicitou não decide; aprovação do relatório (`POST /turnos/:id/aprovar`) só sem pendência em aberto.
- Apuração do PCP: lista só turnos aprovados; apurar; devolver ao líder com parecer (o turno volta a FECHADO com pendência). O PCP não enxerga turno não aprovado nem na lista geral de turnos nem no relatório.
- Exportação: prévia, geração do lote (4 arquivos .xlsx com os nomes de colunas mapeados, regeráveis pelo número do lote), baixa no estoque das etiquetas exportadas, marcação de etiquetas, divisões e turnos como exportados; turno exportado não aceita alteração.
- Estorno de recebimento no estoque (produto) e na matéria-prima (devolução/extrusão).
- Dados de exemplo: segundo líder (`lider2@exemplo.com.br`) para a separação de funções.

**Front-end**: lista de lançamentos com o original em vermelho riscado e o vínculo com o corretivo, botão "Corrigir" (formulário do lançamento já preenchido ou anulação) no apontamento e no relatório; tela Aprovações (relatórios a aprovar, pendências em aberto/aprovadas/rejeitadas, decisão com parecer); botão "Aprovar relatório" e aviso de devolução/exportação no relatório; tela Apuração e exportação (apurar, devolver, prévia em abas, exportar, lotes com download dos 4 arquivos); aba Estorno no estoque e na matéria-prima; mapeamento das colunas de exportação na tela de importação.

### Critérios de aceite

| Critério                                                                                               | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correção aprovada deixa o original em vermelho, fora dos cálculos, com vínculo ao corretivo; nada some | Integração (`aprovacoes/fase4.test.ts`): saída de 3 conjuntos corrigida para 2 → original INCORRETO e ainda presente no detalhe do turno, corretivo com `corrigeEventoId` e 60 peças, relatório com produção 60, 3 etiquetas originais CANCELADAS (consultáveis) e 2 novas `T1-…`; etiqueta recebida bloqueia a aprovação até o estorno, e o recebimento estornado continua gravado. Ponta a ponta (`fase4.spec.ts`): apontador corrige a perda de 2 para 3 peças; após a aprovação a linha original aparece riscada em vermelho com "corrigido pelo lançamento…" e o corretivo mostra "Corrige o lançamento…". |
| Quem solicitou a correção não pode aprová-la                                                           | Integração: líder solicita anulação e recebe 403 "Quem solicitou a correção não pode aprová-la."; apontador recebe 403; o segundo líder aprova. Na tela, o botão "Decidir" fica desabilitado para o próprio solicitante.                                                                                                                                                                                                                                                                                                                                                                                        |
| Relatório não é aprovado com pendência aberta e o PCP não enxerga turno não aprovado                   | Integração: com correção pendente, aprovar o relatório → 409; rejeitada a correção (parecer obrigatório) e decidida a pendência de horário, aprova. Antes disso, o turno não aparece na apuração nem em `/turnos` para o PCP e o relatório devolve 403; apurar → 409. Devolução do PCP volta o turno ao líder com pendência. Ponta a ponta: PCP não vê o turno fechado; líder decide as pendências e só então "Aprovar relatório" fica habilitado.                                                                                                                                                              |
| Exportação gera os arquivos no layout mapeado, dá baixa no saldo e não exporta o mesmo item duas vezes | Integração: lote 1 com produção (30 peças recebidas, 1 conjunto, 5 refugadas), consumo (25 kg − 5 kg devolvidos = 20 kg), perdas e etiquetas; etiqueta exportada sai do saldo da Expedição; etiqueta não recebida fica no aviso e sai no lote 2 sem repetir consumo, perdas e refugo; nova exportação sem novidade → 422; nenhum código de etiqueta repetido entre lotes; arquivo .xlsx baixado tem o cabeçalho mapeado e, após mudar o mapeamento, é regerado com os nomes novos. Ponta a ponta: PCP apura, exporta, baixa `exportacao-N-producao.xlsx` e o botão Exportar fica desabilitado.                  |
| Turno exportado não aceita nenhuma alteração                                                           | Integração: correção (409 "Turno exportado não aceita nenhuma alteração."), lançamento, fechamento, aprovação, devolução, apuração e estorno de etiqueta exportada → recusados. Ponta a ponta: o relatório mostra o aviso e não oferece "Corrigir".                                                                                                                                                                                                                                                                                                                                                             |

### Resultado das verificações finais

- Migrations sem pendências; aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 72/72, API 102/102, agente 4/4, web 3/3, ponta a ponta 15/15 (Fases 1 a 4).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker: 4 serviços saudáveis com a migration nova; prévia de exportação pela web (nginx → API) respondendo. Mesma ressalva de rede da sandbox.

### Pendências e observações

- Consumo de semiacabado não entra no arquivo de consumo (o layout é em kg de material); se o ERP precisar, criar um layout próprio.
- Corrigir uma transferência exige que a divisão de destino esteja em turno aberto (mesma regra do lançamento); depois disso, só anulando.
- Etiquetas novas emitidas por correção ficam com "impressão pendente" e são impressas pela tela de etiquetas.
- Painéis e indicadores: **Fase 5**.

## Fase 3 — Etiquetas, matéria-prima e estoque

### O que foi feito

**`packages/shared`**: código da etiqueta, montagem e leitura de GS1-128, preenchimento de modelos ZPL com seções condicionais, modelos iniciais 100 × 150 e 100 × 50 para os 6 tipos, esquemas de lote, mistura, recebimento e impressão.

**API**

- Migration `fase3_etiquetas_estoque`: etiqueta, sequência por dispositivo, impressão, lote de material, mistura e componentes, movimento de estoque e recebimento.
- Etiquetas geradas pelos lançamentos (conjuntos, volumes de extrusão, perdas, devoluções, transferências) e pelo setor de matéria-prima (compra, moído/reciclado, mistura); consulta por leitura; impressão com registro do resultado; reimpressão "2ª via"; impressão de teste de layout.
- Matéria-prima: entrada de lote comprado, moído/reciclado, mistura (baixa dos componentes, novo lote e etiqueta), recebimento de devoluções e de volumes de extrusão, transferência entre locais, saldo por lote e local; ordem de extrusão pelo setor.
- Estoque: consulta da etiqueta lida, recebimento em local, lista conforme o parâmetro de visão, saldo por local.
- Lançamentos de entrada de matéria-prima, devolução, transferência e semiacabado passam a ler etiqueta/lote e movimentar o estoque.
- Dados de exemplo: 12 layouts, 7 lotes com etiqueta do posto MP e o produto de mistura MIS-PP-AZ.

**Agente de impressão** (`apps/print-agent`): HTTP → TCP 9100, token, portas/hosts permitidos, HTTPS opcional, modo simulação, impressora simulada para testes, Dockerfile e serviço no compose.

**Front-end**: Configurar este posto (dispositivo, agente e teste), impressão automática após cada lançamento com aviso de pendência, Etiquetas (filtros, pendentes, reenviar, reimprimir), Matéria-prima (lotes e saldo, compra, mistura, receber da produção, moído/reciclado, ordem de extrusão), Estoque (recebimento com campo de leitura e confirmação; saldo por local), Layouts com impressão de teste; leitura de etiqueta/lote na tela de lançamento e campos de fluidez e destinos na extrusão.

### Critérios de aceite

| Critério                                                                                                                     | Como foi verificado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lançar 3 conjuntos imprime 3 etiquetas com códigos distintos; falha de impressão deixa a etiqueta pendente e reenviável      | Integração (`etiquetas.test.ts`): 3 etiquetas `T1-0000001..3`, reenvio do mesmo lançamento devolve as mesmas; falha informada mantém pendente; reenvio com sucesso limpa a pendência; reimpressão sai como "2ª VIA" e é auditada. Ponta a ponta (`fase3.spec.ts`): 3 ZPLs com códigos distintos chegam à impressora simulada pelo agente; com a impressora fora (porta fechada) o aviso de pendência aparece, "Reenviar 1 pendente(s)" imprime depois que a impressora volta. Agente: testes de envio TCP e de falha (502). |
| O superusuário altera o tamanho e o modelo de uma etiqueta e imprime um teste                                                | Integração: layout alterado para 60 × 40 mm e modelo novo → teste gera `^PW480^LL320...`; apontador recebe 403. Ponta a ponta: edição na tela (100 × 40 mm, ZPL novo) e "Imprimir teste" → a impressora simulada recebe exatamente `^XA^PW799^LL320...TESTE E2E TS-0000000...^XZ`.                                                                                                                                                                                                                                          |
| Uma mistura dá baixa nos lotes componentes, gera novo lote e etiqueta, e pode ser lida na entrada de matéria-prima de uma OP | Integração: saldo insuficiente recusado; mistura 40 kg PP + 2 kg MB → saldos 60 e 48, novo lote 42 kg, composição 95,24%/4,76% na etiqueta; leitura do código de barras completo da mistura na entrada da OP baixa 30 kg (saldo 12) e recusa 20 kg. Ponta a ponta: mistura pela tela, etiqueta impressa com a composição, lote listado, apontador lê o código da mistura e lança 10 kg.                                                                                                                                     |
| A etiqueta de extrusão traz todos os campos da seção 8                                                                       | Integração: OP de extrusão criada pelo setor de matéria-prima; volumes com operador, fluidez e destinos → ZPL contém material, peso, data de fabricação, lote, OP de extrusão, operador, turno, fluidez, cor, destinos e o GS1 com (3103).                                                                                                                                                                                                                                                                                  |
| Etiqueta lida no estoque muda para recebida e soma no saldo do local; segunda leitura é recusada                             | Integração e ponta a ponta: leitura (GS1 completo ou código digitado) mostra produto, quantidade, OP e turno; confirmação → RECEBIDA, saldo da Expedição 30 peças; segunda leitura recusada com data, usuário e local; inexistente, cancelada e de outro tipo também recusadas.                                                                                                                                                                                                                                             |
| O parâmetro de visão do recebimento alterna entre pendentes, recebidas e ambas                                               | Integração: AMBAS → emitidas e recebidas; PENDENTES → só emitidas; RECEBIDAS → só a recebida. Ponta a ponta: superusuário muda para "Só pendentes" e a tela do estoque passa a mostrar "(só pendentes…)" sem a etiqueta recebida.                                                                                                                                                                                                                                                                                           |

### Resultado das verificações finais

- Migrations sem pendências; aplicadas do zero nos bancos de teste, e2e e Docker.
- Testes: shared 72/72, API 94/94, agente 4/4, web 3/3, ponta a ponta 11/11 (Fases 1, 2 e 3).
- Lint sem problemas, Prettier sem diferenças, typecheck sem erros.
- Docker: 4 serviços (banco, API, web, agente) com volume vazio; impressão de etiqueta pela API → agente (modo simulação) com o GS1 correto. Mesma ressalva de rede da sandbox.

### Pendências e observações

- Cancelamento de etiqueta por correção e estorno de recebimento: **Fase 4** (RN-09).
- Baixa do estoque de produto na exportação: **Fase 4**.
- Sequência de etiquetas gerada no próprio dispositivo (offline): **Fase 7**.
- Os modelos ZPL foram montados para 203 dpi e não foram impressos em uma Zebra física; vale imprimir um teste de cada layout na implantação e ajustar posições/tamanho do código de barras (códigos GS1 longos podem precisar de `^BY` menor no 100 × 50).
- Em produção com HTTPS, o agente precisa de certificado confiável pelos tablets (ver decisões).

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
