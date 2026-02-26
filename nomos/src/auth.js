import { createHash } from "node:crypto";

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function redactToken(token) {
  if (!token || token.length < 8) return "***";
  return token.slice(0, 4) + "***" + token.slice(-4);
}

export function createAuthMiddleware({ db, logger, allowedScope }) {
  const findProject = db.prepare(
    "SELECT id, name, scope, active FROM projects WHERE token_hash = ?"
  );

  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("auth failed: missing bearer token");
      return res.status(401).json({ error: "missing bearer token" });
    }

    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);

    const project = findProject.get(tokenHash);
    if (!project) {
      logger.warn("auth failed: invalid token", { token_hash: tokenHash });
      return res.status(401).json({ error: "invalid token" });
    }

    if (!project.active) {
      logger.warn("auth failed: inactive project", { project_id: project.id });
      return res.status(401).json({ error: "project inactive" });
    }

    if (project.scope !== allowedScope) {
      logger.warn("auth failed: scope mismatch", {
        project_id: project.id,
        required: allowedScope,
        actual: project.scope,
      });
      return res.status(403).json({ error: "scope not allowed" });
    }

    req.project = { id: project.id, name: project.name, scope: project.scope };
    next();
  };
}
