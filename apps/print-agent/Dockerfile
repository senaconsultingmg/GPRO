# Agente de impressão (sem dependências externas). Contexto de build: raiz do repositório.
FROM node:22-alpine
WORKDIR /agente
COPY apps/print-agent/package.json ./
COPY apps/print-agent/src ./src
ENV NODE_ENV=production AGENTE_PORTA=9180
EXPOSE 9180
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:9180/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "src/principal.js"]
