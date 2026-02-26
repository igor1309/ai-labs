export function createLogger() {
  function write(level, msg, data) {
    const entry = { level, msg, ts: new Date().toISOString(), ...data };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    info(msg, data = {}) {
      write("info", msg, data);
    },
    warn(msg, data = {}) {
      write("warn", msg, data);
    },
    error(msg, data = {}) {
      write("error", msg, data);
    },
  };
}
