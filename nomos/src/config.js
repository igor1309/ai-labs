export function loadConfig() {
  return {
    port: parseInt(process.env.NOMOS_PORT || "8080", 10),
    host: process.env.NOMOS_HOST || "0.0.0.0",
    dbPath: process.env.NOMOS_DB_PATH || "data/nomos.db",
    env: process.env.NODE_ENV || "development",
  };
}
