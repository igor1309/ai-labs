FROM node:22-alpine

RUN addgroup -S nomos && adduser -S nomos -G nomos

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY src/ src/

RUN mkdir -p /app/data && chown nomos:nomos /app/data

USER nomos

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "src/server.js"]
