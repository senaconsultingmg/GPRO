-- CreateEnum
CREATE TYPE "SituacaoEtiqueta" AS ENUM ('EMITIDA', 'RECEBIDA', 'CONSUMIDA', 'EXPORTADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemLote" AS ENUM ('COMPRA', 'EXTRUSAO', 'MISTURA', 'MOIDO', 'RECICLADO');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_RETORNO', 'ENTRADA_EXTRUSAO', 'ENTRADA_MISTURA', 'SAIDA_MISTURA', 'CONSUMO_PRODUCAO', 'DEVOLUCAO_PRODUCAO', 'TRANSFERENCIA_LOCAL', 'RECEBIMENTO_PRODUTO', 'CONSUMO_SEMIACABADO');

-- CreateTable
CREATE TABLE "sequencia_dispositivo" (
    "dispositivo_id" UUID NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequencia_dispositivo_pkey" PRIMARY KEY ("dispositivo_id")
);

-- CreateTable
CREATE TABLE "etiqueta" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "dispositivo_id" UUID NOT NULL,
    "tipo" "TipoEtiqueta" NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "unidade" "Unidade" NOT NULL,
    "peso_kg" DOUBLE PRECISION,
    "lote_id" UUID,
    "evento_id" UUID,
    "divisao_id" UUID,
    "turno_id" UUID,
    "responsavel_id" UUID NOT NULL,
    "emitida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avulso" BOOLEAN NOT NULL DEFAULT false,
    "numero_no_lancamento" INTEGER,
    "total_no_lancamento" INTEGER,
    "situacao" "SituacaoEtiqueta" NOT NULL DEFAULT 'EMITIDA',
    "impressao_pendente" BOOLEAN NOT NULL DEFAULT true,
    "reimpressoes" INTEGER NOT NULL DEFAULT 0,
    "local_estoque_id" UUID,
    "dados" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impressao_etiqueta" (
    "id" UUID NOT NULL,
    "etiqueta_id" UUID,
    "layout_id" UUID,
    "impressora_id" UUID,
    "usuario_id" UUID NOT NULL,
    "segunda_via" BOOLEAN NOT NULL DEFAULT false,
    "teste" BOOLEAN NOT NULL DEFAULT false,
    "sucesso" BOOLEAN,
    "mensagem" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "impressao_etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_material" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "material_id" UUID NOT NULL,
    "origem" "OrigemLote" NOT NULL,
    "fornecedor" TEXT,
    "nota_fiscal" TEXT,
    "lote_fornecedor" TEXT,
    "quantidade_inicial" DOUBLE PRECISION NOT NULL,
    "indice_fluidez" DOUBLE PRECISION,
    "cor" TEXT,
    "ordem_extrusao_id" UUID,
    "divisao_id" UUID,
    "observacao" TEXT,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lote_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistura" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "produtos_destino" TEXT[],
    "responsavel_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mistura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_mistura" (
    "id" UUID NOT NULL,
    "mistura_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "quantidade_kg" DOUBLE PRECISION NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "componente_mistura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimento_estoque" (
    "id" UUID NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "produto_id" UUID NOT NULL,
    "lote_id" UUID,
    "etiqueta_id" UUID,
    "local_origem_id" UUID,
    "local_destino_id" UUID,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "evento_id" UUID,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "movimento_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento" (
    "id" UUID NOT NULL,
    "etiqueta_id" UUID NOT NULL,
    "local_estoque_id" UUID NOT NULL,
    "recebido_por_id" UUID NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recebimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_codigo_key" ON "etiqueta"("codigo");

-- CreateIndex
CREATE INDEX "etiqueta_tipo_situacao_idx" ON "etiqueta"("tipo", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_dispositivo_id_sequencia_key" ON "etiqueta"("dispositivo_id", "sequencia");

-- CreateIndex
CREATE UNIQUE INDEX "lote_material_numero_key" ON "lote_material"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "mistura_lote_id_key" ON "mistura"("lote_id");

-- CreateIndex
CREATE INDEX "movimento_estoque_lote_id_idx" ON "movimento_estoque"("lote_id");

-- CreateIndex
CREATE INDEX "movimento_estoque_produto_id_idx" ON "movimento_estoque"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "recebimento_etiqueta_id_key" ON "recebimento"("etiqueta_id");

-- AddForeignKey
ALTER TABLE "sequencia_dispositivo" ADD CONSTRAINT "sequencia_dispositivo_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_dispositivo_id_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_divisao_id_fkey" FOREIGN KEY ("divisao_id") REFERENCES "divisao_op"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_apontamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_local_estoque_id_fkey" FOREIGN KEY ("local_estoque_id") REFERENCES "local_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressao_etiqueta" ADD CONSTRAINT "impressao_etiqueta_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressao_etiqueta" ADD CONSTRAINT "impressao_etiqueta_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "layout_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressao_etiqueta" ADD CONSTRAINT "impressao_etiqueta_impressora_id_fkey" FOREIGN KEY ("impressora_id") REFERENCES "impressora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressao_etiqueta" ADD CONSTRAINT "impressao_etiqueta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_material" ADD CONSTRAINT "lote_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_material" ADD CONSTRAINT "lote_material_ordem_extrusao_id_fkey" FOREIGN KEY ("ordem_extrusao_id") REFERENCES "ordem_producao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_material" ADD CONSTRAINT "lote_material_divisao_id_fkey" FOREIGN KEY ("divisao_id") REFERENCES "divisao_op"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_material" ADD CONSTRAINT "lote_material_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistura" ADD CONSTRAINT "mistura_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistura" ADD CONSTRAINT "mistura_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_mistura" ADD CONSTRAINT "componente_mistura_mistura_id_fkey" FOREIGN KEY ("mistura_id") REFERENCES "mistura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_mistura" ADD CONSTRAINT "componente_mistura_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_local_origem_id_fkey" FOREIGN KEY ("local_origem_id") REFERENCES "local_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_local_destino_id_fkey" FOREIGN KEY ("local_destino_id") REFERENCES "local_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiqueta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_local_estoque_id_fkey" FOREIGN KEY ("local_estoque_id") REFERENCES "local_estoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_recebido_por_id_fkey" FOREIGN KEY ("recebido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
