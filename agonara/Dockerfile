FROM node:22-bookworm-slim

RUN groupadd --system agonara && useradd --system --gid agonara --home-dir /app agonara

WORKDIR /app

COPY --chown=agonara:agonara package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=agonara:agonara src/ src/
COPY --chown=agonara:agonara scripts/ scripts/

RUN chown -R agonara:agonara /app && mkdir -p /data && chown agonara:agonara /data

USER agonara

ENV AGONARA_DB_PATH=/data/agonara.sqlite
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))'

CMD ["node", "src/server.js"]
