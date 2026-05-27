import Database from "better-sqlite3";

export class StorageInvariantError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "StorageInvariantError";
    this.reason = reason;
  }
}

export function openIdentityDatabase(path = ":memory:") {
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  return database;
}

export function initializeIdentityStorage(database) {
  database.exec(`
    create table if not exists identities (
      id text primary key,
      display_name text not null,
      state text not null check (state in ('active', 'disabled')),
      created_at text not null,
      disabled_at text
    );

    create table if not exists local_password_credentials (
      id text primary key,
      identity_id text not null unique references identities(id),
      login text not null unique,
      password_hash text not null,
      created_at text not null
    );

    create table if not exists sessions (
      id text primary key,
      identity_id text not null references identities(id),
      created_at text not null,
      expires_at text not null,
      revoked_at text
    );

    create table if not exists admin_authorities (
      identity_id text primary key references identities(id),
      granted_at text not null,
      revoked_at text
    );

    create table if not exists audit_events (
      id text primary key,
      event_type text not null,
      actor_identity_id text references identities(id),
      target_identity_id text references identities(id),
      target_credential_id text references local_password_credentials(id),
      target_session_id text,
      occurred_at text not null,
      outcome text not null check (outcome in ('accepted', 'rejected')),
      reason text
    );
  `);
}

export function createIdentity(
  database,
  { id, displayName, state = "active", createdAt, disabledAt = null },
) {
  database
    .prepare(
      `insert into identities (id, display_name, state, created_at, disabled_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run(id, displayName, state, createdAt, disabledAt);

  return getIdentity(database, id);
}

export function createLocalPasswordCredential(
  database,
  { id, identityId, login, passwordHash, createdAt },
) {
  assertIdentityExists(database, identityId);

  if (getLocalPasswordCredentialByLogin(database, login)) {
    throw new StorageInvariantError("login_already_bound");
  }

  if (getLocalPasswordCredentialByIdentity(database, identityId)) {
    throw new StorageInvariantError("identity_already_has_credential");
  }

  try {
    database
      .prepare(
        `insert into local_password_credentials (id, identity_id, login, password_hash, created_at)
         values (?, ?, ?, ?, ?)`,
      )
      .run(id, identityId, login, passwordHash, createdAt);
  } catch (error) {
    throw mapCredentialConstraintError(error);
  }

  return getLocalPasswordCredentialByIdentity(database, identityId);
}

export function createSession(database, { id, identityId, createdAt, expiresAt, revokedAt = null }) {
  assertIdentityExists(database, identityId);
  database
    .prepare(
      `insert into sessions (id, identity_id, created_at, expires_at, revoked_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run(id, identityId, createdAt, expiresAt, revokedAt);

  return getSession(database, id);
}

export function revokeSession(database, { id, revokedAt }) {
  database.prepare("update sessions set revoked_at = ? where id = ?").run(revokedAt, id);
  return getSession(database, id);
}

export function getSession(database, id) {
  const row = database
    .prepare(
      `select id, identity_id as identityId, created_at as createdAt, expires_at as expiresAt,
              revoked_at as revokedAt
       from sessions
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function grantAdminAuthority(database, { identityId, grantedAt }) {
  assertIdentityExists(database, identityId);
  if (getIdentity(database, identityId).state === "disabled") {
    throw new StorageInvariantError("identity_disabled");
  }

  database
    .prepare(
      `insert into admin_authorities (identity_id, granted_at, revoked_at)
       values (?, ?, null)
       on conflict(identity_id) do update set granted_at = excluded.granted_at, revoked_at = null`,
    )
    .run(identityId, grantedAt);

  return getAdminAuthority(database, identityId);
}

export function revokeAdminAuthority(database, { identityId, revokedAt }) {
  return database.transaction(() => {
    assertIdentityExists(database, identityId);

    if (isEffectiveAdmin(database, identityId) && countEffectiveAdmins(database) === 1) {
      throw new StorageInvariantError("last_admin_removal");
    }

    database
      .prepare("update admin_authorities set revoked_at = ? where identity_id = ? and revoked_at is null")
      .run(revokedAt, identityId);

    return getAdminAuthority(database, identityId);
  })();
}

export function disableIdentity(database, { identityId, disabledAt }) {
  return database.transaction(() => {
    assertIdentityExists(database, identityId);

    if (isEffectiveAdmin(database, identityId) && countEffectiveAdmins(database) === 1) {
      throw new StorageInvariantError("last_admin_removal");
    }

    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run(disabledAt, identityId);
    revokeSessionsForIdentity(database, { identityId, revokedAt: disabledAt });

    return getIdentity(database, identityId);
  })();
}

export function revokeSessionsForIdentity(database, { identityId, revokedAt }) {
  database
    .prepare("update sessions set revoked_at = ? where identity_id = ? and revoked_at is null")
    .run(revokedAt, identityId);
}

export function createAuditEvent(
  database,
  {
    id,
    eventType,
    actorIdentityId = null,
    targetIdentityId = null,
    targetCredentialId = null,
    targetSessionId = null,
    occurredAt,
    outcome,
    reason = null,
  },
) {
  database
    .prepare(
      `insert into audit_events (
        id,
        event_type,
        actor_identity_id,
        target_identity_id,
        target_credential_id,
        target_session_id,
        occurred_at,
        outcome,
        reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      eventType,
      actorIdentityId,
      targetIdentityId,
      targetCredentialId,
      targetSessionId,
      occurredAt,
      outcome,
      reason,
    );

  return getAuditEvent(database, id);
}

export function exportIdentityBackup(database) {
  return {
    version: 1,
    identities: listIdentities(database),
    localPasswordCredentials: listLocalPasswordCredentials(database),
    adminAuthorities: listAdminAuthorities(database),
    auditEvents: listAuditEvents(database),
  };
}

export function restoreIdentityBackup(database, backup) {
  if (!isValidBackupShape(backup)) {
    throw new StorageInvariantError("validation_failed");
  }

  if (!hasEffectiveAdminInBackup(backup)) {
    throw new StorageInvariantError("last_admin_removal");
  }

  database.transaction(() => {
    database.prepare("delete from sessions").run();
    database.prepare("delete from audit_events").run();
    database.prepare("delete from admin_authorities").run();
    database.prepare("delete from local_password_credentials").run();
    database.prepare("delete from identities").run();

    const insertIdentity = database.prepare(
      `insert into identities (id, display_name, state, created_at, disabled_at)
       values (?, ?, ?, ?, ?)`,
    );
    const insertCredential = database.prepare(
      `insert into local_password_credentials (id, identity_id, login, password_hash, created_at)
       values (?, ?, ?, ?, ?)`,
    );
    const insertAdminAuthority = database.prepare(
      `insert into admin_authorities (identity_id, granted_at, revoked_at)
       values (?, ?, ?)`,
    );
    const insertAuditEvent = database.prepare(
      `insert into audit_events (
        id,
        event_type,
        actor_identity_id,
        target_identity_id,
        target_credential_id,
        target_session_id,
        occurred_at,
        outcome,
        reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const identity of backup.identities) {
      insertIdentity.run(
        identity.id,
        identity.displayName,
        identity.state,
        identity.createdAt,
        identity.disabledAt ?? null,
      );
    }

    for (const credential of backup.localPasswordCredentials) {
      insertCredential.run(
        credential.id,
        credential.identityId,
        credential.login,
        credential.passwordHash,
        credential.createdAt,
      );
    }

    for (const authority of backup.adminAuthorities) {
      insertAdminAuthority.run(authority.identityId, authority.grantedAt, authority.revokedAt ?? null);
    }

    for (const auditEvent of backup.auditEvents) {
      insertAuditEvent.run(
        auditEvent.id,
        auditEvent.eventType,
        auditEvent.actorIdentityId ?? null,
        auditEvent.targetIdentityId ?? null,
        auditEvent.targetCredentialId ?? null,
        auditEvent.targetSessionId ?? null,
        auditEvent.occurredAt,
        auditEvent.outcome,
        auditEvent.reason ?? null,
      );
    }
  })();
}

export function listAuditEvents(database) {
  return database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              target_identity_id as targetIdentityId, target_credential_id as targetCredentialId,
              target_session_id as targetSessionId, occurred_at as occurredAt, outcome, reason
       from audit_events
       order by occurred_at, id`,
    )
    .all();
}

export function listLocalPasswordCredentials(database) {
  return database
    .prepare(
      `select id, identity_id as identityId, login, password_hash as passwordHash, created_at as createdAt
       from local_password_credentials
       order by created_at, id`,
    )
    .all();
}

export function listAdminAuthorities(database) {
  return database
    .prepare(
      `select identity_id as identityId, granted_at as grantedAt, revoked_at as revokedAt
       from admin_authorities
       order by granted_at, identity_id`,
    )
    .all();
}

export function listIdentities(database) {
  return database
    .prepare(
      `select id, display_name as displayName, state, created_at as createdAt, disabled_at as disabledAt
       from identities
       order by created_at, id`,
    )
    .all();
}

export function getIdentity(database, id) {
  const row = database
    .prepare(
      `select id, display_name as displayName, state, created_at as createdAt, disabled_at as disabledAt
       from identities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function getLocalPasswordCredentialByLogin(database, login) {
  return database
    .prepare(
      `select id, identity_id as identityId, login, password_hash as passwordHash, created_at as createdAt
       from local_password_credentials
       where login = ?`,
    )
    .get(login);
}

function getLocalPasswordCredentialByIdentity(database, identityId) {
  return database
    .prepare(
      `select id, identity_id as identityId, login, password_hash as passwordHash, created_at as createdAt
       from local_password_credentials
       where identity_id = ?`,
    )
    .get(identityId);
}

function getAdminAuthority(database, identityId) {
  const row = database
    .prepare(
      `select identity_id as identityId, granted_at as grantedAt, revoked_at as revokedAt
       from admin_authorities
       where identity_id = ?`,
    )
    .get(identityId);

  return row ?? null;
}

function getAuditEvent(database, id) {
  const row = database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              target_identity_id as targetIdentityId, target_credential_id as targetCredentialId,
              target_session_id as targetSessionId, occurred_at as occurredAt, outcome, reason
       from audit_events
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

function assertIdentityExists(database, identityId) {
  if (!getIdentity(database, identityId)) {
    throw new StorageInvariantError("identity_not_found");
  }
}

export function isEffectiveAdmin(database, identityId) {
  const row = database
    .prepare(
      `select 1
       from admin_authorities
       join identities on identities.id = admin_authorities.identity_id
       where admin_authorities.identity_id = ?
         and admin_authorities.revoked_at is null
         and identities.state = 'active'`,
    )
    .get(identityId);

  return row !== undefined;
}

export function countEffectiveAdmins(database) {
  return database
    .prepare(
      `select count(*) as count
       from admin_authorities
       join identities on identities.id = admin_authorities.identity_id
       where admin_authorities.revoked_at is null
         and identities.state = 'active'`,
    )
    .get().count;
}

function mapCredentialConstraintError(error) {
  if (error.code === "SQLITE_CONSTRAINT_UNIQUE" && error.message.includes("login")) {
    return new StorageInvariantError("login_already_bound");
  }

  if (error.code === "SQLITE_CONSTRAINT_UNIQUE" && error.message.includes("identity_id")) {
    return new StorageInvariantError("identity_already_has_credential");
  }

  return error;
}

function isValidBackupShape(backup) {
  return Boolean(
    backup &&
      backup.version === 1 &&
      Array.isArray(backup.identities) &&
      Array.isArray(backup.localPasswordCredentials) &&
      Array.isArray(backup.adminAuthorities) &&
      Array.isArray(backup.auditEvents),
  );
}

function hasEffectiveAdminInBackup(backup) {
  const activeIdentityIds = new Set(
    backup.identities.filter($0 => $0.state === "active").map($0 => $0.id),
  );
  return backup.adminAuthorities.some($0 => $0.revokedAt === null && activeIdentityIds.has($0.identityId));
}
