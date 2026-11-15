-- CreateEnum
CREATE TYPE "EspecialidadeManutencao" AS ENUM ('ELETRICA', 'MECANICA', 'HIDRAULICA', 'FERRAMENTARIA', 'SETUP', 'PREDIAL');

-- CreateEnum
CREATE TYPE "SituacaoSolicitacao" AS ENUM ('ABERTA', 'EM_TRIAGEM', 'CONVERTIDA', 'RECUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "TipoOrdemServico" AS ENUM ('CORRETIVA', 'PREVENTIVA');

-- CreateEnum
CREATE TYPE "SituacaoOrdemServico" AS ENUM ('ABERTA', 'EM_EXECUCAO', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "SituacaoEtapa" AS ENUM ('PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "controlador_manutencao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "especialidades" "EspecialidadeManutencao"[] DEFAULT ARRAY[]::"EspecialidadeManutencao"[];

-- CreateTable
CREATE TABLE "solicitacao_manutencao" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "maquina_id" UUID,
    "local" TEXT,
    "evento_parada_id" UUID,
    "descricao" TEXT NOT NULL,
    "solicitante_id" UUID NOT NULL,
    "situacao" "SituacaoSolicitacao" NOT NULL DEFAULT 'ABERTA',
    "ocorrida_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triagem_em" TIMESTAMPTZ(3),
    "triagem_por_id" UUID,
    "recusada_em" TIMESTAMPTZ(3),
    "justificativa_recusa" TEXT,

    CONSTRAINT "solicitacao_manutencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordem_servico" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "solicitacao_id" UUID NOT NULL,
    "tipo" "TipoOrdemServico" NOT NULL,
    "eletiva" BOOLEAN NOT NULL DEFAULT false,
    "situacao" "SituacaoOrdemServico" NOT NULL DEFAULT 'ABERTA',
    "controlador_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inicio" TIMESTAMPTZ(3),
    "fim" TIMESTAMPTZ(3),
    "servico_executado" TEXT,
    "encerrada_em" TIMESTAMPTZ(3),
    "encerrada_por_id" UUID,

    CONSTRAINT "ordem_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_ordem_servico" (
    "id" UUID NOT NULL,
    "ordem_servico_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "especialidade" "EspecialidadeManutencao" NOT NULL,
    "responsavel_id" UUID,
    "executor_id" UUID,
    "situacao" "SituacaoEtapa" NOT NULL DEFAULT 'PENDENTE',
    "inicio" TIMESTAMPTZ(3),
    "fim" TIMESTAMPTZ(3),
    "servico_executado" TEXT,
    "justificativa_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapa_ordem_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_sequencia" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "etapas" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modelo_sequencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitacao_manutencao_numero_key" ON "solicitacao_manutencao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacao_manutencao_evento_parada_id_key" ON "solicitacao_manutencao"("evento_parada_id");

-- CreateIndex
CREATE INDEX "solicitacao_manutencao_situacao_idx" ON "solicitacao_manutencao"("situacao");

-- CreateIndex
CREATE INDEX "solicitacao_manutencao_maquina_id_situacao_idx" ON "solicitacao_manutencao"("maquina_id", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "ordem_servico_numero_key" ON "ordem_servico"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ordem_servico_solicitacao_id_key" ON "ordem_servico"("solicitacao_id");

-- CreateIndex
CREATE INDEX "etapa_ordem_servico_ordem_servico_id_ordem_idx" ON "etapa_ordem_servico"("ordem_servico_id", "ordem");

-- CreateIndex
CREATE INDEX "etapa_ordem_servico_especialidade_situacao_idx" ON "etapa_ordem_servico"("especialidade", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_sequencia_nome_key" ON "modelo_sequencia"("nome");

-- AddForeignKey
ALTER TABLE "solicitacao_manutencao" ADD CONSTRAINT "solicitacao_manutencao_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_manutencao" ADD CONSTRAINT "solicitacao_manutencao_evento_parada_id_fkey" FOREIGN KEY ("evento_parada_id") REFERENCES "evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_manutencao" ADD CONSTRAINT "solicitacao_manutencao_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao_manutencao" ADD CONSTRAINT "solicitacao_manutencao_triagem_por_id_fkey" FOREIGN KEY ("triagem_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacao_manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_controlador_id_fkey" FOREIGN KEY ("controlador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_encerrada_por_id_fkey" FOREIGN KEY ("encerrada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_ordem_servico" ADD CONSTRAINT "etapa_ordem_servico_ordem_servico_id_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordem_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_ordem_servico" ADD CONSTRAINT "etapa_ordem_servico_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_ordem_servico" ADD CONSTRAINT "etapa_ordem_servico_executor_id_fkey" FOREIGN KEY ("executor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_sequencia" ADD CONSTRAINT "modelo_sequencia_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
