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

const forbiddenEvaluatorArtifactKeys = new Set([
  "authorizationheader",
  "cookieheader",
  "csrftoken",
  "databaseurl",
  "evaluatordiagnostics",
  "filesystempath",
  "hiddenpolicyinstructions",
  "modelmetadatapayload",
  "providerdiagnostics",
  "rawmodelresponse",
  "rawprompt",
  "reviewernotes",
  "sessionid",
  "sqltext",
  "stacktrace",
]);

const llmCurationSuggestionKinds = new Set([
  "navigation_candidate",
  "quick_check_candidate",
  "assessment_criterion_candidate",
  "open_answer_check_candidate",
  "readiness_check_candidate",
]);

const llmCurationSuggestionStatuses = new Set([
  "draft_suggestion",
  "materialized",
  "rejected",
]);

const evaluatorArtifactTextKeys = new Set([
  "cancellationreason",
  "failurereason",
  "feedback",
  "jobfailurereason",
  "priorfailurereason",
  "redactedsummary",
  "summaryfeedback",
  "timeoutreason",
]);

export const MAX_MATERIAL_CONTENT_BYTES = 1048576;

const CONTENT_FORMATS = new Set(["markdown", "plain_text"]);

const lifecycleStatuses = new Set(["active", "withdrawn"]);

const lifecycleTables = [
  "accepted_assessment_criterion_entities",
  "accepted_quick_check_entities",
  "accepted_readiness_check_entities",
  "accepted_open_answer_check_entities",
  "accepted_corpus_entities",
  "accepted_navigation_relationships",
  "program_sources",
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
      admission_policy text not null check (admission_policy in ('self_join', 'invitation_only')),
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

    create table if not exists program_invitations (
      id text primary key,
      program_id text not null references program_shells(id),
      target_identity_id text not null references identities(id),
      participation_kind text not null check (participation_kind in ('student')),
      status text not null check (status in ('pending', 'accepted', 'declined', 'revoked')),
      invited_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null,
      status_changed_by_identity_id text references identities(id),
      status_changed_at text
    );

    create unique index if not exists program_invitations_pending_scope
      on program_invitations (program_id, target_identity_id, participation_kind)
      where status = 'pending';

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
      policy_path text check (
        policy_path in (
          'self_join',
          'curator_invitation',
          'curator_removal',
          'curator_leave',
          'admin_exceptional_recovery',
          'admin_exceptional_revocation'
        )
      ),
      resulting_status text check (resulting_status in ('active', 'left', 'removed')),
      invitation_status text check (invitation_status in ('pending', 'accepted', 'declined', 'revoked')),
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
      recorded_at text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
    );

    create table if not exists corpus_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      candidate_kind text not null check (
        candidate_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference', 'relationship_update')
      ),
      title text not null,
      body text,
      material_reference_kind text check (
        material_reference_kind in (
          'article',
          'book',
          'course',
          'lecture',
          'note',
          'problem_set',
          'standard',
          'video',
          'other'
        )
      ),
      locator text,
      citation text,
      relationship_drafts_json text not null default '[]',
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
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
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

    create table if not exists quick_check_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      check_kind text not null check (check_kind in ('single_select_quick_check')),
      title text not null,
      prompt text not null,
      answer_key_option_id text not null,
      source_ids_json text not null,
      rationale text,
      status text not null check (status in ('draft', 'accepted', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists quick_check_candidate_options (
      candidate_id text not null references quick_check_candidates(id),
      id text not null,
      option_order integer not null,
      text text not null,
      primary key (candidate_id, id),
      unique (candidate_id, option_order)
    );

    create table if not exists accepted_quick_check_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
    );

    create table if not exists accepted_quick_check_revisions (
      id text primary key,
      entity_id text not null references accepted_quick_check_entities(id),
      program_id text not null references program_shells(id),
      check_kind text not null check (check_kind in ('single_select_quick_check')),
      title text not null,
      prompt text not null,
      answer_key_option_id text not null,
      accepted_from_candidate_id text not null references quick_check_candidates(id),
      source_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists accepted_quick_check_revision_options (
      revision_id text not null references accepted_quick_check_revisions(id),
      id text not null,
      option_order integer not null,
      text text not null,
      primary key (revision_id, id),
      unique (revision_id, option_order)
    );

    create table if not exists quick_check_attempts (
      id text primary key,
      program_id text not null references program_shells(id),
      student_identity_id text not null references identities(id),
      check_revision_id text not null references accepted_quick_check_revisions(id),
      selected_option_id text not null,
      matched integer not null check (matched in (0, 1)),
      idempotency_key text not null,
      submitted_at text not null,
      unique (program_id, student_identity_id, check_revision_id, idempotency_key),
      foreign key (check_revision_id, selected_option_id)
        references accepted_quick_check_revision_options(revision_id, id)
    );

    create table if not exists readiness_check_candidates (
      id text primary key,
      program_id text not null references program_shells(id),
      title text not null,
      scope_json text not null,
      requirements_json text not null,
      source_ids_json text not null,
      rationale text,
      status text not null check (status in ('draft', 'accepted', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists accepted_readiness_check_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
    );

    create table if not exists accepted_readiness_check_revisions (
      id text primary key,
      entity_id text not null references accepted_readiness_check_entities(id),
      program_id text not null references program_shells(id),
      title text not null,
      scope_json text not null,
      requirements_json text not null,
      accepted_from_candidate_id text not null references readiness_check_candidates(id),
      source_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists readiness_check_attempts (
      id text primary key,
      program_id text not null references program_shells(id),
      student_identity_id text not null references identities(id),
      readiness_check_revision_id text not null references accepted_readiness_check_revisions(id),
      result text not null check (result in ('ready', 'not_ready', 'in_progress')),
      requirement_results_json text not null,
      idempotency_key text not null,
      submitted_at text not null,
      unique (program_id, student_identity_id, readiness_check_revision_id, idempotency_key)
    );

    create table if not exists llm_curation_suggestions (
      id text primary key,
      program_id text not null references program_shells(id),
      suggestion_kind text not null check (
        suggestion_kind in (
          'navigation_candidate',
          'quick_check_candidate',
          'assessment_criterion_candidate',
          'open_answer_check_candidate',
          'readiness_check_candidate'
        )
      ),
      title text not null,
      summary text not null,
      rationale text not null,
      suggested_draft_json text not null,
      supporting_evidence_json text not null,
      origin_json text not null,
      status text not null check (status in ('draft_suggestion', 'materialized', 'rejected')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null,
      materialized_candidate_kind text check (
        materialized_candidate_kind in (
          'navigation_candidate',
          'quick_check_candidate',
          'assessment_criterion_candidate',
          'open_answer_check_candidate',
          'readiness_check_candidate'
        )
      ),
      materialized_candidate_id text,
      materialized_by_identity_id text references identities(id),
      materialized_at text,
      rejected_by_identity_id text references identities(id),
      rejected_at text
    );

    create table if not exists llm_curation_suggestion_generations (
      id text primary key,
      program_id text not null references program_shells(id),
      idempotency_key text not null,
      request_fingerprint text not null,
      suggestion_ids_json text not null,
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      unique (program_id, idempotency_key)
    );

    create table if not exists accepted_open_answer_check_entities (
      id text primary key,
      program_id text not null references program_shells(id),
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
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
      accepted_kind text not null check (
        accepted_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference')
      ),
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
    );

    create table if not exists accepted_corpus_revisions (
      id text primary key,
      entity_id text not null references accepted_corpus_entities(id),
      program_id text not null references program_shells(id),
      accepted_kind text not null check (
        accepted_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference')
      ),
      title text not null,
      body text,
      material_reference_kind text check (
        material_reference_kind in (
          'article',
          'book',
          'course',
          'lecture',
          'note',
          'problem_set',
          'standard',
          'video',
          'other'
        )
      ),
      locator text,
      citation text,
      accepted_from_candidate_id text not null references corpus_candidates(id),
      source_ids_json text not null,
      rationale text,
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists accepted_navigation_relationships (
      id text primary key,
      program_id text not null references program_shells(id),
      relationship_kind text not null check (
        relationship_kind in (
          'topic_includes_concept',
          'topic_uses_material',
          'concept_uses_material',
          'concept_has_definition',
          'concept_has_principle',
          'concept_prerequisite',
          'concept_related',
          'concept_distinguishes_from'
        )
      ),
      from_entity_id text not null references accepted_corpus_entities(id),
      to_entity_id text not null references accepted_corpus_entities(id),
      current_revision_id text not null,
      status text not null default 'active' check (status in ('active','withdrawn')),
      status_updated_by_identity_id text references identities(id),
      status_updated_at text
    );

    create table if not exists accepted_navigation_relationship_revisions (
      id text primary key,
      relationship_id text not null references accepted_navigation_relationships(id),
      program_id text not null references program_shells(id),
      relationship_kind text not null check (
        relationship_kind in (
          'topic_includes_concept',
          'topic_uses_material',
          'concept_uses_material',
          'concept_has_definition',
          'concept_has_principle',
          'concept_prerequisite',
          'concept_related',
          'concept_distinguishes_from'
        )
      ),
      from_entity_id text not null references accepted_corpus_entities(id),
      from_revision_id text not null references accepted_corpus_revisions(id),
      from_kind text not null check (
        from_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference')
      ),
      to_entity_id text not null references accepted_corpus_entities(id),
      to_revision_id text not null references accepted_corpus_revisions(id),
      to_kind text not null check (
        to_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference')
      ),
      label text,
      source_ids_json text not null,
      accepted_from_candidate_id text not null references corpus_candidates(id),
      accepted_by_identity_id text not null references identities(id),
      accepted_at text not null
    );

    create table if not exists learner_evidence_target_links (
      id text primary key,
      program_id text not null references program_shells(id),
      target_kind text not null check (target_kind in ('topic', 'concept', 'material_reference')),
      target_id text not null,
      evidence_owner_kind text not null check (
        evidence_owner_kind in (
          'accepted_quick_check',
          'accepted_open_answer_check',
          'accepted_assessment_criterion'
        )
      ),
      evidence_owner_entity_id text not null,
      status text not null check (status in ('active', 'deleted')),
      created_by_identity_id text not null references identities(id),
      created_at text not null,
      updated_at text not null
    );

    create unique index if not exists one_active_learner_evidence_target_link
      on learner_evidence_target_links (
        program_id,
        target_kind,
        target_id,
        evidence_owner_kind,
        evidence_owner_entity_id
      )
      where status = 'active';

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

    create table if not exists source_contents (
      source_id text primary key references program_sources(id),
      content text not null,
      content_format text not null check (content_format in ('markdown', 'plain_text')),
      byte_size integer not null,
      recorded_by_identity_id text not null references identities(id),
      recorded_at text not null
    );

    create table if not exists accepted_material_contents (
      revision_id text primary key references accepted_corpus_revisions(id),
      content text not null,
      content_format text not null check (content_format in ('markdown', 'plain_text')),
      byte_size integer not null,
      source_content_provenance_json text
    );
  `);
  ensureLifecycleColumns(database);
}

function ensureLifecycleColumns(database) {
  for (const tableName of lifecycleTables) {
    const existingColumns = new Set(
      database.prepare(`pragma table_info(${tableName})`).all().map($0 => $0.name),
    );
    if (!existingColumns.has("status")) {
      database
        .prepare(
          `alter table ${tableName}
           add column status text not null default 'active' check (status in ('active','withdrawn'))`,
        )
        .run();
    }
    if (!existingColumns.has("status_updated_by_identity_id")) {
      database
        .prepare(`alter table ${tableName} add column status_updated_by_identity_id text`)
        .run();
    }
    if (!existingColumns.has("status_updated_at")) {
      database.prepare(`alter table ${tableName} add column status_updated_at text`).run();
    }
  }
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

export function updateProgramAdmissionPolicyRecord(database, { programId, admissionPolicy }) {
  assertProgramShellExists(database, programId);
  database
    .prepare(
      `update program_shells
       set admission_policy = ?
       where id = ?`,
    )
    .run(admissionPolicy, programId);

  return getProgramShellRecord(database, programId);
}

export function createProgramInvitationRecord(
  database,
  {
    id,
    programId,
    targetIdentityId,
    participationKind,
    status,
    invitedByIdentityId,
    createdAt,
    updatedAt,
    statusChangedByIdentityId = null,
    statusChangedAt = null,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, targetIdentityId);
  assertIdentityExists(database, invitedByIdentityId);
  if (statusChangedByIdentityId !== null) {
    assertIdentityExists(database, statusChangedByIdentityId);
  }

  try {
    database
      .prepare(
        `insert into program_invitations (
           id,
           program_id,
           target_identity_id,
           participation_kind,
           status,
           invited_by_identity_id,
           created_at,
           updated_at,
           status_changed_by_identity_id,
           status_changed_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        programId,
        targetIdentityId,
        participationKind,
        status,
        invitedByIdentityId,
        createdAt,
        updatedAt,
        statusChangedByIdentityId,
        statusChangedAt,
      );
  } catch (error) {
    throw mapProgramInvitationConstraintError(error);
  }

  return getProgramInvitationRecord(database, id);
}

export function updateProgramInvitationStatusRecord(
  database,
  { id, status, statusChangedByIdentityId, statusChangedAt, updatedAt },
) {
  assertIdentityExists(database, statusChangedByIdentityId);
  try {
    database
      .prepare(
        `update program_invitations
         set status = ?,
             status_changed_by_identity_id = ?,
             status_changed_at = ?,
             updated_at = ?
         where id = ?`,
      )
      .run(status, statusChangedByIdentityId, statusChangedAt, updatedAt, id);
  } catch (error) {
    throw mapProgramInvitationConstraintError(error);
  }

  return getProgramInvitationRecord(database, id);
}

export function getProgramInvitationRecord(database, id) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              target_identity_id as targetIdentityId,
              participation_kind as participationKind,
              status,
              invited_by_identity_id as invitedByIdentityId,
              created_at as createdAt,
              updated_at as updatedAt,
              status_changed_by_identity_id as statusChangedByIdentityId,
              status_changed_at as statusChangedAt
       from program_invitations
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listProgramInvitationRecords(
  database,
  { programId = null, targetIdentityId = null, status = null } = {},
) {
  return database
    .prepare(
      `select id,
              program_id as programId,
              target_identity_id as targetIdentityId,
              participation_kind as participationKind,
              status,
              invited_by_identity_id as invitedByIdentityId,
              created_at as createdAt,
              updated_at as updatedAt,
              status_changed_by_identity_id as statusChangedByIdentityId,
              status_changed_at as statusChangedAt
       from program_invitations
       where (? is null or program_id = ?)
         and (? is null or target_identity_id = ?)
         and (? is null or status = ?)
       order by created_at, id`,
    )
    .all(programId, programId, targetIdentityId, targetIdentityId, status, status);
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

export function deleteProgramSourceRecord(database, sourceId) {
  database.prepare(`delete from program_sources where id = ?`).run(sourceId);
}

export function listProgramSourceRecords(database, { programId = null, status = null } = {}) {
  const conditions = [];
  const values = [];
  if (programId !== null) {
    conditions.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    conditions.push("status = ?");
    values.push(status);
  }
  const whereClause = conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`;
  return database
    .prepare(
      `select id, program_id as programId, source_kind as sourceKind, title, locator, citation,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
       from program_sources
       ${whereClause}
       order by recorded_at, id`,
    )
    .all(...values);
}

export function setProgramSourceLifecycleStatusRecord(
  database,
  { sourceId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update program_sources
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, sourceId);

  return getProgramSourceLifecycleStatusRecord(database, sourceId);
}

export function getProgramSourceLifecycleStatusRecord(database, sourceId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from program_sources
       where id = ?`,
    )
    .get(sourceId);

  return row ?? null;
}

function computeWritableContentByteSize({ content, contentFormat }) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new StorageInvariantError("content_required");
  }
  if (!CONTENT_FORMATS.has(contentFormat)) {
    throw new StorageInvariantError("content_format_invalid");
  }
  const byteSize = Buffer.byteLength(content, "utf8");
  if (byteSize > MAX_MATERIAL_CONTENT_BYTES) {
    throw new StorageInvariantError("content_too_large");
  }
  return byteSize;
}

export function setSourceContentRecord(
  database,
  { sourceId, content, contentFormat, recordedByIdentityId, recordedAt },
) {
  if (!getProgramSourceRecord(database, sourceId)) {
    throw new StorageInvariantError("source_content_source_not_found");
  }
  assertIdentityExists(database, recordedByIdentityId);
  const byteSize = computeWritableContentByteSize({ content, contentFormat });

  database
    .prepare(
      `insert into source_contents (
         source_id, content, content_format, byte_size, recorded_by_identity_id, recorded_at
       ) values (?, ?, ?, ?, ?, ?)
       on conflict(source_id) do update set
         content = excluded.content,
         content_format = excluded.content_format,
         byte_size = excluded.byte_size,
         recorded_by_identity_id = excluded.recorded_by_identity_id,
         recorded_at = excluded.recorded_at`,
    )
    .run(sourceId, content, contentFormat, byteSize, recordedByIdentityId, recordedAt);

  return getSourceContentRecord(database, sourceId);
}

export function getSourceContentRecord(database, sourceId) {
  const row = database
    .prepare(
      `select source_id as sourceId, content, content_format as contentFormat, byte_size as byteSize,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
       from source_contents
       where source_id = ?`,
    )
    .get(sourceId);

  return row ?? null;
}

export function listSourceContentRecords(database) {
  return database
    .prepare(
      `select source_id as sourceId, content, content_format as contentFormat, byte_size as byteSize,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt
       from source_contents
       order by source_id`,
    )
    .all();
}

export function deleteSourceContentRecord(database, sourceId) {
  database.prepare("delete from source_contents where source_id = ?").run(sourceId);
}

export function setAcceptedMaterialContentRecord(
  database,
  { revisionId, content, contentFormat, sourceContentProvenance = null },
) {
  const revision = database
    .prepare("select accepted_kind as acceptedKind from accepted_corpus_revisions where id = ?")
    .get(revisionId);
  if (!revision) {
    throw new StorageInvariantError("accepted_material_content_revision_not_found");
  }
  if (revision.acceptedKind !== "material_reference") {
    throw new StorageInvariantError("accepted_material_content_revision_kind_mismatch");
  }
  const byteSize = computeWritableContentByteSize({ content, contentFormat });

  database
    .prepare(
      `insert into accepted_material_contents (
         revision_id, content, content_format, byte_size, source_content_provenance_json
       ) values (?, ?, ?, ?, ?)`,
    )
    .run(
      revisionId,
      content,
      contentFormat,
      byteSize,
      sourceContentProvenance === null ? null : JSON.stringify(sourceContentProvenance),
    );

  return getAcceptedMaterialContentRecord(database, revisionId);
}

export function getAcceptedMaterialContentRecord(database, revisionId) {
  const row = database
    .prepare(
      `select revision_id as revisionId, content, content_format as contentFormat, byte_size as byteSize,
              source_content_provenance_json as sourceContentProvenanceJson
       from accepted_material_contents
       where revision_id = ?`,
    )
    .get(revisionId);

  return row ? mapAcceptedMaterialContentRecord(row) : null;
}

export function deleteAcceptedMaterialContentRecord(database, revisionId) {
  database.prepare(`delete from accepted_material_contents where revision_id = ?`).run(revisionId);
}

export function listAcceptedMaterialContentRecords(database) {
  return database
    .prepare(
      `select revision_id as revisionId, content, content_format as contentFormat, byte_size as byteSize,
              source_content_provenance_json as sourceContentProvenanceJson
       from accepted_material_contents
       order by revision_id`,
    )
    .all()
    .map(mapAcceptedMaterialContentRecord);
}

function mapAcceptedMaterialContentRecord({ sourceContentProvenanceJson, ...rest }) {
  return {
    ...rest,
    sourceContentProvenance:
      sourceContentProvenanceJson === null ? null : JSON.parse(sourceContentProvenanceJson),
  };
}

export function createCorpusCandidateRecord(
  database,
  {
    id,
    programId,
    candidateKind,
    title,
    body = null,
    materialReferenceKind = null,
    locator = null,
    citation = null,
    relationshipDrafts = [],
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
         material_reference_kind,
         locator,
         citation,
         relationship_drafts_json,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      candidateKind,
      title,
      body,
      materialReferenceKind,
      locator,
      citation,
      JSON.stringify(relationshipDrafts),
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
              material_reference_kind as materialReferenceKind, locator, citation,
              relationship_drafts_json as relationshipDraftsJson,
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
                material_reference_kind as materialReferenceKind, locator, citation,
                relationship_drafts_json as relationshipDraftsJson,
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
                material_reference_kind as materialReferenceKind, locator, citation,
                relationship_drafts_json as relationshipDraftsJson,
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
              material_reference_kind as materialReferenceKind, locator, citation,
              relationship_drafts_json as relationshipDraftsJson,
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

export function listAcceptedAssessmentCriterionEntityRecords(database, { programId = null, status = null } = {}) {
  return listAcceptedCurrentRevisionEntityRecords(database, {
    programId,
    status,
    tableName: "accepted_assessment_criterion_entities",
  });
}

export function setAcceptedAssessmentCriterionEntityLifecycleStatusRecord(
  database,
  { entityId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_assessment_criterion_entities
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, entityId);

  return getAcceptedAssessmentCriterionEntityLifecycleStatusRecord(database, entityId);
}

export function getAcceptedAssessmentCriterionEntityLifecycleStatusRecord(database, entityId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_assessment_criterion_entities
       where id = ?`,
    )
    .get(entityId);

  return row ?? null;
}

function listAcceptedCurrentRevisionEntityRecords(database, { programId, status, tableName }) {
  const conditions = [];
  const values = [];
  if (programId !== null) {
    conditions.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    conditions.push("status = ?");
    values.push(status);
  }
  const whereClause = conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`;

  return database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from ${tableName}
       ${whereClause}
       order by id`,
    )
    .all(...values);
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

export function createQuickCheckCandidateRecord(
  database,
  {
    id,
    programId,
    checkKind,
    title,
    prompt,
    options,
    answerKeyOptionId,
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
  assertQuickCheckOptionCollection({ options, answerKeyOptionId });

  database
    .prepare(
      `insert into quick_check_candidates (
         id,
         program_id,
         check_kind,
         title,
         prompt,
         answer_key_option_id,
         source_ids_json,
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
      answerKeyOptionId,
      JSON.stringify(sourceIds),
      rationale,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  for (const [optionIndex, option] of options.entries()) {
    database
      .prepare(
        `insert into quick_check_candidate_options (id, candidate_id, option_order, text)
         values (?, ?, ?, ?)`,
      )
      .run(option.id, id, optionIndex, option.text);
  }

  return getQuickCheckCandidateRecord(database, id);
}

export function getQuickCheckCandidateRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, check_kind as checkKind, title, prompt,
              answer_key_option_id as answerKeyOptionId,
              source_ids_json as sourceIdsJson,
              rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from quick_check_candidates
       where id = ?`,
    )
    .get(id);

  return row ? mapQuickCheckCandidateRecord(database, row) : null;
}

export function listQuickCheckCandidateRecords(database, { programId = null, status = null } = {}) {
  const filters = [];
  const values = [];

  if (programId !== null) {
    filters.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    filters.push("status = ?");
    values.push(status);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, check_kind as checkKind, title, prompt,
              answer_key_option_id as answerKeyOptionId,
              source_ids_json as sourceIdsJson,
              rationale, status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from quick_check_candidates
       ${whereClause}
       order by created_at, id`,
    )
    .all(...values)
    .map(row => mapQuickCheckCandidateRecord(database, row));
}

export function updateQuickCheckCandidateStatus(database, { candidateId, status, updatedAt }) {
  database
    .prepare(
      `update quick_check_candidates
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, candidateId);

  return getQuickCheckCandidateRecord(database, candidateId);
}

export function createAcceptedQuickCheckEntityRecord(database, { id, programId, currentRevisionId }) {
  assertProgramShellExists(database, programId);

  database
    .prepare(
      `insert into accepted_quick_check_entities (id, program_id, current_revision_id)
       values (?, ?, ?)`,
    )
    .run(id, programId, currentRevisionId);

  return getAcceptedQuickCheckEntityRecord(database, id);
}

export function getAcceptedQuickCheckEntityRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_quick_check_entities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedQuickCheckEntityRecords(database, { programId = null, status = null } = {}) {
  return listAcceptedCurrentRevisionEntityRecords(database, {
    programId,
    status,
    tableName: "accepted_quick_check_entities",
  });
}

export function setAcceptedQuickCheckEntityLifecycleStatusRecord(
  database,
  { entityId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_quick_check_entities
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, entityId);

  return getAcceptedQuickCheckEntityLifecycleStatusRecord(database, entityId);
}

export function getAcceptedQuickCheckEntityLifecycleStatusRecord(database, entityId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_quick_check_entities
       where id = ?`,
    )
    .get(entityId);

  return row ?? null;
}

export function updateAcceptedQuickCheckEntityCurrentRevision(database, { entityId, currentRevisionId }) {
  const revision = getAcceptedQuickCheckRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("accepted_quick_check_revision_not_found");
  }

  if (revision.entityId !== entityId) {
    throw new StorageInvariantError("accepted_quick_check_revision_entity_mismatch");
  }

  database
    .prepare(
      `update accepted_quick_check_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, entityId);

  return getAcceptedQuickCheckEntityRecord(database, entityId);
}

export function createAcceptedQuickCheckRevisionRecord(
  database,
  {
    id,
    entityId,
    programId,
    checkKind,
    title,
    prompt,
    options,
    answerKeyOptionId,
    acceptedFromCandidateId,
    sourceIds = [],
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);
  assertQuickCheckCandidateBelongsToProgram(database, { programId, candidateId: acceptedFromCandidateId });
  assertAcceptedQuickCheckEntityBelongsToProgram(database, { programId, entityId });
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });
  assertQuickCheckOptionCollection({ options, answerKeyOptionId });

  database
    .prepare(
      `insert into accepted_quick_check_revisions (
         id,
         entity_id,
         program_id,
         check_kind,
         title,
         prompt,
         answer_key_option_id,
         accepted_from_candidate_id,
         source_ids_json,
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
      answerKeyOptionId,
      acceptedFromCandidateId,
      JSON.stringify(sourceIds),
      rationale,
      acceptedByIdentityId,
      acceptedAt,
    );

  for (const [optionIndex, option] of options.entries()) {
    database
      .prepare(
        `insert into accepted_quick_check_revision_options (id, revision_id, option_order, text)
         values (?, ?, ?, ?)`,
      )
      .run(option.id, id, optionIndex, option.text);
  }

  return getAcceptedQuickCheckRevisionRecord(database, id);
}

export function getAcceptedQuickCheckRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, check_kind as checkKind,
              title, prompt, answer_key_option_id as answerKeyOptionId,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson,
              rationale, accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_quick_check_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedQuickCheckRevisionRecord(database, row) : null;
}

export function listAcceptedQuickCheckRevisionRecords(database) {
  return database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, check_kind as checkKind,
              title, prompt, answer_key_option_id as answerKeyOptionId,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson,
              rationale, accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_quick_check_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(row => mapAcceptedQuickCheckRevisionRecord(database, row));
}

export function createQuickCheckAttemptRecord(
  database,
  {
    id,
    programId,
    studentIdentityId,
    checkRevisionId,
    selectedOptionId,
    matched,
    idempotencyKey,
    submittedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, studentIdentityId);
  assertAcceptedQuickCheckRevisionBelongsToProgram(database, { programId, revisionId: checkRevisionId });
  assertQuickCheckSelectedOptionBelongsToRevision(database, { revisionId: checkRevisionId, selectedOptionId });
  if (typeof matched !== "boolean") {
    throw new StorageInvariantError("quick_check_attempt_matched_invalid");
  }
  const existingAttempt = getQuickCheckAttemptRecordByIdempotencyScope(database, {
    programId,
    studentIdentityId,
    checkRevisionId,
    idempotencyKey,
  });
  if (existingAttempt) {
    if (existingAttempt.selectedOptionId === selectedOptionId && existingAttempt.matched === matched) {
      return existingAttempt;
    }
    throw new StorageInvariantError("quick_check_attempt_idempotency_conflict");
  }

  database
    .prepare(
      `insert into quick_check_attempts (
         id,
         program_id,
         student_identity_id,
         check_revision_id,
         selected_option_id,
         matched,
         idempotency_key,
         submitted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      studentIdentityId,
      checkRevisionId,
      selectedOptionId,
      matched ? 1 : 0,
      idempotencyKey,
      submittedAt,
    );

  return getQuickCheckAttemptRecord(database, id);
}

export function getQuickCheckAttemptRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              check_revision_id as checkRevisionId, selected_option_id as selectedOptionId,
              matched, idempotency_key as idempotencyKey, submitted_at as submittedAt
       from quick_check_attempts
       where id = ?`,
    )
    .get(id);

  return row ? mapQuickCheckAttemptRecord(row) : null;
}

export function listQuickCheckAttemptRecords(
  database,
  { programId = null, studentIdentityId = null, checkRevisionId = null } = {},
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
  if (checkRevisionId !== null) {
    filters.push("check_revision_id = ?");
    values.push(checkRevisionId);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              check_revision_id as checkRevisionId, selected_option_id as selectedOptionId,
              matched, idempotency_key as idempotencyKey, submitted_at as submittedAt
       from quick_check_attempts
       ${whereClause}
       order by submitted_at, id`,
    )
    .all(...values)
    .map(mapQuickCheckAttemptRecord);
}

export function createReadinessCheckCandidateRecord(
  database,
  {
    id,
    programId,
    title,
    scope,
    requirements,
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
  assertReadinessScope(database, { programId, scope });
  assertReadinessRequirements(database, { programId, requirements });

  database
    .prepare(
      `insert into readiness_check_candidates (
         id,
         program_id,
         title,
         scope_json,
         requirements_json,
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
      title,
      JSON.stringify(scope),
      JSON.stringify(requirements),
      JSON.stringify(sourceIds),
      rationale,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  return getReadinessCheckCandidateRecord(database, id);
}

export function getReadinessCheckCandidateRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, title, scope_json as scopeJson,
              requirements_json as requirementsJson, source_ids_json as sourceIdsJson,
              rationale, status, created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from readiness_check_candidates
       where id = ?`,
    )
    .get(id);

  return row ? mapReadinessCheckCandidateRecord(row) : null;
}

export function listReadinessCheckCandidateRecords(database, { programId = null, status = null } = {}) {
  const filters = [];
  const values = [];

  if (programId !== null) {
    filters.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    filters.push("status = ?");
    values.push(status);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, title, scope_json as scopeJson,
              requirements_json as requirementsJson, source_ids_json as sourceIdsJson,
              rationale, status, created_by_identity_id as createdByIdentityId,
              created_at as createdAt, updated_at as updatedAt
       from readiness_check_candidates
       ${whereClause}
       order by created_at, id`,
    )
    .all(...values)
    .map(mapReadinessCheckCandidateRecord);
}

export function updateReadinessCheckCandidateStatus(database, { candidateId, status, updatedAt }) {
  database
    .prepare(
      `update readiness_check_candidates
       set status = ?, updated_at = ?
       where id = ?`,
    )
    .run(status, updatedAt, candidateId);

  return getReadinessCheckCandidateRecord(database, candidateId);
}

export function createLlmCurationSuggestionRecord(
  database,
  {
    id,
    programId,
    suggestionKind,
    title,
    summary,
    rationale,
    suggestedDraft,
    supportingEvidence,
    origin,
    status,
    createdByIdentityId,
    createdAt,
    updatedAt,
    materializedCandidateKind = null,
    materializedCandidateId = null,
    materializedByIdentityId = null,
    materializedAt = null,
    rejectedByIdentityId = null,
    rejectedAt = null,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);
  assertLlmCurationSuggestionShape({
    programId,
    suggestionKind,
    title,
    summary,
    rationale,
    suggestedDraft,
    supportingEvidence,
    origin,
    status,
    materializedCandidateKind,
    materializedCandidateId,
    materializedByIdentityId,
    materializedAt,
    rejectedByIdentityId,
    rejectedAt,
  });
  assertIdentityExists(database, origin.generatedByIdentityId);
  if (materializedByIdentityId !== null) {
    assertIdentityExists(database, materializedByIdentityId);
  }
  if (rejectedByIdentityId !== null) {
    assertIdentityExists(database, rejectedByIdentityId);
  }
  if (status === "materialized") {
    assertLlmCurationSuggestionMaterializedCandidate(database, {
      programId,
      candidateKind: materializedCandidateKind,
      candidateId: materializedCandidateId,
    });
  }

  database
    .prepare(
      `insert into llm_curation_suggestions (
         id,
         program_id,
         suggestion_kind,
         title,
         summary,
         rationale,
         suggested_draft_json,
         supporting_evidence_json,
         origin_json,
         status,
         created_by_identity_id,
         created_at,
         updated_at,
         materialized_candidate_kind,
         materialized_candidate_id,
         materialized_by_identity_id,
         materialized_at,
         rejected_by_identity_id,
         rejected_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      suggestionKind,
      title,
      summary,
      rationale,
      JSON.stringify(suggestedDraft),
      JSON.stringify(supportingEvidence),
      JSON.stringify(origin),
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
      materializedCandidateKind,
      materializedCandidateId,
      materializedByIdentityId,
      materializedAt,
      rejectedByIdentityId,
      rejectedAt,
    );

  return getLlmCurationSuggestionRecord(database, id);
}

export function getLlmCurationSuggestionRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, suggestion_kind as suggestionKind,
              title, summary, rationale, suggested_draft_json as suggestedDraftJson,
              supporting_evidence_json as supportingEvidenceJson, origin_json as originJson,
              status, created_by_identity_id as createdByIdentityId, created_at as createdAt,
              updated_at as updatedAt, materialized_candidate_kind as materializedCandidateKind,
              materialized_candidate_id as materializedCandidateId,
              materialized_by_identity_id as materializedByIdentityId,
              materialized_at as materializedAt,
              rejected_by_identity_id as rejectedByIdentityId, rejected_at as rejectedAt
       from llm_curation_suggestions
       where id = ?`,
    )
    .get(id);

  return row ? mapLlmCurationSuggestionRecord(row) : null;
}

export function listLlmCurationSuggestionRecords(
  database,
  { programId = null, status = null, suggestionKind = null } = {},
) {
  const filters = [];
  const values = [];

  if (programId !== null) {
    filters.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    filters.push("status = ?");
    values.push(status);
  }
  if (suggestionKind !== null) {
    filters.push("suggestion_kind = ?");
    values.push(suggestionKind);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, suggestion_kind as suggestionKind,
              title, summary, rationale, suggested_draft_json as suggestedDraftJson,
              supporting_evidence_json as supportingEvidenceJson, origin_json as originJson,
              status, created_by_identity_id as createdByIdentityId, created_at as createdAt,
              updated_at as updatedAt, materialized_candidate_kind as materializedCandidateKind,
              materialized_candidate_id as materializedCandidateId,
              materialized_by_identity_id as materializedByIdentityId,
              materialized_at as materializedAt,
              rejected_by_identity_id as rejectedByIdentityId, rejected_at as rejectedAt
       from llm_curation_suggestions
       ${whereClause}
       order by created_at, id`,
    )
    .all(...values)
    .map(mapLlmCurationSuggestionRecord);
}

export function materializeLlmCurationSuggestionRecord(
  database,
  { suggestionId, candidateKind, candidateId, materializedByIdentityId, materializedAt, updatedAt },
) {
  const suggestion = getLlmCurationSuggestionRecord(database, suggestionId);
  if (!suggestion) {
    throw new StorageInvariantError("llm_curation_suggestion_not_found");
  }
  if (suggestion.status !== "draft_suggestion") {
    throw new StorageInvariantError("llm_curation_suggestion_terminal");
  }
  if (candidateKind !== suggestion.suggestionKind) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_kind_mismatch");
  }
  assertIdentityExists(database, materializedByIdentityId);
  assertLlmCurationSuggestionMaterializedCandidate(database, {
    programId: suggestion.programId,
    candidateKind,
    candidateId,
  });

  database
    .prepare(
      `update llm_curation_suggestions
       set status = 'materialized',
           updated_at = ?,
           materialized_candidate_kind = ?,
           materialized_candidate_id = ?,
           materialized_by_identity_id = ?,
           materialized_at = ?
       where id = ?`,
    )
    .run(updatedAt, candidateKind, candidateId, materializedByIdentityId, materializedAt, suggestionId);

  return getLlmCurationSuggestionRecord(database, suggestionId);
}

export function rejectLlmCurationSuggestionRecord(
  database,
  { suggestionId, rejectedByIdentityId, rejectedAt, updatedAt },
) {
  const suggestion = getLlmCurationSuggestionRecord(database, suggestionId);
  if (!suggestion) {
    throw new StorageInvariantError("llm_curation_suggestion_not_found");
  }
  if (suggestion.status !== "draft_suggestion") {
    throw new StorageInvariantError("llm_curation_suggestion_terminal");
  }
  assertIdentityExists(database, rejectedByIdentityId);

  database
    .prepare(
      `update llm_curation_suggestions
       set status = 'rejected',
           updated_at = ?,
           rejected_by_identity_id = ?,
           rejected_at = ?
       where id = ?`,
    )
    .run(updatedAt, rejectedByIdentityId, rejectedAt, suggestionId);

  return getLlmCurationSuggestionRecord(database, suggestionId);
}

export function createLlmCurationSuggestionGenerationRecord(
  database,
  { id, programId, idempotencyKey, requestFingerprint, suggestionIds, createdByIdentityId, createdAt },
) {
  if (!isNonEmptyString(id) || !isNonEmptyString(idempotencyKey) || !isNonEmptyString(requestFingerprint)) {
    throw new StorageInvariantError("llm_curation_suggestion_generation_shape_invalid");
  }
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);
  assertLlmCurationSuggestionIdsBelongToProgram(database, { programId, suggestionIds });

  try {
    database
      .prepare(
        `insert into llm_curation_suggestion_generations (
           id,
           program_id,
           idempotency_key,
           request_fingerprint,
           suggestion_ids_json,
           created_by_identity_id,
           created_at
         ) values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        programId,
        idempotencyKey,
        requestFingerprint,
        JSON.stringify(suggestionIds),
        createdByIdentityId,
        createdAt,
      );
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new StorageInvariantError("llm_curation_suggestion_generation_idempotency_conflict");
    }
    throw error;
  }

  return getLlmCurationSuggestionGenerationRecord(database, { programId, idempotencyKey });
}

export function getLlmCurationSuggestionGenerationRecord(database, { programId, idempotencyKey }) {
  const row = database
    .prepare(
      `select id, program_id as programId, idempotency_key as idempotencyKey,
              request_fingerprint as requestFingerprint,
              suggestion_ids_json as suggestionIdsJson,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt
       from llm_curation_suggestion_generations
       where program_id = ? and idempotency_key = ?`,
    )
    .get(programId, idempotencyKey);

  return row ? mapLlmCurationSuggestionGenerationRecord(row) : null;
}

export function listLlmCurationSuggestionGenerationRecords(database, { programId = null } = {}) {
  if (programId !== null) {
    return database
      .prepare(
        `select id, program_id as programId, idempotency_key as idempotencyKey,
                request_fingerprint as requestFingerprint,
                suggestion_ids_json as suggestionIdsJson,
                created_by_identity_id as createdByIdentityId,
                created_at as createdAt
         from llm_curation_suggestion_generations
         where program_id = ?
         order by created_at, id`,
      )
      .all(programId)
      .map(mapLlmCurationSuggestionGenerationRecord);
  }

  return database
    .prepare(
      `select id, program_id as programId, idempotency_key as idempotencyKey,
              request_fingerprint as requestFingerprint,
              suggestion_ids_json as suggestionIdsJson,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt
       from llm_curation_suggestion_generations
       order by created_at, id`,
    )
    .all()
    .map(mapLlmCurationSuggestionGenerationRecord);
}

export function createAcceptedReadinessCheckEntityRecord(database, { id, programId, currentRevisionId }) {
  assertProgramShellExists(database, programId);

  database
    .prepare(
      `insert into accepted_readiness_check_entities (id, program_id, current_revision_id)
       values (?, ?, ?)`,
    )
    .run(id, programId, currentRevisionId);

  return getAcceptedReadinessCheckEntityRecord(database, id);
}

export function getAcceptedReadinessCheckEntityRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId
       from accepted_readiness_check_entities
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedReadinessCheckEntityRecords(database, { programId = null, status = null } = {}) {
  return listAcceptedCurrentRevisionEntityRecords(database, {
    programId,
    status,
    tableName: "accepted_readiness_check_entities",
  });
}

export function setAcceptedReadinessCheckEntityLifecycleStatusRecord(
  database,
  { entityId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_readiness_check_entities
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, entityId);

  return getAcceptedReadinessCheckEntityLifecycleStatusRecord(database, entityId);
}

export function getAcceptedReadinessCheckEntityLifecycleStatusRecord(database, entityId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_readiness_check_entities
       where id = ?`,
    )
    .get(entityId);

  return row ?? null;
}

export function updateAcceptedReadinessCheckEntityCurrentRevision(database, { entityId, currentRevisionId }) {
  const revision = getAcceptedReadinessCheckRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("readiness_revision_not_found");
  }

  if (revision.entityId !== entityId) {
    throw new StorageInvariantError("readiness_revision_entity_mismatch");
  }

  database
    .prepare(
      `update accepted_readiness_check_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, entityId);

  return getAcceptedReadinessCheckEntityRecord(database, entityId);
}

export function createAcceptedReadinessCheckRevisionRecord(
  database,
  {
    id,
    entityId,
    programId,
    title,
    scope,
    requirements,
    acceptedFromCandidateId,
    sourceIds = [],
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);
  assertReadinessCheckCandidateBelongsToProgram(database, {
    programId,
    candidateId: acceptedFromCandidateId,
  });
  assertAcceptedReadinessCheckEntityBelongsToProgram(database, { programId, entityId });
  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });
  assertReadinessScope(database, { programId, scope });
  assertReadinessRequirements(database, { programId, requirements });

  database
    .prepare(
      `insert into accepted_readiness_check_revisions (
         id,
         entity_id,
         program_id,
         title,
         scope_json,
         requirements_json,
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
      title,
      JSON.stringify(scope),
      JSON.stringify(requirements),
      acceptedFromCandidateId,
      JSON.stringify(sourceIds),
      rationale,
      acceptedByIdentityId,
      acceptedAt,
    );

  return getAcceptedReadinessCheckRevisionRecord(database, id);
}

export function getAcceptedReadinessCheckRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, title,
              scope_json as scopeJson, requirements_json as requirementsJson,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_readiness_check_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedReadinessCheckRevisionRecord(row) : null;
}

export function listAcceptedReadinessCheckRevisionRecords(database) {
  return database
    .prepare(
      `select id, entity_id as entityId, program_id as programId, title,
              scope_json as scopeJson, requirements_json as requirementsJson,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_readiness_check_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedReadinessCheckRevisionRecord);
}

export function createReadinessCheckAttemptRecord(
  database,
  {
    id,
    programId,
    studentIdentityId,
    readinessCheckRevisionId,
    result,
    requirementResults,
    idempotencyKey,
    submittedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, studentIdentityId);
  const revision = assertAcceptedReadinessCheckRevisionBelongsToProgram(database, {
    programId,
    revisionId: readinessCheckRevisionId,
  });
  assertReadinessResult(result);
  assertReadinessRequirementResults({ revision, requirementResults, result });

  const existingAttempt = getReadinessCheckAttemptRecordByIdempotencyScope(database, {
    programId,
    studentIdentityId,
    readinessCheckRevisionId,
    idempotencyKey,
  });
  if (existingAttempt) {
    if (
      existingAttempt.result === result
      && JSON.stringify(existingAttempt.requirementResults) === JSON.stringify(requirementResults)
    ) {
      return existingAttempt;
    }
    throw new StorageInvariantError("readiness_attempt_idempotency_conflict");
  }

  database
    .prepare(
      `insert into readiness_check_attempts (
         id,
         program_id,
         student_identity_id,
         readiness_check_revision_id,
         result,
         requirement_results_json,
         idempotency_key,
         submitted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      studentIdentityId,
      readinessCheckRevisionId,
      result,
      JSON.stringify(requirementResults),
      idempotencyKey,
      submittedAt,
    );

  return getReadinessCheckAttemptRecord(database, id);
}

export function getReadinessCheckAttemptRecord(database, id) {
  const row = database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              readiness_check_revision_id as readinessCheckRevisionId, result,
              requirement_results_json as requirementResultsJson,
              idempotency_key as idempotencyKey, submitted_at as submittedAt
       from readiness_check_attempts
       where id = ?`,
    )
    .get(id);

  return row ? mapReadinessCheckAttemptRecord(row) : null;
}

export function listReadinessCheckAttemptRecords(
  database,
  { programId = null, studentIdentityId = null, readinessCheckRevisionId = null } = {},
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
  if (readinessCheckRevisionId !== null) {
    filters.push("readiness_check_revision_id = ?");
    values.push(readinessCheckRevisionId);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  return database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              readiness_check_revision_id as readinessCheckRevisionId, result,
              requirement_results_json as requirementResultsJson,
              idempotency_key as idempotencyKey, submitted_at as submittedAt
       from readiness_check_attempts
       ${whereClause}
       order by submitted_at, id`,
    )
    .all(...values)
    .map(mapReadinessCheckAttemptRecord);
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

export function listAcceptedOpenAnswerCheckEntityRecords(database, { programId = null, status = null } = {}) {
  return listAcceptedCurrentRevisionEntityRecords(database, {
    programId,
    status,
    tableName: "accepted_open_answer_check_entities",
  });
}

export function setAcceptedOpenAnswerCheckEntityLifecycleStatusRecord(
  database,
  { entityId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_open_answer_check_entities
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, entityId);

  return getAcceptedOpenAnswerCheckEntityLifecycleStatusRecord(database, entityId);
}

export function getAcceptedOpenAnswerCheckEntityLifecycleStatusRecord(database, entityId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_open_answer_check_entities
       where id = ?`,
    )
    .get(entityId);

  return row ?? null;
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

function listOpenAnswerEvaluatorRunBackupRecords(database) {
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
              prior_failed_at as priorFailedAt, job_status as jobStatus,
              attempt_number as attemptNumber, retry_policy_json as retryPolicyJson,
              budget_policy_json as budgetPolicyJson, lease_id as leaseId, worker_id as workerId,
              lease_claimed_at as leaseClaimedAt, lease_expires_at as leaseExpiresAt,
              next_retry_at as nextRetryAt, cancellation_reason as cancellationReason,
              timeout_reason as timeoutReason, job_failure_reason as jobFailureReason,
              terminal_completion_signature_json as terminalCompletionSignatureJson,
              job_created_at as jobCreatedAt, job_updated_at as jobUpdatedAt
       from open_answer_evaluator_runs
       order by started_at, id`,
    )
    .all()
    .map(mapOpenAnswerEvaluatorRunBackupRecord);
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

export function listAcceptedCorpusEntityRecords(database, { programId = null, status = null } = {}) {
  const conditions = [];
  const values = [];
  if (programId !== null) {
    conditions.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    conditions.push("status = ?");
    values.push(status);
  }
  const whereClause = conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`;

  return database
    .prepare(
      `select id, program_id as programId, accepted_kind as acceptedKind,
              current_revision_id as currentRevisionId
       from accepted_corpus_entities
       ${whereClause}
       order by id`,
    )
    .all(...values);
}

export function setAcceptedCorpusEntityLifecycleStatusRecord(
  database,
  { entityId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_corpus_entities
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, entityId);

  return getAcceptedCorpusEntityLifecycleStatusRecord(database, entityId);
}

export function getAcceptedCorpusEntityLifecycleStatusRecord(database, entityId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_corpus_entities
       where id = ?`,
    )
    .get(entityId);

  return row ?? null;
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
    materialReferenceKind = null,
    locator = null,
    citation = null,
    acceptedFromCandidateId,
    sourceIds = [],
    rationale = null,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, acceptedByIdentityId);
  assertAcceptedCorpusRevisionMaterialReferenceShape({
    acceptedKind,
    body,
    materialReferenceKind,
    locator,
    citation,
  });

  database
    .prepare(
      `insert into accepted_corpus_revisions (
         id,
         entity_id,
         program_id,
         accepted_kind,
         title,
         body,
         material_reference_kind,
         locator,
         citation,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entityId,
      programId,
      acceptedKind,
      title,
      body,
      materialReferenceKind,
      locator,
      citation,
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
              title, body, material_reference_kind as materialReferenceKind, locator, citation,
              accepted_from_candidate_id as acceptedFromCandidateId,
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
              title, body, material_reference_kind as materialReferenceKind, locator, citation,
              accepted_from_candidate_id as acceptedFromCandidateId,
              source_ids_json as sourceIdsJson, rationale,
              accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
       from accepted_corpus_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedCorpusRevisionRecord);
}

export function createAcceptedNavigationRelationshipRecord(
  database,
  { id, programId, relationshipKind, fromEntityId, toEntityId, currentRevisionId },
) {
  assertProgramShellExists(database, programId);
  const fromEntity = getAcceptedCorpusEntityRecord(database, fromEntityId);
  const toEntity = getAcceptedCorpusEntityRecord(database, toEntityId);
  assertNavigationRelationshipEndpoints({
    programId,
    relationshipKind,
    fromEntity,
    toEntity,
  });
  assertNavigationRelationshipDoesNotCreateCycle(database, {
    programId,
    relationshipKind,
    fromEntityId,
    toEntityId,
  });

  database
    .prepare(
      `insert into accepted_navigation_relationships (
         id, program_id, relationship_kind, from_entity_id, to_entity_id, current_revision_id
       ) values (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, programId, relationshipKind, fromEntityId, toEntityId, currentRevisionId);

  return getAcceptedNavigationRelationshipRecord(database, id);
}

export function getAcceptedNavigationRelationshipRecord(database, id) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              relationship_kind as relationshipKind,
              from_entity_id as fromEntityId,
              to_entity_id as toEntityId,
              current_revision_id as currentRevisionId
       from accepted_navigation_relationships
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listAcceptedNavigationRelationshipRecords(database, { programId = null, status = null } = {}) {
  const conditions = [];
  const values = [];
  if (programId !== null) {
    conditions.push("program_id = ?");
    values.push(programId);
  }
  if (status !== null) {
    conditions.push("status = ?");
    values.push(status);
  }
  const whereClause = conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`;

  return database
    .prepare(
      `select id,
              program_id as programId,
              relationship_kind as relationshipKind,
              from_entity_id as fromEntityId,
              to_entity_id as toEntityId,
              current_revision_id as currentRevisionId
       from accepted_navigation_relationships
       ${whereClause}
       order by id`,
    )
    .all(...values);
}

export function setAcceptedNavigationRelationshipLifecycleStatusRecord(
  database,
  { relationshipId, status, updatedByIdentityId, updatedAt },
) {
  if (!lifecycleStatuses.has(status)) {
    throw new StorageInvariantError("lifecycle_status_invalid");
  }
  assertIdentityExists(database, updatedByIdentityId);
  database
    .prepare(
      `update accepted_navigation_relationships
       set status = ?,
           status_updated_by_identity_id = ?,
           status_updated_at = ?
       where id = ?`,
    )
    .run(status, updatedByIdentityId, updatedAt, relationshipId);

  return getAcceptedNavigationRelationshipLifecycleStatusRecord(database, relationshipId);
}

export function getAcceptedNavigationRelationshipLifecycleStatusRecord(database, relationshipId) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as updatedByIdentityId,
              status_updated_at as updatedAt
       from accepted_navigation_relationships
       where id = ?`,
    )
    .get(relationshipId);

  return row ?? null;
}

export function updateAcceptedNavigationRelationshipCurrentRevision(
  database,
  { relationshipId, currentRevisionId },
) {
  const revision = getAcceptedNavigationRelationshipRevisionRecord(database, currentRevisionId);
  if (!revision) {
    throw new StorageInvariantError("navigation_relationship_revision_not_found");
  }

  if (revision.relationshipId !== relationshipId) {
    throw new StorageInvariantError("navigation_relationship_revision_relationship_mismatch");
  }

  database
    .prepare(
      `update accepted_navigation_relationships
       set current_revision_id = ?
       where id = ?`,
    )
    .run(currentRevisionId, relationshipId);

  return getAcceptedNavigationRelationshipRecord(database, relationshipId);
}

export function createAcceptedNavigationRelationshipRevisionRecord(
  database,
  {
    id,
    relationshipId,
    programId,
    relationshipKind,
    fromEntityId,
    fromRevisionId,
    fromKind,
    toEntityId,
    toRevisionId,
    toKind,
    label = null,
    sourceIds = [],
    acceptedFromCandidateId,
    acceptedByIdentityId,
    acceptedAt,
  },
) {
  const relationship = getAcceptedNavigationRelationshipRecord(database, relationshipId);
  if (!relationship) {
    throw new StorageInvariantError("navigation_relationship_not_found");
  }
  assertIdentityExists(database, acceptedByIdentityId);
  assertNavigationRelationshipRevisionMatches({
    database,
    relationship,
    programId,
    relationshipKind,
    fromEntityId,
    fromRevisionId,
    fromKind,
    toEntityId,
    toRevisionId,
    toKind,
    acceptedFromCandidateId,
    sourceIds,
  });

  database
    .prepare(
      `insert into accepted_navigation_relationship_revisions (
         id,
         relationship_id,
         program_id,
         relationship_kind,
         from_entity_id,
         from_revision_id,
         from_kind,
         to_entity_id,
         to_revision_id,
         to_kind,
         label,
         source_ids_json,
         accepted_from_candidate_id,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      relationshipId,
      programId,
      relationshipKind,
      fromEntityId,
      fromRevisionId,
      fromKind,
      toEntityId,
      toRevisionId,
      toKind,
      label,
      JSON.stringify(sourceIds),
      acceptedFromCandidateId,
      acceptedByIdentityId,
      acceptedAt,
    );

  return getAcceptedNavigationRelationshipRevisionRecord(database, id);
}

export function getAcceptedNavigationRelationshipRevisionRecord(database, id) {
  const row = database
    .prepare(
      `select id,
              relationship_id as relationshipId,
              program_id as programId,
              relationship_kind as relationshipKind,
              from_entity_id as fromEntityId,
              from_revision_id as fromRevisionId,
              from_kind as fromKind,
              to_entity_id as toEntityId,
              to_revision_id as toRevisionId,
              to_kind as toKind,
              label,
              source_ids_json as sourceIdsJson,
              accepted_from_candidate_id as acceptedFromCandidateId,
              accepted_by_identity_id as acceptedByIdentityId,
              accepted_at as acceptedAt
       from accepted_navigation_relationship_revisions
       where id = ?`,
    )
    .get(id);

  return row ? mapAcceptedNavigationRelationshipRevisionRecord(row) : null;
}

export function listAcceptedNavigationRelationshipRevisionRecords(database) {
  return database
    .prepare(
      `select id,
              relationship_id as relationshipId,
              program_id as programId,
              relationship_kind as relationshipKind,
              from_entity_id as fromEntityId,
              from_revision_id as fromRevisionId,
              from_kind as fromKind,
              to_entity_id as toEntityId,
              to_revision_id as toRevisionId,
              to_kind as toKind,
              label,
              source_ids_json as sourceIdsJson,
              accepted_from_candidate_id as acceptedFromCandidateId,
              accepted_by_identity_id as acceptedByIdentityId,
              accepted_at as acceptedAt
       from accepted_navigation_relationship_revisions
       order by accepted_at, id`,
    )
    .all()
    .map(mapAcceptedNavigationRelationshipRevisionRecord);
}

export function createLearnerEvidenceTargetLinkRecord(
  database,
  {
    id,
    programId,
    targetKind,
    targetId,
    evidenceOwnerKind,
    evidenceOwnerEntityId,
    status = "active",
    createdByIdentityId,
    createdAt,
    updatedAt,
  },
) {
  if (status !== "active") {
    throw new StorageInvariantError("learner_state_target_link_status_invalid");
  }
  assertProgramShellExists(database, programId);
  assertIdentityExists(database, createdByIdentityId);

  const existingActiveLink = getActiveLearnerEvidenceTargetLinkRecord(database, {
    programId,
    targetKind,
    targetId,
    evidenceOwnerKind,
    evidenceOwnerEntityId,
  });
  if (existingActiveLink) {
    return existingActiveLink;
  }

  database
    .prepare(
      `insert into learner_evidence_target_links (
         id,
         program_id,
         target_kind,
         target_id,
         evidence_owner_kind,
         evidence_owner_entity_id,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      programId,
      targetKind,
      targetId,
      evidenceOwnerKind,
      evidenceOwnerEntityId,
      status,
      createdByIdentityId,
      createdAt,
      updatedAt,
    );

  return getLearnerEvidenceTargetLinkRecord(database, id);
}

export function deleteLearnerEvidenceTargetLinkRecord(database, { id, updatedAt }) {
  const link = getLearnerEvidenceTargetLinkRecord(database, id);
  if (!link) {
    throw new StorageInvariantError("learner_state_target_link_not_found");
  }

  database
    .prepare(
      `update learner_evidence_target_links
       set status = 'deleted',
           updated_at = ?
       where id = ?`,
    )
    .run(updatedAt, id);

  return getLearnerEvidenceTargetLinkRecord(database, id);
}

export function getLearnerEvidenceTargetLinkRecord(database, id) {
  const row = database
    .prepare(
      `select id,
              program_id as programId,
              target_kind as targetKind,
              target_id as targetId,
              evidence_owner_kind as evidenceOwnerKind,
              evidence_owner_entity_id as evidenceOwnerEntityId,
              status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt,
              updated_at as updatedAt
       from learner_evidence_target_links
       where id = ?`,
    )
    .get(id);

  return row ?? null;
}

export function listLearnerEvidenceTargetLinkRecords(
  database,
  { programId = null, includeDeleted = false } = {},
) {
  const filters = [];
  const values = [];
  if (programId !== null) {
    filters.push("program_id = ?");
    values.push(programId);
  }
  if (!includeDeleted) {
    filters.push("status = 'active'");
  }
  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

  return database
    .prepare(
      `select id,
              program_id as programId,
              target_kind as targetKind,
              target_id as targetId,
              evidence_owner_kind as evidenceOwnerKind,
              evidence_owner_entity_id as evidenceOwnerEntityId,
              status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt,
              updated_at as updatedAt
       from learner_evidence_target_links
       ${whereClause}
       order by created_at, id`,
    )
    .all(...values);
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
    policyPath = null,
    resultingStatus = null,
    invitationStatus = null,
    occurredAt,
    outcome,
    reason = null,
  },
) {
  database
    .prepare(
      `insert into program_membership_events (
         id, event_type, actor_identity_id, target_identity_id, program_id,
         participation_kind, policy_path, resulting_status, invitation_status, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      eventType,
      actorIdentityId,
      targetIdentityId,
      programId,
      participationKind,
      policyPath,
      resultingStatus,
      invitationStatus,
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
              policy_path as policyPath,
              resulting_status as resultingStatus,
              invitation_status as invitationStatus,
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
                policy_path as policyPath,
                resulting_status as resultingStatus,
                invitation_status as invitationStatus,
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
              policy_path as policyPath,
              resulting_status as resultingStatus,
              invitation_status as invitationStatus,
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

function assertAcceptedCorpusRevisionMaterialReferenceShape({
  acceptedKind,
  body,
  materialReferenceKind,
  locator,
  citation,
}) {
  if (acceptedKind !== "material_reference") {
    if (materialReferenceKind !== null || locator !== null || citation !== null) {
      throw new StorageInvariantError("accepted_material_reference_invalid");
    }
    return;
  }

  if (
    !isNonEmptyString(materialReferenceKind) ||
    (!isNonEmptyString(locator) && !isNonEmptyString(citation) && !isNonEmptyString(body))
  ) {
    throw new StorageInvariantError("accepted_material_reference_invalid");
  }
}

function assertNavigationRelationshipRevisionMatches({
  database,
  relationship,
  programId,
  relationshipKind,
  fromEntityId,
  fromRevisionId,
  fromKind,
  toEntityId,
  toRevisionId,
  toKind,
  acceptedFromCandidateId,
  sourceIds,
}) {
  if (
    relationship.programId !== programId ||
    relationship.relationshipKind !== relationshipKind ||
    relationship.fromEntityId !== fromEntityId ||
    relationship.toEntityId !== toEntityId
  ) {
    throw new StorageInvariantError("navigation_relationship_revision_relationship_mismatch");
  }

  const fromEntity = getAcceptedCorpusEntityRecord(database, fromEntityId);
  const toEntity = getAcceptedCorpusEntityRecord(database, toEntityId);
  assertNavigationRelationshipEndpoints({
    programId,
    relationshipKind,
    fromEntity,
    toEntity,
  });

  const fromRevision = getAcceptedCorpusRevisionRecord(database, fromRevisionId);
  const toRevision = getAcceptedCorpusRevisionRecord(database, toRevisionId);
  assertNavigationRelationshipEndpointRevision({
    entity: fromEntity,
    revision: fromRevision,
    revisionKind: fromKind,
  });
  assertNavigationRelationshipEndpointRevision({
    entity: toEntity,
    revision: toRevision,
    revisionKind: toKind,
  });

  const candidate = getCorpusCandidateRecord(database, acceptedFromCandidateId);
  if (!candidate) {
    throw new StorageInvariantError("candidate_not_found");
  }
  if (candidate.status !== "accepted") {
    throw new StorageInvariantError("candidate_not_accepted");
  }
  if (candidate.programId !== programId) {
    throw new StorageInvariantError("candidate_program_mismatch");
  }

  assertProgramSourcesBelongToProgram(database, { programId, sourceIds });
}

function assertNavigationRelationshipEndpointRevision({ entity, revision, revisionKind }) {
  if (!revision) {
    throw new StorageInvariantError("accepted_revision_not_found");
  }
  if (revision.entityId !== entity.id) {
    throw new StorageInvariantError("accepted_revision_entity_mismatch");
  }
  if (revision.programId !== entity.programId) {
    throw new StorageInvariantError("accepted_revision_program_mismatch");
  }
  if (revision.acceptedKind !== entity.acceptedKind || revision.acceptedKind !== revisionKind) {
    throw new StorageInvariantError("accepted_revision_kind_mismatch");
  }
}

function assertNavigationRelationshipEndpoints({ programId, relationshipKind, fromEntity, toEntity }) {
  if (!fromEntity || !toEntity) {
    throw new StorageInvariantError("accepted_entity_not_found");
  }
  if (fromEntity.id === toEntity.id) {
    throw new StorageInvariantError("navigation_relationship_self_reference");
  }
  if (fromEntity.programId !== programId || toEntity.programId !== programId) {
    throw new StorageInvariantError("navigation_relationship_program_mismatch");
  }
  if (!isValidNavigationRelationshipEndpointPair(relationshipKind, fromEntity.acceptedKind, toEntity.acceptedKind)) {
    throw new StorageInvariantError("navigation_relationship_endpoint_kind_mismatch");
  }
}

function isValidNavigationRelationshipEndpointPair(relationshipKind, fromKind, toKind) {
  return (
    (relationshipKind === "topic_includes_concept" && fromKind === "topic" && toKind === "concept") ||
    (relationshipKind === "topic_uses_material" && fromKind === "topic" && toKind === "material_reference") ||
    (relationshipKind === "concept_uses_material" && fromKind === "concept" && toKind === "material_reference") ||
    (relationshipKind === "concept_has_definition" && fromKind === "concept" && toKind === "definition") ||
    (relationshipKind === "concept_has_principle" && fromKind === "concept" && toKind === "principle") ||
    (relationshipKind === "concept_prerequisite" && fromKind === "concept" && toKind === "concept") ||
    (relationshipKind === "concept_related" && fromKind === "concept" && toKind === "concept") ||
    (relationshipKind === "concept_distinguishes_from" && fromKind === "concept" && toKind === "concept")
  );
}

function assertNavigationRelationshipDoesNotCreateCycle(
  database,
  { programId, relationshipKind, fromEntityId, toEntityId },
) {
  if (relationshipKind !== "concept_prerequisite") {
    return;
  }

  const edgesByFromEntityId = new Map();
  for (const relationship of listAcceptedNavigationRelationshipRecords(database, { programId })) {
    if (relationship.relationshipKind !== "concept_prerequisite") {
      continue;
    }
    const targets = edgesByFromEntityId.get(relationship.fromEntityId) ?? [];
    targets.push(relationship.toEntityId);
    edgesByFromEntityId.set(relationship.fromEntityId, targets);
  }

  const visited = new Set();
  const stack = [toEntityId];
  while (stack.length > 0) {
    const currentEntityId = stack.pop();
    if (currentEntityId === fromEntityId) {
      throw new StorageInvariantError("navigation_prerequisite_cycle");
    }
    if (visited.has(currentEntityId)) {
      continue;
    }
    visited.add(currentEntityId);
    stack.push(...(edgesByFromEntityId.get(currentEntityId) ?? []));
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

function assertQuickCheckCandidateBelongsToProgram(database, { programId, candidateId }) {
  const candidate = getQuickCheckCandidateRecord(database, candidateId);
  if (!candidate) {
    throw new StorageInvariantError("quick_check_candidate_not_found");
  }

  if (candidate.programId !== programId) {
    throw new StorageInvariantError("quick_check_candidate_program_mismatch");
  }
}

function assertAcceptedQuickCheckEntityBelongsToProgram(database, { programId, entityId }) {
  const entity = getAcceptedQuickCheckEntityRecord(database, entityId);
  if (!entity) {
    throw new StorageInvariantError("quick_check_entity_not_found");
  }

  if (entity.programId !== programId) {
    throw new StorageInvariantError("quick_check_entity_program_mismatch");
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

function assertAcceptedQuickCheckRevisionBelongsToProgram(database, { programId, revisionId }) {
  const revision = getAcceptedQuickCheckRevisionRecord(database, revisionId);
  if (!revision) {
    throw new StorageInvariantError("quick_check_revision_not_found");
  }

  if (revision.programId !== programId) {
    throw new StorageInvariantError("quick_check_revision_program_mismatch");
  }
}

function assertReadinessCheckCandidateBelongsToProgram(database, { programId, candidateId }) {
  const candidate = getReadinessCheckCandidateRecord(database, candidateId);
  if (!candidate) {
    throw new StorageInvariantError("readiness_candidate_not_found");
  }

  if (candidate.status !== "accepted") {
    throw new StorageInvariantError("readiness_candidate_not_accepted");
  }

  if (candidate.programId !== programId) {
    throw new StorageInvariantError("readiness_candidate_program_mismatch");
  }
}

function assertAcceptedReadinessCheckEntityBelongsToProgram(database, { programId, entityId }) {
  const entity = getAcceptedReadinessCheckEntityRecord(database, entityId);
  if (!entity) {
    throw new StorageInvariantError("readiness_entity_not_found");
  }

  if (entity.programId !== programId) {
    throw new StorageInvariantError("readiness_entity_program_mismatch");
  }
}

function assertAcceptedReadinessCheckRevisionBelongsToProgram(database, { programId, revisionId }) {
  const revision = getAcceptedReadinessCheckRevisionRecord(database, revisionId);
  if (!revision) {
    throw new StorageInvariantError("readiness_revision_not_found");
  }

  if (revision.programId !== programId) {
    throw new StorageInvariantError("readiness_revision_program_mismatch");
  }

  return revision;
}

function assertReadinessScope(database, { programId, scope }) {
  if (scope?.scopeKind === "topic") {
    assertReadinessAcceptedCorpusTarget(database, {
      programId,
      targetKind: "topic",
      targetId: scope.topicEntityId,
      notFoundReason: "readiness_scope_not_found",
      mismatchReason: "readiness_scope_program_mismatch",
    });
    return;
  }

  if (scope?.scopeKind === "period") {
    if (typeof scope.title !== "string" || scope.title.length === 0) {
      throw new StorageInvariantError("readiness_scope_invalid");
    }
    if (!Array.isArray(scope.topicEntityIds) || scope.topicEntityIds.length === 0) {
      throw new StorageInvariantError("readiness_scope_invalid");
    }
    const ids = new Set();
    for (const topicEntityId of scope.topicEntityIds) {
      if (ids.has(topicEntityId)) {
        throw new StorageInvariantError("readiness_scope_invalid");
      }
      ids.add(topicEntityId);
      assertReadinessAcceptedCorpusTarget(database, {
        programId,
        targetKind: "topic",
        targetId: topicEntityId,
        notFoundReason: "readiness_scope_not_found",
        mismatchReason: "readiness_scope_program_mismatch",
      });
    }
    return;
  }

  throw new StorageInvariantError("readiness_scope_invalid");
}

function assertReadinessRequirements(database, { programId, requirements }) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new StorageInvariantError("readiness_requirements_invalid");
  }

  const ids = new Set();
  for (const requirement of requirements) {
    if (ids.has(requirement.requirementId)) {
      throw new StorageInvariantError("readiness_requirement_id_conflict");
    }
    ids.add(requirement.requirementId);
    if (!["developing", "on_track"].includes(requirement.requiredLevel)) {
      throw new StorageInvariantError("readiness_required_level_invalid");
    }
    assertReadinessRequirementTarget(database, { programId, requirement });
  }
}

function assertReadinessRequirementTarget(database, { programId, requirement }) {
  if (["topic", "concept", "material_reference"].includes(requirement.targetKind)) {
    assertReadinessAcceptedCorpusTarget(database, {
      programId,
      targetKind: requirement.targetKind,
      targetId: requirement.targetId,
      notFoundReason: "readiness_requirement_target_not_found",
      mismatchReason: "readiness_requirement_program_mismatch",
    });
    return;
  }

  const entity = getReadinessEvidenceOwnerEntity(database, requirement);
  if (!entity) {
    throw new StorageInvariantError("readiness_requirement_target_not_found");
  }
  if (entity.programId !== programId) {
    throw new StorageInvariantError("readiness_requirement_program_mismatch");
  }
}

function assertReadinessAcceptedCorpusTarget(
  database,
  { programId, targetKind, targetId, notFoundReason, mismatchReason },
) {
  const target = getAcceptedCorpusEntityRecord(database, targetId);
  if (!target) {
    throw new StorageInvariantError(notFoundReason);
  }
  if (target.programId !== programId) {
    throw new StorageInvariantError(mismatchReason);
  }
  if (target.acceptedKind !== targetKind) {
    throw new StorageInvariantError("readiness_target_kind_invalid");
  }
}

function getReadinessEvidenceOwnerEntity(database, requirement) {
  if (requirement.targetKind === "quick_check") {
    return getAcceptedQuickCheckEntityRecord(database, requirement.targetId);
  }
  if (requirement.targetKind === "open_answer_check") {
    return getAcceptedOpenAnswerCheckEntityRecord(database, requirement.targetId);
  }
  if (requirement.targetKind === "assessment_criterion") {
    return getAcceptedAssessmentCriterionEntityRecord(database, requirement.targetId);
  }
  throw new StorageInvariantError("readiness_requirement_target_kind_invalid");
}

function assertLlmCurationSuggestionShape({
  suggestionKind,
  title,
  summary,
  rationale,
  suggestedDraft,
  supportingEvidence,
  origin,
  status,
  materializedCandidateKind,
  materializedCandidateId,
  materializedByIdentityId,
  materializedAt,
  rejectedByIdentityId,
  rejectedAt,
}) {
  if (!llmCurationSuggestionKinds.has(suggestionKind)) {
    throw new StorageInvariantError("llm_curation_suggestion_kind_invalid");
  }
  if (!llmCurationSuggestionStatuses.has(status)) {
    throw new StorageInvariantError("llm_curation_suggestion_status_invalid");
  }
  if (!isNonEmptyString(title) || !isNonEmptyString(summary) || !isNonEmptyString(rationale)) {
    throw new StorageInvariantError("llm_curation_suggestion_shape_invalid");
  }
  if (containsForbiddenLlmCurationSuggestionArtifact({ title, summary, rationale })) {
    throw new StorageInvariantError("llm_curation_suggestion_raw_artifact_forbidden");
  }
  assertLlmCurationSuggestionDraft({ suggestionKind, suggestedDraft });
  assertLlmCurationSuggestionSupportingEvidence(supportingEvidence);
  assertLlmCurationSuggestionOrigin(origin);

  if (status === "draft_suggestion") {
    assertNoLlmCurationSuggestionTerminalFields({
      materializedCandidateKind,
      materializedCandidateId,
      materializedByIdentityId,
      materializedAt,
      rejectedByIdentityId,
      rejectedAt,
    });
    return;
  }

  if (status === "materialized") {
    if (materializedCandidateKind !== suggestionKind) {
      throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_kind_mismatch");
    }
    if (
      !llmCurationSuggestionKinds.has(materializedCandidateKind) ||
      !isNonEmptyString(materializedCandidateId) ||
      !isNonEmptyString(materializedByIdentityId) ||
      !isNonEmptyString(materializedAt) ||
      rejectedByIdentityId !== null ||
      rejectedAt !== null
    ) {
      throw new StorageInvariantError("llm_curation_suggestion_terminal_state_invalid");
    }
    return;
  }

  if (
    materializedCandidateKind !== null ||
    materializedCandidateId !== null ||
    materializedByIdentityId !== null ||
    materializedAt !== null ||
    !isNonEmptyString(rejectedByIdentityId) ||
    !isNonEmptyString(rejectedAt)
  ) {
    throw new StorageInvariantError("llm_curation_suggestion_terminal_state_invalid");
  }
}

function assertLlmCurationSuggestionDraft({ suggestionKind, suggestedDraft }) {
  if (
    !suggestedDraft ||
    typeof suggestedDraft !== "object" ||
    Array.isArray(suggestedDraft) ||
    suggestedDraft.candidateKind !== suggestionKind ||
    !suggestedDraft.request ||
    typeof suggestedDraft.request !== "object" ||
    Array.isArray(suggestedDraft.request)
  ) {
    throw new StorageInvariantError("llm_curation_suggestion_draft_invalid");
  }
  assertNoForbiddenLlmCurationSuggestionArtifact(suggestedDraft);
}

function assertLlmCurationSuggestionSupportingEvidence(supportingEvidence) {
  if (!Array.isArray(supportingEvidence) || supportingEvidence.length === 0) {
    throw new StorageInvariantError("llm_curation_suggestion_evidence_invalid");
  }
  for (const evidence of supportingEvidence) {
    if (
      !evidence ||
      typeof evidence !== "object" ||
      Array.isArray(evidence) ||
      !isNonEmptyString(evidence.sourceKind) ||
      !isNonEmptyString(evidence.sourceId) ||
      !isNonEmptyString(evidence.label)
    ) {
      throw new StorageInvariantError("llm_curation_suggestion_evidence_invalid");
    }
    assertNoForbiddenLlmCurationSuggestionArtifact(evidence);
  }
}

function assertLlmCurationSuggestionOrigin(origin) {
  if (
    !origin ||
    typeof origin !== "object" ||
    Array.isArray(origin) ||
    !isNonEmptyString(origin.suggestionPolicyId) ||
    !isNonEmptyString(origin.providerAdapterId) ||
    !isNonEmptyString(origin.outputValidatorPolicyId) ||
    !isNonEmptyString(origin.redactionPolicyId) ||
    !Array.isArray(origin.sourceKinds) ||
    !Array.isArray(origin.sourceIds) ||
    !Array.isArray(origin.coverageGapIds) ||
    !isNonEmptyString(origin.promptContextSummary) ||
    !isNonEmptyString(origin.generatedByIdentityId) ||
    !isNonEmptyString(origin.generatedAt)
  ) {
    throw new StorageInvariantError("llm_curation_suggestion_origin_invalid");
  }
  assertNoForbiddenLlmCurationSuggestionArtifact(origin);
}

function assertNoLlmCurationSuggestionTerminalFields({
  materializedCandidateKind,
  materializedCandidateId,
  materializedByIdentityId,
  materializedAt,
  rejectedByIdentityId,
  rejectedAt,
}) {
  if (
    materializedCandidateKind !== null ||
    materializedCandidateId !== null ||
    materializedByIdentityId !== null ||
    materializedAt !== null ||
    rejectedByIdentityId !== null ||
    rejectedAt !== null
  ) {
    throw new StorageInvariantError("llm_curation_suggestion_terminal_state_invalid");
  }
}

function assertLlmCurationSuggestionMaterializedCandidate(database, { programId, candidateKind, candidateId }) {
  const candidate = getLlmCurationSuggestionMaterializedCandidate(database, { candidateKind, candidateId });
  if (!candidate) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_not_found");
  }
  if (candidate.programId !== programId) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_program_mismatch");
  }
  if (candidate.status !== "draft") {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_not_draft");
  }
}

function getLlmCurationSuggestionMaterializedCandidate(database, { candidateKind, candidateId }) {
  if (candidateKind === "navigation_candidate") {
    return getCorpusCandidateRecord(database, candidateId);
  }
  if (candidateKind === "quick_check_candidate") {
    return getQuickCheckCandidateRecord(database, candidateId);
  }
  if (candidateKind === "assessment_criterion_candidate") {
    return getAssessmentCriterionCandidateRecord(database, candidateId);
  }
  if (candidateKind === "open_answer_check_candidate") {
    return getOpenAnswerCheckCandidateRecord(database, candidateId);
  }
  if (candidateKind === "readiness_check_candidate") {
    return getReadinessCheckCandidateRecord(database, candidateId);
  }

  throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_kind_invalid");
}

function assertLlmCurationSuggestionIdsBelongToProgram(database, { programId, suggestionIds }) {
  if (!Array.isArray(suggestionIds)) {
    throw new StorageInvariantError("llm_curation_suggestion_generation_suggestions_invalid");
  }
  const ids = new Set();
  for (const suggestionId of suggestionIds) {
    if (!isNonEmptyString(suggestionId) || ids.has(suggestionId)) {
      throw new StorageInvariantError("llm_curation_suggestion_generation_suggestions_invalid");
    }
    ids.add(suggestionId);
    const suggestion = getLlmCurationSuggestionRecord(database, suggestionId);
    if (!suggestion) {
      throw new StorageInvariantError("llm_curation_suggestion_not_found");
    }
    if (suggestion.programId !== programId) {
      throw new StorageInvariantError("llm_curation_suggestion_program_mismatch");
    }
  }
}

function assertNoForbiddenLlmCurationSuggestionArtifact(record) {
  if (containsForbiddenLlmCurationSuggestionArtifact(record)) {
    throw new StorageInvariantError("llm_curation_suggestion_raw_artifact_forbidden");
  }
}

function containsForbiddenLlmCurationSuggestionArtifact(value, key = null) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return containsForbiddenResponseDetail(value);
  }
  if (Array.isArray(value)) {
    return value.some(entry => containsForbiddenLlmCurationSuggestionArtifact(entry, key));
  }
  if (typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(
    ([entryKey, entryValue]) =>
      forbiddenEvaluatorArtifactKeys.has(normalizeEvaluatorArtifactKey(entryKey)) ||
      containsForbiddenLlmCurationSuggestionArtifact(entryValue, entryKey),
  );
}

function assertReadinessResult(result) {
  if (!["ready", "not_ready", "in_progress"].includes(result)) {
    throw new StorageInvariantError("readiness_result_invalid");
  }
}

function assertReadinessRequirementResults({ revision, requirementResults, result }) {
  if (!Array.isArray(requirementResults) || requirementResults.length !== revision.requirements.length) {
    throw new StorageInvariantError("readiness_requirement_results_invalid");
  }

  const resultsById = new Map(requirementResults.map($0 => [$0.requirementId, $0]));
  if (resultsById.size !== requirementResults.length) {
    throw new StorageInvariantError("readiness_requirement_result_id_conflict");
  }
  for (const requirement of revision.requirements) {
    const requirementResult = resultsById.get(requirement.requirementId);
    if (!requirementResult) {
      throw new StorageInvariantError("readiness_requirement_result_mismatch");
    }
    if (
      requirementResult.targetKind !== requirement.targetKind
      || requirementResult.targetId !== requirement.targetId
      || requirementResult.requiredLevel !== requirement.requiredLevel
    ) {
      throw new StorageInvariantError("readiness_requirement_result_mismatch");
    }
    if (!["no_evidence", "in_progress", "developing", "on_track", "needs_attention"].includes(requirementResult.observedLevel)) {
      throw new StorageInvariantError("readiness_observed_level_invalid");
    }
    if (deriveReadinessRequirementResult(requirementResult) !== requirementResult.result) {
      throw new StorageInvariantError("readiness_requirement_result_mismatch");
    }
  }
  if (deriveReadinessAttemptResult(requirementResults) !== result) {
    throw new StorageInvariantError("readiness_attempt_result_mismatch");
  }
}

function deriveReadinessRequirementResult(requirementResult) {
  if (requirementResult.observedLevel === "in_progress") {
    return "in_progress";
  }
  if (requirementResult.requiredLevel === "developing") {
    return ["developing", "on_track"].includes(requirementResult.observedLevel) ? "ready" : "not_ready";
  }
  return requirementResult.observedLevel === "on_track" ? "ready" : "not_ready";
}

function deriveReadinessAttemptResult(requirementResults) {
  if (requirementResults.some($0 => $0.result === "not_ready")) {
    return "not_ready";
  }
  if (requirementResults.some($0 => $0.result === "in_progress")) {
    return "in_progress";
  }
  return "ready";
}

function getReadinessCheckAttemptRecordByIdempotencyScope(
  database,
  { programId, studentIdentityId, readinessCheckRevisionId, idempotencyKey },
) {
  const row = database
    .prepare(
      `select id, program_id as programId, student_identity_id as studentIdentityId,
              readiness_check_revision_id as readinessCheckRevisionId, result,
              requirement_results_json as requirementResultsJson,
              idempotency_key as idempotencyKey, submitted_at as submittedAt
       from readiness_check_attempts
       where program_id = ?
         and student_identity_id = ?
         and readiness_check_revision_id = ?
         and idempotency_key = ?`,
    )
    .get(programId, studentIdentityId, readinessCheckRevisionId, idempotencyKey);

  return row ? mapReadinessCheckAttemptRecord(row) : null;
}

function assertQuickCheckOptionCollection({ options, answerKeyOptionId }) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new StorageInvariantError("quick_check_option_collection_invalid");
  }

  const optionIds = new Set();
  const optionTexts = new Set();
  for (const option of options) {
    if (!option || typeof option.id !== "string" || typeof option.text !== "string") {
      throw new StorageInvariantError("quick_check_option_collection_invalid");
    }
    const trimmedText = option.text.trim();
    if (option.id.length === 0 || trimmedText.length === 0) {
      throw new StorageInvariantError("quick_check_option_collection_invalid");
    }
    if (optionIds.has(option.id) || optionTexts.has(trimmedText)) {
      throw new StorageInvariantError("quick_check_option_collection_invalid");
    }
    optionIds.add(option.id);
    optionTexts.add(trimmedText);
  }

  if (!optionIds.has(answerKeyOptionId)) {
    throw new StorageInvariantError("quick_check_answer_key_option_mismatch");
  }
}

function assertQuickCheckSelectedOptionBelongsToRevision(database, { revisionId, selectedOptionId }) {
  const row = database
    .prepare(
      `select 1
       from accepted_quick_check_revision_options
       where revision_id = ? and id = ?`,
    )
    .get(revisionId, selectedOptionId);

  if (!row) {
    throw new StorageInvariantError("quick_check_selected_option_mismatch");
  }
}

function getQuickCheckAttemptRecordByIdempotencyScope(
  database,
  { programId, studentIdentityId, checkRevisionId, idempotencyKey },
) {
  const attempt = database
    .prepare(
      `select id
       from quick_check_attempts
       where program_id = ?
         and student_identity_id = ?
         and check_revision_id = ?
         and idempotency_key = ?`,
    )
    .get(programId, studentIdentityId, checkRevisionId, idempotencyKey);

  return attempt ? getQuickCheckAttemptRecord(database, attempt.id) : null;
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

function listProgramSourceBackupRecords(database) {
  return database
    .prepare(
      `select id, program_id as programId, source_kind as sourceKind, title, locator, citation,
              recorded_by_identity_id as recordedByIdentityId, recorded_at as recordedAt,
              status, status_updated_by_identity_id as statusUpdatedByIdentityId,
              status_updated_at as statusUpdatedAt
       from program_sources
       order by recorded_at, id`,
    )
    .all();
}

function listAcceptedCorpusEntityBackupRecords(database) {
  return database
    .prepare(
      `select id, program_id as programId, accepted_kind as acceptedKind,
              current_revision_id as currentRevisionId, status,
              status_updated_by_identity_id as statusUpdatedByIdentityId,
              status_updated_at as statusUpdatedAt
       from accepted_corpus_entities
       order by id`,
    )
    .all();
}

function listAcceptedNavigationRelationshipBackupRecords(database) {
  return database
    .prepare(
      `select id,
              program_id as programId,
              relationship_kind as relationshipKind,
              from_entity_id as fromEntityId,
              to_entity_id as toEntityId,
              current_revision_id as currentRevisionId,
              status,
              status_updated_by_identity_id as statusUpdatedByIdentityId,
              status_updated_at as statusUpdatedAt
       from accepted_navigation_relationships
       order by id`,
    )
    .all();
}

function listAcceptedAssessmentCriterionEntityBackupRecords(database) {
  return listAcceptedEntityBackupRecords(database, {
    tableName: "accepted_assessment_criterion_entities",
  });
}

function listAcceptedQuickCheckEntityBackupRecords(database) {
  return listAcceptedEntityBackupRecords(database, {
    tableName: "accepted_quick_check_entities",
  });
}

function listAcceptedReadinessCheckEntityBackupRecords(database) {
  return listAcceptedEntityBackupRecords(database, {
    tableName: "accepted_readiness_check_entities",
  });
}

function listAcceptedOpenAnswerCheckEntityBackupRecords(database) {
  return listAcceptedEntityBackupRecords(database, {
    tableName: "accepted_open_answer_check_entities",
  });
}

function listAcceptedEntityBackupRecords(database, { tableName }) {
  return database
    .prepare(
      `select id, program_id as programId, current_revision_id as currentRevisionId, status,
              status_updated_by_identity_id as statusUpdatedByIdentityId,
              status_updated_at as statusUpdatedAt
       from ${tableName}
       order by id`,
    )
    .all();
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
    programInvitations: listProgramInvitationRecords(database),
    programEvents: listProgramEventRecords(database),
    programMembershipEvents: listProgramMembershipEventRecords(database),
    programSources: listProgramSourceBackupRecords(database),
    corpusCandidates: listCorpusCandidateRecords(database),
    acceptedCorpusEntities: listAcceptedCorpusEntityBackupRecords(database),
    acceptedCorpusRevisions: listAcceptedCorpusRevisionRecords(database),
    sourceContents: listSourceContentRecords(database),
    acceptedMaterialContents: listAcceptedMaterialContentRecords(database),
    acceptedNavigationRelationships: listAcceptedNavigationRelationshipBackupRecords(database),
    acceptedNavigationRelationshipRevisions: listAcceptedNavigationRelationshipRevisionRecords(database),
    learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, { includeDeleted: true }),
    corpusEvents: listCorpusEventRecords(database),
    assessmentCriterionCandidates: listAssessmentCriterionCandidateRecords(database),
    acceptedAssessmentCriterionEntities: listAcceptedAssessmentCriterionEntityBackupRecords(database),
    acceptedAssessmentCriterionRevisions: listAcceptedAssessmentCriterionRevisionRecords(database),
    quickCheckCandidates: listQuickCheckCandidateRecords(database),
    acceptedQuickCheckEntities: listAcceptedQuickCheckEntityBackupRecords(database),
    acceptedQuickCheckRevisions: listAcceptedQuickCheckRevisionRecords(database),
    quickCheckAttempts: listQuickCheckAttemptRecords(database),
    readinessCheckCandidates: listReadinessCheckCandidateRecords(database),
    acceptedReadinessCheckEntities: listAcceptedReadinessCheckEntityBackupRecords(database),
    acceptedReadinessCheckRevisions: listAcceptedReadinessCheckRevisionRecords(database),
    readinessCheckAttempts: listReadinessCheckAttemptRecords(database),
    llmCurationSuggestions: listLlmCurationSuggestionRecords(database),
    llmCurationSuggestionGenerations: listLlmCurationSuggestionGenerationRecords(database),
    openAnswerCheckCandidates: listOpenAnswerCheckCandidateRecords(database),
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityBackupRecords(database),
    acceptedOpenAnswerCheckRevisions: listAcceptedOpenAnswerCheckRevisionRecords(database),
    openAnswerAttempts: listOpenAnswerAttemptRecords(database),
    openAnswerEvaluations: listOpenAnswerEvaluationRecords(database),
    openAnswerEvaluationFailures: listOpenAnswerEvaluationFailureRecords(database),
    openAnswerEvaluatorRuns: listOpenAnswerEvaluatorRunBackupRecords(database),
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

  assertValidLifecycleStatusesInBackup(backup);
  assertValidCorpusGraphInBackup(backup);
  assertValidContentGraphInBackup(backup);
  assertValidNavigationGraphInBackup(backup);
  assertValidAssessmentGraphInBackup(backup);
  assertValidQuickCheckGraphInBackup(backup);
  assertValidLearnerEvidenceTargetLinksInBackup(backup);
  assertValidProgramMembershipGraphInBackup(backup);
  assertValidReadinessGraphInBackup(backup);
  assertValidLlmCurationSuggestionGraphInBackup(backup);
  assertValidStudentAttemptGraphInBackup(backup);

  database.transaction(() => {
    database.prepare("delete from sessions").run();
    database.prepare("delete from source_contents").run();
    database.prepare("delete from accepted_material_contents").run();
    database.prepare("delete from corpus_events").run();
    database.prepare("delete from open_answer_evaluator_evidence").run();
    database.prepare("delete from open_answer_evaluator_runs").run();
    database.prepare("delete from open_answer_evaluation_failures").run();
    database.prepare("delete from open_answer_evaluations").run();
    database.prepare("delete from open_answer_attempts").run();
    database.prepare("delete from readiness_check_attempts").run();
    database.prepare("delete from llm_curation_suggestion_generations").run();
    database.prepare("delete from llm_curation_suggestions").run();
    database.prepare("delete from learner_evidence_target_links").run();
    database.prepare("delete from quick_check_attempts").run();
    database.prepare("delete from accepted_readiness_check_revisions").run();
    database.prepare("delete from accepted_readiness_check_entities").run();
    database.prepare("delete from readiness_check_candidates").run();
    database.prepare("delete from accepted_open_answer_check_revisions").run();
    database.prepare("delete from accepted_open_answer_check_entities").run();
    database.prepare("delete from open_answer_check_candidates").run();
    database.prepare("delete from accepted_quick_check_revision_options").run();
    database.prepare("delete from accepted_quick_check_revisions").run();
    database.prepare("delete from accepted_quick_check_entities").run();
    database.prepare("delete from quick_check_candidate_options").run();
    database.prepare("delete from quick_check_candidates").run();
    database.prepare("delete from accepted_assessment_criterion_revisions").run();
    database.prepare("delete from accepted_assessment_criterion_entities").run();
    database.prepare("delete from assessment_criterion_candidates").run();
    database.prepare("delete from accepted_navigation_relationship_revisions").run();
    database.prepare("delete from accepted_navigation_relationships").run();
    database.prepare("delete from accepted_corpus_revisions").run();
    database.prepare("delete from accepted_corpus_entities").run();
    database.prepare("delete from corpus_candidates").run();
    database.prepare("delete from program_sources").run();
    database.prepare("delete from program_membership_events").run();
    database.prepare("delete from program_invitations").run();
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
    const insertProgramInvitation = database.prepare(
      `insert into program_invitations (
         id,
         program_id,
         target_identity_id,
         participation_kind,
         status,
         invited_by_identity_id,
         created_at,
         updated_at,
         status_changed_by_identity_id,
         status_changed_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramEvent = database.prepare(
      `insert into program_events (
         id, event_type, actor_identity_id, program_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramMembershipEvent = database.prepare(
      `insert into program_membership_events (
         id, event_type, actor_identity_id, target_identity_id, program_id,
         participation_kind, policy_path, resulting_status, invitation_status, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertProgramSource = database.prepare(
      `insert into program_sources (
         id,
         program_id,
         source_kind,
         title,
         locator,
         citation,
         recorded_by_identity_id,
         recorded_at,
         status,
         status_updated_by_identity_id,
         status_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCorpusCandidate = database.prepare(
      `insert into corpus_candidates (
         id,
         program_id,
         candidate_kind,
         title,
         body,
         material_reference_kind,
         locator,
         citation,
         relationship_drafts_json,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedCorpusEntity = database.prepare(
      `insert into accepted_corpus_entities (
         id,
         program_id,
         accepted_kind,
         current_revision_id,
         status,
         status_updated_by_identity_id,
         status_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedCorpusRevision = database.prepare(
      `insert into accepted_corpus_revisions (
         id,
         entity_id,
         program_id,
         accepted_kind,
         title,
         body,
         material_reference_kind,
         locator,
         citation,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedNavigationRelationship = database.prepare(
      `insert into accepted_navigation_relationships (
         id,
         program_id,
         relationship_kind,
         from_entity_id,
         to_entity_id,
         current_revision_id,
         status,
         status_updated_by_identity_id,
         status_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedNavigationRelationshipRevision = database.prepare(
      `insert into accepted_navigation_relationship_revisions (
         id,
         relationship_id,
         program_id,
         relationship_kind,
         from_entity_id,
         from_revision_id,
         from_kind,
         to_entity_id,
         to_revision_id,
         to_kind,
         label,
         source_ids_json,
         accepted_from_candidate_id,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLearnerEvidenceTargetLink = database.prepare(
      `insert into learner_evidence_target_links (
         id,
         program_id,
         target_kind,
         target_id,
         evidence_owner_kind,
         evidence_owner_entity_id,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
         id, program_id, current_revision_id, status, status_updated_by_identity_id, status_updated_at
       ) values (?, ?, ?, ?, ?, ?)`,
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
    const insertQuickCheckCandidate = database.prepare(
      `insert into quick_check_candidates (
         id,
         program_id,
         check_kind,
         title,
         prompt,
         answer_key_option_id,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertQuickCheckCandidateOption = database.prepare(
      `insert into quick_check_candidate_options (candidate_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    );
    const insertAcceptedQuickCheckEntity = database.prepare(
      `insert into accepted_quick_check_entities (
         id, program_id, current_revision_id, status, status_updated_by_identity_id, status_updated_at
       ) values (?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedQuickCheckRevision = database.prepare(
      `insert into accepted_quick_check_revisions (
         id,
         entity_id,
         program_id,
         check_kind,
         title,
         prompt,
         answer_key_option_id,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedQuickCheckRevisionOption = database.prepare(
      `insert into accepted_quick_check_revision_options (revision_id, id, option_order, text)
       values (?, ?, ?, ?)`,
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
         id, program_id, current_revision_id, status, status_updated_by_identity_id, status_updated_at
       ) values (?, ?, ?, ?, ?, ?)`,
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
    const insertQuickCheckAttempt = database.prepare(
      `insert into quick_check_attempts (
         id,
         program_id,
         student_identity_id,
         check_revision_id,
         selected_option_id,
         matched,
         idempotency_key,
         submitted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertReadinessCheckCandidate = database.prepare(
      `insert into readiness_check_candidates (
         id,
         program_id,
         title,
         scope_json,
         requirements_json,
         source_ids_json,
         rationale,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedReadinessCheckEntity = database.prepare(
      `insert into accepted_readiness_check_entities (
         id, program_id, current_revision_id, status, status_updated_by_identity_id, status_updated_at
       ) values (?, ?, ?, ?, ?, ?)`,
    );
    const insertAcceptedReadinessCheckRevision = database.prepare(
      `insert into accepted_readiness_check_revisions (
         id,
         entity_id,
         program_id,
         title,
         scope_json,
         requirements_json,
         accepted_from_candidate_id,
         source_ids_json,
         rationale,
         accepted_by_identity_id,
         accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertReadinessCheckAttempt = database.prepare(
      `insert into readiness_check_attempts (
         id,
         program_id,
         student_identity_id,
         readiness_check_revision_id,
         result,
         requirement_results_json,
         idempotency_key,
         submitted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLlmCurationSuggestion = database.prepare(
      `insert into llm_curation_suggestions (
         id,
         program_id,
         suggestion_kind,
         title,
         summary,
         rationale,
         suggested_draft_json,
         supporting_evidence_json,
         origin_json,
         status,
         created_by_identity_id,
         created_at,
         updated_at,
         materialized_candidate_kind,
         materialized_candidate_id,
         materialized_by_identity_id,
         materialized_at,
         rejected_by_identity_id,
         rejected_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLlmCurationSuggestionGeneration = database.prepare(
      `insert into llm_curation_suggestion_generations (
         id,
         program_id,
         idempotency_key,
         request_fingerprint,
         suggestion_ids_json,
         created_by_identity_id,
         created_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
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
         terminal_completion_signature_json,
         job_created_at,
         job_updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    for (const invitation of backup.programInvitations ?? []) {
      insertProgramInvitation.run(
        invitation.id,
        invitation.programId,
        invitation.targetIdentityId,
        invitation.participationKind,
        invitation.status,
        invitation.invitedByIdentityId,
        invitation.createdAt,
        invitation.updatedAt,
        invitation.statusChangedByIdentityId ?? null,
        invitation.statusChangedAt ?? null,
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
        event.policyPath ?? null,
        event.resultingStatus ?? null,
        event.invitationStatus ?? null,
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
        backupLifecycleStatus(source),
        source.statusUpdatedByIdentityId ?? null,
        source.statusUpdatedAt ?? null,
      );
    }

    for (const candidate of backup.corpusCandidates ?? []) {
      insertCorpusCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.candidateKind,
        candidate.title,
        candidate.body ?? null,
        candidate.materialReferenceKind ?? null,
        candidate.locator ?? null,
        candidate.citation ?? null,
        JSON.stringify(candidate.relationshipDrafts ?? []),
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
        backupLifecycleStatus(entity),
        entity.statusUpdatedByIdentityId ?? null,
        entity.statusUpdatedAt ?? null,
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
        revision.materialReferenceKind ?? null,
        revision.locator ?? null,
        revision.citation ?? null,
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    const insertSourceContent = database.prepare(
      `insert into source_contents (
         source_id, content, content_format, byte_size, recorded_by_identity_id, recorded_at
       ) values (?, ?, ?, ?, ?, ?)`,
    );
    for (const record of backup.sourceContents ?? []) {
      insertSourceContent.run(
        record.sourceId,
        record.content,
        record.contentFormat,
        record.byteSize,
        record.recordedByIdentityId,
        record.recordedAt,
      );
    }

    const insertAcceptedMaterialContent = database.prepare(
      `insert into accepted_material_contents (
         revision_id, content, content_format, byte_size, source_content_provenance_json
       ) values (?, ?, ?, ?, ?)`,
    );
    for (const record of backup.acceptedMaterialContents ?? []) {
      insertAcceptedMaterialContent.run(
        record.revisionId,
        record.content,
        record.contentFormat,
        record.byteSize,
        record.sourceContentProvenance == null ? null : JSON.stringify(record.sourceContentProvenance),
      );
    }

    for (const relationship of backup.acceptedNavigationRelationships ?? []) {
      insertAcceptedNavigationRelationship.run(
        relationship.id,
        relationship.programId,
        relationship.relationshipKind,
        relationship.fromEntityId,
        relationship.toEntityId,
        relationship.currentRevisionId,
        backupLifecycleStatus(relationship),
        relationship.statusUpdatedByIdentityId ?? null,
        relationship.statusUpdatedAt ?? null,
      );
    }

    for (const revision of backup.acceptedNavigationRelationshipRevisions ?? []) {
      insertAcceptedNavigationRelationshipRevision.run(
        revision.id,
        revision.relationshipId,
        revision.programId,
        revision.relationshipKind,
        revision.fromEntityId,
        revision.fromRevisionId,
        revision.fromKind,
        revision.toEntityId,
        revision.toRevisionId,
        revision.toKind,
        revision.label ?? null,
        JSON.stringify(revision.sourceIds ?? []),
        revision.acceptedFromCandidateId,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    for (const link of backup.learnerEvidenceTargetLinks ?? []) {
      insertLearnerEvidenceTargetLink.run(
        link.id,
        link.programId,
        link.targetKind,
        link.targetId,
        link.evidenceOwnerKind,
        link.evidenceOwnerEntityId,
        link.status,
        link.createdByIdentityId,
        link.createdAt,
        link.updatedAt,
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
        backupLifecycleStatus(entity),
        entity.statusUpdatedByIdentityId ?? null,
        entity.statusUpdatedAt ?? null,
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

    for (const candidate of backup.quickCheckCandidates ?? []) {
      insertQuickCheckCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.checkKind,
        candidate.title,
        candidate.prompt,
        candidate.answerKeyOptionId,
        JSON.stringify(candidate.sourceIds ?? []),
        candidate.rationale ?? null,
        candidate.status,
        candidate.createdByIdentityId,
        candidate.createdAt,
        candidate.updatedAt,
      );
      for (const [optionIndex, option] of candidate.options.entries()) {
        insertQuickCheckCandidateOption.run(
          candidate.id,
          option.id,
          optionIndex,
          option.text,
        );
      }
    }

    for (const entity of backup.acceptedQuickCheckEntities ?? []) {
      insertAcceptedQuickCheckEntity.run(
        entity.id,
        entity.programId,
        entity.currentRevisionId,
        backupLifecycleStatus(entity),
        entity.statusUpdatedByIdentityId ?? null,
        entity.statusUpdatedAt ?? null,
      );
    }

    for (const revision of backup.acceptedQuickCheckRevisions ?? []) {
      insertAcceptedQuickCheckRevision.run(
        revision.id,
        revision.entityId,
        revision.programId,
        revision.checkKind,
        revision.title,
        revision.prompt,
        revision.answerKeyOptionId,
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
      for (const [optionIndex, option] of revision.options.entries()) {
        insertAcceptedQuickCheckRevisionOption.run(
          revision.id,
          option.id,
          optionIndex,
          option.text,
        );
      }
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
        backupLifecycleStatus(entity),
        entity.statusUpdatedByIdentityId ?? null,
        entity.statusUpdatedAt ?? null,
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

    for (const candidate of backup.readinessCheckCandidates ?? []) {
      insertReadinessCheckCandidate.run(
        candidate.id,
        candidate.programId,
        candidate.title,
        JSON.stringify(candidate.scope),
        JSON.stringify(candidate.requirements ?? []),
        JSON.stringify(candidate.sourceIds ?? []),
        candidate.rationale ?? null,
        candidate.status,
        candidate.createdByIdentityId,
        candidate.createdAt,
        candidate.updatedAt,
      );
    }

    for (const suggestion of backup.llmCurationSuggestions ?? []) {
      insertLlmCurationSuggestion.run(
        suggestion.id,
        suggestion.programId,
        suggestion.suggestionKind,
        suggestion.title,
        suggestion.summary,
        suggestion.rationale,
        JSON.stringify(suggestion.suggestedDraft),
        JSON.stringify(suggestion.supportingEvidence),
        JSON.stringify(suggestion.origin),
        suggestion.status,
        suggestion.createdByIdentityId,
        suggestion.createdAt,
        suggestion.updatedAt,
        suggestion.materializedCandidateKind ?? null,
        suggestion.materializedCandidateId ?? null,
        suggestion.materializedByIdentityId ?? null,
        suggestion.materializedAt ?? null,
        suggestion.rejectedByIdentityId ?? null,
        suggestion.rejectedAt ?? null,
      );
    }

    for (const generation of backup.llmCurationSuggestionGenerations ?? []) {
      insertLlmCurationSuggestionGeneration.run(
        generation.id,
        generation.programId,
        generation.idempotencyKey,
        generation.requestFingerprint,
        JSON.stringify(generation.suggestionIds ?? []),
        generation.createdByIdentityId,
        generation.createdAt,
      );
    }

    for (const entity of backup.acceptedReadinessCheckEntities ?? []) {
      insertAcceptedReadinessCheckEntity.run(
        entity.id,
        entity.programId,
        entity.currentRevisionId,
        backupLifecycleStatus(entity),
        entity.statusUpdatedByIdentityId ?? null,
        entity.statusUpdatedAt ?? null,
      );
    }

    for (const revision of backup.acceptedReadinessCheckRevisions ?? []) {
      insertAcceptedReadinessCheckRevision.run(
        revision.id,
        revision.entityId,
        revision.programId,
        revision.title,
        JSON.stringify(revision.scope),
        JSON.stringify(revision.requirements ?? []),
        revision.acceptedFromCandidateId,
        JSON.stringify(revision.sourceIds ?? []),
        revision.rationale ?? null,
        revision.acceptedByIdentityId,
        revision.acceptedAt,
      );
    }

    for (const attempt of backup.quickCheckAttempts ?? []) {
      insertQuickCheckAttempt.run(
        attempt.id,
        attempt.programId,
        attempt.studentIdentityId,
        attempt.checkRevisionId,
        attempt.selectedOptionId,
        attempt.matched ? 1 : 0,
        attempt.idempotencyKey,
        attempt.submittedAt,
      );
    }

    for (const attempt of backup.readinessCheckAttempts ?? []) {
      insertReadinessCheckAttempt.run(
        attempt.id,
        attempt.programId,
        attempt.studentIdentityId,
        attempt.readinessCheckRevisionId,
        attempt.result,
        JSON.stringify(attempt.requirementResults ?? []),
        attempt.idempotencyKey,
        attempt.submittedAt,
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
        evaluatorRun.jobStatus ?? null,
        evaluatorRun.attemptNumber ?? null,
        evaluatorRun.retryPolicy ? JSON.stringify(evaluatorRun.retryPolicy) : null,
        evaluatorRun.budgetPolicy ? JSON.stringify(evaluatorRun.budgetPolicy) : null,
        evaluatorRun.leaseId ?? null,
        evaluatorRun.workerId ?? null,
        evaluatorRun.leaseClaimedAt ?? null,
        evaluatorRun.leaseExpiresAt ?? null,
        evaluatorRun.nextRetryAt ?? null,
        evaluatorRun.cancellationReason ?? null,
        evaluatorRun.timeoutReason ?? null,
        evaluatorRun.jobFailureReason ?? null,
        evaluatorRun.terminalCompletionSignature
          ? JSON.stringify(evaluatorRun.terminalCompletionSignature)
          : null,
        evaluatorRun.jobCreatedAt ?? evaluatorRun.startedAt ?? null,
        evaluatorRun.jobUpdatedAt ?? evaluatorRun.startedAt ?? null,
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
  const candidate = {
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

  if (row.materialReferenceKind !== null) {
    candidate.materialReferenceKind = row.materialReferenceKind;
  }
  if (row.locator !== null) {
    candidate.locator = row.locator;
  }
  if (row.citation !== null) {
    candidate.citation = row.citation;
  }

  const relationshipDrafts = JSON.parse(row.relationshipDraftsJson ?? "[]");
  if (relationshipDrafts.length > 0) {
    candidate.relationshipDrafts = relationshipDrafts;
  }

  return candidate;
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

function mapQuickCheckCandidateRecord(database, row) {
  return {
    id: row.id,
    programId: row.programId,
    checkKind: row.checkKind,
    title: row.title,
    prompt: row.prompt,
    options: listQuickCheckCandidateOptionRecords(database, row.id),
    answerKeyOptionId: row.answerKeyOptionId,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listQuickCheckCandidateOptionRecords(database, candidateId) {
  return database
    .prepare(
      `select id, text
       from quick_check_candidate_options
       where candidate_id = ?
       order by option_order`,
    )
    .all(candidateId);
}

function mapAcceptedQuickCheckRevisionRecord(database, row) {
  return {
    id: row.id,
    entityId: row.entityId,
    programId: row.programId,
    checkKind: row.checkKind,
    title: row.title,
    prompt: row.prompt,
    options: listAcceptedQuickCheckRevisionOptionRecords(database, row.id),
    answerKeyOptionId: row.answerKeyOptionId,
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
}

function listAcceptedQuickCheckRevisionOptionRecords(database, revisionId) {
  return database
    .prepare(
      `select id, text
       from accepted_quick_check_revision_options
       where revision_id = ?
       order by option_order`,
    )
    .all(revisionId);
}

function mapQuickCheckAttemptRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    checkRevisionId: row.checkRevisionId,
    selectedOptionId: row.selectedOptionId,
    matched: Boolean(row.matched),
    idempotencyKey: row.idempotencyKey,
    submittedAt: row.submittedAt,
  };
}

function mapReadinessCheckCandidateRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    title: row.title,
    scope: JSON.parse(row.scopeJson),
    requirements: JSON.parse(row.requirementsJson),
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLlmCurationSuggestionRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    suggestionKind: row.suggestionKind,
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    suggestedDraft: JSON.parse(row.suggestedDraftJson),
    supportingEvidence: JSON.parse(row.supportingEvidenceJson),
    origin: JSON.parse(row.originJson),
    status: row.status,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    materializedCandidateKind: row.materializedCandidateKind,
    materializedCandidateId: row.materializedCandidateId,
    materializedByIdentityId: row.materializedByIdentityId,
    materializedAt: row.materializedAt,
    rejectedByIdentityId: row.rejectedByIdentityId,
    rejectedAt: row.rejectedAt,
  };
}

function mapLlmCurationSuggestionGenerationRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    suggestionIds: JSON.parse(row.suggestionIdsJson),
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
  };
}

function mapAcceptedReadinessCheckRevisionRecord(row) {
  return {
    id: row.id,
    entityId: row.entityId,
    programId: row.programId,
    title: row.title,
    scope: JSON.parse(row.scopeJson),
    requirements: JSON.parse(row.requirementsJson),
    sourceIds: JSON.parse(row.sourceIdsJson),
    rationale: row.rationale,
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
}

function mapReadinessCheckAttemptRecord(row) {
  return {
    id: row.id,
    programId: row.programId,
    studentIdentityId: row.studentIdentityId,
    readinessCheckRevisionId: row.readinessCheckRevisionId,
    result: row.result,
    requirementResults: JSON.parse(row.requirementResultsJson),
    idempotencyKey: row.idempotencyKey,
    submittedAt: row.submittedAt,
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

function mapOpenAnswerEvaluatorRunBackupRecord(row) {
  const run = mapOpenAnswerEvaluatorRunRecord(row);
  if (!row.jobStatus) {
    return run;
  }
  return {
    ...run,
    jobStatus: row.jobStatus,
    attemptNumber: row.attemptNumber,
    retryPolicy: JSON.parse(row.retryPolicyJson),
    budgetPolicy: row.budgetPolicyJson ? JSON.parse(row.budgetPolicyJson) : null,
    leaseId: row.leaseId,
    workerId: row.workerId,
    leaseClaimedAt: row.leaseClaimedAt,
    leaseExpiresAt: row.leaseExpiresAt,
    nextRetryAt: row.nextRetryAt,
    cancellationReason: row.cancellationReason,
    timeoutReason: row.timeoutReason,
    jobFailureReason: row.jobFailureReason,
    ...(row.terminalCompletionSignatureJson
      ? { terminalCompletionSignature: JSON.parse(row.terminalCompletionSignatureJson) }
      : {}),
    jobCreatedAt: row.jobCreatedAt,
    jobUpdatedAt: row.jobUpdatedAt,
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
  const revision = {
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

  if (row.materialReferenceKind !== null) {
    revision.materialReferenceKind = row.materialReferenceKind;
  }
  if (row.locator !== null) {
    revision.locator = row.locator;
  }
  if (row.citation !== null) {
    revision.citation = row.citation;
  }

  return revision;
}

function mapAcceptedNavigationRelationshipRevisionRecord(row) {
  return {
    id: row.id,
    relationshipId: row.relationshipId,
    programId: row.programId,
    relationshipKind: row.relationshipKind,
    fromEntityId: row.fromEntityId,
    fromRevisionId: row.fromRevisionId,
    fromKind: row.fromKind,
    toEntityId: row.toEntityId,
    toRevisionId: row.toRevisionId,
    toKind: row.toKind,
    label: row.label,
    sourceIds: JSON.parse(row.sourceIdsJson),
    acceptedFromCandidateId: row.acceptedFromCandidateId,
    acceptedByIdentityId: row.acceptedByIdentityId,
    acceptedAt: row.acceptedAt,
  };
}

function getActiveLearnerEvidenceTargetLinkRecord(
  database,
  { programId, targetKind, targetId, evidenceOwnerKind, evidenceOwnerEntityId },
) {
  return database
    .prepare(
      `select id,
              program_id as programId,
              target_kind as targetKind,
              target_id as targetId,
              evidence_owner_kind as evidenceOwnerKind,
              evidence_owner_entity_id as evidenceOwnerEntityId,
              status,
              created_by_identity_id as createdByIdentityId,
              created_at as createdAt,
              updated_at as updatedAt
       from learner_evidence_target_links
       where program_id = ?
         and target_kind = ?
         and target_id = ?
         and evidence_owner_kind = ?
         and evidence_owner_entity_id = ?
         and status = 'active'`,
    )
    .get(programId, targetKind, targetId, evidenceOwnerKind, evidenceOwnerEntityId) ?? null;
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

function mapProgramInvitationConstraintError(error) {
  if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return new StorageInvariantError("invitation_conflict");
  }

  if (error.code === "SQLITE_CONSTRAINT_CHECK" && error.message.includes("participation_kind")) {
    return new StorageInvariantError("unsupported_participation_kind");
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

function assertValidLifecycleStatusesInBackup(backup) {
  for (const record of backupLifecycleRecords(backup)) {
    if (!lifecycleStatuses.has(backupLifecycleStatus(record))) {
      throw new StorageInvariantError("lifecycle_status_invalid");
    }
  }
}

function backupLifecycleRecords(backup) {
  return [
    ...(backup.programSources ?? []),
    ...(backup.acceptedAssessmentCriterionEntities ?? []),
    ...(backup.acceptedQuickCheckEntities ?? []),
    ...(backup.acceptedReadinessCheckEntities ?? []),
    ...(backup.acceptedOpenAnswerCheckEntities ?? []),
    ...(backup.acceptedCorpusEntities ?? []),
    ...(backup.acceptedNavigationRelationships ?? []),
  ];
}

function backupLifecycleStatus(record) {
  return record.status ?? "active";
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

function assertValidProgramMembershipGraphInBackup(backup) {
  const identityIds = new Set((backup.identities ?? []).map($0 => $0.id));
  const programIds = new Set((backup.programShells ?? []).map($0 => $0.id));
  const invitationIds = new Set();
  const pendingInvitationScopes = new Set();
  const membershipScopes = new Set();
  const policyPaths = new Set([
    null,
    undefined,
    "self_join",
    "curator_invitation",
    "curator_removal",
    "curator_leave",
    "admin_exceptional_recovery",
    "admin_exceptional_revocation",
  ]);
  const invitationStatuses = new Set([null, undefined, "pending", "accepted", "declined", "revoked"]);

  for (const shell of backup.programShells ?? []) {
    if (!["self_join", "invitation_only"].includes(shell.admissionPolicy)) {
      throw new StorageInvariantError("validation_failed");
    }
  }

  for (const membership of backup.programMemberships ?? []) {
    const scope = `${membership.programId}:${membership.identityId}:${membership.participationKind}`;
    if (membershipScopes.has(scope)) {
      throw new StorageInvariantError("membership_conflict");
    }
    membershipScopes.add(scope);
  }

  for (const invitation of backup.programInvitations ?? []) {
    if (invitationIds.has(invitation.id)) {
      throw new StorageInvariantError("invitation_conflict");
    }
    invitationIds.add(invitation.id);

    if (!programIds.has(invitation.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    if (
      !identityIds.has(invitation.targetIdentityId) ||
      !identityIds.has(invitation.invitedByIdentityId) ||
      (invitation.statusChangedByIdentityId !== null &&
        invitation.statusChangedByIdentityId !== undefined &&
        !identityIds.has(invitation.statusChangedByIdentityId))
    ) {
      throw new StorageInvariantError("identity_not_found");
    }

    if (invitation.participationKind !== "student") {
      throw new StorageInvariantError("unsupported_participation_kind");
    }

    if (invitation.status === "pending") {
      const scope = `${invitation.programId}:${invitation.targetIdentityId}:${invitation.participationKind}`;
      if (pendingInvitationScopes.has(scope)) {
        throw new StorageInvariantError("invitation_conflict");
      }
      pendingInvitationScopes.add(scope);
    }
  }

  for (const event of backup.programMembershipEvents ?? []) {
    if (!policyPaths.has(event.policyPath) || !invitationStatuses.has(event.invitationStatus)) {
      throw new StorageInvariantError("validation_failed");
    }
  }
}

function assertBackupContentShape(record) {
  if (!CONTENT_FORMATS.has(record.contentFormat)) {
    throw new StorageInvariantError("content_format_invalid");
  }
  if (typeof record.content !== "string" || Buffer.byteLength(record.content, "utf8") !== record.byteSize) {
    throw new StorageInvariantError("content_byte_size_mismatch");
  }
  if (record.byteSize > MAX_MATERIAL_CONTENT_BYTES) {
    throw new StorageInvariantError("content_too_large");
  }
}

function assertValidContentGraphInBackup(backup) {
  const sourceIds = new Set((backup.programSources ?? []).map($0 => $0.id));
  const revisionsById = new Map((backup.acceptedCorpusRevisions ?? []).map($0 => [$0.id, $0]));

  for (const record of backup.sourceContents ?? []) {
    if (!sourceIds.has(record.sourceId)) {
      throw new StorageInvariantError("source_content_source_not_found");
    }
    assertBackupContentShape(record);
  }

  for (const record of backup.acceptedMaterialContents ?? []) {
    const revision = revisionsById.get(record.revisionId);
    if (!revision) {
      throw new StorageInvariantError("accepted_material_content_revision_not_found");
    }
    if (revision.acceptedKind !== "material_reference") {
      throw new StorageInvariantError("accepted_material_content_revision_kind_mismatch");
    }
    assertBackupContentShape(record);
  }
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
    assertAcceptedCorpusRevisionMaterialReferenceShape({
      acceptedKind: revision.acceptedKind,
      body: revision.body ?? null,
      materialReferenceKind: revision.materialReferenceKind ?? null,
      locator: revision.locator ?? null,
      citation: revision.citation ?? null,
    });

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

function assertValidNavigationGraphInBackup(backup) {
  const sourcesById = new Map((backup.programSources ?? []).map($0 => [$0.id, $0]));
  const candidatesById = new Map((backup.corpusCandidates ?? []).map($0 => [$0.id, $0]));
  const entitiesById = new Map((backup.acceptedCorpusEntities ?? []).map($0 => [$0.id, $0]));
  const revisionsById = new Map((backup.acceptedCorpusRevisions ?? []).map($0 => [$0.id, $0]));
  const relationshipsById = new Map(
    (backup.acceptedNavigationRelationships ?? []).map($0 => [$0.id, $0]),
  );
  const relationshipRevisionsById = new Map(
    (backup.acceptedNavigationRelationshipRevisions ?? []).map($0 => [$0.id, $0]),
  );

  for (const relationship of backup.acceptedNavigationRelationships ?? []) {
    const fromEntity = entitiesById.get(relationship.fromEntityId);
    const toEntity = entitiesById.get(relationship.toEntityId);
    assertNavigationRelationshipBackupEndpoints({
      programId: relationship.programId,
      relationshipKind: relationship.relationshipKind,
      fromEntity,
      toEntity,
    });

    const currentRevision = relationshipRevisionsById.get(relationship.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("navigation_relationship_revision_not_found");
    }
    if (currentRevision.relationshipId !== relationship.id) {
      throw new StorageInvariantError("navigation_relationship_revision_relationship_mismatch");
    }
  }

  for (const revision of backup.acceptedNavigationRelationshipRevisions ?? []) {
    const relationship = relationshipsById.get(revision.relationshipId);
    if (!relationship) {
      throw new StorageInvariantError("navigation_relationship_not_found");
    }
    if (
      relationship.programId !== revision.programId ||
      relationship.relationshipKind !== revision.relationshipKind ||
      relationship.fromEntityId !== revision.fromEntityId ||
      relationship.toEntityId !== revision.toEntityId
    ) {
      throw new StorageInvariantError("navigation_relationship_revision_relationship_mismatch");
    }
    if (!isValidNavigationRelationshipEndpointPair(revision.relationshipKind, revision.fromKind, revision.toKind)) {
      throw new StorageInvariantError("navigation_relationship_endpoint_kind_mismatch");
    }

    assertNavigationRelationshipBackupRevisionEndpoint({
      entity: entitiesById.get(revision.fromEntityId),
      revision: revisionsById.get(revision.fromRevisionId),
      revisionKind: revision.fromKind,
    });
    assertNavigationRelationshipBackupRevisionEndpoint({
      entity: entitiesById.get(revision.toEntityId),
      revision: revisionsById.get(revision.toRevisionId),
      revisionKind: revision.toKind,
    });

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

  assertNavigationBackupHasNoPrerequisiteCycles(backup.acceptedNavigationRelationships ?? []);
}

function assertNavigationRelationshipBackupEndpoints({ programId, relationshipKind, fromEntity, toEntity }) {
  if (!fromEntity || !toEntity) {
    throw new StorageInvariantError("accepted_entity_not_found");
  }
  if (fromEntity.id === toEntity.id) {
    throw new StorageInvariantError("navigation_relationship_self_reference");
  }
  if (fromEntity.programId !== programId || toEntity.programId !== programId) {
    throw new StorageInvariantError("navigation_relationship_program_mismatch");
  }
  if (!isValidNavigationRelationshipEndpointPair(relationshipKind, fromEntity.acceptedKind, toEntity.acceptedKind)) {
    throw new StorageInvariantError("navigation_relationship_endpoint_kind_mismatch");
  }
}

function assertNavigationRelationshipBackupRevisionEndpoint({ entity, revision, revisionKind }) {
  if (!entity) {
    throw new StorageInvariantError("accepted_entity_not_found");
  }
  if (!revision) {
    throw new StorageInvariantError("accepted_revision_not_found");
  }
  if (revision.entityId !== entity.id) {
    throw new StorageInvariantError("accepted_revision_entity_mismatch");
  }
  if (revision.programId !== entity.programId) {
    throw new StorageInvariantError("accepted_revision_program_mismatch");
  }
  if (revision.acceptedKind !== entity.acceptedKind || revision.acceptedKind !== revisionKind) {
    throw new StorageInvariantError("accepted_revision_kind_mismatch");
  }
}

function assertNavigationBackupHasNoPrerequisiteCycles(relationships) {
  const edgesByProgramAndFrom = new Map();
  for (const relationship of relationships) {
    if (relationship.relationshipKind !== "concept_prerequisite") {
      continue;
    }
    const key = `${relationship.programId}:${relationship.fromEntityId}`;
    const targets = edgesByProgramAndFrom.get(key) ?? [];
    targets.push(relationship.toEntityId);
    edgesByProgramAndFrom.set(key, targets);
  }

  for (const relationship of relationships) {
    if (relationship.relationshipKind !== "concept_prerequisite") {
      continue;
    }
    const visited = new Set();
    const stack = [relationship.toEntityId];
    while (stack.length > 0) {
      const currentEntityId = stack.pop();
      if (currentEntityId === relationship.fromEntityId) {
        throw new StorageInvariantError("navigation_prerequisite_cycle");
      }
      if (visited.has(currentEntityId)) {
        continue;
      }
      visited.add(currentEntityId);
      stack.push(...(edgesByProgramAndFrom.get(`${relationship.programId}:${currentEntityId}`) ?? []));
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

function assertValidQuickCheckGraphInBackup(backup) {
  const programShellsById = new Map((backup.programShells ?? []).map($0 => [$0.id, $0]));
  const identitiesById = new Map((backup.identities ?? []).map($0 => [$0.id, $0]));
  const sourcesById = new Map((backup.programSources ?? []).map($0 => [$0.id, $0]));
  const candidatesById = new Map((backup.quickCheckCandidates ?? []).map($0 => [$0.id, $0]));
  const entitiesById = new Map((backup.acceptedQuickCheckEntities ?? []).map($0 => [$0.id, $0]));
  const revisionsById = new Map((backup.acceptedQuickCheckRevisions ?? []).map($0 => [$0.id, $0]));
  const attemptIdempotencyScopes = new Set();

  for (const candidate of backup.quickCheckCandidates ?? []) {
    if (!programShellsById.has(candidate.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    if (!identitiesById.has(candidate.createdByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }

    assertSourceIdsBelongToProgram({
      programId: candidate.programId,
      sourceIds: candidate.sourceIds ?? [],
      sourcesById,
    });
    assertQuickCheckOptionCollection({
      options: candidate.options,
      answerKeyOptionId: candidate.answerKeyOptionId,
    });
  }

  for (const revision of backup.acceptedQuickCheckRevisions ?? []) {
    if (!programShellsById.has(revision.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    if (!identitiesById.has(revision.acceptedByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }

    const entity = entitiesById.get(revision.entityId);
    if (!entity) {
      throw new StorageInvariantError("quick_check_entity_not_found");
    }

    if (entity.programId !== revision.programId) {
      throw new StorageInvariantError("quick_check_revision_program_mismatch");
    }

    const candidate = candidatesById.get(revision.acceptedFromCandidateId);
    if (!candidate) {
      throw new StorageInvariantError("quick_check_candidate_not_found");
    }

    if (candidate.status !== "accepted") {
      throw new StorageInvariantError("quick_check_candidate_not_accepted");
    }

    if (candidate.programId !== revision.programId) {
      throw new StorageInvariantError("quick_check_candidate_program_mismatch");
    }

    assertSourceIdsBelongToProgram({
      programId: revision.programId,
      sourceIds: revision.sourceIds ?? [],
      sourcesById,
    });
    assertQuickCheckOptionCollection({
      options: revision.options,
      answerKeyOptionId: revision.answerKeyOptionId,
    });
  }

  for (const entity of backup.acceptedQuickCheckEntities ?? []) {
    if (!programShellsById.has(entity.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    const currentRevision = revisionsById.get(entity.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("quick_check_revision_not_found");
    }

    if (currentRevision.entityId !== entity.id) {
      throw new StorageInvariantError("quick_check_revision_entity_mismatch");
    }

    if (currentRevision.programId !== entity.programId) {
      throw new StorageInvariantError("quick_check_revision_program_mismatch");
    }
  }

  for (const attempt of backup.quickCheckAttempts ?? []) {
    if (!programShellsById.has(attempt.programId)) {
      throw new StorageInvariantError("program_not_found");
    }

    if (!identitiesById.has(attempt.studentIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }

    const revision = revisionsById.get(attempt.checkRevisionId);
    if (!revision) {
      throw new StorageInvariantError("quick_check_revision_not_found");
    }

    if (revision.programId !== attempt.programId) {
      throw new StorageInvariantError("quick_check_revision_program_mismatch");
    }

    const selectedOption = revision.options.find($0 => $0.id === attempt.selectedOptionId);
    if (!selectedOption) {
      throw new StorageInvariantError("quick_check_selected_option_mismatch");
    }

    if (typeof attempt.matched !== "boolean") {
      throw new StorageInvariantError("quick_check_attempt_matched_invalid");
    }

    if ((attempt.selectedOptionId === revision.answerKeyOptionId) !== attempt.matched) {
      throw new StorageInvariantError("quick_check_attempt_matched_mismatch");
    }

    const idempotencyScope = [
      attempt.programId,
      attempt.studentIdentityId,
      attempt.checkRevisionId,
      attempt.idempotencyKey,
    ].join("\u0000");
    if (attemptIdempotencyScopes.has(idempotencyScope)) {
      throw new StorageInvariantError("quick_check_attempt_idempotency_conflict");
    }
    attemptIdempotencyScopes.add(idempotencyScope);
  }
}

function assertValidReadinessGraphInBackup(backup) {
  const programShellsById = new Map((backup.programShells ?? []).map($0 => [$0.id, $0]));
  const identitiesById = new Map((backup.identities ?? []).map($0 => [$0.id, $0]));
  const sourcesById = new Map((backup.programSources ?? []).map($0 => [$0.id, $0]));
  const acceptedCorpusEntitiesById = new Map(
    (backup.acceptedCorpusEntities ?? []).map($0 => [$0.id, $0]),
  );
  const quickCheckEntitiesById = new Map(
    (backup.acceptedQuickCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const openAnswerCheckEntitiesById = new Map(
    (backup.acceptedOpenAnswerCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const criterionEntitiesById = new Map(
    (backup.acceptedAssessmentCriterionEntities ?? []).map($0 => [$0.id, $0]),
  );
  const candidatesById = new Map((backup.readinessCheckCandidates ?? []).map($0 => [$0.id, $0]));
  const entitiesById = new Map(
    (backup.acceptedReadinessCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const revisionsById = new Map(
    (backup.acceptedReadinessCheckRevisions ?? []).map($0 => [$0.id, $0]),
  );
  const attemptIdempotencyScopes = new Set();

  assertBackupCollectionHasNoDuplicateIds(backup.readinessCheckCandidates ?? [], "readiness_candidate_id_conflict");
  assertBackupCollectionHasNoDuplicateIds(
    backup.acceptedReadinessCheckEntities ?? [],
    "readiness_entity_id_conflict",
  );
  assertBackupCollectionHasNoDuplicateIds(
    backup.acceptedReadinessCheckRevisions ?? [],
    "readiness_revision_id_conflict",
  );
  assertBackupCollectionHasNoDuplicateIds(
    backup.readinessCheckAttempts ?? [],
    "readiness_attempt_id_conflict",
  );

  for (const candidate of backup.readinessCheckCandidates ?? []) {
    if (!programShellsById.has(candidate.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (!identitiesById.has(candidate.createdByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }
    assertSourceIdsBelongToProgram({
      programId: candidate.programId,
      sourceIds: candidate.sourceIds ?? [],
      sourcesById,
    });
    assertReadinessBackupScope({
      programId: candidate.programId,
      scope: candidate.scope,
      acceptedCorpusEntitiesById,
    });
    assertReadinessBackupRequirements({
      programId: candidate.programId,
      requirements: candidate.requirements,
      acceptedCorpusEntitiesById,
      quickCheckEntitiesById,
      openAnswerCheckEntitiesById,
      criterionEntitiesById,
    });
  }

  for (const revision of backup.acceptedReadinessCheckRevisions ?? []) {
    if (!programShellsById.has(revision.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (!identitiesById.has(revision.acceptedByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }
    const entity = entitiesById.get(revision.entityId);
    if (!entity) {
      throw new StorageInvariantError("readiness_entity_not_found");
    }
    if (entity.programId !== revision.programId) {
      throw new StorageInvariantError("readiness_revision_program_mismatch");
    }
    const candidate = candidatesById.get(revision.acceptedFromCandidateId);
    if (!candidate) {
      throw new StorageInvariantError("readiness_candidate_not_found");
    }
    if (candidate.status !== "accepted") {
      throw new StorageInvariantError("readiness_candidate_not_accepted");
    }
    if (candidate.programId !== revision.programId) {
      throw new StorageInvariantError("readiness_candidate_program_mismatch");
    }
    assertSourceIdsBelongToProgram({
      programId: revision.programId,
      sourceIds: revision.sourceIds ?? [],
      sourcesById,
    });
    assertReadinessBackupScope({
      programId: revision.programId,
      scope: revision.scope,
      acceptedCorpusEntitiesById,
    });
    assertReadinessBackupRequirements({
      programId: revision.programId,
      requirements: revision.requirements,
      acceptedCorpusEntitiesById,
      quickCheckEntitiesById,
      openAnswerCheckEntitiesById,
      criterionEntitiesById,
    });
  }

  for (const entity of backup.acceptedReadinessCheckEntities ?? []) {
    if (!programShellsById.has(entity.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    const currentRevision = revisionsById.get(entity.currentRevisionId);
    if (!currentRevision) {
      throw new StorageInvariantError("readiness_revision_not_found");
    }
    if (currentRevision.entityId !== entity.id) {
      throw new StorageInvariantError("readiness_revision_entity_mismatch");
    }
    if (currentRevision.programId !== entity.programId) {
      throw new StorageInvariantError("readiness_revision_program_mismatch");
    }
  }

  for (const attempt of backup.readinessCheckAttempts ?? []) {
    if (!programShellsById.has(attempt.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (!identitiesById.has(attempt.studentIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }
    const revision = revisionsById.get(attempt.readinessCheckRevisionId);
    if (!revision) {
      throw new StorageInvariantError("readiness_revision_not_found");
    }
    if (revision.programId !== attempt.programId) {
      throw new StorageInvariantError("readiness_revision_program_mismatch");
    }
    assertReadinessResult(attempt.result);
    assertReadinessRequirementResults({
      revision,
      requirementResults: attempt.requirementResults,
      result: attempt.result,
    });
    const idempotencyScope = [
      attempt.programId,
      attempt.studentIdentityId,
      attempt.readinessCheckRevisionId,
      attempt.idempotencyKey,
    ].join("\u0000");
    if (attemptIdempotencyScopes.has(idempotencyScope)) {
      throw new StorageInvariantError("readiness_attempt_idempotency_conflict");
    }
    attemptIdempotencyScopes.add(idempotencyScope);
  }
}

function assertValidLearnerEvidenceTargetLinksInBackup(backup) {
  const programShellsById = new Map((backup.programShells ?? []).map($0 => [$0.id, $0]));
  const identitiesById = new Map((backup.identities ?? []).map($0 => [$0.id, $0]));
  const targetsById = new Map((backup.acceptedCorpusEntities ?? []).map($0 => [$0.id, $0]));
  const quickCheckEntitiesById = new Map(
    (backup.acceptedQuickCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const openAnswerCheckEntitiesById = new Map(
    (backup.acceptedOpenAnswerCheckEntities ?? []).map($0 => [$0.id, $0]),
  );
  const criterionEntitiesById = new Map(
    (backup.acceptedAssessmentCriterionEntities ?? []).map($0 => [$0.id, $0]),
  );
  const activeScopes = new Set();
  const ids = new Set();

  for (const link of backup.learnerEvidenceTargetLinks ?? []) {
    if (ids.has(link.id)) {
      throw new StorageInvariantError("learner_state_target_link_id_conflict");
    }
    ids.add(link.id);

    if (!programShellsById.has(link.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (!identitiesById.has(link.createdByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }
    if (!["topic", "concept", "material_reference"].includes(link.targetKind)) {
      throw new StorageInvariantError("learner_state_target_kind_invalid");
    }
    if (
      ![
        "accepted_quick_check",
        "accepted_open_answer_check",
        "accepted_assessment_criterion",
      ].includes(link.evidenceOwnerKind)
    ) {
      throw new StorageInvariantError("learner_state_evidence_owner_kind_invalid");
    }
    if (!["active", "deleted"].includes(link.status)) {
      throw new StorageInvariantError("learner_state_target_link_status_invalid");
    }

    const target = targetsById.get(link.targetId);
    if (!target) {
      throw new StorageInvariantError("accepted_entity_not_found");
    }
    if (target.programId !== link.programId) {
      throw new StorageInvariantError("learner_state_target_program_mismatch");
    }
    if (target.acceptedKind !== link.targetKind) {
      throw new StorageInvariantError("learner_state_target_kind_invalid");
    }

    const evidenceOwner = getLearnerEvidenceTargetLinkBackupEvidenceOwner({
      link,
      quickCheckEntitiesById,
      openAnswerCheckEntitiesById,
      criterionEntitiesById,
    });
    if (evidenceOwner.programId !== link.programId) {
      throw new StorageInvariantError("learner_state_evidence_owner_program_mismatch");
    }

    if (link.status === "active") {
      const activeScope = [
        link.programId,
        link.targetKind,
        link.targetId,
        link.evidenceOwnerKind,
        link.evidenceOwnerEntityId,
      ].join("\u0000");
      if (activeScopes.has(activeScope)) {
        throw new StorageInvariantError("learner_state_target_link_idempotency_conflict");
      }
      activeScopes.add(activeScope);
    }
  }
}

function assertValidLlmCurationSuggestionGraphInBackup(backup) {
  const programShellsById = new Map((backup.programShells ?? []).map($0 => [$0.id, $0]));
  const identitiesById = new Map((backup.identities ?? []).map($0 => [$0.id, $0]));
  const suggestionsById = new Map((backup.llmCurationSuggestions ?? []).map($0 => [$0.id, $0]));
  const materializedCandidatesByKind = makeLlmCurationSuggestionBackupCandidateMaps(backup);
  const generationScopes = new Set();

  assertBackupCollectionHasNoDuplicateIds(
    backup.llmCurationSuggestions ?? [],
    "llm_curation_suggestion_id_conflict",
  );
  assertBackupCollectionHasNoDuplicateIds(
    backup.llmCurationSuggestionGenerations ?? [],
    "llm_curation_suggestion_generation_id_conflict",
  );

  for (const suggestion of backup.llmCurationSuggestions ?? []) {
    if (!programShellsById.has(suggestion.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (
      !identitiesById.has(suggestion.createdByIdentityId) ||
      !identitiesById.has(suggestion.origin?.generatedByIdentityId) ||
      (suggestion.materializedByIdentityId !== null &&
        suggestion.materializedByIdentityId !== undefined &&
        !identitiesById.has(suggestion.materializedByIdentityId)) ||
      (suggestion.rejectedByIdentityId !== null &&
        suggestion.rejectedByIdentityId !== undefined &&
        !identitiesById.has(suggestion.rejectedByIdentityId))
    ) {
      throw new StorageInvariantError("identity_not_found");
    }

    assertLlmCurationSuggestionShape({
      suggestionKind: suggestion.suggestionKind,
      title: suggestion.title,
      summary: suggestion.summary,
      rationale: suggestion.rationale,
      suggestedDraft: suggestion.suggestedDraft,
      supportingEvidence: suggestion.supportingEvidence,
      origin: suggestion.origin,
      status: suggestion.status,
      materializedCandidateKind: suggestion.materializedCandidateKind ?? null,
      materializedCandidateId: suggestion.materializedCandidateId ?? null,
      materializedByIdentityId: suggestion.materializedByIdentityId ?? null,
      materializedAt: suggestion.materializedAt ?? null,
      rejectedByIdentityId: suggestion.rejectedByIdentityId ?? null,
      rejectedAt: suggestion.rejectedAt ?? null,
    });

    if (suggestion.status === "materialized") {
      assertLlmCurationSuggestionBackupMaterializedCandidate({
        programId: suggestion.programId,
        candidateKind: suggestion.materializedCandidateKind,
        candidateId: suggestion.materializedCandidateId,
        materializedCandidatesByKind,
      });
    }
  }

  for (const generation of backup.llmCurationSuggestionGenerations ?? []) {
    if (!programShellsById.has(generation.programId)) {
      throw new StorageInvariantError("program_not_found");
    }
    if (!identitiesById.has(generation.createdByIdentityId)) {
      throw new StorageInvariantError("identity_not_found");
    }
    if (!isNonEmptyString(generation.idempotencyKey) || !isNonEmptyString(generation.requestFingerprint)) {
      throw new StorageInvariantError("llm_curation_suggestion_generation_shape_invalid");
    }
    const scope = `${generation.programId}:${generation.idempotencyKey}`;
    if (generationScopes.has(scope)) {
      throw new StorageInvariantError("llm_curation_suggestion_generation_idempotency_conflict");
    }
    generationScopes.add(scope);

    assertLlmCurationSuggestionBackupGenerationIds({
      programId: generation.programId,
      suggestionIds: generation.suggestionIds,
      suggestionsById,
    });
  }
}

function makeLlmCurationSuggestionBackupCandidateMaps(backup) {
  return new Map([
    ["navigation_candidate", new Map((backup.corpusCandidates ?? []).map($0 => [$0.id, $0]))],
    ["quick_check_candidate", new Map((backup.quickCheckCandidates ?? []).map($0 => [$0.id, $0]))],
    [
      "assessment_criterion_candidate",
      new Map((backup.assessmentCriterionCandidates ?? []).map($0 => [$0.id, $0])),
    ],
    ["open_answer_check_candidate", new Map((backup.openAnswerCheckCandidates ?? []).map($0 => [$0.id, $0]))],
    ["readiness_check_candidate", new Map((backup.readinessCheckCandidates ?? []).map($0 => [$0.id, $0]))],
  ]);
}

function assertLlmCurationSuggestionBackupMaterializedCandidate({
  programId,
  candidateKind,
  candidateId,
  materializedCandidatesByKind,
}) {
  const candidatesById = materializedCandidatesByKind.get(candidateKind);
  if (!candidatesById) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_kind_invalid");
  }

  const candidate = candidatesById.get(candidateId);
  if (!candidate) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_not_found");
  }
  if (candidate.programId !== programId) {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_program_mismatch");
  }
  if (candidate.status !== "draft") {
    throw new StorageInvariantError("llm_curation_suggestion_materialized_candidate_not_draft");
  }
}

function assertLlmCurationSuggestionBackupGenerationIds({
  programId,
  suggestionIds,
  suggestionsById,
}) {
  if (!Array.isArray(suggestionIds)) {
    throw new StorageInvariantError("llm_curation_suggestion_generation_suggestions_invalid");
  }
  const ids = new Set();
  for (const suggestionId of suggestionIds) {
    if (!isNonEmptyString(suggestionId) || ids.has(suggestionId)) {
      throw new StorageInvariantError("llm_curation_suggestion_generation_suggestions_invalid");
    }
    ids.add(suggestionId);
    const suggestion = suggestionsById.get(suggestionId);
    if (!suggestion) {
      throw new StorageInvariantError("llm_curation_suggestion_not_found");
    }
    if (suggestion.programId !== programId) {
      throw new StorageInvariantError("llm_curation_suggestion_program_mismatch");
    }
  }
}

function assertBackupCollectionHasNoDuplicateIds(records, reason) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new StorageInvariantError(reason);
    }
    ids.add(record.id);
  }
}

function assertReadinessBackupScope({ programId, scope, acceptedCorpusEntitiesById }) {
  if (scope?.scopeKind === "topic") {
    assertReadinessBackupAcceptedCorpusTarget({
      programId,
      targetKind: "topic",
      targetId: scope.topicEntityId,
      acceptedCorpusEntitiesById,
      notFoundReason: "readiness_scope_not_found",
      mismatchReason: "readiness_scope_program_mismatch",
    });
    return;
  }

  if (scope?.scopeKind === "period") {
    if (typeof scope.title !== "string" || scope.title.length === 0) {
      throw new StorageInvariantError("readiness_scope_invalid");
    }
    if (!Array.isArray(scope.topicEntityIds) || scope.topicEntityIds.length === 0) {
      throw new StorageInvariantError("readiness_scope_invalid");
    }
    const topicEntityIds = new Set();
    for (const topicEntityId of scope.topicEntityIds) {
      if (topicEntityIds.has(topicEntityId)) {
        throw new StorageInvariantError("readiness_scope_invalid");
      }
      topicEntityIds.add(topicEntityId);
      assertReadinessBackupAcceptedCorpusTarget({
        programId,
        targetKind: "topic",
        targetId: topicEntityId,
        acceptedCorpusEntitiesById,
        notFoundReason: "readiness_scope_not_found",
        mismatchReason: "readiness_scope_program_mismatch",
      });
    }
    return;
  }

  throw new StorageInvariantError("readiness_scope_invalid");
}

function assertReadinessBackupRequirements({
  programId,
  requirements,
  acceptedCorpusEntitiesById,
  quickCheckEntitiesById,
  openAnswerCheckEntitiesById,
  criterionEntitiesById,
}) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new StorageInvariantError("readiness_requirements_invalid");
  }

  const requirementIds = new Set();
  for (const requirement of requirements) {
    if (requirementIds.has(requirement.requirementId)) {
      throw new StorageInvariantError("readiness_requirement_id_conflict");
    }
    requirementIds.add(requirement.requirementId);
    if (!["developing", "on_track"].includes(requirement.requiredLevel)) {
      throw new StorageInvariantError("readiness_required_level_invalid");
    }
    assertReadinessBackupRequirementTarget({
      programId,
      requirement,
      acceptedCorpusEntitiesById,
      quickCheckEntitiesById,
      openAnswerCheckEntitiesById,
      criterionEntitiesById,
    });
  }
}

function assertReadinessBackupRequirementTarget({
  programId,
  requirement,
  acceptedCorpusEntitiesById,
  quickCheckEntitiesById,
  openAnswerCheckEntitiesById,
  criterionEntitiesById,
}) {
  if (["topic", "concept", "material_reference"].includes(requirement.targetKind)) {
    assertReadinessBackupAcceptedCorpusTarget({
      programId,
      targetKind: requirement.targetKind,
      targetId: requirement.targetId,
      acceptedCorpusEntitiesById,
      notFoundReason: "readiness_requirement_target_not_found",
      mismatchReason: "readiness_requirement_program_mismatch",
    });
    return;
  }

  const target = getReadinessBackupEvidenceOwnerEntity({
    requirement,
    quickCheckEntitiesById,
    openAnswerCheckEntitiesById,
    criterionEntitiesById,
  });
  if (!target) {
    throw new StorageInvariantError("readiness_requirement_target_not_found");
  }
  if (target.programId !== programId) {
    throw new StorageInvariantError("readiness_requirement_program_mismatch");
  }
}

function assertReadinessBackupAcceptedCorpusTarget({
  programId,
  targetKind,
  targetId,
  acceptedCorpusEntitiesById,
  notFoundReason,
  mismatchReason,
}) {
  const target = acceptedCorpusEntitiesById.get(targetId);
  if (!target) {
    throw new StorageInvariantError(notFoundReason);
  }
  if (target.programId !== programId) {
    throw new StorageInvariantError(mismatchReason);
  }
  if (target.acceptedKind !== targetKind) {
    throw new StorageInvariantError("readiness_target_kind_invalid");
  }
}

function getReadinessBackupEvidenceOwnerEntity({
  requirement,
  quickCheckEntitiesById,
  openAnswerCheckEntitiesById,
  criterionEntitiesById,
}) {
  if (requirement.targetKind === "quick_check") {
    return quickCheckEntitiesById.get(requirement.targetId);
  }
  if (requirement.targetKind === "open_answer_check") {
    return openAnswerCheckEntitiesById.get(requirement.targetId);
  }
  if (requirement.targetKind === "assessment_criterion") {
    return criterionEntitiesById.get(requirement.targetId);
  }
  throw new StorageInvariantError("readiness_requirement_target_kind_invalid");
}

function getLearnerEvidenceTargetLinkBackupEvidenceOwner({
  link,
  quickCheckEntitiesById,
  openAnswerCheckEntitiesById,
  criterionEntitiesById,
}) {
  if (link.evidenceOwnerKind === "accepted_quick_check") {
    const entity = quickCheckEntitiesById.get(link.evidenceOwnerEntityId);
    if (!entity) {
      throw new StorageInvariantError("quick_check_entity_not_found");
    }
    return entity;
  }
  if (link.evidenceOwnerKind === "accepted_open_answer_check") {
    const entity = openAnswerCheckEntitiesById.get(link.evidenceOwnerEntityId);
    if (!entity) {
      throw new StorageInvariantError("check_entity_not_found");
    }
    return entity;
  }

  const entity = criterionEntitiesById.get(link.evidenceOwnerEntityId);
  if (!entity) {
    throw new StorageInvariantError("criterion_entity_not_found");
  }
  return entity;
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

    assertNoForbiddenEvaluatorArtifactBackup(evaluation);
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

    assertNoForbiddenEvaluatorArtifactBackup(evaluatorRun);
    assertEvaluatorRunMatchesAttemptBackup(evaluatorRun, attempt);
    assertEvaluatorRunAttributionBackup(evaluatorRun, identitiesById);
    assertEvaluatorJobOrchestrationBackup(evaluatorRun, attempt);
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
    assertNoForbiddenEvaluatorArtifactBackup(evidence);
    assertEvaluatorEvidenceBackup(evidence);
  }
}

function assertEvaluatorJobOrchestrationBackup(evaluatorRun, attempt) {
  const jobFields = [
    evaluatorRun.jobStatus,
    evaluatorRun.attemptNumber,
    evaluatorRun.retryPolicy,
    evaluatorRun.budgetPolicy,
    evaluatorRun.leaseId,
    evaluatorRun.workerId,
    evaluatorRun.leaseClaimedAt,
    evaluatorRun.leaseExpiresAt,
    evaluatorRun.nextRetryAt,
    evaluatorRun.cancellationReason,
    evaluatorRun.timeoutReason,
    evaluatorRun.jobFailureReason,
    evaluatorRun.terminalCompletionSignature,
    evaluatorRun.jobCreatedAt,
    evaluatorRun.jobUpdatedAt,
  ];
  if (jobFields.every($0 => $0 === undefined || $0 === null)) {
    return;
  }

  const retryPolicy = evaluatorRun.retryPolicy ?? null;
  const budgetPolicy = evaluatorRun.budgetPolicy ?? null;
  const leaseId = evaluatorRun.leaseId ?? null;
  const workerId = evaluatorRun.workerId ?? null;
  const leaseClaimedAt = evaluatorRun.leaseClaimedAt ?? null;
  const leaseExpiresAt = evaluatorRun.leaseExpiresAt ?? null;

  assertOpenAnswerEvaluatorJobState({
    jobStatus: evaluatorRun.jobStatus ?? null,
    attemptNumber: evaluatorRun.attemptNumber ?? null,
    retryPolicy,
    budgetPolicy,
    leaseId,
    workerId,
    leaseClaimedAt,
    leaseExpiresAt,
  });
  if (!isValidTerminalCompletionSignature(evaluatorRun.terminalCompletionSignature ?? null)) {
    throw new StorageInvariantError("validation_failed");
  }
  if (!isNonEmptyString(evaluatorRun.jobCreatedAt) || !isNonEmptyString(evaluatorRun.jobUpdatedAt)) {
    throw new StorageInvariantError("validation_failed");
  }
  if (attempt.status === "submitted" && evaluatorRun.jobStatus !== "cancelled") {
    throw new StorageInvariantError("attempt_status_mismatch");
  }
  if (attempt.status === "evaluated" && evaluatorRun.jobStatus !== "succeeded") {
    throw new StorageInvariantError("attempt_status_mismatch");
  }
  if (
    attempt.status === "evaluation_failed" &&
    !["failed", "cancelled", "timed_out"].includes(evaluatorRun.jobStatus)
  ) {
    throw new StorageInvariantError("attempt_status_mismatch");
  }
  if (
    attempt.status === "evaluating" &&
    !["waiting", "leased", "retry_waiting"].includes(evaluatorRun.jobStatus)
  ) {
    throw new StorageInvariantError("attempt_status_mismatch");
  }
  if (
    ["retry_waiting", "failed", "timed_out", "cancelled"].includes(evaluatorRun.jobStatus) &&
    !isValidOpenAnswerEvaluatorRecoveryState({
      runStatus: evaluatorRun.status,
      jobStatus: evaluatorRun.jobStatus,
      nextRetryAt: evaluatorRun.nextRetryAt ?? null,
      cancellationReason: evaluatorRun.cancellationReason ?? null,
      timeoutReason: evaluatorRun.timeoutReason ?? null,
      jobFailureReason: evaluatorRun.jobFailureReason ?? null,
    })
  ) {
    throw new StorageInvariantError("validation_failed");
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

function assertNoForbiddenEvaluatorArtifactBackup(record) {
  if (containsForbiddenEvaluatorArtifactBackup(record)) {
    throw new StorageInvariantError("validation_failed");
  }
}

function containsForbiddenEvaluatorArtifactBackup(value, key = null) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return (
      evaluatorArtifactTextKeys.has(normalizeEvaluatorArtifactKey(key ?? "")) &&
      containsForbiddenResponseDetail(value)
    );
  }
  if (Array.isArray(value)) {
    return value.some(entry => containsForbiddenEvaluatorArtifactBackup(entry, key));
  }
  if (typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(
    ([key, entryValue]) =>
      forbiddenEvaluatorArtifactKeys.has(normalizeEvaluatorArtifactKey(key)) ||
      containsForbiddenEvaluatorArtifactBackup(entryValue, key),
  );
}

function normalizeEvaluatorArtifactKey(key) {
  return key.toLowerCase().replace(/[^a-z]/g, "");
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
