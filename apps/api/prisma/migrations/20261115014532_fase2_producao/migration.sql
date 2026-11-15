-- CreateEnum
CREATE TYPE "TipoOrdem" AS ENUM ('PRODUCAO', 'EXTRUSAO');

-- CreateEnum
CREATE TYPE "SituacaoOrdem" AS ENUM ('ABERTA', 'EM_PRODUCAO', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SituacaoRodada" AS ENUM ('PLANEJADA', 'EM_ANDAMENTO', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "SituacaoTurno" AS ENUM ('ABERTO', 'FECHADO', 'APROVADO', 'APURADO', 'EXPORTADO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO', 'ENTRADA_MATERIA_PRIMA', 'ENTRADA_SEMIACABADO', 'SAIDA_PRODUCAO', 'PERDA', 'DEVOLUCAO_MATERIA_PRIMA', 'TRANSFERENCIA', 'BLOQUEIO_CAVIDADE', 'DESBLOQUEIO_CAVIDADE', 'SALDO_AVULSO_DEIXADO', 'SALDO_AVULSO_RECEBIDO');

-- CreateEnum
CREATE TYPE "MarcaHorario" AS ENUM ('NO_MOMENTO', 'RETROATIVO', 'ANTECIPADO');

-- CreateEnum
CREATE TYPE "SituacaoEvento" AS ENUM ('VALIDO', 'CORRECAO_PENDENTE', 'INCORRETO');

-- CreateEnum
CREATE TYPE "TipoAprovacao" AS ENUM ('CORRECAO', 'HORARIO', 'PESO', 'JUSTIFICATIVA', 'RELATORIO_TURNO');

-- CreateEnum
CREATE TYPE "SituacaoAprovacao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- AlterTable
ALTER TABLE "horario_turno" ADD COLUMN     "parada_programada_prevista_min" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ordem_producao" (
    "id" UUID NOT NULL,
    "numero_interno" SERIAL NOT NULL,
    "numero_erp" TEXT,
    "tipo" "TipoOrdem" NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "unidade" "Unidade" NOT NULL,
    "data_inicio_prevista" DATE,
    "data_fim_prevista" DATE,
    "observacao" TEXT,
    "situacao" "SituacaoOrdem" NOT NULL DEFAULT 'ABERTA',
    "origem" TEXT NOT NULL DEFAULT 'DIGITACAO',
    "criado_por_id" UUID NOT NULL,
    "encerrada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ordem_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rodada" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "maquina_id" UUID NOT NULL,
    "molde_id" UUID,
    "situacao" "SituacaoRodada" NOT NULL DEFAULT 'PLANEJADA',
    "observacao" TEXT,
    "criado_por_id" UUID NOT NULL,
    "iniciada_em" TIMESTAMPTZ(3),
    "encerrada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rodada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rodada_op" (
    "id" UUID NOT NULL,
    "rodada_id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "ficha_tecnica_id" UUID NOT NULL,
    "cavidades" INTEGER[],

    CONSTRAINT "rodada_op_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno_apontamento" (
    "id" UUID NOT NULL,
    "apontador_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horario_turno_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "inicio_nominal" TIMESTAMPTZ(3) NOT NULL,
    "fim_nominal" TIMESTAMPTZ(3) NOT NULL,
    "aberto_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" TIMESTAMPTZ(3),
    "situacao" "SituacaoTurno" NOT NULL DEFAULT 'ABERTO',
    "dispositivo" TEXT NOT NULL,

    CONSTRAINT "turno_apontamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_turno" (
    "id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "maquina_id" UUID NOT NULL,
    "rodada_id" UUID NOT NULL,
    "segue_rodando" BOOLEAN NOT NULL DEFAULT false,
    "parada_aberta_motivo_id" UUID,

    CONSTRAINT "maquina_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisao_op" (
    "id" UUID NOT NULL,
    "ordem_id" UUID NOT NULL,
    "rodada_op_id" UUID NOT NULL,
    "sequencial" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "turno_id" UUID NOT NULL,
    "maquina_id" UUID NOT NULL,
    "horas_disponiveis" DOUBLE PRECISION NOT NULL,
    "ph_referencia" DOUBLE PRECISION NOT NULL,
    "meta" DOUBLE PRECISION NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divisao_op_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento" (
    "id" UUID NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "turno_id" UUID NOT NULL,
    "maquina_id" UUID NOT NULL,
    "rodada_id" UUID,
    "divisao_id" UUID,
    "hora_ocorrencia" TIMESTAMPTZ(3) NOT NULL,
    "hora_registro" TIMESTAMPTZ(3) NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" UUID NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "quantidade" DOUBLE PRECISION,
    "marca_horario" "MarcaHorario" NOT NULL DEFAULT 'NO_MOMENTO',
    "peso_nao_conforme" BOOLEAN NOT NULL DEFAULT false,
    "situacao" "SituacaoEvento" NOT NULL DEFAULT 'VALIDO',
    "corrige_evento_id" UUID,
    "justificativa" TEXT,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacao" (
    "id" UUID NOT NULL,
    "tipo" "TipoAprovacao" NOT NULL,
    "turno_id" UUID NOT NULL,
    "evento_id" UUID,
    "descricao" TEXT NOT NULL,
    "solicitante_id" UUID NOT NULL,
    "aprovador_id" UUID,
    "situacao" "SituacaoAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "parecer" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_em" TIMESTAMPTZ(3),

    CONSTRAINT "aprovacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacao" (
    "id" UUID NOT NULL,
    "layout" TEXT NOT NULL,
    "arquivo_nome" TEXT NOT NULL,
    "arquivo" BYTEA NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucesso" BOOLEAN NOT NULL,
    "linhas" INTEGER NOT NULL,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "erros" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapeamento_coluna" (
    "id" UUID NOT NULL,
    "layout" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "coluna" TEXT NOT NULL,

    CONSTRAINT "mapeamento_coluna_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordem_producao_numero_interno_key" ON "ordem_producao"("numero_interno");

-- CreateIndex
CREATE UNIQUE INDEX "ordem_producao_numero_erp_key" ON "ordem_producao"("numero_erp");

-- CreateIndex
CREATE UNIQUE INDEX "rodada_numero_key" ON "rodada"("numero");

-- CreateIndex
CREATE INDEX "rodada_maquina_id_situacao_idx" ON "rodada"("maquina_id", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "rodada_op_rodada_id_ordem_id_key" ON "rodada_op"("rodada_id", "ordem_id");

-- CreateIndex
CREATE INDEX "turno_apontamento_apontador_id_situacao_idx" ON "turno_apontamento"("apontador_id", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_turno_turno_id_maquina_id_key" ON "maquina_turno"("turno_id", "maquina_id");

-- CreateIndex
CREATE UNIQUE INDEX "divisao_op_codigo_key" ON "divisao_op"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "divisao_op_ordem_id_sequencial_key" ON "divisao_op"("ordem_id", "sequencial");

-- CreateIndex
CREATE UNIQUE INDEX "divisao_op_turno_id_rodada_op_id_key" ON "divisao_op"("turno_id", "rodada_op_id");

-- CreateIndex
CREATE INDEX "evento_turno_id_maquina_id_hora_ocorrencia_idx" ON "evento"("turno_id", "maquina_id", "hora_ocorrencia");

-- CreateIndex
CREATE INDEX "evento_rodada_id_tipo_idx" ON "evento"("rodada_id", "tipo");

-- CreateIndex
CREATE INDEX "evento_divisao_id_tipo_idx" ON "evento"("divisao_id", "tipo");

-- CreateIndex
CREATE INDEX "aprovacao_turno_id_situacao_idx" ON "aprovacao"("turno_id", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "mapeamento_coluna_layout_campo_key" ON "mapeamento_coluna"("layout", "campo");

-- AddForeignKey
ALTER TABLE "ordem_producao" ADD CONSTRAINT "ordem_producao_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_producao" ADD CONSTRAINT "ordem_producao_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_molde_id_fkey" FOREIGN KEY ("molde_id") REFERENCES "molde"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada" ADD CONSTRAINT "rodada_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada_op" ADD CONSTRAINT "rodada_op_rodada_id_fkey" FOREIGN KEY ("rodada_id") REFERENCES "rodada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada_op" ADD CONSTRAINT "rodada_op_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordem_producao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodada_op" ADD CONSTRAINT "rodada_op_ficha_tecnica_id_fkey" FOREIGN KEY ("ficha_tecnica_id") REFERENCES "ficha_tecnica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_apontamento" ADD CONSTRAINT "turno_apontamento_apontador_id_fkey" FOREIGN KEY ("apontador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_apontamento" ADD CONSTRAINT "turno_apontamento_horario_turno_id_fkey" FOREIGN KEY ("horario_turno_id") REFERENCES "horario_turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_apontamento" ADD CONSTRAINT "turno_apontamento_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_turno" ADD CONSTRAINT "maquina_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_turno" ADD CONSTRAINT "maquina_turno_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_turno" ADD CONSTRAINT "maquina_turno_rodada_id_fkey" FOREIGN KEY ("rodada_id") REFERENCES "rodada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisao_op" ADD CONSTRAINT "divisao_op_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordem_producao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisao_op" ADD CONSTRAINT "divisao_op_rodada_op_id_fkey" FOREIGN KEY ("rodada_op_id") REFERENCES "rodada_op"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisao_op" ADD CONSTRAINT "divisao_op_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisao_op" ADD CONSTRAINT "divisao_op_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_rodada_id_fkey" FOREIGN KEY ("rodada_id") REFERENCES "rodada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_divisao_id_fkey" FOREIGN KEY ("divisao_id") REFERENCES "divisao_op"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_aprovador_id_fkey" FOREIGN KEY ("aprovador_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
