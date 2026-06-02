import Database from "better-sqlite3";

export class StorageInvariantError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "StorageInvariantError";
    this.reason = reason;
  }
}

const forbiddenResponseDetailPatterns = [
  /\bsession\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i,
  /\bauthorization\b/i,
  /\braw\s+model\b/i,
  /\braw\s+prompt\b/i,
  /\bselect\s+\*/i,
  /\bstack\s+trace\b/i,
  /\/tmp\b/i,
  /\bpostgres:\/\//i,
  /\bdatabase-url\b/i,
];

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

    create table if not exists program_shells (
      id text primary key,
      title text not null,
      description text,
      admission_policy text not null check (admission_policy in ('self_join')),
      created_by_identity_id text not null references identities(id),
      created_at text not null
    );

    create table if not exists program_memberships (
      id text primary key,
      program_id text not null references program_shells(id),
      identity_id text not null references identities(id),
      participation_kind text not null check (participation_kind in ('student', 'program_curator')),
      status text not null check (status in ('active', 'left', 'removed')),
      created_at text not null,
      updated_at text not null,
      unique (program_id, identity_id, participation_kind)
    );

    create table if not exists program_events (
      id text primary key,
      event_type text not null,
      actor_identity_id text not null references identities(id),
      program_id text references program_shells(id),
      occurred_at text not null,
      outcome text not null check (outcome in ('accepted', 'rejected')),
      reason text
    );

    create table if not exists program_membership_events (
      id text primary key,
      event_type text not null,
      actor_identity_id text not null references identities(id),
      target_identity_id text not null references identities(id),
      program_id text not null references program_shells(id),
      participation_kind text not null check (participation_kind in ('student', 'program_curator')),
      resulting_status text check (resulting_status in ('active', 'left', 'removed')),
      occurred_at text not null,
      outcome text not null check (outcome in ('accepted', 'rejected')),
      reason text
    );

    create table if not exists program_sources (
      id text primary key,
      program_id text not null references program_shells(id),
      source_kind text not null check (
        source_kind in (
          'public_plan',
          'exam_requirement',
          'standard',
          'textbook',
          'article',
          'lecture',
          'course',
          'note',
          'research_result',
          'other'
        )
      ),
      title text not null,
      locator text,
      citation text,
      recorded_by_identity_id text not null references identities(id),
      recorded_at text not null
    );

    create table if not exists corpus_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      candidate_kind text not null check (candidate_kind in ('topic', 'concept')),
      title text not null,
      body text,
      source_ids_json text not null,
      rationale text,
      status text not null check (status in ('draft', 'accepted', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists assessment_criterion_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      title text not null,
      body text not null,
      source_ids_json text not null,
      rationale text,
      status text not null check (status in ('draft', 'accepted', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists accepted_assessment_criterion_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      current_revision_id text not null
    );

    create table if not exists accepted_assessment_criterion_revisions (
      id text primary key,
      entity_id text not null references accepted_assessment_criterion_entities(id),
      program_id text not null references program_shells(id),
      title text not null,
      body text not null,
      accepted_from_candidate_id text not null references assessment_criterion_candidates(id),
      source_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists open_answer_check_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      check_kind text not null check (check_kind in ('open_answer')),
      title text not null,
      prompt text not null,
      source_ids_json text not null,
      criterion_entity_ids_json text not null,
      rationale text,
      status text not null check (status in ('draft', 'accepted', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists accepted_open_answer_check_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      current_revision_id text not null
    );

    create table if not exists accepted_open_answer_check_revisions (
      id text primary key,
      entity_id text not null references accepted_open_answer_check_entities(id),
      program_id text not null references program_shells(id),
      check_kind text not null check (check_kind in ('open_answer')),
      title text not null,
      prompt text not null,
      accepted_from_candidate_id text not null references open_answer_check_candidates(id),
      source_ids_json text not null,
      criterion_revision_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists open_answer_attempts (
      id text primary key,
      program_id text not null references program_shells(id),
      student_identity_id text not null references identities(id),
      check_revision_id text not null references accepted_open_answer_check_revisions(id),
      criterion_revision_ids_json text not null,
      submitted_answer text not null,
      idempotency_key text not null,
      status text not null check (status in ('submitted', 'evaluating', 'evaluated', 'evaluation_failed')),
      submitted_at text not null,
      updated_at text not null,
      unique (program_id, student_identity_id, check_revision_id, idempotency_key),
      unique (id, program_id, student_identity_id, check_revision_id)
    );

    create table if not exists open_answer_evaluations (
      id text primary key,
      attempt_id text not null unique references open_answer_attempts(id),
      program_id text not null references program_shells(id),
      student_identity_id text not null references identities(id),
      check_revision_id text not null references accepted_open_answer_check_revisions(id),
      criterion_revision_ids_json text not null,
      evaluator_kind text not null check (evaluator_kind in ('student_workspace')),
      summary_feedback text not null,
      criterion_feedback_json text not null,
      evaluated_at text not null
    );

    create table if not exists open_answer_evaluation_failures (
      attempt_id text primary key references open_answer_attempts(id),
      reason text not null,
      failed_at text not null
    );

    create table if not exists open_answer_evaluator_runs (
      id text primary key,
      attempt_id text not null references open_answer_attempts(id),
      program_id text not null references program_shells(id),
      student_identity_id text not null references identities(id),
      check_revision_id text not null references accepted_open_answer_check_revisions(id),
      criterion_revision_ids_json text not null,
      evaluator_path_kind text not null check (
        evaluator_path_kind in ('student_workspace', 'deterministic', 'llm_assisted', 'human_reviewed')
      ),
      evaluator_policy_id text not null,
      status text not null check (status in ('running', 'succeeded', 'failed', 'cancelled')),
      requested_by_identity_id text references identities(id),
      reviewer_identity_id text references identities(id),
      reviewer_capability text,
      started_at text,
      completed_at text,
      failed_at text,
      failure_reason text,
      prior_failure_reason text,
      prior_failed_at text,
      job_status text check (
        job_status in ('waiting', 'leased', 'retry_waiting', 'succeeded', 'failed', 'cancelled', 'timed_out')
      ),
      attempt_number integer,
      retry_policy_json text,
      budget_policy_json text,
      lease_id text,
      worker_id text,
      lease_claimed_at text,
      lease_expires_at text,
      next_retry_at text,
      cancellation_reason text,
      timeout_reason text,
      job_failure_reason text,
      terminal_completion_signature_json text,
      job_created_at text,
      job_updated_at text,
      unique (id, attempt_id),
      foreign key (attempt_id, program_id, student_identity_id, check_revision_id)
        references open_answer_attempts(id, program_id, student_identity_id, check_revision_id)
    );

    create unique index if not exists one_running_open_answer_evaluator_run_per_attempt
      on open_answer_evaluator_runs (attempt_id)
      where status = 'running';

    create table if not exists open_answer_evaluator_evidence (
      id text primary key,
      evaluator_run_id text not null references open_answer_evaluator_runs(id),
      attempt_id text not null references open_answer_attempts(id),
      evidence_kind text not null,
      visibility text not null check (visibility in ('internal')),
      redacted_summary text,
      recorded_at text not null,
      foreign key (evaluator_run_id, attempt_id) references open_answer_evaluator_runs(id, attempt_id)
    );

    create table if not exists accepted_corpus_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      accepted_kind text not null check (accepted_kind in ('topic', 'concept')),
      current_revision_id text not null
    );

    create table if not exists accepted_corpus_revisions (
      id text primary key,
      entity_id text not null references accepted_corpus_entities(id),
      program_id text not null references program_shells(id),
      accepted_kind text not null check (accepted_kind in ('topic', 'concept')),
      title text not null,
      body text,
      accepted_from_candidate_id text not null references corpus_candidates(id),
      source_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists corpus_events (
      id text primary key,
      event_type text not null check (
        event_type in (
          'program_source_recorded',
          'corpus_candidate_created',
          'corpus_candidate_accepted',
          'corpus_candidate_rejected'
        )
      ),
      actor_identity_id text not null references identities(id),
      program_id text references program_shells(id),
      target_id text,
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

export function createProgramShellRecord(
  database,
  { id, title, description = null, admissionPolicy, createdByIdentityId, createdAt },
) {
  assertIdentityExists(database, createdByIdentityId);
  database
    .prepare(
      `insert into program_shells (id, title, description, admission_policy, created_by_identity_id, created_at)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, title, description, admissionPolicy, createdByIdentityId, createdAt);

  return getProgramShellRecord(database, id);
}

export function getProgramShellRecord(database, id) {
  const row = database
    .prepare(
      `select id, title, description, admission_policy as admissionPolicy,
              created_by_identity_id as createdByIdentityId, created_at as createdAt
       from program_shells
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listProgramShellRecords(database) {
  return database
    .prepare(
      `select id, title, description, admission_policy as admissionPolicy,
              created_by_identity_id as createdByIdentityId, created_at as createdAt
       from program_shells
       order by created_at, id`,
    )
    .all();
}

export function createProgramSourceRecord(
  database,
  { id, programId, sourceKind, title, locator = null, citation = null, recordedByIdentityId, recordedAt },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, recordedByIdentityId);

  database
    .prepare(
      `insert into program_sources (
         id, program_id, source_kind, title, locator, citation, recorded_by_identity_id, recorded_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, programId, sourceKind, title, locator, citation, recordedByIdentityId, recordedAt);

  return getProgramSourceRecord(database, id);
}

export function getProgramSourceRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, source_kind as sourceKind, title, locator, citation,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
       from program_sources
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listProgramSourceRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, source_kind as sourceKind, title, locator, citation,
                recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
         from program_sources
         order by recorded_at, id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, program_id as programId, source_kind as sourceKind, title, locator, citation,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
       from program_sources
       where program_id = ?
       order by recorded_at, id`,
    )
    .all(programId);
}

export function createCorpusCandidateRecord(
  database,
  {
    id,
    programId,
    candidateKind,
    title,
    body = null,
    sourceIds = [],
    rationale = null,
    status,
    createdByIdentityId,
    createdAt,
    updatedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });

  database
    .prepare(
      `insert into corpus_candidates (
         id,
         program_id,
         candidate_kind,
         title,
         body,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      candidateKind,
      title,
      body,
      JSON.stringify(sourceIds),
      rationale,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  return getCorpusCandidateRecord(database, id);
}

export function getCorpusCandidateRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, candidate_kind as candidateKind, title, body,
              source_ids_json as sourceIdsJson, rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from corpus_candidates
       where id = ?`,
    )
    .get(id);

  return row ? mapCorpusCandidateRecord(row) : null;
}

export function listCorpusCandidateRecords(database, { programId = null, status = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, candidate_kind as candidateKind, title, body,
                source_ids_json as sourceIdsJson, rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from corpus_candidates
         order by created_at, id`,
      )
      .all()
      .map(mapCorpusCandidateRecord);
  }

  if (status === null) {
    return database
      .prepare(
        `select id, program_id as programId, candidate_kind as candidateKind, title, body,
                source_ids_json as sourceIdsJson, rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from corpus_candidates
         where program_id = ?
         order by created_at, id`,
      )
      .all(programId)
      .map(mapCorpusCandidateRecord);
  }

  return database
    .prepare(
      `select id, program_id as programId, candidate_kind as candidateKind, title, body,
              source_ids_json as sourceIdsJson, rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from corpus_candidates
       where program_id = ? and status = ?
       order by created_at, id`,
    )
    .all(programId, status)
    .map(mapCorpusCandidateRecord);
}

export function updateCorpusCandidateStatus(database, { candidateId, status, updatedAt }) {
  database
    .prepare(
      `update corpus_candidates
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, candidateId);

  return getCorpusCandidateRecord(database, candidateId);
}

export function createAssessmentCriterionCandidateRecord(
  database,
  {
    id,
    programId,
    title,
    body,
    sourceIds = [],
    rationale = null,
    status,
    createdByIdentityId,
    createdAt,
    updatedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });

  database
    .prepare(
      `insert into assessment_criterion_candidates (
         id,
         program_id,
         title,
         body,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      title,
      body,
      JSON.stringify(sourceIds),
      rationale,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  return getAssessmentCriterionCandidateRecord(database, id);
}

export function getAssessmentCriterionCandidateRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, title, body,
              source_ids_json as sourceIdsJson, rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from assessment_criterion_candidates
       where id = ?`,
    )
    .get(id);

  return row ? mapAssessmentCriterionCandidateRecord(row) : null;
}

export function listAssessmentCriterionCandidateRecords(database, { programId = null, status = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, title, body,
                source_ids_json as sourceIdsJson, rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from assessment_criterion_candidates
         order by created_at, id`,
      )
      .all()
      .map(mapAssessmentCriterionCandidateRecord);
  }

  if (status === null) {
    return database
      .prepare(
        `select id, program_id as programId, title, body,
                source_ids_json as sourceIdsJson, rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from assessment_criterion_candidates
         where program_id = ?
         order by created_at, id`,
      )
      .all(programId)
      .map(mapAssessmentCriterionCandidateRecord);
  }

  return database
    .prepare(
      `select id, program_id as programId, title, body,
              source_ids_json as sourceIdsJson, rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from assessment_criterion_candidates
       where program_id = ? and status = ?
       order by created_at, id`,
    )
    .all(programId, status)
    .map(mapAssessmentCriterionCandidateRecord);
}

export function updateAssessmentCriterionCandidateStatus(database, { candidateId, status, updatedAt }) {
  database
    .prepare(
      `update assessment_criterion_candidates
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, candidateId);

  return getAssessmentCriterionCandidateRecord(database, candidateId);
}

export function createAcceptedAssessmentCriterionEntityRecord(database, { id, programId, currentRevisionId }) {
  assertProgramShellExists(database, programId);

  database
    .prepare(
      `insert into accepted_assessment_criterion_entities (id, program_id, current_revision_id)
       values (?, ?, ?)`,
    )
    .run(id, programId, currentRevisionId);

  return getAcceptedAssessmentCriterionEntityRecord(database, id);
}

export function getAcceptedAssessmentCriterionEntityRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_assessment_criterion_entities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedAssessmentCriterionEntityRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, current_revision_id as currentRevisionId
         from accepted_assessment_criterion_entities
         order by id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_assessment_criterion_entities
       where program_id = ?
       order by id`,
    )
    .all(programId);
}

export function updateAcceptedAssessmentCriterionEntityCurrentRevision(database, { entityId, currentRevisionId }) {
  const revision = getAcceptedAssessmentCriterionRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("accepted_criterion_revision_not_found");
  }

  if (revision.entityId !== entityId) {
    throw new StorageInvariantError("accepted_criterion_revision_entity_mismatch");
  }

  database
    .prepare(
      `update accepted_assessment_criterion_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, entityId);

  return getAcceptedAssessmentCriterionEntityRecord(database, entityId);
}

export function createAcceptedAssessmentCriterionRevisionRecord(
  database,
  {
    id,
    entityId,
    programId,
    title,
    body,
    acceptedFromCandidateId,
    sourceIds = [],
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);
  assertAssessmentCriterionCandidateBelongsToProgram(database, { programId, candidateId: acceptedFromCandidateId });
  assertAcceptedAssessmentCriterionEntityBelongsToProgram(database, { programId, entityId });
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });

  database
    .prepare(
      `insert into accepted_assessment_criterion_revisions (
         id,
         entity_id,
         program_id,
         title,
         body,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entityId,
      programId,
      title,
      body,
      acceptedFromCandidateId,
      JSON.stringify(sourceIds),
      rationale,
      acceptedByIdentityId,
      acceptedAt,
    );

  return getAcceptedAssessmentCriterionRevisionRecord(database, id);
}

export function getAcceptedAssessmentCriterionRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, title, body,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_assessment_criterion_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedAssessmentCriterionRevisionRecord(row) : null;
}

export function listAcceptedAssessmentCriterionRevisionRecords(database) {
  return database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, title, body,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_assessment_criterion_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedAssessmentCriterionRevisionRecord);
}

export function createOpenAnswerCheckCandidateRecord(
  database,
  {
    id,
    programId,
    checkKind,
    title,
    prompt,
    sourceIds = [],
    criterionEntityIds,
    rationale = null,
    status,
    createdByIdentityId,
    createdAt,
    updatedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });
  assertAcceptedAssessmentCriterionEntitiesBelongToProgram(database, { programId, criterionEntityIds });

  database
    .prepare(
      `insert into open_answer_check_candidates (
         id,
         program_id,
         check_kind,
         title,
         prompt,
         source_ids_json,
         criterion_entity_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      checkKind,
      title,
      prompt,
      JSON.stringify(sourceIds),
      JSON.stringify(criterionEntityIds),
      rationale,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  return getOpenAnswerCheckCandidateRecord(database, id);
}

export function getOpenAnswerCheckCandidateRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, check_kind as checkKind, title, prompt,
              source_ids_json as sourceIdsJson,
              criterion_entity_ids_json as criterionEntityIdsJson,
              rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from open_answer_check_candidates
       where id = ?`,
    )
    .get(id);

  return row ? mapOpenAnswerCheckCandidateRecord(row) : null;
}

export function listOpenAnswerCheckCandidateRecords(database, { programId = null, status = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, check_kind as checkKind, title, prompt,
                source_ids_json as sourceIdsJson,
                criterion_entity_ids_json as criterionEntityIdsJson,
                rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from open_answer_check_candidates
         order by created_at, id`,
      )
      .all()
      .map(mapOpenAnswerCheckCandidateRecord);
  }

  if (status === null) {
    return database
      .prepare(
        `select id, program_id as programId, check_kind as checkKind, title, prompt,
                source_ids_json as sourceIdsJson,
                criterion_entity_ids_json as criterionEntityIdsJson,
                rationale, status,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from open_answer_check_candidates
         where program_id = ?
         order by created_at, id`,
      )
      .all(programId)
      .map(mapOpenAnswerCheckCandidateRecord);
  }

  return database
    .prepare(
      `select id, program_id as programId, check_kind as checkKind, title, prompt,
              source_ids_json as sourceIdsJson,
              criterion_entity_ids_json as criterionEntityIdsJson,
              rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from open_answer_check_candidates
       where program_id = ? and status = ?
       order by created_at, id`,
    )
    .all(programId, status)
    .map(mapOpenAnswerCheckCandidateRecord);
}

export function updateOpenAnswerCheckCandidateStatus(database, { candidateId, status, updatedAt }) {
  database
    .prepare(
      `update open_answer_check_candidates
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, candidateId);

  return getOpenAnswerCheckCandidateRecord(database, candidateId);
}

export function createAcceptedOpenAnswerCheckEntityRecord(database, { id, programId, currentRevisionId }) {
  assertProgramShellExists(database, programId);

  database
    .prepare(
      `insert into accepted_open_answer_check_entities (id, program_id, current_revision_id)
       values (?, ?, ?)`,
    )
    .run(id, programId, currentRevisionId);

  return getAcceptedOpenAnswerCheckEntityRecord(database, id);
}

export function getAcceptedOpenAnswerCheckEntityRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_open_answer_check_entities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedOpenAnswerCheckEntityRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, current_revision_id as currentRevisionId
         from accepted_open_answer_check_entities
         order by id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_open_answer_check_entities
       where program_id = ?
       order by id`,
    )
    .all(programId);
}

export function updateAcceptedOpenAnswerCheckEntityCurrentRevision(database, { entityId, currentRevisionId }) {
  const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("accepted_check_revision_not_found");
  }

  if (revision.entityId !== entityId) {
    throw new StorageInvariantError("accepted_check_revision_entity_mismatch");
  }

  database
    .prepare(
      `update accepted_open_answer_check_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, entityId);

  return getAcceptedOpenAnswerCheckEntityRecord(database, entityId);
}

export function createAcceptedOpenAnswerCheckRevisionRecord(
  database,
  {
    id,
    entityId,
    programId,
    checkKind,
    title,
    prompt,
    acceptedFromCandidateId,
    sourceIds = [],
    criterionRevisionIds,
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);
  assertOpenAnswerCheckCandidateBelongsToProgram(database, { programId, candidateId: acceptedFromCandidateId });
  assertAcceptedOpenAnswerCheckEntityBelongsToProgram(database, { programId, entityId });
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });
  assertAcceptedAssessmentCriterionRevisionsBelongToProgram(database, { programId, criterionRevisionIds });

  database
    .prepare(
      `insert into accepted_open_answer_check_revisions (
         id,
         entity_id,
         program_id,
         check_kind,
         title,
         prompt,
         accepted_from_candidate_id,
         source_ids_json,
         criterion_revision_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entityId,
      programId,
      checkKind,
      title,
      prompt,
      acceptedFromCandidateId,
      JSON.stringify(sourceIds),
      JSON.stringify(criterionRevisionIds),
      rationale,
      acceptedByIdentityId,
      acceptedAt,
    );

  return getAcceptedOpenAnswerCheckRevisionRecord(database, id);
}

export function getAcceptedOpenAnswerCheckRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, check_kind as checkKind,
              title, prompt, accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              rationale, accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_open_answer_check_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedOpenAnswerCheckRevisionRecord(row) : null;
}

export function listAcceptedOpenAnswerCheckRevisionRecords(database) {
  return database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, check_kind as checkKind,
              title, prompt, accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              rationale, accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_open_answer_check_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedOpenAnswerCheckRevisionRecord);
}

export function createOpenAnswerAttemptRecord(
  database,
  {
    id,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    submittedAnswer,
    idempotencyKey,
    status,
    submittedAt,
    updatedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, studentIdentityId);
  assertAcceptedOpenAnswerCheckRevisionBelongsToProgram(database, { programId, revisionId: checkRevisionId });
  assertAcceptedAssessmentCriterionRevisionsBelongToProgram(database, { programId, criterionRevisionIds });
  assertOpenAnswerAttemptCriterionSnapshotMatchesCheck(database, { checkRevisionId, criterionRevisionIds });
  assertOpenAnswerAttemptIdempotencyScopeAvailable(database, {
    programId,
    studentIdentityId,
    checkRevisionId,
    idempotencyKey,
  });

  database
    .prepare(
      `insert into open_answer_attempts (
         id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         submitted_answer,
         idempotency_key,
         status,
         submitted_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      studentIdentityId,
      checkRevisionId,
      JSON.stringify(criterionRevisionIds),
      submittedAnswer,
      idempotencyKey,
      status,
      submittedAt,
      updatedAt,
    );

  return getOpenAnswerAttemptRecord(database, id);
}

export function getOpenAnswerAttemptRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              submitted_answer as submittedAnswer, idempotency_key as idempotencyKey,
              status, submitted_at as submittedAt, updated_at as updatedAt
       from open_answer_attempts
       where id = ?`,
    )
    .get(id);

  return row ? mapOpenAnswerAttemptRecord(row) : null;
}

export function listOpenAnswerAttemptRecords(
  database,
  { programId = null, studentIdentityId = null, status = null, checkRevisionId = null } = {},
) {
  const filters = [];
  const values = [];

  if (programId !== null) {
    filters.push("program_id = ?");
    values.push(programId);
  }
  if (studentIdentityId !== null) {
    filters.push("student_identity_id = ?");
    values.push(studentIdentityId);
  }
  if (status !== null) {
    filters.push("status = ?");
    values.push(status);
  }
  if (checkRevisionId !== null) {
    filters.push("check_revision_id = ?");
    values.push(checkRevisionId);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              submitted_answer as submittedAnswer, idempotency_key as idempotencyKey,
              status, submitted_at as submittedAt, updated_at as updatedAt
       from open_answer_attempts
       ${whereClause}
       order by submitted_at, id`,
    )
    .all(...values)
    .map(mapOpenAnswerAttemptRecord);
}

export function updateOpenAnswerAttemptStatus(database, { attemptId, status, updatedAt }) {
  database
    .prepare(
      `update open_answer_attempts
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, attemptId);

  return getOpenAnswerAttemptRecord(database, attemptId);
}

export function createOpenAnswerEvaluationRecord(
  database,
  {
    id,
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    evaluatorKind,
    summaryFeedback,
    criterionFeedback,
    evaluatedAt,
  },
) {
  assertOpenAnswerEvaluationMatchesAttempt(database, {
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
  });

  database
    .prepare(
      `insert into open_answer_evaluations (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_kind,
         summary_feedback,
         criterion_feedback_json,
         evaluated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      attemptId,
      programId,
      studentIdentityId,
      checkRevisionId,
      JSON.stringify(criterionRevisionIds),
      evaluatorKind,
      summaryFeedback,
      JSON.stringify(criterionFeedback),
      evaluatedAt,
    );

  return getOpenAnswerEvaluationRecord(database, id);
}

export function getOpenAnswerEvaluationRecord(database, id) {
  const row = database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_kind as evaluatorKind, summary_feedback as summaryFeedback,
              criterion_feedback_json as criterionFeedbackJson, evaluated_at as evaluatedAt
       from open_answer_evaluations
       where id = ?`,
    )
    .get(id);

  return row ? mapOpenAnswerEvaluationRecord(row) : null;
}

export function getOpenAnswerEvaluationRecordByAttemptId(database, attemptId) {
  const row = database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_kind as evaluatorKind, summary_feedback as summaryFeedback,
              criterion_feedback_json as criterionFeedbackJson, evaluated_at as evaluatedAt
       from open_answer_evaluations
       where attempt_id = ?`,
    )
    .get(attemptId);

  return row ? mapOpenAnswerEvaluationRecord(row) : null;
}

export function listOpenAnswerEvaluationRecords(database) {
  return database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_kind as evaluatorKind, summary_feedback as summaryFeedback,
              criterion_feedback_json as criterionFeedbackJson, evaluated_at as evaluatedAt
       from open_answer_evaluations
       order by evaluated_at, id`,
    )
    .all()
    .map(mapOpenAnswerEvaluationRecord);
}

export function createOpenAnswerEvaluationFailureRecord(database, { attemptId, reason, failedAt }) {
  assertOpenAnswerAttemptExists(database, attemptId);

  database
    .prepare(
      `insert into open_answer_evaluation_failures (attempt_id, reason, failed_at)
       values (?, ?, ?)
       on conflict(attempt_id) do update set reason = excluded.reason, failed_at = excluded.failed_at`,
    )
    .run(attemptId, reason, failedAt);

  return getOpenAnswerEvaluationFailureRecord(database, attemptId);
}

export function getOpenAnswerEvaluationFailureRecord(database, attemptId) {
  const row = database
    .prepare(
      `select attempt_id as attemptId, reason, failed_at as failedAt
       from open_answer_evaluation_failures
       where attempt_id = ?`,
    )
    .get(attemptId);

  return row ?? null;
}

export function listOpenAnswerEvaluationFailureRecords(database) {
  return database
    .prepare(
      `select attempt_id as attemptId, reason, failed_at as failedAt
       from open_answer_evaluation_failures
       order by failed_at, attempt_id`,
    )
    .all();
}

export function deleteOpenAnswerEvaluationFailureRecord(database, attemptId) {
  database.prepare("delete from open_answer_evaluation_failures where attempt_id = ?").run(attemptId);
}

export function createOpenAnswerEvaluatorRunRecord(
  database,
  {
    id,
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    evaluatorPathKind,
    evaluatorPolicyId,
    status,
    requestedByIdentityId = null,
    reviewerIdentityId = null,
    reviewerCapability = null,
    startedAt = null,
    completedAt = null,
    failedAt = null,
    failureReason = null,
    priorFailureReason = null,
    priorFailedAt = null,
    jobStatus = null,
    attemptNumber = null,
    retryPolicy = null,
    budgetPolicy = null,
    leaseId = null,
    workerId = null,
    leaseClaimedAt = null,
    leaseExpiresAt = null,
    nextRetryAt = null,
    cancellationReason = null,
    timeoutReason = null,
    jobFailureReason = null,
    jobCreatedAt = startedAt,
    jobUpdatedAt = startedAt,
  },
) {
  assertOpenAnswerEvaluatorRunMatchesAttempt(database, {
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
  });
  assertOpenAnswerEvaluatorJobState({
    jobStatus,
    attemptNumber,
    retryPolicy,
    budgetPolicy,
    leaseId,
    workerId,
    leaseClaimedAt,
    leaseExpiresAt,
  });
  assertOpenAnswerEvaluatorRunScopeAvailable(database, { attemptId, status });

  database
    .prepare(
      `insert into open_answer_evaluator_runs (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_path_kind,
         evaluator_policy_id,
         status,
         requested_by_identity_id,
         reviewer_identity_id,
         reviewer_capability,
         started_at,
         completed_at,
         failed_at,
         failure_reason,
         prior_failure_reason,
         prior_failed_at,
         job_status,
         attempt_number,
         retry_policy_json,
         budget_policy_json,
         lease_id,
         worker_id,
         lease_claimed_at,
         lease_expires_at,
         next_retry_at,
         cancellation_reason,
         timeout_reason,
         job_failure_reason,
         job_created_at,
         job_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      attemptId,
      programId,
      studentIdentityId,
      checkRevisionId,
      JSON.stringify(criterionRevisionIds),
      evaluatorPathKind,
      evaluatorPolicyId,
      status,
      requestedByIdentityId,
      reviewerIdentityId,
      reviewerCapability,
      startedAt,
      completedAt,
      failedAt,
      failureReason,
      priorFailureReason,
      priorFailedAt,
      jobStatus,
      attemptNumber,
      retryPolicy === null ? null : JSON.stringify(retryPolicy),
      budgetPolicy === null ? null : JSON.stringify(budgetPolicy),
      leaseId,
      workerId,
      leaseClaimedAt,
      leaseExpiresAt,
      nextRetryAt,
      cancellationReason,
      timeoutReason,
      jobFailureReason,
      jobCreatedAt,
      jobUpdatedAt,
    );

  return getOpenAnswerEvaluatorRunRecord(database, id);
}

export function getOpenAnswerEvaluatorRunRecord(database, id) {
  const row = database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_path_kind as evaluatorPathKind, evaluator_policy_id as evaluatorPolicyId,
              status, requested_by_identity_id as requestedByIdentityId,
              reviewer_identity_id as reviewerIdentityId, reviewer_capability as reviewerCapability,
              started_at as startedAt, completed_at as completedAt, failed_at as failedAt,
              failure_reason as failureReason, prior_failure_reason as priorFailureReason,
              prior_failed_at as priorFailedAt
       from open_answer_evaluator_runs
       where id = ?`,
    )
    .get(id);

  return row ? mapOpenAnswerEvaluatorRunRecord(row) : null;
}

export function getOpenAnswerEvaluatorJobRecord(database, id) {
  const row = database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_path_kind as evaluatorPathKind, evaluator_policy_id as evaluatorPolicyId,
              status as runStatus, job_status as jobStatus, attempt_number as attemptNumber,
              retry_policy_json as retryPolicyJson, budget_policy_json as budgetPolicyJson,
              lease_id as leaseId, worker_id as workerId, lease_claimed_at as leaseClaimedAt,
              lease_expires_at as leaseExpiresAt, next_retry_at as nextRetryAt,
              cancellation_reason as cancellationReason, timeout_reason as timeoutReason,
              job_failure_reason as jobFailureReason,
              terminal_completion_signature_json as terminalCompletionSignatureJson,
              job_created_at as jobCreatedAt,
              job_updated_at as jobUpdatedAt
       from open_answer_evaluator_runs
       where id = ?`,
    )
    .get(id);

  return row && row.jobStatus ? mapOpenAnswerEvaluatorJobRecord(row) : null;
}

export function listOpenAnswerEvaluatorRunRecords(database, { attemptId = null, status = null } = {}) {
  const filters = [];
  const values = [];

  if (attemptId !== null) {
    filters.push("attempt_id = ?");
    values.push(attemptId);
  }
  if (status !== null) {
    filters.push("status = ?");
    values.push(status);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_path_kind as evaluatorPathKind, evaluator_policy_id as evaluatorPolicyId,
              status, requested_by_identity_id as requestedByIdentityId,
              reviewer_identity_id as reviewerIdentityId, reviewer_capability as reviewerCapability,
              started_at as startedAt, completed_at as completedAt, failed_at as failedAt,
              failure_reason as failureReason, prior_failure_reason as priorFailureReason,
              prior_failed_at as priorFailedAt
       from open_answer_evaluator_runs
       ${whereClause}
       order by started_at, id`,
    )
    .all(...values)
    .map(mapOpenAnswerEvaluatorRunRecord);
}

export function listClaimableOpenAnswerEvaluatorJobRecords(database, { now, limit = 50 } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
  return database
    .prepare(
      `select id, attempt_id as attemptId, program_id as programId,
              student_identity_id as studentIdentityId, check_revision_id as checkRevisionId,
              criterion_revision_ids_json as criterionRevisionIdsJson,
              evaluator_path_kind as evaluatorPathKind, evaluator_policy_id as evaluatorPolicyId,
              status as runStatus, job_status as jobStatus, attempt_number as attemptNumber,
              retry_policy_json as retryPolicyJson, budget_policy_json as budgetPolicyJson,
              lease_id as leaseId, worker_id as workerId, lease_claimed_at as leaseClaimedAt,
              lease_expires_at as leaseExpiresAt, next_retry_at as nextRetryAt,
              cancellation_reason as cancellationReason, timeout_reason as timeoutReason,
              job_failure_reason as jobFailureReason,
              terminal_completion_signature_json as terminalCompletionSignatureJson,
              job_created_at as jobCreatedAt,
              job_updated_at as jobUpdatedAt
       from open_answer_evaluator_runs
       where job_status = 'waiting'
          or (job_status = 'retry_waiting' and next_retry_at <= ?)
       order by case job_status when 'waiting' then 0 else 1 end, job_created_at, id
       limit ?`,
    )
    .all(now, safeLimit)
    .map(mapOpenAnswerEvaluatorJobRecord);
}

export function updateOpenAnswerEvaluatorRunStatus(
  database,
  { evaluatorRunId, status, completedAt = null, failedAt = null, failureReason = null },
) {
  database
    .prepare(
      `update open_answer_evaluator_runs
       set status = ?, completed_at = ?, failed_at = ?, failure_reason = ?
       where id = ?`,
    )
    .run(status, completedAt, failedAt, failureReason, evaluatorRunId);

  return getOpenAnswerEvaluatorRunRecord(database, evaluatorRunId);
}

export function updateOpenAnswerEvaluatorJobLease(
  database,
  { evaluatorJobId, leaseId, workerId, claimedAt, expiresAt, updatedAt = claimedAt },
) {
  assertOpenAnswerEvaluatorLeaseFields({ leaseId, workerId, claimedAt, expiresAt });

  database
    .prepare(
      `update open_answer_evaluator_runs
       set job_status = 'leased',
           lease_id = ?,
           worker_id = ?,
           lease_claimed_at = ?,
           lease_expires_at = ?,
           next_retry_at = null,
           cancellation_reason = null,
           timeout_reason = null,
           job_failure_reason = null,
           job_updated_at = ?
       where id = ?`,
    )
    .run(leaseId, workerId, claimedAt, expiresAt, updatedAt, evaluatorJobId);

  return getOpenAnswerEvaluatorJobRecord(database, evaluatorJobId);
}

export function updateOpenAnswerEvaluatorJobRecovery(
  database,
  {
    evaluatorJobId,
    runStatus,
    jobStatus,
    failedAt,
    failureReason,
    attemptNumber,
    nextRetryAt = null,
    cancellationReason = null,
    timeoutReason = null,
    jobFailureReason = null,
    updatedAt = failedAt,
  },
) {
  if (
    !["failed", "cancelled"].includes(runStatus) ||
    !isOpenAnswerEvaluatorJobStatus(jobStatus) ||
    !isNonEmptyString(failedAt) ||
    !isNonEmptyString(failureReason) ||
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1 ||
    !isNonEmptyString(updatedAt) ||
    !isValidOpenAnswerEvaluatorRecoveryState({
      runStatus,
      jobStatus,
      nextRetryAt,
      cancellationReason,
      timeoutReason,
      jobFailureReason,
    })
  ) {
    throw new StorageInvariantError("validation_failed");
  }

  database
    .prepare(
      `update open_answer_evaluator_runs
       set status = ?,
           completed_at = null,
           failed_at = ?,
           failure_reason = ?,
           job_status = ?,
           attempt_number = ?,
           lease_id = null,
           worker_id = null,
           lease_claimed_at = null,
           lease_expires_at = null,
           terminal_completion_signature_json = null,
           next_retry_at = ?,
           cancellation_reason = ?,
           timeout_reason = ?,
           job_failure_reason = ?,
           job_updated_at = ?
       where id = ?`,
    )
    .run(
      runStatus,
      failedAt,
      failureReason,
      jobStatus,
      attemptNumber,
      nextRetryAt,
      cancellationReason,
      timeoutReason,
      jobFailureReason,
      updatedAt,
      evaluatorJobId,
    );

  return getOpenAnswerEvaluatorJobRecord(database, evaluatorJobId);
}

function isValidOpenAnswerEvaluatorRecoveryState({
  runStatus,
  jobStatus,
  nextRetryAt,
  cancellationReason,
  timeoutReason,
  jobFailureReason,
}) {
  if (jobStatus === "retry_waiting") {
    return (
      runStatus === "failed" &&
      isNonEmptyString(nextRetryAt) &&
      isNonEmptyString(jobFailureReason) &&
      cancellationReason === null &&
      timeoutReason === null
    );
  }
  if (jobStatus === "failed") {
    return (
      runStatus === "failed" &&
      nextRetryAt === null &&
      cancellationReason === null &&
      timeoutReason === null &&
      isNonEmptyString(jobFailureReason)
    );
  }
  if (jobStatus === "timed_out") {
    return (
      runStatus === "failed" &&
      nextRetryAt === null &&
      cancellationReason === null &&
      isNonEmptyString(timeoutReason) &&
      jobFailureReason === null
    );
  }
  if (jobStatus === "cancelled") {
    return (
      runStatus === "cancelled" &&
      nextRetryAt === null &&
      isNonEmptyString(cancellationReason) &&
      timeoutReason === null &&
      jobFailureReason === null
    );
  }
  return false;
}

export function clearOpenAnswerEvaluatorJobLease(
  database,
  { evaluatorJobId, jobStatus, updatedAt, terminalCompletionSignature = null },
) {
  if (
    !isOpenAnswerEvaluatorJobStatus(jobStatus) ||
    !isNonEmptyString(updatedAt) ||
    !isValidTerminalCompletionSignature(terminalCompletionSignature)
  ) {
    throw new StorageInvariantError("validation_failed");
  }

  database
    .prepare(
      `update open_answer_evaluator_runs
       set job_status = ?,
           lease_id = null,
           worker_id = null,
           lease_claimed_at = null,
           lease_expires_at = null,
           terminal_completion_signature_json = ?,
           job_updated_at = ?
       where id = ?`,
    )
    .run(
      jobStatus,
      terminalCompletionSignature === null ? null : JSON.stringify(terminalCompletionSignature),
      updatedAt,
      evaluatorJobId,
    );

  return getOpenAnswerEvaluatorJobRecord(database, evaluatorJobId);
}

export function createOpenAnswerEvaluatorEvidenceRecord(
  database,
  { id, evaluatorRunId, attemptId, evidenceKind, redactedSummary = null, recordedAt },
) {
  assertOpenAnswerEvaluatorEvidenceMatchesRun(database, { evaluatorRunId, attemptId });

  database
    .prepare(
      `insert into open_answer_evaluator_evidence (
         id, evaluator_run_id, attempt_id, evidence_kind, visibility, redacted_summary, recorded_at
       ) values (?, ?, ?, ?, 'internal', ?, ?)`,
    )
    .run(id, evaluatorRunId, attemptId, evidenceKind, redactedSummary, recordedAt);

  return getOpenAnswerEvaluatorEvidenceRecord(database, id);
}

export function getOpenAnswerEvaluatorEvidenceRecord(database, id) {
  const row = database
    .prepare(
      `select id, evaluator_run_id as evaluatorRunId, attempt_id as attemptId,
              evidence_kind as evidenceKind, visibility, redacted_summary as redactedSummary,
              recorded_at as recordedAt
       from open_answer_evaluator_evidence
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listOpenAnswerEvaluatorEvidenceRecords(database, { evaluatorRunId = null } = {}) {
  const whereClause = evaluatorRunId === null ? "" : "where evaluator_run_id = ?";
  const values = evaluatorRunId === null ? [] : [evaluatorRunId];

  return database
    .prepare(
      `select id, evaluator_run_id as evaluatorRunId, attempt_id as attemptId,
              evidence_kind as evidenceKind, visibility, redacted_summary as redactedSummary,
              recorded_at as recordedAt
       from open_answer_evaluator_evidence
       ${whereClause}
       order by recorded_at, id`,
    )
    .all(...values);
}

export function createAcceptedCorpusEntityRecord(
  database,
  { id, programId, acceptedKind, currentRevisionId },
) {
  assertProgramShellExists(database, programId);

  database
    .prepare(
      `insert into accepted_corpus_entities (id, program_id, accepted_kind, current_revision_id)
       values (?, ?, ?, ?)`,
    )
    .run(id, programId, acceptedKind, currentRevisionId);

  return getAcceptedCorpusEntityRecord(database, id);
}

export function getAcceptedCorpusEntityRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, accepted_kind as acceptedKind,
              current_revision_id as currentRevisionId
       from accepted_corpus_entities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedCorpusEntityRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, program_id as programId, accepted_kind as acceptedKind,
                current_revision_id as currentRevisionId
         from accepted_corpus_entities
         order by id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, program_id as programId, accepted_kind as acceptedKind,
              current_revision_id as currentRevisionId
       from accepted_corpus_entities
       where program_id = ?
       order by id`,
    )
    .all(programId);
}

export function updateAcceptedCorpusEntityCurrentRevision(
  database,
  { entityId, currentRevisionId },
) {
  const revision = getAcceptedCorpusRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("accepted_revision_not_found");
  }

  if (revision.entityId !== entityId) {
    throw new StorageInvariantError("accepted_revision_entity_mismatch");
  }

  database
    .prepare(
      `update accepted_corpus_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, entityId);

  return getAcceptedCorpusEntityRecord(database, entityId);
}

export function createAcceptedCorpusRevisionRecord(
  database,
  {
    id,
    entityId,
    programId,
    acceptedKind,
    title,
    body = null,
    acceptedFromCandidateId,
    sourceIds = [],
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);

  database
    .prepare(
      `insert into accepted_corpus_revisions (
         id,
         entity_id,
         program_id,
         accepted_kind,
         title,
         body,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entityId,
      programId,
      acceptedKind,
      title,
      body,
      acceptedFromCandidateId,
      JSON.stringify(sourceIds),
      rationale,
      acceptedByIdentityId,
      acceptedAt,
    );

  return getAcceptedCorpusRevisionRecord(database, id);
}

export function getAcceptedCorpusRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, accepted_kind as acceptedKind,
              title, body, accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_corpus_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedCorpusRevisionRecord(row) : null;
}

export function listAcceptedCorpusRevisionRecords(database) {
  return database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, accepted_kind as acceptedKind,
              title, body, accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_corpus_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedCorpusRevisionRecord);
}

export function createCorpusEventRecord(
  database,
  {
    id,
    eventType,
    actorIdentityId,
    programId = null,
    targetId = null,
    occurredAt,
    outcome,
    reason = null,
  },
) {
  assertIdentityExists(database, actorIdentityId);

  database
    .prepare(
      `insert into corpus_events (
         id, event_type, actor_identity_id, program_id, target_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, eventType, actorIdentityId, programId, targetId, occurredAt, outcome, reason);

  return getCorpusEventRecord(database, id);
}

export function getCorpusEventRecord(database, id) {
  const row = database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              program_id as programId, target_id as targetId, occurred_at as occurredAt,
              outcome, reason
       from corpus_events
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listCorpusEventRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, event_type as eventType, actor_identity_id as actorIdentityId,
                program_id as programId, target_id as targetId, occurred_at as occurredAt,
                outcome, reason
         from corpus_events
         order by occurred_at, id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              program_id as programId, target_id as targetId, occurred_at as occurredAt,
              outcome, reason
       from corpus_events
       where program_id = ?
       order by occurred_at, id`,
    )
    .all(programId);
}

export function createProgramMembershipRecord(
  database,
  { id, programId, identityId, participationKind, status, createdAt, updatedAt },
) {
  assertIdentityExists(database, identityId);
  assertProgramShellExists(database, programId);
  database
    .prepare(
      `insert into program_memberships (
         id, program_id, identity_id, participation_kind, status, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, programId, identityId, participationKind, status, createdAt, updatedAt);

  return getProgramMembershipRecord(database, { programId, identityId, participationKind });
}

export function updateProgramMembershipStatus(
  database,
  { programId, identityId, participationKind, status, updatedAt },
) {
  database
    .prepare(
      `update program_memberships
       set status = ?, updated_at = ?
       where program_id = ? and identity_id = ? and participation_kind = ?`,
    )
    .run(status, updatedAt, programId, identityId, participationKind);

  return getProgramMembershipRecord(database, { programId, identityId, participationKind });
}

export function getProgramMembershipRecord(
  database,
  { programId, identityId, participationKind },
) {
  const row = database
    .prepare(
      `select id, program_id as programId, identity_id as identityId,
              participation_kind as participationKind, status,
              created_at as createdAt, updated_at as updatedAt
       from program_memberships
       where program_id = ? and identity_id = ? and participation_kind = ?`,
    )
    .get(programId, identityId, participationKind);

  return row ?? null;
}

export function listProgramMembershipRecordsByIdentity(database, identityId) {
  return database
    .prepare(
      `select id, program_id as programId, identity_id as identityId,
              participation_kind as participationKind, status,
              created_at as createdAt, updated_at as updatedAt
       from program_memberships
       where identity_id = ?
       order by created_at, id`,
    )
    .all(identityId);
}

export function listProgramMembershipRecords(database) {
  return database
    .prepare(
      `select id, program_id as programId, identity_id as identityId,
              participation_kind as participationKind, status,
              created_at as createdAt, updated_at as updatedAt
       from program_memberships
       order by created_at, id`,
    )
    .all();
}

export function listActiveProgramCuratorIdentityIds(database, programId) {
  return database
    .prepare(
      `select identity_id as identityId
       from program_memberships
       where program_id = ? and participation_kind = 'program_curator' and status = 'active'`,
    )
    .all(programId)
    .map($0 => $0.identityId);
}

export function hasActiveProgramCuratorMembership(database, { programId, identityId }) {
  const row = database
    .prepare(
      `select 1
       from program_memberships
       join identities on identities.id = program_memberships.identity_id
       where program_memberships.program_id = ?
         and program_memberships.identity_id = ?
         and program_memberships.participation_kind = 'program_curator'
         and program_memberships.status = 'active'
         and identities.state = 'active'`,
    )
    .get(programId, identityId);

  return row !== undefined;
}

export function listProgramIdsWithActiveCuratorParticipation(database, identityId) {
  return database
    .prepare(
      `select distinct program_memberships.program_id as programId
       from program_memberships
       join identities on identities.id = program_memberships.identity_id
       where program_memberships.identity_id = ?
         and program_memberships.participation_kind = 'program_curator'
         and program_memberships.status = 'active'
         and identities.state = 'active'`,
    )
    .all(identityId)
    .map($0 => $0.programId);
}

export function createProgramEventRecord(
  database,
  {
    id,
    eventType,
    actorIdentityId,
    programId = null,
    occurredAt,
    outcome,
    reason = null,
  },
) {
  database
    .prepare(
      `insert into program_events (
         id, event_type, actor_identity_id, program_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, eventType, actorIdentityId, programId, occurredAt, outcome, reason);

  return getProgramEventRecord(database, id);
}

export function getProgramEventRecord(database, id) {
  const row = database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              program_id as programId, occurred_at as occurredAt, outcome, reason
       from program_events
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listProgramEventRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, event_type as eventType, actor_identity_id as actorIdentityId,
                program_id as programId, occurred_at as occurredAt, outcome, reason
         from program_events
         order by occurred_at, id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              program_id as programId, occurred_at as occurredAt, outcome, reason
       from program_events
       where program_id = ?
       order by occurred_at, id`,
    )
    .all(programId);
}

export function createProgramMembershipEventRecord(
  database,
  {
    id,
    eventType,
    actorIdentityId,
    targetIdentityId,
    programId,
    participationKind,
    resultingStatus = null,
    occurredAt,
    outcome,
    reason = null,
  },
) {
  database
    .prepare(
      `insert into program_membership_events (
         id, event_type, actor_identity_id, target_identity_id, program_id,
         participation_kind, resulting_status, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      eventType,
      actorIdentityId,
      targetIdentityId,
      programId,
      participationKind,
      resultingStatus,
      occurredAt,
      outcome,
      reason,
    );

  return getProgramMembershipEventRecord(database, id);
}

export function getProgramMembershipEventRecord(database, id) {
  const row = database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              target_identity_id as targetIdentityId, program_id as programId,
              participation_kind as participationKind,
              resulting_status as resultingStatus,
              occurred_at as occurredAt, outcome, reason
       from program_membership_events
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listProgramMembershipEventRecords(database, { programId = null } = {}) {
  if (programId === null) {
    return database
      .prepare(
        `select id, event_type as eventType, actor_identity_id as actorIdentityId,
                target_identity_id as targetIdentityId, program_id as programId,
                participation_kind as participationKind,
                resulting_status as resultingStatus,
                occurred_at as occurredAt, outcome, reason
         from program_membership_events
         order by occurred_at, id`,
      )
      .all();
  }

  return database
    .prepare(
      `select id, event_type as eventType, actor_identity_id as actorIdentityId,
              target_identity_id as targetIdentityId, program_id as programId,
              participation_kind as participationKind,
              resulting_status as resultingStatus,
              occurred_at as occurredAt, outcome, reason
       from program_membership_events
       where program_id = ?
       order by occurred_at, id`,
    )
    .all(programId);
}

function assertProgramShellExists(database, programId) {
  if (!getProgramShellRecord(database, programId)) {
    throw new StorageInvariantError("program_not_found");
  }
}

function assertProgramSourcesBelongToProgram(database, { programId, sourceIds }) {
  for (const sourceId of sourceIds) {
    const source = getProgramSourceRecord(database, sourceId);
    if (!source) {
      throw new StorageInvariantError("program_source_not_found");
    }

    if (source.programId !== programId) {
      throw new StorageInvariantError("program_source_mismatch");
    }
  }
}

function assertAcceptedAssessmentCriterionEntitiesBelongToProgram(database, { programId, criterionEntityIds }) {
  for (const criterionEntityId of criterionEntityIds) {
    const criterionEntity = getAcceptedAssessmentCriterionEntityRecord(database, criterionEntityId);
    if (!criterionEntity) {
      throw new StorageInvariantError("criterion_entity_not_found");
    }

    if (criterionEntity.programId !== programId) {
      throw new StorageInvariantError("criterion_entity_program_mismatch");
    }
  }
}

function assertAssessmentCriterionCandidateBelongsToProgram(database, { programId, candidateId }) {
  const candidate = getAssessmentCriterionCandidateRecord(database, candidateId);
  if (!candidate) {
    throw new StorageInvariantError("criterion_candidate_not_found");
  }

  if (candidate.programId !== programId) {
    throw new StorageInvariantError("criterion_candidate_program_mismatch");
  }
}

function assertAcceptedAssessmentCriterionEntityBelongsToProgram(database, { programId, entityId }) {
  const entity = getAcceptedAssessmentCriterionEntityRecord(database, entityId);
  if (!entity) {
    throw new StorageInvariantError("criterion_entity_not_found");
  }

  if (entity.programId !== programId) {
    throw new StorageInvariantError("criterion_entity_program_mismatch");
  }
}

function assertAcceptedAssessmentCriterionRevisionsBelongToProgram(database, { programId, criterionRevisionIds }) {
  for (const criterionRevisionId of criterionRevisionIds) {
    const criterionRevision = getAcceptedAssessmentCriterionRevisionRecord(database, criterionRevisionId);
    if (!criterionRevision) {
      throw new StorageInvariantError("criterion_revision_not_found");
    }

    if (criterionRevision.programId !== programId) {
      throw new StorageInvariantError("criterion_revision_program_mismatch");
    }
  }
}

function assertOpenAnswerCheckCandidateBelongsToProgram(database, { programId, candidateId }) {
  const candidate = getOpenAnswerCheckCandidateRecord(database, candidateId);
  if (!candidate) {
    throw new StorageInvariantError("check_candidate_not_found");
  }

  if (candidate.programId !== programId) {
    throw new StorageInvariantError("check_candidate_program_mismatch");
  }
}

function assertAcceptedOpenAnswerCheckEntityBelongsToProgram(database, { programId, entityId }) {
  const entity = getAcceptedOpenAnswerCheckEntityRecord(database, entityId);
  if (!entity) {
    throw new StorageInvariantError("check_entity_not_found");
  }

  if (entity.programId !== programId) {
    throw new StorageInvariantError("check_entity_program_mismatch");
  }
}

function assertAcceptedOpenAnswerCheckRevisionBelongsToProgram(database, { programId, revisionId }) {
  const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, revisionId);
  if (!revision) {
    throw new StorageInvariantError("check_revision_not_found");
  }

  if (revision.programId !== programId) {
    throw new StorageInvariantError("check_revision_program_mismatch");
  }
}

function assertOpenAnswerAttemptIdempotencyScopeAvailable(
  database,
  { programId, studentIdentityId, checkRevisionId, idempotencyKey },
) {
  const row = database
    .prepare(
      `select 1
       from open_answer_attempts
       where program_id = ?
         and student_identity_id = ?
         and check_revision_id = ?
         and idempotency_key = ?`,
    )
    .get(programId, studentIdentityId, checkRevisionId, idempotencyKey);

  if (row) {
    throw new StorageInvariantError("attempt_idempotency_conflict");
  }
}

function assertOpenAnswerAttemptCriterionSnapshotMatchesCheck(database, { checkRevisionId, criterionRevisionIds }) {
  const checkRevision = getAcceptedOpenAnswerCheckRevisionRecord(database, checkRevisionId);
  if (JSON.stringify(checkRevision.criterionRevisionIds) !== JSON.stringify(criterionRevisionIds)) {
    throw new StorageInvariantError("check_criterion_revision_mismatch");
  }
}

function assertOpenAnswerEvaluationMatchesAttempt(
  database,
  { attemptId, programId, studentIdentityId, checkRevisionId, criterionRevisionIds },
) {
  const attempt = getOpenAnswerAttemptRecord(database, attemptId);
  if (!attempt) {
    throw new StorageInvariantError("attempt_not_found");
  }

  if (attempt.programId !== programId) {
    throw new StorageInvariantError("attempt_program_mismatch");
  }
  if (attempt.studentIdentityId !== studentIdentityId) {
    throw new StorageInvariantError("attempt_student_mismatch");
  }
  if (attempt.checkRevisionId !== checkRevisionId) {
    throw new StorageInvariantError("attempt_check_revision_mismatch");
  }
  if (JSON.stringify(attempt.criterionRevisionIds) !== JSON.stringify(criterionRevisionIds)) {
    throw new StorageInvariantError("attempt_criterion_revisions_mismatch");
  }
}

function assertOpenAnswerEvaluatorRunMatchesAttempt(
  database,
  { attemptId, programId, studentIdentityId, checkRevisionId, criterionRevisionIds },
) {
  const attempt = getOpenAnswerAttemptRecord(database, attemptId);
  if (!attempt) {
    throw new StorageInvariantError("attempt_not_found");
  }

  if (
    attempt.programId !== programId ||
    attempt.studentIdentityId !== studentIdentityId ||
    attempt.checkRevisionId !== checkRevisionId ||
    JSON.stringify(attempt.criterionRevisionIds) !== JSON.stringify(criterionRevisionIds)
  ) {
    throw new StorageInvariantError("evaluator_run_attempt_mismatch");
  }
}

function assertOpenAnswerEvaluatorJobState({
  jobStatus,
  attemptNumber,
  retryPolicy,
  budgetPolicy,
  leaseId,
  workerId,
  leaseClaimedAt,
  leaseExpiresAt,
}) {
  if (
    jobStatus === null &&
    attemptNumber === null &&
    retryPolicy === null &&
    budgetPolicy === null &&
    leaseId === null &&
    workerId === null &&
    leaseClaimedAt === null &&
    leaseExpiresAt === null
  ) {
    return;
  }

  if (!isOpenAnswerEvaluatorJobStatus(jobStatus)) {
    throw new StorageInvariantError("validation_failed");
  }
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new StorageInvariantError("validation_failed");
  }
  assertOpenAnswerEvaluatorRetryPolicy(retryPolicy);
  assertOpenAnswerEvaluatorBudgetPolicy(budgetPolicy);

  const hasLease = leaseId !== null || workerId !== null || leaseClaimedAt !== null || leaseExpiresAt !== null;
  if (jobStatus === "leased" && !hasLease) {
    throw new StorageInvariantError("validation_failed");
  }
  if (
    hasLease &&
    (!isNonEmptyString(leaseId) ||
      !isNonEmptyString(workerId) ||
      !isNonEmptyString(leaseClaimedAt) ||
      !isNonEmptyString(leaseExpiresAt))
  ) {
    throw new StorageInvariantError("validation_failed");
  }
}

function isOpenAnswerEvaluatorJobStatus(value) {
  return [
    "waiting",
    "leased",
    "retry_waiting",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
  ].includes(value);
}

function assertOpenAnswerEvaluatorLeaseFields({ leaseId, workerId, claimedAt, expiresAt }) {
  if (
    !isNonEmptyString(leaseId) ||
    !isNonEmptyString(workerId) ||
    !isNonEmptyString(claimedAt) ||
    !isNonEmptyString(expiresAt)
  ) {
    throw new StorageInvariantError("validation_failed");
  }
}

function isValidTerminalCompletionSignature(value) {
  return (
    value === null ||
    (isNonEmptyString(value.leaseId) &&
      isNonEmptyString(value.workerId) &&
      (value.providerUsage === null || typeof value.providerUsage === "object") &&
      (value.outputValidation === null || typeof value.outputValidation === "object"))
  );
}

function assertOpenAnswerEvaluatorRetryPolicy(retryPolicy) {
  if (
    !retryPolicy ||
    !Number.isInteger(retryPolicy.maxAttempts) ||
    retryPolicy.maxAttempts < 1 ||
    !Array.isArray(retryPolicy.backoffSeconds) ||
    retryPolicy.backoffSeconds.length < retryPolicy.maxAttempts - 1 ||
    retryPolicy.backoffSeconds.some($0 => !Number.isInteger($0) || $0 < 0)
  ) {
    throw new StorageInvariantError("validation_failed");
  }
}

function assertOpenAnswerEvaluatorBudgetPolicy(budgetPolicy) {
  if (budgetPolicy === null) {
    return;
  }
  if (typeof budgetPolicy !== "object" || Array.isArray(budgetPolicy)) {
    throw new StorageInvariantError("validation_failed");
  }
  const numericFields = [
    budgetPolicy.maxProviderCalls,
    budgetPolicy.maxInputTokens,
    budgetPolicy.maxOutputTokens,
    budgetPolicy.maxEstimatedCostMinorUnits,
  ].filter($0 => $0 !== undefined);
  if (numericFields.some($0 => !Number.isInteger($0) || $0 < 0)) {
    throw new StorageInvariantError("validation_failed");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertOpenAnswerEvaluatorRunScopeAvailable(database, { attemptId, status }) {
  if (
    status === "running" &&
    listOpenAnswerEvaluatorRunRecords(database, { attemptId, status: "running" }).length > 0
  ) {
    throw new StorageInvariantError("evaluator_run_conflict");
  }
}

function assertOpenAnswerEvaluatorEvidenceMatchesRun(database, { evaluatorRunId, attemptId }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, evaluatorRunId);
  if (!evaluatorRun) {
    throw new StorageInvariantError("evaluator_run_not_found");
  }

  if (evaluatorRun.attemptId !== attemptId) {
    throw new StorageInvariantError("evaluator_evidence_attempt_mismatch");
  }
}

function assertOpenAnswerAttemptExists(database, attemptId) {
  if (!getOpenAnswerAttemptRecord(database, attemptId)) {
    throw new StorageInvariantError("attempt_not_found");
  }
}

export function exportIdentityBackup(database) {
  return {
    version: 1,
    identities: listIdentities(database),
    localPasswordCredentials: listLocalPasswordCredentials(database),
    adminAuthorities: listAdminAuthorities(database),
    auditEvents: listAuditEvents(database),
    programShells: listProgramShellRecords(database),
    programMemberships: listProgramMembershipRecords(database),
    programEvents: listProgramEventRecords(database),
    programMembershipEvents: listProgramMembershipEventRecords(database),
    programSources: listProgramSourceRecords(database),
    corpusCandidates: listCorpusCandidateRecords(database),
    acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database),
    acceptedCorpusRevisions: listAcceptedCorpusRevisionRecords(database),
    corpusEvents: listCorpusEventRecords(database),
    assessmentCriterionCandidates: listAssessmentCriterionCandidateRecords(database),
    acceptedAssessmentCriterionEntities: listAcceptedAssessmentCriterionEntityRecords(database),
    acceptedAssessmentCriterionRevisions: listAcceptedAssessmentCriterionRevisionRecords(database),
    openAnswerCheckCandidates: listOpenAnswerCheckCandidateRecords(database),
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityRecords(database),
    acceptedOpenAnswerCheckRevisions: listAcceptedOpenAnswerCheckRevisionRecords(database),
    openAnswerAttempts: listOpenAnswerAttemptRecords(database),
    openAnswerEvaluations: listOpenAnswerEvaluationRecords(database),
    openAnswerEvaluationFailures: listOpenAnswerEvaluationFailureRecords(database),
    openAnswerEvaluatorRuns: listOpenAnswerEvaluatorRunRecords(database),
    openAnswerEvaluatorEvidence: listOpenAnswerEvaluatorEvidenceRecords(database),
  };
}

export function restoreIdentityBackup(database, backup) {
  if (!isValidBackupShape(backup)) {
    throw new StorageInvariantError("validation_failed");
  }

  if (!hasEffectiveAdminInBackup(backup)) {
    throw new StorageInvariantError("last_admin_removal");
  }

  if (!hasActiveCuratorForEveryProgramInBackup(backup)) {
    throw new StorageInvariantError("program_curator_missing");
  }

  assertValidCorpusGraphInBackup(backup);
  assertValidAssessmentGraphInBackup(backup);
  assertValidStudentAttemptGraphInBackup(backup);

  database.transaction(() => {
    database.prepare("delete from sessions").run();
    database.prepare("delete from corpus_events").run();
    database.prepare("delete from open_answer_evaluator_evidence").run();
    database.prepare("delete from open_answer_evaluator_runs").run();
    database.prepare("delete from open_answer_evaluation_failures").run();
    database.prepare("delete from open_answer_evaluations").run();
    database.prepare("delete from open_answer_attempts").run();
    database.prepare("delete from accepted_open_answer_check_revisions").run();
    database.prepare("delete from accepted_open_answer_check_entities").run();
    database.prepare("delete from open_answer_check_candidates").run();
    database.prepare("delete from accepted_assessment_criterion_revisions").run();
    database.prepare("delete from accepted_assessment_criterion_entities").run();
    database.prepare("delete from assessment_criterion_candidates").run();
    database.prepare("delete from accepted_corpus_revisions").run();
    database.prepare("delete from accepted_corpus_entities").run();
    database.prepare("delete from corpus_candidates").run();
    database.prepare("delete from program_sources").run();
    database.prepare("delete from program_membership_events").run();
    database.prepare("delete from program_memberships").run();
    database.prepare("delete from program_events").run();
    database.prepare("delete from program_shells").run();
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

    const insertProgramShell = database.prepare(
      `insert into program_shells (
         id, title, description, admission_policy, created_by_identity_id, created_at
       ) values (?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramMembership = database.prepare(
      `insert into program_memberships (
         id, program_id, identity_id, participation_kind, status, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramEvent = database.prepare(
      `insert into program_events (
         id, event_type, actor_identity_id, program_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramMembershipEvent = database.prepare(
      `insert into program_membership_events (
         id, event_type, actor_identity_id, target_identity_id, program_id,
         participation_kind, resulting_status, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramSource = database.prepare(
      `insert into program_sources (
         id, program_id, source_kind, title, locator, citation, recorded_by_identity_id, recorded_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCorpusCandidate = database.prepare(
      `insert into corpus_candidates (
         id,
         program_id,
         candidate_kind,
         title,
         body,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedCorpusEntity = database.prepare(
      `insert into accepted_corpus_entities (
         id, program_id, accepted_kind, current_revision_id
       ) values (?, ?, ?, ?)`,
    );
    const insertAcceptedCorpusRevision = database.prepare(
      `insert into accepted_corpus_revisions (
         id,
         entity_id,
         program_id,
         accepted_kind,
         title,
         body,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCorpusEvent = database.prepare(
      `insert into corpus_events (
         id, event_type, actor_identity_id, program_id, target_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAssessmentCriterionCandidate = database.prepare(
      `insert into assessment_criterion_candidates (
         id,
         program_id,
         title,
         body,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedAssessmentCriterionEntity = database.prepare(
      `insert into accepted_assessment_criterion_entities (
         id, program_id, current_revision_id
       ) values (?, ?, ?)`,
    );
    const insertAcceptedAssessmentCriterionRevision = database.prepare(
      `insert into accepted_assessment_criterion_revisions (
         id,
         entity_id,
         program_id,
         title,
         body,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertOpenAnswerCheckCandidate = database.prepare(
      `insert into open_answer_check_candidates (
         id,
         program_id,
         check_kind,
         title,
         prompt,
         source_ids_json,
         criterion_entity_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedOpenAnswerCheckEntity = database.prepare(
      `insert into accepted_open_answer_check_entities (
         id, program_id, current_revision_id
       ) values (?, ?, ?)`,
    );
    const insertAcceptedOpenAnswerCheckRevision = database.prepare(
      `insert into accepted_open_answer_check_revisions (
         id,
         entity_id,
         program_id,
         check_kind,
         title,
         prompt,
         accepted_from_candidate_id,
         source_ids_json,
         criterion_revision_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertOpenAnswerAttempt = database.prepare(
      `insert into open_answer_attempts (
         id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         submitted_answer,
         idempotency_key,
         status,
         submitted_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertOpenAnswerEvaluation = database.prepare(
      `insert into open_answer_evaluations (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_kind,
         summary_feedback,
         criterion_feedback_json,
         evaluated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertOpenAnswerEvaluationFailure = database.prepare(
      `insert into open_answer_evaluation_failures (attempt_id, reason, failed_at)
       values (?, ?, ?)`,
    );
    const insertOpenAnswerEvaluatorRun = database.prepare(
      `insert into open_answer_evaluator_runs (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_path_kind,
         evaluator_policy_id,
         status,
         requested_by_identity_id,
         reviewer_identity_id,
         reviewer_capability,
         started_at,
         completed_at,
         failed_at,
         failure_reason,
         prior_failure_reason,
         prior_failed_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertOpenAnswerEvaluatorEvidence = database.prepare(
      `insert into open_answer_evaluator_evidence (
         id, evaluator_run_id, attempt_id, evidence_kind, visibility, redacted_summary, recorded_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const shell of backup.programShells ?? []) {
      insertProgramShell.run(
        shell.id,
        shell.title,
        shell.description ?? null,
        shell.admissionPolicy,
        shell.createdByIdentityId,
        shell.createdAt,
      );
    }

    for (const membership of backup.programMemberships ?? []) {
      insertProgramMembership.run(
        membership.id,
        membership.programId,
        membership.identityId,
        membership.participationKind,
        membership.status,
        membership.createdAt,
        membership.updatedAt,
      );
    }

    for (const event of backup.programEvents ?? []) {
      insertProgramEvent.run(
        event.id,
        event.eventType,
        event.actorIdentityId,
        event.programId ?? null,
        event.occurredAt,
        event.outcome,
        event.reason ?? null,
      );
    }

    for (const event of backup.programMembershipEvents ?? []) {
      insertProgramMembershipEvent.run(
        event.id,
        event.eventType,
        event.actorIdentityId,
        event.targetIdentityId,
        event.programId,
        event.participationKind,
        event.resultingStatus ?? null,
        event.occurredAt,
        event.outcome,
        event.reason ?? null,
      );
    }

    for (const source of backup.programSources ?? []) {
      insertProgramSource.run(
        source.id,
        source.programId,
        source.sourceKind,
        source.title,
        source.locator ?? null,
        source.citation ?? null,
        source.recordedByIdentityId,
        source.recordedAt,
      );
    }

    for (const candidate of backup.corpusCandidates ?? []) {
      insertCorpusCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.candidateKind,
        candidate.title,
        candidate.body ?? null,
        JSON.stringify(candidate.sourceIds ?? []),
        candidate.rationale ?? null,
        candidate.status,
        candidate.createdByIdentityId,
        candidate.createdAt,
        candidate.updatedAt,
      );
    }

    for (const entity of backup.acceptedCorpusEntities ?? []) {
      insertAcceptedCorpusEntity.run(
        entity.id,
        entity.programId,
        entity.acceptedKind,
        entity.currentRevisionId,
      );
    }

    for (const revision of backup.acceptedCorpusRevisions ?? []) {
      insertAcceptedCorpusRevision.run(
        revision.id,
        revision.entityId,
        revision.programId,
        revision.acceptedKind,
        revision.title,
        revision.body ?? null,
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    for (const event of backup.corpusEvents ?? []) {
      insertCorpusEvent.run(
        event.id,
        event.eventType,
        event.actorIdentityId,
        event.programId ?? null,
        event.targetId ?? null,
        event.occurredAt,
        event.outcome,
        event.reason ?? null,
      );
    }

    for (const candidate of backup.assessmentCriterionCandidates ?? []) {
      insertAssessmentCriterionCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.title,
        candidate.body,
        JSON.stringify(candidate.sourceIds ?? []),
        candidate.rationale ?? null,
        candidate.status,
        candidate.createdByIdentityId,
        candidate.createdAt,
        candidate.updatedAt,
      );
    }

    for (const entity of backup.acceptedAssessmentCriterionEntities ?? []) {
      insertAcceptedAssessmentCriterionEntity.run(
        entity.id,
        entity.programId,
        entity.currentRevisionId,
      );
    }

    for (const revision of backup.acceptedAssessmentCriterionRevisions ?? []) {
      insertAcceptedAssessmentCriterionRevision.run(
        revision.id,
        revision.entityId,
        revision.programId,
        revision.title,
        revision.body,
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    for (const candidate of backup.openAnswerCheckCandidates ?? []) {
      insertOpenAnswerCheckCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.checkKind,
        candidate.title,
        candidate.prompt,
        JSON.stringify(candidate.sourceIds ?? []),
        JSON.stringify(candidate.criterionEntityIds ?? []),
        candidate.rationale ?? null,
        candidate.status,
        candidate.createdByIdentityId,
        candidate.createdAt,
        candidate.updatedAt,
      );
    }

    for (const entity of backup.acceptedOpenAnswerCheckEntities ?? []) {
      insertAcceptedOpenAnswerCheckEntity.run(
        entity.id,
        entity.programId,
        entity.currentRevisionId,
      );
    }

    for (const revision of backup.acceptedOpenAnswerCheckRevisions ?? []) {
      insertAcceptedOpenAnswerCheckRevision.run(
        revision.id,
        revision.entityId,
        revision.programId,
        revision.checkKind,
        revision.title,
        revision.prompt,
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        JSON.stringify(revision.criterionRevisionIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    for (const attempt of backup.openAnswerAttempts ?? []) {
      insertOpenAnswerAttempt.run(
        attempt.id,
        attempt.programId,
        attempt.studentIdentityId,
        attempt.checkRevisionId,
        JSON.stringify(attempt.criterionRevisionIds ?? []),
        attempt.submittedAnswer,
        attempt.idempotencyKey,
        attempt.status,
        attempt.submittedAt,
        attempt.updatedAt,
      );
    }

    for (const evaluation of backup.openAnswerEvaluations ?? []) {
      insertOpenAnswerEvaluation.run(
        evaluation.id,
        evaluation.attemptId,
        evaluation.programId,
        evaluation.studentIdentityId,
        evaluation.checkRevisionId,
        JSON.stringify(evaluation.criterionRevisionIds ?? []),
        evaluation.evaluatorKind,
        evaluation.summaryFeedback,
        JSON.stringify(evaluation.criterionFeedback ?? []),
        evaluation.evaluatedAt,
      );
    }

    for (const failure of backup.openAnswerEvaluationFailures ?? []) {
      insertOpenAnswerEvaluationFailure.run(
        failure.attemptId,
        failure.reason,
        failure.failedAt,
      );
    }

    for (const evaluatorRun of backup.openAnswerEvaluatorRuns ?? []) {
      insertOpenAnswerEvaluatorRun.run(
        evaluatorRun.id,
        evaluatorRun.attemptId,
        evaluatorRun.programId,
        evaluatorRun.studentIdentityId,
        evaluatorRun.checkRevisionId,
        JSON.stringify(evaluatorRun.criterionRevisionIds ?? []),
        evaluatorRun.evaluatorPathKind,
        evaluatorRun.evaluatorPolicyId,
        evaluatorRun.status,
        evaluatorRun.requestedByIdentityId ?? null,
        evaluatorRun.reviewerIdentityId ?? null,
        evaluatorRun.reviewerCapability ?? null,
        evaluatorRun.startedAt ?? null,
        evaluatorRun.completedAt ?? null,
        evaluatorRun.failedAt ?? null,
        evaluatorRun.failureReason ?? null,
        evaluatorRun.priorFailureReason ?? null,
        evaluatorRun.priorFailedAt ?? null,
      );
    }

    for (const evidence of backup.openAnswerEvaluatorEvidence ?? []) {
      insertOpenAnswerEvaluatorEvidence.run(
        evidence.id,
        evidence.evaluatorRunId,
        evidence.attemptId,
        evidence.evidenceKind,
        evidence.visibility,
        evidence.redactedSummary ?? null,
        evidence.recordedAt,
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

function mapCorpusCandidateRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    candidateKind: row.candidateKind,
    title: row.title,
    body: row.body,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAssessmentCriterionCandidateRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    title: row.title,
    body: row.body,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAcceptedAssessmentCriterionRevisionRecord(row) {
  return {
    id: row.id,
    entityId: row.entityId,
    programId: row.programId,
    title: row.title,
    body: row.body,
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
}

function mapOpenAnswerCheckCandidateRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    checkKind: row.checkKind,
    title: row.title,
    prompt: row.prompt,
    sourceIds: JSON.parse(row.sourceIdsJson),
    criterionEntityIds: JSON.parse(row.criterionEntityIdsJson),
    rationale: row.rationale,
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAcceptedOpenAnswerCheckRevisionRecord(row) {
  return {
    id: row.id,
    entityId: row.entityId,
    programId: row.programId,
    checkKind: row.checkKind,
    title: row.title,
    prompt: row.prompt,
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    sourceIds: JSON.parse(row.sourceIdsJson),
    criterionRevisionIds: JSON.parse(row.criterionRevisionIdsJson),
    rationale: row.rationale,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
}

function mapOpenAnswerAttemptRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    checkRevisionId: row.checkRevisionId,
    criterionRevisionIds: JSON.parse(row.criterionRevisionIdsJson),
    submittedAnswer: row.submittedAnswer,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
  };
}

function mapOpenAnswerEvaluationRecord(row) {
  return {
    id: row.id,
    attemptId: row.attemptId,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    checkRevisionId: row.checkRevisionId,
    criterionRevisionIds: JSON.parse(row.criterionRevisionIdsJson),
    evaluatorKind: row.evaluatorKind,
    summaryFeedback: row.summaryFeedback,
    criterionFeedback: JSON.parse(row.criterionFeedbackJson),
    evaluatedAt: row.evaluatedAt,
  };
}

function mapOpenAnswerEvaluatorRunRecord(row) {
  return {
    id: row.id,
    attemptId: row.attemptId,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    checkRevisionId: row.checkRevisionId,
    criterionRevisionIds: JSON.parse(row.criterionRevisionIdsJson),
    evaluatorPathKind: row.evaluatorPathKind,
    evaluatorPolicyId: row.evaluatorPolicyId,
    status: row.status,
    requestedByIdentityId: row.requestedByIdentityId,
    reviewerIdentityId: row.reviewerIdentityId,
    reviewerCapability: row.reviewerCapability,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    failureReason: row.failureReason,
    priorFailureReason: row.priorFailureReason,
    priorFailedAt: row.priorFailedAt,
  };
}

function mapOpenAnswerEvaluatorJobRecord(row) {
  return {
    evaluatorJobId: row.id,
    evaluatorRunId: row.id,
    attemptId: row.attemptId,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    checkRevisionId: row.checkRevisionId,
    criterionRevisionIds: JSON.parse(row.criterionRevisionIdsJson),
    evaluatorPathKind: row.evaluatorPathKind,
    evaluatorPolicyId: row.evaluatorPolicyId,
    runStatus: row.runStatus,
    jobStatus: row.jobStatus,
    attemptNumber: row.attemptNumber,
    retryPolicy: JSON.parse(row.retryPolicyJson),
    budgetPolicy: row.budgetPolicyJson ? JSON.parse(row.budgetPolicyJson) : null,
    lease:
      row.leaseId === null
        ? null
        : {
            leaseId: row.leaseId,
            workerId: row.workerId,
            claimedAt: row.leaseClaimedAt,
            expiresAt: row.leaseExpiresAt,
          },
    nextRetryAt: row.nextRetryAt,
    cancellationReason: row.cancellationReason,
    timeoutReason: row.timeoutReason,
    jobFailureReason: row.jobFailureReason,
    ...(row.terminalCompletionSignatureJson
      ? { terminalCompletionSignature: JSON.parse(row.terminalCompletionSignatureJson) }
      : {}),
    createdAt: row.jobCreatedAt,
    updatedAt: row.jobUpdatedAt,
  };
}

function mapAcceptedCorpusRevisionRecord(row) {
  return {
    id: row.id,
    entityId: row.entityId,
    programId: row.programId,
    acceptedKind: row.acceptedKind,
    title: row.title,
    body: row.body,
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
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

function hasActiveCuratorForEveryProgramInBackup(backup) {
  const shells = backup.programShells ?? [];
  if (shells.length === 0) {
    return true;
  }
  const memberships = backup.programMemberships ?? [];
  const curatorPrograms = new Set(
    memberships
      .filter($0 => $0.participationKind === "program_curator" && $0.status === "active")
      .map($0 => $0.programId),
  );
  return shells.every($0 => curatorPrograms.has($0.id));
}

function assertValidCorpusGraphInBackup(backup) {
  const sourcesById = new Map((backup.programSources ?? []).map($0 => [$0.id, $0]));
  const candidatesById = new Map((backup.corpusCandidates ?? []).map($0 => [$0.id, $0]));
  const entitiesById = new Map((backup.acceptedCorpusEntities ?? []).map($0 => [$0.id, $0]));
  const revisionsById = new Map((backup.acceptedCorpusRevisions ?? []).map($0 => [$0.id, $0]));

  for (const candidate of backup.corpusCandidates ?? []) {
    assertSourceIdsBelongToProgram({
      programId: candidate.programId,
      sourceIds: candidate.sourceIds ?? [],
      sourcesById,
    });
  }

  for (const revision of backup.acceptedCorpusRevisions ?? []) {
    const entity = entitiesById.get(revision.entityId);
    if (!entity) {
      throw new StorageInvariantError("accepted_entity_not_found");
    }

    if (entity.programId !== revision.programId) {
      throw new StorageInvariantError("accepted_revision_program_mismatch");
    }

    if (entity.acceptedKind !== revision.acceptedKind) {
      throw new StorageInvariantError("accepted_revision_kind_mismatch");
    }

    const candidate = candidatesById.get(revision.acceptedFromCandidateId);
    if (!candidate) {
      throw new StorageInvariantError("candidate_not_found");
    }

    if (candidate.status !== "accepted") {
      throw new StorageInvariantError("candidate_not_accepted");
    }

    if (candidate.programId !== revision.programId) {
      throw new StorageInvariantError("candidate_program_mismatch");
    }

    assertSourceIdsBelongToProgram({
      programId: revision.programId,
      sourceIds: revision.sourceIds ?? [],
      sourcesById,
    });
  }

  for (const entity of backup.acceptedCorpusEntities ?? []) {
    const currentRevision = revisionsById.get(entity.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("accepted_revision_not_found");
    }

    if (currentRevision.entityId !== entity.id) {
      throw new StorageInvariantError("accepted_revision_entity_mismatch");
    }

    if (currentRevision.programId !== entity.programId) {
      throw new StorageInvariantError("accepted_revision_program_mismatch");
    }

    if (currentRevision.acceptedKind !== entity.acceptedKind) {
      throw new StorageInvariantError("accepted_revision_kind_mismatch");
    }
  }
}

function assertValidAssessmentGraphInBackup(backup) {
  const sourcesById = new Map((backup.programSources ?? []).map($0 => [$0.id, $0]));
  const criterionCandidatesById = new Map(
    (backup.assessmentCriterionCandidates ?? []).map($0 => [$0.id, $0]),
  );
  const criterionEntitiesById = new Map(
    (backup.acceptedAssessmentCriterionEntities ?? []).map($0 => [$0.id, $0]),
  );
  const criterionRevisionsById = new Map(
    (backup.acceptedAssessmentCriterionRevisions ?? []).map($0 => [$0.id, $0]),
  );
  const checkCandidatesById = new Map(
    (backup.openAnswerCheckCandidates ?? []).map($0 => [$0.id, $0]),
  );
  const checkEntitiesById = new Map(
    (backup.acceptedOpenAnswerCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const checkRevisionsById = new Map(
    (backup.acceptedOpenAnswerCheckRevisions ?? []).map($0 => [$0.id, $0]),
  );

  for (const candidate of backup.assessmentCriterionCandidates ?? []) {
    assertSourceIdsBelongToProgram({
      programId: candidate.programId,
      sourceIds: candidate.sourceIds ?? [],
      sourcesById,
    });
  }

  for (const revision of backup.acceptedAssessmentCriterionRevisions ?? []) {
    const entity = criterionEntitiesById.get(revision.entityId);
    if (!entity) {
      throw new StorageInvariantError("criterion_entity_not_found");
    }

    if (entity.programId !== revision.programId) {
      throw new StorageInvariantError("criterion_revision_program_mismatch");
    }

    const candidate = criterionCandidatesById.get(revision.acceptedFromCandidateId);
    if (!candidate) {
      throw new StorageInvariantError("criterion_candidate_not_found");
    }

    if (candidate.status !== "accepted") {
      throw new StorageInvariantError("criterion_candidate_not_accepted");
    }

    if (candidate.programId !== revision.programId) {
      throw new StorageInvariantError("criterion_candidate_program_mismatch");
    }

    assertSourceIdsBelongToProgram({
      programId: revision.programId,
      sourceIds: revision.sourceIds ?? [],
      sourcesById,
    });
  }

  for (const entity of backup.acceptedAssessmentCriterionEntities ?? []) {
    const currentRevision = criterionRevisionsById.get(entity.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("criterion_revision_not_found");
    }

    if (currentRevision.entityId !== entity.id) {
      throw new StorageInvariantError("criterion_revision_entity_mismatch");
    }

    if (currentRevision.programId !== entity.programId) {
      throw new StorageInvariantError("criterion_revision_program_mismatch");
    }
  }

  for (const candidate of backup.openAnswerCheckCandidates ?? []) {
    assertSourceIdsBelongToProgram({
      programId: candidate.programId,
      sourceIds: candidate.sourceIds ?? [],
      sourcesById,
    });
    assertCriterionEntityIdsBelongToProgram({
      programId: candidate.programId,
      criterionEntityIds: candidate.criterionEntityIds,
      criterionEntitiesById,
    });
  }

  for (const revision of backup.acceptedOpenAnswerCheckRevisions ?? []) {
    const entity = checkEntitiesById.get(revision.entityId);
    if (!entity) {
      throw new StorageInvariantError("check_entity_not_found");
    }

    if (entity.programId !== revision.programId) {
      throw new StorageInvariantError("check_revision_program_mismatch");
    }

    const candidate = checkCandidatesById.get(revision.acceptedFromCandidateId);
    if (!candidate) {
      throw new StorageInvariantError("check_candidate_not_found");
    }

    if (candidate.status !== "accepted") {
      throw new StorageInvariantError("check_candidate_not_accepted");
    }

    if (candidate.programId !== revision.programId) {
      throw new StorageInvariantError("check_candidate_program_mismatch");
    }

    assertSourceIdsBelongToProgram({
      programId: revision.programId,
      sourceIds: revision.sourceIds ?? [],
      sourcesById,
    });
    assertCriterionRevisionIdsBelongToProgram({
      programId: revision.programId,
      criterionRevisionIds: revision.criterionRevisionIds,
      criterionRevisionsById,
    });
  }

  for (const entity of backup.acceptedOpenAnswerCheckEntities ?? []) {
    const currentRevision = checkRevisionsById.get(entity.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("check_revision_not_found");
    }

    if (currentRevision.entityId !== entity.id) {
      throw new StorageInvariantError("check_revision_entity_mismatch");
    }

    if (currentRevision.programId !== entity.programId) {
      throw new StorageInvariantError("check_revision_program_mismatch");
    }
  }
}

function assertValidStudentAttemptGraphInBackup(backup) {
  const programShellsById = new Map((backup.programShells ?? []).map($0 => [$0.id, $0]));
  const identitiesById = new Map((backup.identities ?? []).map($0 => [$0.id, $0]));
  const checkRevisionsById = new Map(
    (backup.acceptedOpenAnswerCheckRevisions ?? []).map($0 => [$0.id, $0]),
  );
  const attemptsById = new Map((backup.openAnswerAttempts ?? []).map($0 => [$0.id, $0]));
  const evaluationsByAttemptId = new Map(
    (backup.openAnswerEvaluations ?? []).map($0 => [$0.attemptId, $0]),
  );
  const evaluatorRunsById = new Map(
    (backup.openAnswerEvaluatorRuns ?? []).map($0 => [$0.id, $0]),
  );
  const runningRunAttemptIds = new Set();

  for (const attempt of backup.openAnswerAttempts ?? []) {
    if (!programShellsById.has(attempt.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    if (!identitiesById.has(attempt.studentIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }

    const checkRevision = checkRevisionsById.get(attempt.checkRevisionId);
    if (!checkRevision) {
      throw new StorageInvariantError("check_revision_not_found");
    }

    if (checkRevision.programId !== attempt.programId) {
      throw new StorageInvariantError("check_revision_program_mismatch");
    }

    assertCriterionRevisionIdsBelongToCheckRevision({
      criterionRevisionIds: attempt.criterionRevisionIds,
      checkRevision,
    });
  }

  for (const evaluation of backup.openAnswerEvaluations ?? []) {
    const attempt = attemptsById.get(evaluation.attemptId);
    if (!attempt) {
      throw new StorageInvariantError("attempt_not_found");
    }
    if (attempt.status !== "evaluated") {
      throw new StorageInvariantError("attempt_status_mismatch");
    }

    assertEvaluationMatchesAttemptBackup(evaluation, attempt);
  }

  for (const failure of backup.openAnswerEvaluationFailures ?? []) {
    const attempt = attemptsById.get(failure.attemptId);
    if (!attempt) {
      throw new StorageInvariantError("attempt_not_found");
    }
    if (attempt.status !== "evaluation_failed") {
      throw new StorageInvariantError("attempt_status_mismatch");
    }
  }

  for (const evaluatorRun of backup.openAnswerEvaluatorRuns ?? []) {
    const attempt = attemptsById.get(evaluatorRun.attemptId);
    if (!attempt) {
      throw new StorageInvariantError("attempt_not_found");
    }

    assertEvaluatorRunMatchesAttemptBackup(evaluatorRun, attempt);
    assertEvaluatorRunAttributionBackup(evaluatorRun, identitiesById);
    assertEvaluatorRunLifecycleMatchesAttemptBackup({
      attempt,
      evaluatorRun,
      evaluationsByAttemptId,
      runningRunAttemptIds,
    });
  }

  for (const evidence of backup.openAnswerEvaluatorEvidence ?? []) {
    const evaluatorRun = evaluatorRunsById.get(evidence.evaluatorRunId);
    if (!evaluatorRun) {
      throw new StorageInvariantError("evaluator_run_not_found");
    }
    if (evidence.attemptId !== evaluatorRun.attemptId) {
      throw new StorageInvariantError("evaluator_evidence_attempt_mismatch");
    }
    assertEvaluatorEvidenceBackup(evidence);
  }
}

function assertSourceIdsBelongToProgram({ programId, sourceIds, sourcesById }) {
  for (const sourceId of sourceIds) {
    const source = sourcesById.get(sourceId);
    if (!source) {
      throw new StorageInvariantError("program_source_not_found");
    }

    if (source.programId !== programId) {
      throw new StorageInvariantError("source_program_mismatch");
    }
  }
}

function assertCriterionRevisionIdsBelongToCheckRevision({ criterionRevisionIds, checkRevision }) {
  if (!Array.isArray(criterionRevisionIds) || criterionRevisionIds.length === 0) {
    throw new StorageInvariantError("criterion_revision_not_found");
  }

  const acceptedCriterionRevisionIds = new Set(checkRevision.criterionRevisionIds);
  for (const criterionRevisionId of criterionRevisionIds) {
    if (!acceptedCriterionRevisionIds.has(criterionRevisionId)) {
      throw new StorageInvariantError("criterion_revision_not_found");
    }
  }
}

function assertEvaluationMatchesAttemptBackup(evaluation, attempt) {
  if (
    evaluation.programId !== attempt.programId ||
    evaluation.studentIdentityId !== attempt.studentIdentityId ||
    evaluation.checkRevisionId !== attempt.checkRevisionId ||
    JSON.stringify(evaluation.criterionRevisionIds) !== JSON.stringify(attempt.criterionRevisionIds)
  ) {
    throw new StorageInvariantError("evaluation_attempt_mismatch");
  }
}

function assertEvaluatorRunMatchesAttemptBackup(evaluatorRun, attempt) {
  if (
    evaluatorRun.programId !== attempt.programId ||
    evaluatorRun.studentIdentityId !== attempt.studentIdentityId ||
    evaluatorRun.checkRevisionId !== attempt.checkRevisionId ||
    JSON.stringify(evaluatorRun.criterionRevisionIds) !== JSON.stringify(attempt.criterionRevisionIds)
  ) {
    throw new StorageInvariantError("evaluator_run_attempt_mismatch");
  }
}

function assertEvaluatorRunAttributionBackup(evaluatorRun, identitiesById) {
  if (evaluatorRun.requestedByIdentityId && !identitiesById.has(evaluatorRun.requestedByIdentityId)) {
    throw new StorageInvariantError("identity_not_found");
  }

  if (evaluatorRun.reviewerIdentityId && !identitiesById.has(evaluatorRun.reviewerIdentityId)) {
    throw new StorageInvariantError("identity_not_found");
  }

  if (
    evaluatorRun.evaluatorPathKind === "human_reviewed" &&
    (!isNonEmptyText(evaluatorRun.reviewerIdentityId) ||
      !isNonEmptyText(evaluatorRun.reviewerCapability))
  ) {
    throw new StorageInvariantError("validation_failed");
  }
}

function assertEvaluatorRunLifecycleMatchesAttemptBackup({
  attempt,
  evaluatorRun,
  evaluationsByAttemptId,
  runningRunAttemptIds,
}) {
  if (evaluatorRun.status === "running") {
    if (runningRunAttemptIds.has(evaluatorRun.attemptId)) {
      throw new StorageInvariantError("evaluator_run_conflict");
    }
    runningRunAttemptIds.add(evaluatorRun.attemptId);
    if (attempt.status !== "evaluating") {
      throw new StorageInvariantError("attempt_status_mismatch");
    }
  }

  if (evaluatorRun.status === "succeeded" && !evaluationsByAttemptId.has(evaluatorRun.attemptId)) {
    throw new StorageInvariantError("evaluation_not_found");
  }

  if (
    evaluatorRun.status === "cancelled" &&
    Boolean(evaluatorRun.priorFailureReason) !== Boolean(evaluatorRun.priorFailedAt)
  ) {
    throw new StorageInvariantError("evaluation_failure_snapshot_mismatch");
  }
}

function assertEvaluatorEvidenceBackup(evidence) {
  if (
    evidence.visibility !== "internal" ||
    (evidence.redactedSummary !== undefined &&
      evidence.redactedSummary !== null &&
      (!isNonEmptyText(evidence.redactedSummary) ||
        containsForbiddenResponseDetail(evidence.redactedSummary)))
  ) {
    throw new StorageInvariantError("validation_failed");
  }
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsForbiddenResponseDetail(value) {
  return forbiddenResponseDetailPatterns.some($0 => $0.test(value));
}

function assertCriterionEntityIdsBelongToProgram({
  programId,
  criterionEntityIds,
  criterionEntitiesById,
}) {
  if (!Array.isArray(criterionEntityIds) || criterionEntityIds.length === 0) {
    throw new StorageInvariantError("criterion_entity_not_found");
  }

  for (const criterionEntityId of criterionEntityIds) {
    const criterionEntity = criterionEntitiesById.get(criterionEntityId);
    if (!criterionEntity) {
      throw new StorageInvariantError("criterion_entity_not_found");
    }

    if (criterionEntity.programId !== programId) {
      throw new StorageInvariantError("criterion_entity_program_mismatch");
    }
  }
}

function assertCriterionRevisionIdsBelongToProgram({
  programId,
  criterionRevisionIds,
  criterionRevisionsById,
}) {
  if (!Array.isArray(criterionRevisionIds) || criterionRevisionIds.length === 0) {
    throw new StorageInvariantError("criterion_revision_not_found");
  }

  for (const criterionRevisionId of criterionRevisionIds) {
    const criterionRevision = criterionRevisionsById.get(criterionRevisionId);
    if (!criterionRevision) {
      throw new StorageInvariantError("criterion_revision_not_found");
    }

    if (criterionRevision.programId !== programId) {
      throw new StorageInvariantError("criterion_revision_program_mismatch");
    }
  }
}
