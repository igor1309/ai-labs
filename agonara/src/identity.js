import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  countEffectiveAdmins,
  createAuditEvent,
  createIdentity as insertIdentity,
  createLocalPasswordCredential,
  createSession,
  disableIdentity as disableStoredIdentity,
  exportIdentityBackup,
  getIdentity,
  getLocalPasswordCredentialByLogin,
  getSession,
  grantAdminAuthority,
  isEffectiveAdmin,
  listAuditEvents as readAuditEvents,
  listIdentities as readIdentities,
  restoreIdentityBackup,
  revokeAdminAuthority,
  revokeSession,
} from "./storage.js";

const scryptAsync = promisify(scrypt);
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

export function createIdentityCommands({
  bootstrapSecret,
  database,
  generateId = randomUUID,
  now = () => new Date(),
  operationLog = () => {},
} = {}) {
  return {
    bootstrapFirstAdmin: input =>
      bootstrapFirstAdmin({ bootstrapSecret, database, generateId, input, now }),
    bindLocalPasswordCredential: input =>
      bindLocalPasswordCredential({ database, generateId, input, now }),
    createIdentity: input => createIdentity({ database, generateId, input, now }),
    disableIdentity: input => disableIdentity({ database, generateId, input, now }),
    getOperationalAccessState: input =>
      getOperationalAccessState({ database, input, now }),
    grantAdmin: input => grantAdmin({ database, generateId, input, now }),
    exportBackup: () => exportBackup({ database, now, operationLog }),
    getBootstrapStatus: () => accepted({ available: countEffectiveAdmins(database) === 0 }),
    listAuditEvents: input => listAuditEvents({ database, input, now }),
    listIdentities: input => listIdentities({ database, input, now }),
    login: input => login({ database, generateId, input, now }),
    logout: input => logout({ database, input, now }),
    restoreBackup: input => restoreBackup({ database, input, now, operationLog }),
    revokeAdmin: input => revokeAdmin({ database, generateId, input, now }),
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
    const identity = insertIdentity(database, {
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

function createIdentity({ database, generateId, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    auditDomainEvent({
      database,
      eventType: "identity_created",
      generateId,
      now,
      outcome: "rejected",
      reason: actor.reason,
      actorIdentityId: actor.actorIdentityId,
    });
    return rejected(actor.reason);
  }

  if (!input?.displayName?.trim()) {
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "identity_created",
      generateId,
      now,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const createdAt = now().toISOString();
  const identityId = generateId();
  const auditEventId = generateId();
  const identity = insertIdentity(database, {
    id: identityId,
    displayName: input.displayName,
    createdAt,
  });
  createAuditEvent(database, {
    id: auditEventId,
    eventType: "identity_created",
    actorIdentityId: actor.value.identity.id,
    targetIdentityId: identityId,
    occurredAt: createdAt,
    outcome: "accepted",
  });

  return accepted(identity);
}

async function bindLocalPasswordCredential({ database, generateId, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    auditDomainEvent({
      database,
      eventType: "local_password_credential_bound",
      generateId,
      now,
      outcome: "rejected",
      reason: actor.reason,
      actorIdentityId: actor.actorIdentityId,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(actor.reason);
  }

  if (!input?.identityId || !input.login?.trim() || !input.password || input.password.length < 12) {
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "local_password_credential_bound",
      generateId,
      now,
      outcome: "rejected",
      reason: "validation_failed",
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected("validation_failed");
  }

  const createdAt = now().toISOString();
  const credentialId = generateId();
  const passwordHash = await hashPassword(input.password);

  try {
    const credential = createLocalPasswordCredential(database, {
      id: credentialId,
      identityId: input.identityId,
      login: input.login,
      passwordHash,
      createdAt,
    });
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "local_password_credential_bound",
      generateId,
      now,
      outcome: "accepted",
      targetCredentialId: credential.id,
      targetIdentityId: input.identityId,
    });
    return accepted({ credentialBound: true });
  } catch (error) {
    const reason = storageReason(error);
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "local_password_credential_bound",
      generateId,
      now,
      outcome: "rejected",
      reason,
      targetIdentityId: input.identityId,
    });
    return rejected(reason);
  }
}

function disableIdentity({ database, generateId, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    auditDomainEvent({
      database,
      eventType: "identity_disabled",
      generateId,
      now,
      outcome: "rejected",
      reason: actor.reason,
      actorIdentityId: actor.actorIdentityId,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(actor.reason);
  }

  try {
    const identity = disableStoredIdentity(database, {
      identityId: input?.identityId,
      disabledAt: now().toISOString(),
    });
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "identity_disabled",
      generateId,
      now,
      outcome: "accepted",
      targetIdentityId: input.identityId,
    });
    return accepted(identity);
  } catch (error) {
    const reason = storageReason(error);
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "identity_disabled",
      generateId,
      now,
      outcome: "rejected",
      reason,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(reason);
  }
}

function grantAdmin({ database, generateId, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    auditDomainEvent({
      database,
      eventType: "admin_granted",
      generateId,
      now,
      outcome: "rejected",
      reason: actor.reason,
      actorIdentityId: actor.actorIdentityId,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(actor.reason);
  }

  try {
    grantAdminAuthority(database, {
      identityId: input?.identityId,
      grantedAt: now().toISOString(),
    });
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "admin_granted",
      generateId,
      now,
      outcome: "accepted",
      targetIdentityId: input.identityId,
    });
    return accepted(getIdentity(database, input.identityId));
  } catch (error) {
    const reason = storageReason(error);
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "admin_granted",
      generateId,
      now,
      outcome: "rejected",
      reason,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(reason);
  }
}

function revokeAdmin({ database, generateId, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    auditDomainEvent({
      database,
      eventType: "admin_revoked",
      generateId,
      now,
      outcome: "rejected",
      reason: actor.reason,
      actorIdentityId: actor.actorIdentityId,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(actor.reason);
  }

  try {
    revokeAdminAuthority(database, {
      identityId: input?.identityId,
      revokedAt: now().toISOString(),
    });
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "admin_revoked",
      generateId,
      now,
      outcome: "accepted",
      targetIdentityId: input.identityId,
    });
    return accepted(getIdentity(database, input.identityId));
  } catch (error) {
    const reason = storageReason(error);
    auditDomainEvent({
      actorIdentityId: actor.value.identity.id,
      database,
      eventType: "admin_revoked",
      generateId,
      now,
      outcome: "rejected",
      reason,
      targetIdentityId: input?.identityId ?? null,
    });
    return rejected(reason);
  }
}

function listIdentities({ database, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  return accepted({
    identities: readIdentities(database).map($0 => summarizeIdentity(database, $0)),
  });
}

function getOperationalAccessState({ database, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  const identity = getIdentity(database, input?.identityId);
  if (!identity) {
    return rejected("identity_not_found");
  }

  return accepted({
    effectiveAdmin: isEffectiveAdmin(database, identity.id),
    identity: summarizeIdentity(database, identity),
  });
}

function listAuditEvents({ database, input, now }) {
  const actor = resolveAdminActor({ database, sessionId: input?.actingSessionId, now });
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  return accepted({ auditEvents: readAuditEvents(database) });
}

function exportBackup({ database, now, operationLog }) {
  const requestId = randomUUID();
  logBackupOperation(operationLog, now, {
    operation: "identity.backup.export",
    outcome: "started",
    requestId,
  });

  try {
    const backup = exportIdentityBackup(database);
    logBackupOperation(operationLog, now, {
      operation: "identity.backup.export",
      outcome: "accepted",
      requestId,
    });
    return accepted({ backup });
  } catch {
    logBackupOperation(operationLog, now, {
      operation: "identity.backup.export",
      outcome: "fault",
      errorKind: "unexpected",
      requestId,
    });
    throw new Error("backup_export_failed");
  }
}

function restoreBackup({ database, input, now, operationLog }) {
  const requestId = randomUUID();
  logBackupOperation(operationLog, now, {
    operation: "identity.backup.restore",
    outcome: "started",
    requestId,
  });

  try {
    restoreIdentityBackup(database, input);
    logBackupOperation(operationLog, now, {
      operation: "identity.backup.restore",
      outcome: "accepted",
      requestId,
    });
    return accepted({ restored: true });
  } catch (error) {
    if (error?.reason) {
      logBackupOperation(operationLog, now, {
        operation: "identity.backup.restore",
        outcome: "rejected",
        reason: error.reason,
        requestId,
      });
      return rejected(error.reason);
    }

    logBackupOperation(operationLog, now, {
      operation: "identity.backup.restore",
      outcome: "fault",
      errorKind: "unexpected",
      requestId,
    });
    throw new Error("backup_restore_failed");
  }
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

function resolveAdminActor({ database, sessionId, now }) {
  const resolved = resolveSession({ database, input: { sessionId }, now });
  if (resolved.status === "rejected") {
    return resolved;
  }

  if (!isEffectiveAdmin(database, resolved.value.identity.id)) {
    return {
      status: "rejected",
      reason: "admin_required",
      actorIdentityId: resolved.value.identity.id,
    };
  }

  return resolved;
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

function auditDomainEvent({
  actorIdentityId = null,
  database,
  eventType,
  generateId,
  now,
  outcome,
  reason = null,
  targetCredentialId = null,
  targetIdentityId = null,
}) {
  createAuditEvent(database, {
    id: generateId(),
    eventType,
    actorIdentityId,
    targetCredentialId,
    targetIdentityId,
    occurredAt: now().toISOString(),
    outcome,
    reason,
  });
}

function summarizeIdentity(database, identity) {
  return {
    id: identity.id,
    displayName: identity.displayName,
    state: identity.state,
    isAdmin: isEffectiveAdmin(database, identity.id),
  };
}

function storageReason(error) {
  if (error?.reason) {
    return error.reason;
  }

  throw error;
}

function logBackupOperation(operationLog, now, event) {
  operationLog({
    occurredAt: now().toISOString(),
    component: "identity-role-management",
    severity: severityForBackupOutcome(event.outcome),
    ...event,
  });
}

function severityForBackupOutcome(outcome) {
  if (outcome === "fault") {
    return "error";
  }

  if (outcome === "rejected") {
    return "warning";
  }

  return "info";
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
