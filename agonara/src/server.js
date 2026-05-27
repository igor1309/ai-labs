import http from "node:http";
import { pathToFileURL } from "node:url";

export function createServer() {
  return http.createServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "rejected", reason: "not_found" }));
  });
}

export function startServer({ host = process.env.HOST ?? "0.0.0.0", port = process.env.PORT ?? "8080" } = {}) {
  const server = createServer();
  server.listen(Number(port), host);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
