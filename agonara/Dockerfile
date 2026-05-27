FROM node:22-alpine

RUN addgroup -S agonara && adduser -S agonara -G agonara

WORKDIR /app

COPY package.json ./
COPY src/ src/

USER agonara

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/operations/health || exit 1

CMD ["node", "src/server.js"]
