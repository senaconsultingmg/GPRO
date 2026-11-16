# Manual rápido por perfil

Entre pelo navegador (ou pelo aplicativo instalado no tablet) com seu login e senha. No primeiro acesso, o sistema pede para trocar a senha. Todo perfil vê os **painéis** (Acompanhamento e Indicadores). Datas em dd/mm/aaaa e horas em 24 h, no horário de São Paulo.

---

## Apontador

Tela: **Apontamento** (tablet). Botões grandes; quase nada precisa de teclado.

1. **Abrir turno:** confira data, horário e equipe sugeridos pela escala e toque em **Abrir turno**.
2. **Ligar máquina:** toque em **Ligar máquina**, escolha a máquina na lista e confirme a hora. Se ela vinha rodando do turno anterior, a hora de início já vem sugerida.
3. **Divisão da OP:** para cada OP da rodada, toque em **Criar divisão**. O sistema propõe o código (ex.: `04508401001-02`), as horas disponíveis e a meta. Se o turno anterior deixou saldo solto, confirme o saldo recebido.
4. **Lançar:** no cartão da máquina, toque no tipo de lançamento:
   - **Produção:** número de conjuntos padrão (+/−), peso médio da peça. Conjunto avulso exige confirmação. Cada conjunto imprime uma etiqueta.
   - **Parada / Reinício**, **Perda**, **Matéria-prima** (leia a etiqueta do lote), **Semiacabado**, **Devolução**, **Transferência**, **Bloquear/Desbloquear cavidade**.
   - A hora vem preenchida com a hora atual; se mudar mais de 10 minutos, o lançamento fica marcado como retroativo/antecipado e vai para o líder.
   - Peso fora da tolerância exige justificativa (vai para o líder).
5. **Corrigir um lançamento:** na lista de lançamentos, toque em **Corrigir**, informe os valores certos ou anule, e o motivo. O líder aprova.
6. **Fechar turno:** toque em **Fechar turno**, diga se cada máquina desliga ou segue rodando e informe o saldo solto de cada OP.

**Sem conexão (offline):**

- O topo mostra **Sem conexão** e **N aguardando envio**. Continue trabalhando normalmente: abrir turno, ligar máquinas, criar divisões, lançar, imprimir etiquetas e fechar o turno.
- O código da divisão criada offline aparece como **provisório** até a fila subir.
- Ao voltar a rede, a fila sobe sozinha (ou toque em **N aguardando envio** para tentar na hora).
- Não troque de tablet com lançamentos pendentes: o turno só continua em outro tablet depois que o primeiro enviar a fila (ou com liberação do líder).
- Se algo for recusado pelo servidor, aparece em **Lançamentos recusados**: relance corrigido ou descarte com justificativa.

**Etiquetas:** em **Etiquetas**, filtre "Só impressão pendente" para reenviar as que falharam; a reimpressão sai como "2ª via".

---

## Líder de produção

Telas: **Aprovações**, **Turnos e relatórios**, **Lançamentos recusados**.

1. Em **Aprovações**, decida cada pendência (horário, peso, justificativa, correção) com parecer. Quem solicitou uma correção não pode aprová-la.
2. Com o turno fechado e sem pendências, toque em **Aprovar relatório**. O relatório não é aprovado enquanto houver pendência aberta ou lançamentos do tablet ainda não enviados.
3. Em **Lançamentos recusados**, veja o motivo de cada recusa e descarte com justificativa quando não houver o que relançar.
4. Tablet quebrado com turno aberto: no relatório do turno, **Liberar troca de tablet** (com justificativa) para o apontador continuar em outro aparelho.
5. Pode solicitar correções e registrar solicitações de manutenção manuais.

---

## PCP

Telas: **Ordens de produção**, **Importação Excel**, **Rodadas**, **Fichas técnicas**, **Apuração e exportação**.

1. **Importação Excel:** baixe o modelo, preencha e envie. O arquivo inteiro é validado antes de gravar.
2. **Rodadas:** escolha máquina e molde compatíveis e vincule as OPs com suas cavidades e fichas.
3. **Fichas técnicas:** crie e revise (o superusuário aprova).
4. **Apuração:** confira os turnos aprovados e **Apurar**, ou **Devolver ao líder** com parecer.
5. **Exportação:** veja a prévia, **Exportar** e baixe os 4 arquivos do lote. A exportação dá baixa no estoque e nunca repete itens.

---

## Estoque

Tela: **Estoque**.

1. **Recebimento:** leia a etiqueta do produto, confira produto, quantidade, OP e turno e confirme o local.
2. **Saldo por local** e **Estorno** de recebimento (quando o líder vai corrigir um lançamento cuja etiqueta já foi recebida).

---

## Matéria-prima

Tela: **Matéria-prima**.

Entrada de lote comprado, mistura (baixa os componentes e gera lote com etiqueta), recebimento de devoluções e volumes de extrusão, moído/reciclado, transferência entre locais, ordem de extrusão, saldo por lote e estorno.

---

## Manutenção

Tela: **Manutenção**.

- **Técnico:** em **Minhas etapas**, toque em **Iniciar** e depois **Concluir** (com o serviço executado). Só aparecem as etapas liberadas da sua especialidade.
- **Controlador:** em **Solicitações**, faça a triagem, recuse com justificativa ou **Aprove/abra OS** montando as etapas em sequência (mesma ordem = em paralelo) ou a partir de um modelo. Em **Ordens de serviço**, acompanhe, inclua/cancele etapas e encerre a OS. Encerrar não reinicia a máquina: o reinício é sempre do apontador.

---

## Superusuário

- **Cadastros** (máquinas, moldes, produtos, conjuntos, turnos, escala, motivos, tipos de perda, locais, impressoras, layouts, dispositivos), **Usuários** (perfis, especialidades e controlador de manutenção), **Parâmetros** do sistema e aprovação de **fichas técnicas**.
- **Alertas de relógio:** tablets com relógio diferente do servidor. Acerte o relógio do aparelho e marque como resolvido.
- **Auditoria:** toda criação, alteração, aprovação, correção e exportação, com valores anterior e novo.
- **Backup e restauração:** ver `docs/INSTALACAO.md`.
