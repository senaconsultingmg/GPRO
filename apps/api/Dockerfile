# Contexto de build: raiz do repositório.
# Alpine já traz a libssl 3 exigida pelo motor de migrations do Prisma.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @apontamento/api... --filter @apontamento/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @apontamento/shared build && pnpm --filter @apontamento/api build

FROM base AS execucao
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "docker-entrypoint.sh"]
