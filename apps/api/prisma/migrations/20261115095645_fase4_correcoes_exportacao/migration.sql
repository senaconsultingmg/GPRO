-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimento" ADD VALUE 'ESTORNO_RECEBIMENTO';
ALTER TYPE "TipoMovimento" ADD VALUE 'ESTORNO_CORRECAO';
ALTER TYPE "TipoMovimento" ADD VALUE 'BAIXA_EXPORTACAO';

-- DropIndex
DROP INDEX "recebimento_etiqueta_id_key";

-- AlterTable
ALTER TABLE "aprovacao" ADD COLUMN     "correcao_tipo" TEXT,
ADD COLUMN     "evento_corretivo_id" UUID,
ADD COLUMN     "justificativa" TEXT,
ADD COLUMN     "valores_correcao" JSONB;

-- AlterTable
ALTER TABLE "divisao_op" ADD COLUMN     "exportacao_id" UUID;

-- AlterTable
ALTER TABLE "etiqueta" ADD COLUMN     "cancelada_em" TIMESTAMPTZ(3),
ADD COLUMN     "exportacao_id" UUID,
ADD COLUMN     "motivo_cancelamento" TEXT;

-- AlterTable
ALTER TABLE "recebimento" ADD COLUMN     "estornado_em" TIMESTAMPTZ(3),
ADD COLUMN     "estornado_por_id" UUID,
ADD COLUMN     "motivo_estorno" TEXT;

-- AlterTable
ALTER TABLE "turno_apontamento" ADD COLUMN     "aprovado_em" TIMESTAMPTZ(3),
ADD COLUMN     "aprovado_por_id" UUID,
ADD COLUMN     "apurado_em" TIMESTAMPTZ(3),
ADD COLUMN     "apurado_por_id" UUID,
ADD COLUMN     "devolvido_em" TIMESTAMPTZ(3),
ADD COLUMN     "exportacao_id" UUID,
ADD COLUMN     "exportado_em" TIMESTAMPTZ(3),
ADD COLUMN     "parecer_devolucao" TEXT;

-- CreateTable
CREATE TABLE "lote_exportacao" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnos" INTEGER NOT NULL DEFAULT 0,
    "resumo" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "lote_exportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_exportacao" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "layout" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,

    CONSTRAINT "item_exportacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lote_exportacao_numero_key" ON "lote_exportacao"("numero");

-- CreateIndex
CREATE INDEX "item_exportacao_lote_id_layout_idx" ON "item_exportacao"("lote_id", "layout");

-- CreateIndex
CREATE INDEX "recebimento_etiqueta_id_idx" ON "recebimento"("etiqueta_id");

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_exportacao_id_fkey" FOREIGN KEY ("exportacao_id") REFERENCES "lote_exportacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_exportacao" ADD CONSTRAINT "lote_exportacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_exportacao" ADD CONSTRAINT "item_exportacao_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_exportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
