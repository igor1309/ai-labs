FROM node:22-bookworm-slim

RUN groupadd --system agonara && useradd --system --gid agonara --home-dir /app agonara

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ src/

RUN mkdir -p /data && chown agonara:agonara /data

USER agonara

ENV AGONARA_DB_PATH=/data/agonara.sqlite
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/operations/health || exit 1

CMD ["node", "src/server.js"]
