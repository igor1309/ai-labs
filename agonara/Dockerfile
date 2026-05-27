FROM node:22-alpine

RUN addgroup -S agonara && adduser -S agonara -G agonara

WORKDIR /app

COPY package.json ./
COPY src/ src/

USER agonara

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
