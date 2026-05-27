import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  countEffectiveAdmins,
  createAuditEvent,
  createIdentity,
  createLocalPasswordCredential,
  createSession,
  getIdentity,
  getLocalPasswordCredentialByLogin,
  getSession,
  grantAdminAuthority,
  revokeSession,
} from "./storage.js";

const scryptAsync = promisify(scrypt);
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

export function createIdentityCommands({
  bootstrapSecret,
  database,
  generateId = randomUUID,
  now = () => new Date(),
} = {}) {
  return {
    bootstrapFirstAdmin: input =>
      bootstrapFirstAdmin({ bootstrapSecret, database, generateId, input, now }),
    login: input => login({ database, generateId, input, now }),
    logout: input => logout({ database, input, now }),
    resolveSession: input => resolveSession({ database, input, now }),
  };
}

async function bootstrapFirstAdmin({ bootstrapSecret, database, generateId, input, now }) {
  if (!isValidBootstrapInput(input)) {
    await auditBootstrapRejection({ database, generateId, now, reason: "validation_failed" });
    return rejected("validation_failed");
  }

  if (!safeStringEqual(input.bootstrapSecret, bootstrapSecret)) {
    await auditBootstrapRejection({ database, generateId, now, reason: "invalid_bootstrap_secret" });
    return rejected("invalid_bootstrap_secret");
  }

  if (countEffectiveAdmins(database) > 0) {
    await auditBootstrapRejection({ database, generateId, now, reason: "bootstrap_already_completed" });
    return rejected("bootstrap_already_completed");
  }

  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();
  const identityId = generateId();
  const credentialId = generateId();
  const sessionId = generateId();
  const auditEventId = generateId();
  const passwordHash = await hashPassword(input.password);

  const result = database.transaction(() => {
    const identity = createIdentity(database, {
      id: identityId,
      displayName: input.displayName,
      createdAt,
    });
    createLocalPasswordCredential(database, {
      id: credentialId,
      identityId,
      login: input.login,
      passwordHash,
      createdAt,
    });
    grantAdminAuthority(database, { identityId, grantedAt: createdAt });
    const session = createSession(database, {
      id: sessionId,
      identityId,
      createdAt,
      expiresAt: addSessionDuration(createdAtDate).toISOString(),
    });
    createAuditEvent(database, {
      id: auditEventId,
      eventType: "bootstrap_first_admin",
      targetIdentityId: identityId,
      occurredAt: createdAt,
      outcome: "accepted",
    });

    return { identity, session };
  })();

  return accepted(result);
}

async function login({ database, generateId, input, now }) {
  if (!input?.login || !input?.password) {
    return rejected("invalid_credentials");
  }

  const credential = getLocalPasswordCredentialByLogin(database, input.login);
  if (!credential) {
    return rejected("invalid_credentials");
  }

  const passwordMatches = await verifyPassword(input.password, credential.passwordHash);
  if (!passwordMatches) {
    return rejected("invalid_credentials");
  }

  const identity = getIdentity(database, credential.identityId);
  if (!identity || identity.state === "disabled") {
    return rejected("invalid_credentials");
  }

  const createdAtDate = now();
  const createdAt = createdAtDate.toISOString();
  const session = createSession(database, {
    id: generateId(),
    identityId: identity.id,
    createdAt,
    expiresAt: addSessionDuration(createdAtDate).toISOString(),
  });

  return accepted({ identity, session });
}

function resolveSession({ database, input, now }) {
  const session = getSession(database, input?.sessionId);
  if (!session) {
    return rejected("session_not_found");
  }

  if (session.revokedAt) {
    return rejected("session_revoked");
  }

  if (new Date(session.expiresAt).getTime() <= now().getTime()) {
    return rejected("session_expired");
  }

  const identity = getIdentity(database, session.identityId);
  if (!identity) {
    return rejected("session_not_found");
  }

  if (identity.state === "disabled") {
    return rejected("identity_disabled");
  }

  return accepted({ identity, session });
}

function logout({ database, input, now }) {
  const resolved = resolveSession({ database, input, now });
  if (resolved.status === "rejected") {
    return resolved;
  }

  revokeSession(database, { id: input.sessionId, revokedAt: now().toISOString() });
  return accepted({ loggedOut: true });
}

async function auditBootstrapRejection({ database, generateId, now, reason }) {
  createAuditEvent(database, {
    id: generateId(),
    eventType: "bootstrap_first_admin",
    occurredAt: now().toISOString(),
    outcome: "rejected",
    reason,
  });
}

function isValidBootstrapInput(input) {
  return Boolean(
    input?.bootstrapSecret &&
      input.displayName?.trim() &&
      input.login?.trim() &&
      input.password &&
      input.password.length >= 12,
  );
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$N=16384,r=8,p=1$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

async function verifyPassword(password, passwordHash) {
  const parsed = parsePasswordHash(passwordHash);
  if (!parsed) {
    return false;
  }

  const key = await scryptAsync(password, parsed.salt, parsed.key.length, parsed.options);
  return timingSafeEqual(Buffer.from(key), parsed.key);
}

function parsePasswordHash(passwordHash) {
  const parts = passwordHash.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") {
    return null;
  }

  const options = parseScryptOptions(parts[1]);
  if (!options) {
    return null;
  }

  return {
    options,
    salt: Buffer.from(parts[2], "base64url"),
    key: Buffer.from(parts[3], "base64url"),
  };
}

function parseScryptOptions(value) {
  const entries = new Map(value.split(",").map($0 => $0.split("=")));
  const N = Number(entries.get("N"));
  const r = Number(entries.get("r"));
  const p = Number(entries.get("p"));

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  return { N, r, p };
}

function addSessionDuration(date) {
  return new Date(date.getTime() + sessionDurationMs);
}

function safeStringEqual(left, right) {
  const leftDigest = createHash("sha256").update(left ?? "").digest();
  const rightDigest = createHash("sha256").update(right ?? "").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
