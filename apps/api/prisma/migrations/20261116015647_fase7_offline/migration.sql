-- CreateEnum
CREATE TYPE "SituacaoRecusa" AS ENUM ('PENDENTE', 'DESCARTADO', 'RELANCADO');

-- AlterTable
ALTER TABLE "turno_apontamento" ADD COLUMN     "troca_aparelho_liberada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bloco_etiqueta" (
    "id" UUID NOT NULL,
    "dispositivo_id" UUID NOT NULL,
    "aparelho" TEXT NOT NULL,
    "inicio" INTEGER NOT NULL,
    "fim" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloco_etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recusa_sincronizacao" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "turno_id" UUID,
    "tipo" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "corpo" JSONB NOT NULL,
    "status" INTEGER NOT NULL,
    "mensagem" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" UUID NOT NULL,
    "aparelho" TEXT NOT NULL,
    "situacao" "SituacaoRecusa" NOT NULL DEFAULT 'PENDENTE',
    "decidido_em" TIMESTAMPTZ(3),
    "decidido_por_id" UUID,
    "justificativa" TEXT,
    "evento_relancado_id" UUID,

    CONSTRAINT "recusa_sincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_fila_aparelho" (
    "id" UUID NOT NULL,
    "aparelho" TEXT NOT NULL,
    "turno_id" UUID NOT NULL,
    "pendentes" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estado_fila_aparelho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_relogio" (
    "id" UUID NOT NULL,
    "aparelho" TEXT NOT NULL,
    "usuario_id" UUID,
    "diferenca_seg" INTEGER NOT NULL,
    "maior_seg" INTEGER NOT NULL,
    "ocorrencias" INTEGER NOT NULL DEFAULT 1,
    "primeira_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerta_relogio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bloco_etiqueta_dispositivo_id_inicio_idx" ON "bloco_etiqueta"("dispositivo_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "recusa_sincronizacao_item_id_key" ON "recusa_sincronizacao"("item_id");

-- CreateIndex
CREATE INDEX "recusa_sincronizacao_situacao_idx" ON "recusa_sincronizacao"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "estado_fila_aparelho_aparelho_turno_id_key" ON "estado_fila_aparelho"("aparelho", "turno_id");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_relogio_aparelho_key" ON "alerta_relogio"("aparelho");

-- AddForeignKey
ALTER TABLE "bloco_etiqueta" ADD CONSTRAINT "bloco_etiqueta_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloco_etiqueta" ADD CONSTRAINT "bloco_etiqueta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recusa_sincronizacao" ADD CONSTRAINT "recusa_sincronizacao_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recusa_sincronizacao" ADD CONSTRAINT "recusa_sincronizacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recusa_sincronizacao" ADD CONSTRAINT "recusa_sincronizacao_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_fila_aparelho" ADD CONSTRAINT "estado_fila_aparelho_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_relogio" ADD CONSTRAINT "alerta_relogio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
