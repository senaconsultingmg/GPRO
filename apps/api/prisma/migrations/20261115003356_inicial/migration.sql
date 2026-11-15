-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('SUPERUSUARIO', 'PCP', 'APONTADOR', 'LIDER', 'ESTOQUE', 'MATERIA_PRIMA', 'MANUTENCAO');

-- CreateEnum
CREATE TYPE "TipoMaquina" AS ENUM ('INJETORA', 'SOPRADORA', 'EXTRUSORA');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('ACABADO', 'SEMIACABADO', 'MATERIA_PRIMA', 'ADITIVO', 'EXTRUSADO', 'MOIDO', 'RECICLADO', 'MISTURA');

-- CreateEnum
CREATE TYPE "Unidade" AS ENUM ('PECA', 'KG');

-- CreateEnum
CREATE TYPE "TipoEmbalagem" AS ENUM ('PALLET', 'SACO', 'GAIOLA', 'CAIXOTE', 'PILHA', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoFicha" AS ENUM ('RASCUNHO', 'VIGENTE', 'OBSOLETA');

-- CreateEnum
CREATE TYPE "TipoLocalEstoque" AS ENUM ('PRODUTO_ACABADO', 'MATERIA_PRIMA');

-- CreateEnum
CREATE TYPE "ModalidadeTurno" AS ENUM ('CENTRAL', 'REVEZAMENTO');

-- CreateEnum
CREATE TYPE "TipoEtiqueta" AS ENUM ('PRODUTO', 'EXTRUSAO', 'MISTURA', 'ENTRADA_MATERIA_PRIMA', 'PERDA', 'DEVOLUCAO_TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoParametro" AS ENUM ('INTEIRO', 'DECIMAL', 'TEXTO', 'BOOLEANO', 'LISTA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfis" "Perfil"[],
    "equipe_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "deve_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessao_dispositivo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "token_renovacao_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogada_em" TIMESTAMPTZ(3),

    CONSTRAINT "sessao_dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID,
    "usuario_login" TEXT,
    "data_hora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "acao" TEXT NOT NULL,
    "valor_anterior" JSONB,
    "valor_novo" JSONB,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro_sistema" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" "TipoParametro" NOT NULL,
    "opcoes" TEXT[],
    "descricao" TEXT NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "atualizado_por_id" UUID,

    CONSTRAINT "parametro_sistema_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "horario_turno" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "modalidade" "ModalidadeTurno" NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fim" TEXT NOT NULL,
    "dias_semana" INTEGER[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "horario_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipe" (
    "id" UUID NOT NULL,
    "letra" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala" (
    "id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horario_turno_id" UUID NOT NULL,
    "equipe_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoMaquina" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "forca_fechamento_t" DOUBLE PRECISION,
    "distancia_colunas_horizontal_mm" DOUBLE PRECISION,
    "distancia_colunas_vertical_mm" DOUBLE PRECISION,
    "altura_molde_min_mm" DOUBLE PRECISION,
    "altura_molde_max_mm" DOUBLE PRECISION,
    "peso_max_molde_kg" DOUBLE PRECISION,
    "pressao_injecao_bar" DOUBLE PRECISION,
    "capacidade_injecao_g" DOUBLE PRECISION,
    "capacidade_kg_h" DOUBLE PRECISION,
    "parametros_adicionais" JSONB NOT NULL DEFAULT '[]',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maquina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "molde" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "largura_mm" DOUBLE PRECISION NOT NULL,
    "comprimento_mm" DOUBLE PRECISION NOT NULL,
    "altura_mm" DOUBLE PRECISION NOT NULL,
    "peso_kg" DOUBLE PRECISION NOT NULL,
    "numero_cavidades" INTEGER NOT NULL,
    "forca_fechamento_t" DOUBLE PRECISION NOT NULL,
    "pressao_bar" DOUBLE PRECISION NOT NULL,
    "peso_injetado_g" DOUBLE PRECISION NOT NULL,
    "pode_girar" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "molde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cavidade_molde" (
    "id" UUID NOT NULL,
    "molde_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "produto_id" UUID,

    CONSTRAINT "cavidade_molde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoProduto" NOT NULL,
    "unidade" "Unidade" NOT NULL,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conjunto_padrao" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "tipo_embalagem" "TipoEmbalagem" NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conjunto_padrao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ficha_tecnica" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "molde_id" UUID,
    "maquina_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "situacao" "SituacaoFicha" NOT NULL DEFAULT 'RASCUNHO',
    "ciclo_s" DOUBLE PRECISION,
    "cavidades" INTEGER NOT NULL,
    "ph_padrao" DOUBLE PRECISION NOT NULL,
    "ph_calculado" BOOLEAN NOT NULL DEFAULT false,
    "peso_padrao_g" DOUBLE PRECISION,
    "tolerancia_peso_pct" DOUBLE PRECISION,
    "parametros_processo" JSONB NOT NULL DEFAULT '[]',
    "observacao" TEXT,
    "parecer_reprovacao" TEXT,
    "criado_por_id" UUID NOT NULL,
    "aprovador_id" UUID,
    "vigente_desde" TIMESTAMPTZ(3),
    "obsoleta_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ficha_tecnica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_ficha" (
    "id" UUID NOT NULL,
    "ficha_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "consumo_g_por_peca" DOUBLE PRECISION,
    "percentual" DOUBLE PRECISION,

    CONSTRAINT "componente_ficha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivo_parada" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "programada" BOOLEAN NOT NULL,
    "gera_solicitacao_manutencao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "motivo_parada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_perda" (
    "id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "conta_como_refugo" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tipo_perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_estoque" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLocalEstoque" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "local_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impressora" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco_ip" TEXT NOT NULL,
    "porta" INTEGER NOT NULL DEFAULT 9100,
    "resolucao_dpi" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "impressora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_etiqueta" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_etiqueta" "TipoEtiqueta" NOT NULL,
    "largura_mm" DOUBLE PRECISION NOT NULL,
    "altura_mm" DOUBLE PRECISION NOT NULL,
    "modelo_zpl" TEXT NOT NULL,
    "impressora_padrao_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "layout_etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivo" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_login_key" ON "usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_dispositivo_token_renovacao_hash_key" ON "sessao_dispositivo"("token_renovacao_hash");

-- CreateIndex
CREATE INDEX "sessao_dispositivo_usuario_id_dispositivo_idx" ON "sessao_dispositivo"("usuario_id", "dispositivo");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidade_entidade_id_idx" ON "registro_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "registro_auditoria_data_hora_idx" ON "registro_auditoria"("data_hora");

-- CreateIndex
CREATE UNIQUE INDEX "horario_turno_nome_key" ON "horario_turno"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "equipe_letra_key" ON "equipe"("letra");

-- CreateIndex
CREATE UNIQUE INDEX "escala_data_horario_turno_id_key" ON "escala"("data", "horario_turno_id");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_codigo_key" ON "maquina"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "molde_codigo_key" ON "molde"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cavidade_molde_molde_id_numero_key" ON "cavidade_molde"("molde_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "produto_codigo_key" ON "produto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "conjunto_padrao_produto_id_tipo_embalagem_key" ON "conjunto_padrao"("produto_id", "tipo_embalagem");

-- CreateIndex
CREATE INDEX "ficha_tecnica_produto_id_molde_id_maquina_id_idx" ON "ficha_tecnica"("produto_id", "molde_id", "maquina_id");

-- CreateIndex
CREATE UNIQUE INDEX "componente_ficha_ficha_id_material_id_key" ON "componente_ficha"("ficha_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_parada_codigo_key" ON "motivo_parada"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_perda_descricao_key" ON "tipo_perda"("descricao");

-- CreateIndex
CREATE UNIQUE INDEX "local_estoque_nome_key" ON "local_estoque"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "impressora_nome_key" ON "impressora"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "layout_etiqueta_nome_key" ON "layout_etiqueta"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_nome_key" ON "dispositivo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_prefixo_key" ON "dispositivo"("prefixo");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_dispositivo" ADD CONSTRAINT "sessao_dispositivo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_horario_turno_id_fkey" FOREIGN KEY ("horario_turno_id") REFERENCES "horario_turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cavidade_molde" ADD CONSTRAINT "cavidade_molde_molde_id_fkey" FOREIGN KEY ("molde_id") REFERENCES "molde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cavidade_molde" ADD CONSTRAINT "cavidade_molde_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conjunto_padrao" ADD CONSTRAINT "conjunto_padrao_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_molde_id_fkey" FOREIGN KEY ("molde_id") REFERENCES "molde"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_aprovador_id_fkey" FOREIGN KEY ("aprovador_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_ficha" ADD CONSTRAINT "componente_ficha_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "ficha_tecnica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_ficha" ADD CONSTRAINT "componente_ficha_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_etiqueta" ADD CONSTRAINT "layout_etiqueta_impressora_padrao_id_fkey" FOREIGN KEY ("impressora_padrao_id") REFERENCES "impressora"("id") ON DELETE SET NULL ON UPDATE CASCADE;
