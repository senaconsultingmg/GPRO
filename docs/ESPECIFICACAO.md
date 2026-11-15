# Script de geração — App de Apontamento de Produção

Versão de 14/11/2026

## 1. Como usar este script

Este documento é a especificação completa do aplicativo e deve ser executado no Claude Code com o modelo Claude Sonnet 5.5, uma fase por vez. Um sistema deste tamanho não sai bem em uma única instrução; cada fase termina testada antes de a próxima começar.

1. Crie uma pasta vazia para o projeto e exporte este documento em Markdown para `docs/ESPECIFICACAO.md` dentro dela.
2. Abra o Claude Code nessa pasta, com o modelo Sonnet 5.5.
3. Cole o prompt abaixo, trocando `N` pelo número da fase (seção 12).
4. Confira os critérios de aceite da fase. Só avance quando todos passarem.
5. Faça um commit por fase concluída.

```
Leia docs/ESPECIFICACAO.md por inteiro antes de escrever código.
Implemente somente a Fase N (seção 12), respeitando as regras gerais da seção 1
e as regras de negócio da seção 7.
Antes de codificar, apresente um plano curto com os arquivos que vai criar ou alterar
e as dúvidas que encontrou; espere minha confirmação.
Ao terminar: rode migrations, testes e lint; corrija o que falhar;
liste cada critério de aceite da fase dizendo como foi verificado;
atualize docs/PROGRESSO.md com o que foi feito e o que ficou pendente.
Não implemente nada de fases futuras.
```

### Regras gerais para a IA (valem em todas as fases)

- **Idioma:** interface, mensagens e documentação em português do Brasil. Código (nomes de tabelas, variáveis, rotas) em inglês ou português, mas de forma consistente em todo o projeto.
- **Fuso e datas:** gravar tudo em UTC no banco; exibir em `America/Sao_Paulo`. Formato de data `dd/mm/aaaa`, hora em 24 h.
- **Nada é apagado:** lançamentos de produção nunca são excluídos nem editados. Correção se faz por novo lançamento ligado ao original (regra RN-09).
- **Auditoria:** toda criação, aprovação, correção, exportação e alteração de cadastro grava usuário, data/hora e valores anterior e novo.
- **Regra de negócio no servidor:** a API valida tudo; o front-end repete as validações apenas para dar retorno rápido.
- **Permissões:** toda rota verifica o perfil do usuário (seção 5). Negar por padrão.
- **Parâmetros, não constantes:** todo limite citado como "parametrizável" fica em tabela de parâmetros editável pelo superusuário.
- **Testes:** cada regra de negócio numerada (RN-xx) tem ao menos um teste automatizado; os cálculos de OEE, PH e metas têm testes com valores conhecidos.
- **Dados de exemplo:** manter um script de carga (seed) com 3 injetoras, 1 sopradora, 1 extrusora, moldes, produtos, fichas técnicas e usuários de cada perfil.
- **Dúvida:** quando a especificação for ambígua, perguntar antes de decidir. Decisões tomadas sem pergunta entram em `docs/DECISOES.md`.
- **Tela do apontador:** pensada para tablet no chão de fábrica: botões grandes, poucos toques, sem depender de teclado quando houver alternativa (listas, leitor de código).

## 2. Visão geral

O aplicativo registra o apontamento de produção de uma fábrica de transformação de plásticos com injetoras e sopradoras (produção em peças) e extrusoras (produção em kg/toneladas). Ele cobre do recebimento da ordem de produção do ERP até a devolução dos valores apurados ao ERP, sempre por arquivos Excel.

**Porte:** uma planta, cerca de 10 usuários simultâneos.

**Fora do escopo:** integração direta com o banco do ERP, leitura automática de máquina, balança integrada, plano de manutenção preventiva por calendário, estoque de peças de manutenção.

### Fluxo do processo

1. O **PCP** importa as ordens de produção (OPs) do ERP por Excel. Cada OP recebe um número interno automático, vinculado ao número do ERP.
2. O PCP monta a **rodada**: máquina + molde + uma ou mais OPs que rodam juntas (um molde com 3 cavidades pode atender 3 OPs), cada uma com sua ficha técnica.
3. O setor de **matéria-prima** mantém o estoque de materiais por lote, produz material extrusado por ordem de extrusão e prepara **misturas**, que recebem novo lote e etiqueta.
4. No início do turno, o **apontador** abre o turno, seleciona as máquinas que vão ligar e cria a divisão de cada OP para aquele turno. O tempo de máquina passa a contar.
5. Durante o turno, o apontador lança os eventos: entrada de matéria-prima e de semiacabados, saída de produção, perdas, paradas e reinícios, bloqueio de cavidades, devoluções e transferências.
6. Cada saída de produção gera **uma etiqueta por conjunto**, impressa em Zebra, com código único.
7. Parada por manutenção gera uma **solicitação de manutenção**, tratada em módulo separado.
8. No fim do turno, o apontador fecha o turno e informa o saldo de peças avulsas deixado para o próximo.
9. O **líder de produção** aprova o relatório do turno, as justificativas, os lançamentos fora de hora, os pesos fora de tolerância e as correções.
10. O **estoque** confirma o recebimento do produto lendo o código da etiqueta.
11. O **PCP** apura os turnos aprovados e exporta os valores finais para o ERP em Excel; a exportação dá baixa no estoque do aplicativo.
12. Painéis mostram a produção em tempo real e os indicadores diários, mensais e anuais.

## 3. Premissas a validar

Estas decisões foram assumidas sem confirmação explícita. Revise antes de rodar a Fase 1; cada uma pode ser alterada editando a regra indicada.

| # | Premissa | Onde está |
| --- | --- | --- |
| P1 | Em uma rodada com várias OPs, o tempo de máquina e as paradas são compartilhados; só a produção é lançada por OP. O OEE é da máquina. | RN-03 |
| P2 | Peças avulsas contam como produção do turno que as produziu; a etiqueta sai quando o conjunto se completa, mesmo em outro turno. | RN-06 |
| P3 | Peso fora da tolerância sinaliza não conformidade, exige justificativa e vai para aprovação do líder, sem impedir o lançamento. | RN-07 |
| P4 | Lançamento é considerado retroativo ou antecipado quando a hora da ocorrência difere da hora do registro em mais de 10 minutos (parametrizável). | RN-08 |
| P5 | Com cavidade bloqueada, o PH esperado da OP cai na proporção das cavidades ativas. | RN-05 |
| P6 | Além das perdas de material (borra, canal, varredura, rebarba, outros), existe o tipo "peça refugada", usado no fator Qualidade do OEE. | RN-11 |
| P7 | Perda que vira material moído só entra no estoque quando o setor de matéria-prima lança a entrada; não é automática. | RN-10 |
| P8 | O OEE não é limitado a 100% na Performance; valores acima de 100% são exibidos com alerta de ficha técnica possivelmente desatualizada. | Seção 10 |
| P9 | Fichas técnicas são criadas pelo PCP e passam a valer após aprovação do superusuário. | Seção 5 |
| P10 | Ordens de extrusão criadas pelo setor de matéria-prima não precisam de número do ERP. | RN-10 |
| P11 | Sopradoras seguem as mesmas regras das injetoras (peças, molde, cavidades). | Seção 6 |
| P12 | O PCP só apura turnos cujo relatório foi aprovado pelo líder. | RN-13 |
| P13 | Funcionamento offline vale apenas para o apontador; aprovações, recebimento, apuração e exportação exigem conexão. | Seção 11 |
| P14 | O estoque de produto acabado tem locais simples, sem endereçamento por posição. | RN-12 |
| P15 | O código legível da etiqueta é curto (posto + sequência); os demais dados pedidos vão no QR Code e impressos por extenso. | Seção 8 |

**P16:** a exportação de produção para o ERP inclui apenas etiquetas já recebidas no estoque (seção 9). **P17:** um turno não pode ser aprovado enquanto houver lançamentos offline não enviados (seção 11).

## 4. Arquitetura e stack

O sistema é uma aplicação web única, empacotada em Docker, que roda igual em servidor local na fábrica ou em nuvem. PCs e tablets acessam pelo navegador e podem instalar o aplicativo como PWA.

| Camada | Tecnologia | Observação |
| --- | --- | --- |
| Front-end | React + TypeScript + Vite | PWA instalável; biblioteca de componentes com bom suporte a toque |
| Dados no cliente | TanStack Query + IndexedDB (Dexie) | Cache e fila de lançamentos offline |
| API | Node.js + NestJS + TypeScript | REST, documentação OpenAPI gerada |
| Banco | PostgreSQL + Prisma | Migrations versionadas |
| Validação | Zod em pacote compartilhado | Mesmos esquemas no front-end e na API |
| Tempo real | Server-Sent Events ou WebSocket | Atualização do painel de acompanhamento |
| Excel | Biblioteca de leitura e escrita de .xlsx | Importação e exportação (seção 9) |
| Impressão | ZPL enviado por TCP à Zebra em rede (porta 9100) | Agente de impressão na rede local (seção 8) |
| Autenticação | Login e senha, token de acesso + renovação | Senhas com hash forte; sessão por dispositivo |
| Testes | Testes unitários e de integração na API; testes de ponta a ponta nos fluxos principais |  |
| Implantação | Docker Compose (web, api, banco, agente de impressão) | Backup diário do banco por script |

Usar as versões estáveis atuais de cada tecnologia.

### Estrutura do repositório

```
apps/web            front-end React (PWA)
apps/api            API NestJS
apps/print-agent    serviço pequeno que recebe ZPL por HTTP e envia à impressora
packages/shared     tipos, esquemas Zod e fórmulas de cálculo (OEE, PH, metas)
docs/               ESPECIFICACAO.md, PROGRESSO.md, DECISOES.md
docker-compose.yml
```

As fórmulas de OEE, PH e meta ficam em `packages/shared`, em funções puras, para serem usadas pela API e pelo front-end e testadas isoladamente.

## 5. Perfis e permissões

São sete perfis; um usuário pode acumular mais de um. Todo perfil enxerga os painéis em modo leitura.

| Perfil | O que faz |
| --- | --- |
| Superusuário | Cadastros (máquinas, moldes, produtos, conjuntos, turnos, escala, motivos de parada com a marca programada/não programada, tipos de perda, locais de estoque, impressoras, layouts de etiqueta), usuários, parâmetros do sistema, aprovação de fichas técnicas |
| PCP | Importa OPs, cria rodadas e vincula OPs, cria e revisa fichas técnicas, apura turnos aprovados, exporta para o ERP e dá baixa no estoque |
| Apontador | Abre e fecha turno, liga máquinas, cria a divisão da OP, lança todos os eventos de produção, emite e reimprime etiquetas, solicita correções |
| Líder de produção | Aprova ou rejeita: relatório do turno, justificativas, lançamentos fora de hora, pesos fora de tolerância e correções. Pode solicitar correções |
| Estoque | Recebe produto por leitura de etiqueta, consulta saldo por local |
| Matéria-prima | Lança entrada de lotes, cria ordens de extrusão, prepara misturas, recebe devoluções da produção, transfere material, consulta saldo por lote |
| Manutenção | Tria solicitações, abre e encerra ordens de serviço |

Regras de separação de funções:

- Quem solicita uma correção não pode aprová-la.
- O apontador só lança eventos no turno que ele mesmo abriu e enquanto estiver aberto.
- Depois de o turno ser aprovado pelo líder, alterações só por correção aprovada; depois de apurado e exportado pelo PCP, nenhuma alteração.

## 6. Modelo de dados

O centro do modelo é a tabela de **eventos**: cada lançamento do apontador é um registro imutável, e todos os totais, tempos e indicadores são calculados a partir deles. As tabelas abaixo listam as entidades e os campos principais; a IA completa chaves, índices e campos de auditoria.

### Cadastros

| Entidade | Campos principais |
| --- | --- |
| Usuário | nome, login, senha (hash), perfis, equipe, ativo |
| Horário de turno | nome (ex.: Dia, Noite), hora de início, hora de fim |
| Equipe | letra (A, B, C, D) |
| Escala | data, horário de turno, equipe. Tela para gerar a escala 12x36 automaticamente a partir de uma data inicial |
| Máquina | código, descrição, tipo (injetora, sopradora, extrusora), ativa. Injetora/sopradora: força de fechamento (t), distância entre colunas horizontal e vertical (mm), altura de molde mínima e máxima (mm), peso máximo de molde (kg), pressão de injeção (bar), capacidade de injeção (g). Extrusora: capacidade (kg/h). Parâmetros adicionais em campo livre estruturado |
| Molde | código, descrição, largura, comprimento e altura (mm), peso (kg), número de cavidades, força de fechamento exigida (t), pressão exigida (bar), peso injetado por ciclo (g) |
| Cavidade do molde | molde, número da cavidade, produto que ela produz |
| Produto | código (igual ao do ERP), descrição, tipo (acabado, semiacabado, matéria-prima, aditivo, extrusado, moído, reciclado, mistura), unidade (peça ou kg), cor |
| Conjunto padrão | produto, tipo de embalagem (pallet, saco, gaiola, caixote, pilha, outro), quantidade por conjunto |
| Ficha técnica | produto, molde, máquina, versão, situação (rascunho, vigente, obsoleta), ciclo (s), cavidades, PH padrão, peso padrão da peça (g), tolerância de peso (%), parâmetros de processo (temperaturas, pressões, tempos), composição (material e consumo por peça ou %), aprovador, vigente desde |
| Motivo de parada | código, descrição, programada (sim/não), gera solicitação de manutenção (sim/não) |
| Tipo de perda | descrição (borra, canal, varredura, rebarba, peça refugada, outros), conta como refugo de peça (sim/não) |
| Local de estoque | nome, tipo (produto acabado, matéria-prima) |
| Impressora | nome, endereço IP, porta, resolução |
| Layout de etiqueta | tipo de etiqueta, largura e altura (mm), modelo ZPL, impressora padrão |
| Parâmetro do sistema | chave, valor, descrição |

### Produção

| Entidade | Campos principais |
| --- | --- |
| Ordem de produção | número interno (automático), número do ERP, tipo (produção, extrusão), produto, quantidade, unidade, data prevista, situação |
| Rodada | máquina, molde, situação (planejada, em andamento, encerrada), criada pelo PCP |
| OP da rodada | rodada, OP, versão da ficha técnica congelada, cavidades atribuídas à OP |
| Turno de apontamento | apontador, data, horário de turno, equipe, aberto em, fechado em, situação (aberto, fechado, aprovado, apurado, exportado) |
| Máquina no turno | turno de apontamento, máquina, rodada |
| Divisão da OP | OP, sequencial, turno de apontamento, máquina, horas disponíveis, PH de referência, meta, código (número do ERP + "-" + sequencial com 2 dígitos) |
| Evento | identificador único gerado no dispositivo, tipo, turno de apontamento, máquina, rodada, divisão da OP, hora da ocorrência, hora do registro, usuário, dispositivo, dados do evento, marca de horário (no momento, retroativo, antecipado), situação (válido, correção pendente, incorreto), evento que ele corrige, justificativa |
| Aprovação | tipo (correção, horário, peso, justificativa, relatório de turno), referência, solicitante, aprovador, situação (pendente, aprovada, rejeitada), parecer, datas |
| Etiqueta | código, sequência, tipo, produto, quantidade, unidade, peso, lote, evento de origem, divisão da OP, turno, responsável, emitida em, avulso (sim/não), situação (emitida, recebida, exportada, cancelada), número de reimpressões |

**Tipos de evento:** início de máquina, fim de máquina, parada, reinício, entrada de matéria-prima, entrada de semiacabado, saída de produção, perda, devolução de matéria-prima, transferência, bloqueio de cavidade, desbloqueio de cavidade, saldo avulso deixado, saldo avulso recebido.

### Matéria-prima e estoque

| Entidade | Campos principais |
| --- | --- |
| Lote de material | número do lote, material, origem (compra, extrusão, mistura, moído, devolução), fornecedor, nota fiscal, quantidade (kg), índice de fluidez, cor |
| Mistura | lote gerado, componentes (lote, kg, %), produtos a que se destina, responsável |
| Movimento de estoque | lote ou etiqueta, local de origem, local de destino, quantidade, tipo, evento de origem, usuário, data. O saldo é a soma dos movimentos |
| Recebimento | etiqueta, local de estoque, recebido por, recebido em |
| Exportação para o ERP | número do lote de exportação, tipo de arquivo, período, usuário, data, itens exportados |

### Manutenção e auditoria

| Entidade | Campos principais |
| --- | --- |
| Solicitação de manutenção | máquina, evento de parada de origem, descrição, solicitante, situação (aberta, em triagem, convertida em ordem de serviço, recusada, encerrada) |
| Ordem de serviço | número, solicitação, tipo (corretiva, preventiva), eletiva (sim/não), responsável, início, fim, serviço executado, situação |
| Registro de auditoria | usuário, data/hora, entidade, ação, valor anterior, valor novo |

## 7. Regras de negócio

São 14 regras numeradas (RN-01 a RN-14); cada uma deve ter teste automatizado.

### RN-01 — Ordem de produção

- A OP chega por importação de Excel (seção 9) ou por digitação do PCP.
- O sistema gera um número interno sequencial e guarda o número do ERP; o número do ERP é único e obrigatório para OP de produção.
- Toda tela e toda exportação mostram os dois números.
- Uma OP pode durar vários dias e vários turnos.

### RN-02 — Compatibilidade molde × máquina e ficha técnica

- Um molde só pode ser alocado em máquina compatível. A máquina é compatível quando: largura e comprimento do molde cabem entre as colunas (horizontal e vertical); a altura do molde está entre a mínima e a máxima da máquina; o peso do molde não excede o máximo; a força de fechamento e a pressão da máquina atendem ao exigido pelo molde; o peso injetado por ciclo cabe na capacidade de injeção.
- A tela do molde lista as máquinas compatíveis e, para as incompatíveis, o critério que falhou.
- A ficha técnica vale para a combinação produto + molde + máquina (extrusão: produto + máquina). O PH padrão pode ser informado ou calculado: 3600 ÷ ciclo em segundos × cavidades do produto.
- Ficha vigente não é editada: qualquer alteração cria nova versão em rascunho; ao ser aprovada, a anterior vira obsoleta.
- A OP da rodada guarda a versão da ficha usada; mudanças posteriores não alteram o histórico nem os indicadores já calculados.

### RN-03 — Rodada

- O PCP cria a rodada escolhendo máquina e molde compatíveis e vinculando uma ou mais OPs, cada uma com suas cavidades e sua ficha técnica.
- Uma máquina tem no máximo uma rodada em andamento.
- Tempo de máquina, paradas e bloqueios de cavidade pertencem à rodada; produção, perdas e consumo são lançados por OP.
- Em extrusoras, a rodada tem uma única OP e não tem molde.

### RN-04 — Abertura do turno e divisão da OP

- O apontador abre o turno; o sistema sugere horário de turno e equipe pela escala.
- Ele seleciona em uma lista as máquinas que vai ligar. Cada máquina selecionada gera o evento de início e o tempo começa a contar.
- Para cada OP da rodada de cada máquina ligada, o apontador cria a divisão da OP naquele turno. O sistema propõe o próximo sequencial e o código, por exemplo `04508401001-02`.
- Meta da divisão = horas disponíveis no turno × PH da ficha técnica. As horas disponíveis vêm da duração do turno menos as paradas programadas previstas, e o apontador pode ajustá-las.
- A meta nunca ultrapassa o saldo a produzir da OP.
- Máquinas podem ser ligadas depois da abertura, a qualquer momento do turno.
- Se a máquina já vinha rodando do turno anterior, o sistema sugere como hora de início a hora de fechamento do turno anterior.

### RN-05 — Eventos do turno

- Com a máquina ligada, o apontador lança: entrada de matéria-prima, entrada de semiacabado, saída de produção, perda, devolução de matéria-prima, transferência, parada, reinício, bloqueio e desbloqueio de cavidade.
- **Parada:** exige motivo e hora da ocorrência. Enquanto parada, a máquina não aceita saída de produção com hora dentro do intervalo parado. O reinício encerra a parada.
- Motivo marcado como "gera solicitação de manutenção" abre a solicitação automaticamente (RN-14).
- **Cavidade bloqueada:** evento com cavidade, motivo e hora. Enquanto bloqueada, o PH esperado da OP daquela cavidade cai na proporção cavidades ativas ÷ cavidades da OP. O painel e a meta consideram o PH ponderado pelo tempo em cada situação.
- **Entrada de semiacabado:** leitura da etiqueta do semiacabado ou digitação do código; registra o consumo na OP.

### RN-06 — Conjuntos, avulsos e etiquetas

- Na saída de produção o apontador informa o número de conjuntos padrão. O sistema calcula as peças e emite uma etiqueta por conjunto. Exemplo: 3 conjuntos de 30 cadeiras = 90 peças e 3 etiquetas, cada uma com código sequencial próprio.
- **Conjunto avulso:** conjunto fechado com quantidade diferente do padrão. É exceção: exige confirmação, sai com a palavra AVULSO em destaque na etiqueta e aparece destacado no relatório do turno.
- **Saldo solto:** peças produzidas que ainda não completam um conjunto. No fechamento do turno o apontador informa o saldo solto de cada OP; na abertura seguinte, o novo apontador confirma o saldo recebido.
- Produção do turno por OP = soma das quantidades etiquetadas no turno + saldo solto deixado − saldo solto recebido.
- Na extrusão não há conjunto padrão: cada volume (saco, bobina, caixa) é lançado com o peso digitado e gera sua etiqueta.

### RN-07 — Conferência de peso

- Em injetoras e sopradoras, cada saída de produção pede o peso médio da peça, digitado.
- O sistema compara com o peso padrão da ficha técnica. Desvio dentro da tolerância da ficha: lançamento normal.
- Desvio acima da tolerância: o campo fica sinalizado como não conformidade (NC), a justificativa é obrigatória e o lançamento entra na lista de aprovação do líder.
- O lançamento com NC conta na produção, mas o turno não pode ser aprovado enquanto houver NC pendente.

### RN-08 — Hora da ocorrência e hora do registro

- Todo evento guarda duas horas: a da ocorrência, informada pelo apontador e usada em todos os cálculos de tempo, e a do registro, gravada pelo sistema e não editável.
- Por padrão a hora da ocorrência vem preenchida com a hora atual.
- Diferença maior que a tolerância (10 minutos, parametrizável) marca o evento como retroativo ou antecipado, de forma visível na lista.
- Eventos marcados entram na lista de aprovação do líder no fechamento do turno.
- A hora da ocorrência deve ficar dentro do período do turno aberto e não pode criar sobreposição de paradas.

### RN-09 — Correções

- Lançamento errado não é apagado nem editado. O apontador ou o líder solicita a correção informando justificativa e os valores corretos.
- Enquanto a solicitação está pendente, o lançamento original continua valendo e aparece com a marca "correção pendente".
- Aprovada pelo líder: o original passa a "incorreto", fica visível em vermelho e deixa de entrar nos cálculos; o lançamento corretivo passa a valer e mostra o vínculo com o original.
- Rejeitada: o original continua válido e a solicitação fica registrada com o parecer.
- Se o lançamento corrigido gerou etiquetas, elas são canceladas (continuam consultáveis) e novas são emitidas. Etiqueta já recebida no estoque não pode ser cancelada sem estorno do recebimento.

### RN-10 — Matéria-prima, extrusão e misturas

- O setor de matéria-prima mantém o saldo por lote e por local. Tipos de material: granulado, extrusado, moído, reciclado, aditivo e mistura.
- **Entrada de lote comprado:** material, lote, fornecedor, nota fiscal, quantidade.
- **Ordem de extrusão:** o setor pode criar uma OP do tipo extrusão para gerar saldo de material extrusado. O apontamento segue o mesmo fluxo de turno, em kg.
- **Mistura:** combina lotes de matérias-primas e aditivos, dá baixa nos componentes, gera um novo número de lote e uma etiqueta. Registra a composição em kg e % e os produtos a que se destina.
- **Entrada na produção:** o apontador informa o material na OP lendo a etiqueta da mistura ou do lote, ou digitando o código. O sistema registra o consumo na OP e a saída do estoque.
- **Devolução:** sobra de material volta ao setor de matéria-prima com etiqueta; o saldo retorna ao lote.
- **Transferência:** sobra de uma máquina parada pode ir direto para outra máquina, com etiqueta, saindo do consumo da OP de origem e entrando na de destino.
- Material moído ou reciclado que volta da produção entra no estoque por lançamento do setor de matéria-prima, com novo lote.
- Consumo real da OP = entradas − devoluções − transferências de saída. O relatório compara com o consumo teórico da ficha técnica.

### RN-11 — Perdas

- Toda perda é lançada por OP com tipo, peso (kg) e quantidade (peças); pelo menos um dos dois valores é obrigatório.
- Tipos iniciais: borra, canal, varredura, rebarba, peça refugada, outros. O cadastro é editável.
- Só os tipos marcados como "conta como refugo de peça" entram no fator Qualidade do OEE.
- A perda gera etiqueta, para rastrear o destino do material.

### RN-12 — Recebimento no estoque

- O usuário do estoque lê o código da etiqueta; o sistema mostra produto, quantidade, OP e turno, e ele confirma o recebimento em um local de estoque.
- Etiqueta cancelada, já recebida ou inexistente é recusada com mensagem clara.
- Um parâmetro do sistema define o que a tela de recebimento lista: só etiquetas pendentes, só recebidas ou ambas. Valor inicial: ambas.
- O saldo de cada local acumula os recebimentos. A baixa acontece na exportação para o ERP (RN-13).

### RN-13 — Fechamento, aprovação e apuração

- **Fechamento:** o apontador encerra cada máquina (ou registra que segue rodando), informa o saldo solto por OP e fecha o turno. Turno fechado não recebe novos eventos. O próximo apontador abre um novo turno.
- **Relatório do turno:** por máquina e OP, mostra produção, meta, perdas, consumo, paradas com motivos e tempos, cavidades bloqueadas, OEE, PH real e todas as pendências.
- **Aprovação do líder:** ele decide cada pendência (horário, peso, correção, justificativa) e depois aprova o relatório. Não é possível aprovar o relatório com pendência em aberto.
- **Apuração do PCP:** o PCP confere os turnos aprovados e marca como apurados. Divergências voltam ao líder como solicitação de correção.
- **Exportação:** o PCP gera os arquivos Excel dos turnos apurados. A exportação marca turnos e etiquetas como exportados, dá baixa do saldo no estoque do aplicativo e guarda o número do lote de exportação. Um item nunca é exportado duas vezes; o arquivo pode ser gerado novamente pelo número do lote.

### RN-14 — Manutenção

- Parada com motivo de manutenção cria uma solicitação com máquina, hora, apontador e descrição.
- O usuário de manutenção faz a triagem: recusa com justificativa ou converte em ordem de serviço corretiva ou preventiva, eletiva ou não.
- A ordem de serviço registra responsável, início, fim e serviço executado.
- Encerrar a ordem de serviço não reinicia a máquina: o reinício é sempre lançado pelo apontador.
- Indicadores do módulo: tempo até o atendimento, tempo de reparo e número de solicitações por máquina.

## 8. Etiquetas e impressão Zebra

Toda saída de produto acabado ou semiacabado, perda, entrada de matéria-prima, devolução, transferência, mistura e volume de extrusão gera etiqueta com código único, impressa em Zebra de rede.

### Código

- **Código legível:** prefixo do posto (2 caracteres, definido no cadastro do dispositivo) + sequência de 7 dígitos, por exemplo `T3-0001245`. O prefixo garante que dois tablets sem conexão nunca gerem o mesmo número.
- **QR Code:** contém código legível, código do produto, data, hora, responsável pelo lançamento e turno, separados por `|`. Exemplo: `T3-0001245|CAD-0031|20261114|1432|jsilva|B-Noite`.
- A leitura aceita o QR Code inteiro ou a digitação do código legível.
- O código é único no banco e nunca é reutilizado, mesmo após cancelamento.

### Conteúdo por tipo de etiqueta

| Tipo | Campos impressos além do código e do QR Code |
| --- | --- |
| Produto acabado ou semiacabado | Produto, quantidade do conjunto, tipo de embalagem, OP (ERP) e divisão, máquina, data, hora, turno, responsável, número do conjunto no lançamento (ex.: 2 de 3); AVULSO em destaque quando for o caso |
| Extrusão | Material, peso, data de fabricação, lote, OP de extrusão, operador que produziu (digitado), turno, média de fluidez, cor, produtos a que se destina |
| Mistura | Novo lote, peso, composição resumida, produtos a que se destina, data, responsável |
| Entrada de matéria-prima | Material, lote, fornecedor, nota fiscal, peso, data |
| Perda | Tipo de perda, peso, quantidade, OP, máquina, data, turno |
| Devolução e transferência | Material, lote, peso, origem, destino, data, responsável |

### Layout e impressão

- O tamanho da etiqueta é parametrizável: cada layout tem largura e altura em mm e um modelo ZPL com campos substituíveis (`{{codigo}}`, `{{produto}}`, `{{quantidade}}` etc.). O superusuário edita o modelo e imprime um teste.
- Entregar um modelo inicial de 100 × 150 mm e outro de 100 × 50 mm para cada tipo.
- Cada layout aponta para uma impressora padrão; o apontador pode escolher outra na hora.
- O envio é feito pelo **agente de impressão**, um serviço pequeno na rede da fábrica que recebe o ZPL por HTTP e o repassa à impressora por TCP (porta 9100). Assim a impressão funciona mesmo com a aplicação na nuvem e mesmo sem internet.
- Falha de impressão não desfaz o lançamento: a etiqueta fica como "impressão pendente" e pode ser reenviada.
- Reimpressão é permitida, registrada com usuário e hora, e a etiqueta reimpressa sai com a indicação "2ª via".

## 9. Layouts de Excel

A troca de dados com o ERP é feita só por arquivos .xlsx: dois de importação e quatro de exportação. Os layouts abaixo são o padrão proposto; como o formato do ERP ainda não é conhecido, o nome de cada coluna é configurável.

### Regras comuns

- Uma tela de mapeamento permite ao superusuário associar cada campo do sistema ao nome da coluna no arquivo, por layout.
- Cada layout tem um arquivo-modelo para baixar.
- A importação valida o arquivo inteiro antes de gravar e mostra os erros por linha; ou importa tudo, ou nada.
- Linha repetida (mesmo número de OP ou mesmo código de produto) atualiza o registro apenas se ele ainda não tiver apontamentos; caso contrário é recusada.
- Toda importação e exportação fica registrada com usuário, data e arquivo.

### Importação

| Layout | Colunas |
| --- | --- |
| Ordens de produção | número da OP no ERP, código do produto, quantidade, unidade, data prevista de início, data prevista de término, observação |
| Produtos | código, descrição, tipo, unidade, cor, quantidade por conjunto padrão, tipo de embalagem |

### Exportação

| Layout | Colunas |
| --- | --- |
| Produção apurada | lote de exportação, número da OP no ERP, número interno, divisão, data, horário de turno, equipe, máquina, molde, código do produto, quantidade produzida, unidade, número de conjuntos, quantidade em conjuntos avulsos, peças refugadas |
| Consumo de matéria-prima | lote de exportação, número da OP no ERP, divisão, data, código do material, lote do material, fornecedor, nota fiscal, entrada (kg), devolução (kg), transferência (kg), consumo líquido (kg) |
| Perdas | lote de exportação, número da OP no ERP, divisão, data, máquina, tipo de perda, peso (kg), quantidade (peças) |
| Etiquetas e recebimento | lote de exportação, código da etiqueta, número da OP no ERP, código do produto, quantidade, unidade, local de estoque, recebido em, recebido por |

A exportação de produção só inclui etiquetas já recebidas no estoque; etiquetas emitidas e não recebidas aparecem em um aviso antes de o PCP confirmar.

## 10. Painéis e indicadores

São dois painéis: o de acompanhamento, em tempo real, e o de indicadores, com apurações diárias, mensais e anuais. Ambos usam as mesmas fórmulas, calculadas só com eventos válidos.

### Fórmulas

| Indicador | Cálculo |
| --- | --- |
| Tempo ligado | Do início ao fim da máquina no turno |
| Tempo planejado | Tempo ligado − paradas programadas |
| Tempo produzindo | Tempo planejado − paradas não programadas |
| Disponibilidade | Tempo produzindo ÷ tempo planejado |
| Produção esperada | Para cada OP da rodada: horas produzindo × PH da ficha, ponderado pelas cavidades ativas em cada intervalo |
| Performance | Produção total (boas + refugadas) ÷ produção esperada, somadas as OPs da rodada |
| Qualidade | Peças boas ÷ (peças boas + peças refugadas) |
| OEE | Disponibilidade × Performance × Qualidade |
| PH real | Produção total ÷ horas produzindo, por máquina + molde + produto |

- Em extrusoras, as mesmas fórmulas valem em kg e kg/h.
- Para períodos (dia, mês, ano) e para grupos de máquinas, somar tempos e quantidades antes de dividir; nunca fazer média de percentuais.
- Performance acima de 100% é exibida com alerta de ficha técnica possivelmente desatualizada.
- Produção com peso em não conformidade pendente conta normalmente; lançamento marcado como incorreto não conta.

### Painel de acompanhamento

- Um cartão por máquina, atualizado automaticamente, legível em TV ou monitor grande.
- Cada cartão mostra: situação (produzindo em verde, parada em vermelho, desligada em cinza), OP(s) em andamento com os dois números, produto, quantidade demandada na OP, quantidade produzida, percentual concluído, meta e realizado do turno, OEE do turno e PH real × padrão.
- Máquina parada: cartão em vermelho com o motivo e o tempo parado, em contagem.
- Indicação de cavidades bloqueadas e de solicitação de manutenção aberta.

### Painel de indicadores

- Filtros: período (dia, mês, ano ou intervalo), máquina, tipo de máquina, molde, produto, horário de turno e equipe.
- OEE com os três fatores, por máquina e evolução no tempo.
- Quantidade produzida por máquina e por tipo de peça.
- PH real × PH padrão por combinação máquina + molde, com a versão da ficha técnica.
- Paradas: tempo e número de ocorrências por motivo, em ordem decrescente, separando programadas e não programadas.
- Perdas por tipo, em kg e peças, e percentual sobre a produção.
- Consumo real × teórico de matéria-prima por OP.
- Comparação entre equipes (A, B, C, D) e entre horários de turno.
- Toda tabela do painel pode ser exportada para Excel.

## 11. Offline e sincronização

O apontador continua lançando quando perde contato com o servidor; os lançamentos ficam salvos no dispositivo e sobem sozinhos quando a conexão volta. As demais funções exigem conexão.

- **O que funciona offline:** abrir turno, ligar máquinas, criar divisão de OP, lançar todos os eventos, emitir e imprimir etiquetas (pelo agente de impressão na rede local), fechar turno.
- **O que exige conexão:** login inicial, cadastros, aprovações, recebimento no estoque, matéria-prima, apuração, importação e exportação, painéis.
- **Dados locais:** ao abrir o turno com conexão, o dispositivo baixa o necessário para trabalhar sozinho: rodadas e OPs das máquinas, fichas técnicas, motivos de parada, tipos de perda, conjuntos padrão e layouts de etiqueta.
- **Fila de envio:** cada lançamento é gravado primeiro no dispositivo, com identificador único gerado ali, e entra em uma fila. O envio é repetido até o servidor confirmar.
- **Sem duplicidade:** o servidor reconhece o identificador do evento; receber o mesmo lançamento duas vezes não gera dois registros.
- **Horas:** a hora do registro de um lançamento offline é a do dispositivo; o servidor grava também a hora em que recebeu. Diferença grande entre o relógio do dispositivo e o do servidor gera alerta ao superusuário.
- **Etiquetas:** a sequência é por dispositivo, com o prefixo do posto, e portanto não depende do servidor.
- **Conflitos:** como os eventos são apenas acrescentados, não há edição concorrente. Se o servidor recusar um evento na sincronização (por exemplo, OP encerrada pelo PCP nesse intervalo), ele fica em uma lista de "lançamentos recusados" para o apontador e o líder resolverem; nada é descartado em silêncio.
- **Indicador na tela:** o apontador vê sempre se está conectado e quantos lançamentos aguardam envio. O turno só pode ser aprovado pelo líder depois que a fila daquele turno estiver vazia.
- **Um turno, um dispositivo:** um turno aberto em um dispositivo não pode ser continuado em outro enquanto houver lançamentos não enviados.

## 12. Fases de entrega

O desenvolvimento está dividido em sete fases, cada uma utilizável e testada antes da seguinte. Use o prompt da seção 1 trocando o número da fase.

### Fase 1 — Fundação e cadastros

**Escopo:** estrutura do repositório, Docker Compose, banco e migrations, login, perfis e permissões, auditoria, parâmetros do sistema, todos os cadastros da seção 6, geração da escala 12x36, compatibilidade molde × máquina e fichas técnicas versionadas (RN-02), carga de dados de exemplo.

**Critérios de aceite:**

- `docker compose up` sobe o sistema completo em uma máquina limpa.
- Cada perfil só acessa o que a seção 5 permite; rota sem permissão retorna erro.
- Alocar molde em máquina incompatível é recusado, com o critério que falhou.
- Alterar ficha vigente cria nova versão; a anterior fica consultável como obsoleta.
- Toda alteração de cadastro aparece na auditoria.

### Fase 2 — OPs, rodadas e apontamento

**Escopo:** importação de OPs e produtos por Excel com mapeamento de colunas, rodadas (RN-01, RN-03), abertura de turno e divisão da OP (RN-04), eventos do turno, paradas e cavidades (RN-05), saída de produção com conjuntos, avulsos e saldo solto (RN-06, ainda sem impressão), conferência de peso (RN-07), horas de ocorrência e registro (RN-08), perdas (RN-11), fechamento do turno e relatório do turno.

**Critérios de aceite:**

- Um turno completo pode ser lançado do início ao fim em tablet, com uma rodada de 3 OPs no mesmo molde.
- A divisão recebe o código no formato `número do ERP-NN` e a meta calculada.
- 3 conjuntos de 30 registram 90 peças; conjunto avulso exige confirmação e aparece destacado.
- O saldo solto deixado em um turno é oferecido na abertura do seguinte, e a produção de cada turno fecha pela fórmula da RN-06.
- Peso fora da tolerância marca NC e exige justificativa.
- Lançamento com hora divergente fica marcado como retroativo ou antecipado.
- Bloquear uma cavidade reduz a produção esperada da OP correspondente.

### Fase 3 — Etiquetas, matéria-prima e estoque

**Escopo:** etiquetas com código único e QR Code, layouts ZPL parametrizáveis, agente de impressão e reimpressão (seção 8); módulo de matéria-prima com lotes, ordem de extrusão, misturas, devoluções e transferências (RN-10); recebimento no estoque por leitura de etiqueta, locais e saldo (RN-12).

**Critérios de aceite:**

- Lançar 3 conjuntos imprime 3 etiquetas com códigos distintos; falha de impressão deixa a etiqueta pendente e reenviável.
- O superusuário altera o tamanho e o modelo de uma etiqueta e imprime um teste.
- Uma mistura dá baixa nos lotes componentes, gera novo lote e etiqueta, e pode ser lida na entrada de matéria-prima de uma OP.
- A etiqueta de extrusão traz todos os campos da seção 8.
- Etiqueta lida no estoque muda para recebida e soma no saldo do local; segunda leitura é recusada.
- O parâmetro de visão do recebimento alterna entre pendentes, recebidas e ambas.

### Fase 4 — Correções, aprovações, apuração e exportação

**Escopo:** fluxo de correção (RN-09), fila de aprovações do líder, aprovação do relatório, apuração do PCP, exportação dos quatro arquivos Excel e baixa de estoque (RN-13, seção 9).

**Critérios de aceite:**

- Correção aprovada deixa o original em vermelho, fora dos cálculos, com vínculo para o lançamento corretivo; nada some da lista.
- Quem solicitou a correção não consegue aprová-la.
- O relatório não pode ser aprovado com pendência aberta, e o PCP não enxerga turno não aprovado para apurar.
- A exportação gera os arquivos no layout mapeado, dá baixa no saldo e não exporta o mesmo item duas vezes.
- Turno exportado não aceita nenhuma alteração.

### Fase 5 — Painéis e indicadores

**Escopo:** fórmulas em `packages/shared`, painel de acompanhamento em tempo real e painel de indicadores (seção 10).

**Critérios de aceite:**

- Testes com valores conhecidos conferem Disponibilidade, Performance, Qualidade, OEE e PH, incluindo rodada com várias OPs e cavidade bloqueada.
- Ao lançar uma parada, o cartão da máquina fica vermelho com motivo e tempo em contagem, sem recarregar a página.
- O OEE do mês é calculado sobre tempos e quantidades somados, não como média dos dias.
- Filtros por equipe e por horário de turno funcionam; tabelas exportam para Excel.

### Fase 6 — Manutenção

**Escopo:** solicitações geradas por parada, triagem, ordens de serviço e indicadores do módulo (RN-14).

**Critérios de aceite:**

- Parada com motivo de manutenção cria a solicitação sem ação extra do apontador.
- A solicitação pode ser recusada com justificativa ou convertida em ordem de serviço corretiva ou preventiva.
- Encerrar a ordem de serviço não reinicia a máquina.
- O painel de acompanhamento indica máquina com solicitação aberta.

### Fase 7 — Offline e implantação

**Escopo:** PWA instalável, dados locais e fila de envio (seção 11), impressão offline pelo agente, rotina de backup, guia de instalação em servidor local e em nuvem, manual rápido por perfil.

**Critérios de aceite:**

- Com a rede do servidor desligada, o apontador lança um turno inteiro e imprime etiquetas; ao religar, tudo sobe sem duplicar.
- Dois tablets offline emitem etiquetas sem código repetido.
- Evento recusado na sincronização aparece na lista de recusados.
- O backup é restaurado com sucesso em uma instalação limpa, seguindo apenas o guia.
