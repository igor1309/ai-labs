// Seeded from the pre-automation OpenAPI contract during implementation.
// Keep this file as the source for route-level OpenAPI generation and routing inventory.

export const openApiContractMetadata = {
  "openapi": "3.1.0",
  "info": {
    "title": "Agonara API",
    "version": "0.1.0",
    "summary": "API-first structured learning program environment.",
    "description": "Canonical route-level OpenAPI contract for implemented Agonara HTTP surfaces. Detailed domain field semantics remain governed by the linked Agonara Markdown specs; this contract locks routes, transport security, shared envelopes, request headers, status families, and client-facing operation names.\n",
    "license": {
      "name": "Private",
      "identifier": "LicenseRef-Private"
    }
  },
  "servers": [
    {
      "url": "http://127.0.0.1:8080",
      "description": "Local container or development server"
    },
    {
      "url": "https://staging.agonara.enoa.ai",
      "description": "Private staging instance"
    }
  ],
  "tags": [
    {
      "name": "operations",
      "description": "Health, diagnostics, and operator-triggered runtime work."
    },
    {
      "name": "identity",
      "description": "Bootstrap, sessions, identities, Admin authority, and audit inspection."
    },
    {
      "name": "programs",
      "description": "Program shell, participation, invitations, participants, and membership recovery."
    },
    {
      "name": "corpus",
      "description": "Sources, candidates, accepted corpus, navigation, checks, and target links."
    },
    {
      "name": "student-workspace",
      "description": "Student-owned attempts, learner state, readiness, and evidence reads."
    },
    {
      "name": "curator-workspace",
      "description": "Curator-only diagnostics and LLM-assisted draft suggestions."
    },
    {
      "name": "ui",
      "description": "HTML shells that consume the API."
    }
  ],
  "security": [
    {
      "sessionCookie": []
    }
  ],
  "components": {
    "securitySchemes": {
      "sessionCookie": {
        "type": "apiKey",
        "in": "cookie",
        "name": "agonara_session",
        "description": "Server-managed opaque session cookie."
      },
      "csrfHeader": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Agonara-CSRF",
        "description": "Required for state-changing session-backed requests."
      },
      "idempotencyKey": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Agonara-Idempotency-Key",
        "description": "Required for Student attempt submissions; never returned by the API."
      },
      "operationsTriggerToken": {
        "type": "http",
        "scheme": "bearer",
        "description": "Optional host-configured operations trigger token."
      }
    },
    "headers": {
      "SessionCookie": {
        "description": "Server-managed `agonara_session` cookie.",
        "schema": {
          "type": "string"
        }
      }
    },
    "parameters": {
      "ProgramId": {
        "name": "programId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "IdentityId": {
        "name": "identityId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "IdentityIdQuery": {
        "name": "identityId",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "CandidateId": {
        "name": "candidateId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "RevisionId": {
        "name": "revisionId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "EntityId": {
        "name": "entityId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "AttemptId": {
        "name": "attemptId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "InvitationId": {
        "name": "invitationId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "SuggestionId": {
        "name": "suggestionId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "TargetLinkId": {
        "name": "targetLinkId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "TargetKind": {
        "name": "targetKind",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "enum": [
            "topic",
            "concept",
            "material",
            "check",
            "readiness_check"
          ]
        }
      },
      "TargetId": {
        "name": "targetId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "ParticipationKind": {
        "name": "participationKind",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "enum": [
            "student",
            "program_curator"
          ]
        }
      },
      "ParticipationKindQuery": {
        "name": "participationKind",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "student",
            "program_curator"
          ]
        }
      },
      "Limit": {
        "name": "limit",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "Cursor": {
        "name": "cursor",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "CandidateStatus": {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "$ref": "#/components/schemas/CandidateStatus"
        }
      },
      "InvitationStatus": {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "pending",
            "accepted",
            "declined",
            "revoked"
          ]
        }
      },
      "MembershipStatus": {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "active",
            "left",
            "removed"
          ]
        }
      },
      "AcceptedKind": {
        "name": "acceptedKind",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "topic",
            "concept"
          ]
        }
      },
      "CheckRevisionId": {
        "name": "checkRevisionId",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "ReadinessCheckRevisionId": {
        "name": "readinessCheckRevisionId",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "CoverageGapScopeKind": {
        "name": "scopeKind",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "program",
            "topic",
            "period"
          ]
        }
      },
      "CoverageGapScopeId": {
        "name": "scopeId",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "CoverageGapMinimumSeverity": {
        "name": "minimumSeverity",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "info",
            "warning",
            "critical"
          ]
        }
      },
      "CoverageGapKind": {
        "name": "gapKind",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "LlmSuggestionStatus": {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "draft_suggestion",
            "materialized",
            "rejected"
          ]
        }
      },
      "LlmSuggestionKind": {
        "name": "suggestionKind",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "navigation_candidate",
            "quick_check_candidate",
            "assessment_criterion_candidate",
            "open_answer_check_candidate",
            "readiness_check_candidate"
          ]
        }
      }
    },
    "requestBodies": {
      "SetSourceContent": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": ["content", "contentFormat"],
              "properties": {
                "content": { "type": "string", "minLength": 1 },
                "contentFormat": { "type": "string", "enum": ["markdown", "plain_text"] }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "SetAcceptedMaterialContent": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": ["content", "contentFormat"],
              "properties": {
                "content": { "type": "string", "minLength": 1 },
                "contentFormat": { "type": "string", "enum": ["markdown", "plain_text"] },
                "sourceContentProvenance": { "type": "object", "additionalProperties": true }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "LifecycleStatus": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": ["status"],
              "properties": {
                "status": { "type": "string", "enum": ["active", "withdrawn"] }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "OptionalObject": {
        "required": false,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "EvaluatorTick": {
        "required": false,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "evaluatorJobId": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "IdentityBootstrap": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "bootstrapSecret",
                "displayName",
                "login",
                "password"
              ],
              "properties": {
                "bootstrapSecret": {
                  "type": "string",
                  "minLength": 1
                },
                "displayName": {
                  "type": "string",
                  "minLength": 1
                },
                "login": {
                  "type": "string",
                  "minLength": 1
                },
                "password": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "Login": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "login",
                "password"
              ],
              "properties": {
                "login": {
                  "type": "string",
                  "minLength": 1
                },
                "password": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "DisplayName": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "displayName"
              ],
              "properties": {
                "displayName": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "LocalPassword": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "login",
                "password"
              ],
              "properties": {
                "login": {
                  "type": "string",
                  "minLength": 1
                },
                "password": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "CreateProgram": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "title"
              ],
              "properties": {
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "description": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "AdmissionPolicy": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "admissionPolicy"
              ],
              "properties": {
                "admissionPolicy": {
                  "type": "string",
                  "enum": [
                    "self_join",
                    "invitation_only"
                  ]
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "CreateInvitation": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "participationKind",
                "targetIdentityId"
              ],
              "properties": {
                "participationKind": {
                  "type": "string",
                  "const": "student"
                },
                "targetIdentityId": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "MembershipRecovery": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "programId",
                "targetIdentityId",
                "participationKind",
                "recoveryReason"
              ],
              "properties": {
                "programId": {
                  "type": "string",
                  "minLength": 1
                },
                "targetIdentityId": {
                  "type": "string",
                  "minLength": 1
                },
                "participationKind": {
                  "type": "string",
                  "enum": [
                    "student",
                    "program_curator"
                  ]
                },
                "recoveryReason": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "MembershipRevocation": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "programId",
                "targetIdentityId",
                "participationKind",
                "revocationReason"
              ],
              "properties": {
                "programId": {
                  "type": "string",
                  "minLength": 1
                },
                "targetIdentityId": {
                  "type": "string",
                  "minLength": 1
                },
                "participationKind": {
                  "type": "string",
                  "enum": [
                    "student",
                    "program_curator"
                  ]
                },
                "revocationReason": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "ProgramSource": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "sourceKind",
                "title"
              ],
              "properties": {
                "sourceKind": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "locator": {
                  "type": "string"
                },
                "citation": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "CorpusCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "candidateKind",
                "title"
              ],
              "properties": {
                "candidateKind": {
                  "type": "string",
                  "minLength": 1
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "body": {
                  "type": "string"
                },
                "sourceIds": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1
                  }
                },
                "rationale": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "TargetEntity": {
        "required": false,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "targetEntityId": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "NavigationCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "AssessmentCriterionCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "OpenAnswerCheckCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "QuickCheckCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "ReadinessCheckCandidate": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "LearnerStateTargetLink": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "OpenAnswerAttempt": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "checkRevisionId",
                "submittedAnswer"
              ],
              "properties": {
                "checkRevisionId": {
                  "type": "string",
                  "minLength": 1
                },
                "submittedAnswer": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "QuickCheckAttempt": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "checkRevisionId",
                "selectedOptionId"
              ],
              "properties": {
                "checkRevisionId": {
                  "type": "string",
                  "minLength": 1
                },
                "selectedOptionId": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "ReadinessCheckAttempt": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "readinessCheckRevisionId"
              ],
              "properties": {
                "readinessCheckRevisionId": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "additionalProperties": false
            }
          }
        }
      },
      "LlmCurationSuggestionGeneration": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      }
    },
    "responses": {
      "Accepted": {
        "description": "Operation accepted.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/AcceptedObjectResult"
            }
          }
        }
      },
      "Rejected": {
        "description": "Operation rejected by validation, session, authorization, or domain policy.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/RejectedResult"
            }
          }
        }
      },
      "Fault": {
        "description": "Unexpected fault; details are redacted.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/FaultResult"
            }
          }
        }
      },
      "Html": {
        "description": "HTML shell.",
        "content": {
          "text/html": {
            "schema": {
              "type": "string"
            }
          }
        }
      }
    },
    "schemas": {
      "AcceptedObjectResult": {
        "type": "object",
        "required": [
          "status",
          "value"
        ],
        "properties": {
          "status": {
            "type": "string",
            "const": "accepted"
          },
          "value": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "additionalProperties": false
      },
      "RejectedResult": {
        "type": "object",
        "required": [
          "status",
          "reason"
        ],
        "properties": {
          "status": {
            "type": "string",
            "const": "rejected"
          },
          "reason": {
            "$ref": "#/components/schemas/ApiRejectionReason"
          }
        },
        "additionalProperties": false
      },
      "FaultResult": {
        "type": "object",
        "required": [
          "status",
          "reason"
        ],
        "properties": {
          "status": {
            "type": "string",
            "const": "fault"
          },
          "reason": {
            "type": "string",
            "const": "internal_error"
          }
        },
        "additionalProperties": false
      },
      "HealthResult": {
        "type": "object",
        "required": [
          "status",
          "checkedAt",
          "requestId",
          "version"
        ],
        "properties": {
          "status": {
            "type": "string",
            "const": "ok"
          },
          "checkedAt": {
            "type": "string",
            "format": "date-time"
          },
          "requestId": {
            "type": "string"
          },
          "version": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "CandidateStatus": {
        "type": "string",
        "enum": [
          "draft",
          "accepted",
          "rejected"
        ]
      },
      "ApiRejectionReason": {
        "type": "string",
        "enum": [
          "accepted_entity_not_found",
          "accepted_entity_program_mismatch",
          "accepted_kind_mismatch",
          "accepted_revision_not_found",
          "admin_or_curator_required",
          "admin_required",
          "attempt_not_found",
          "bootstrap_already_completed",
          "candidate_already_accepted",
          "candidate_already_rejected",
          "candidate_not_found",
          "check_candidate_already_accepted",
          "check_candidate_already_rejected",
          "check_candidate_not_found",
          "check_entity_not_found",
          "check_entity_program_mismatch",
          "check_revision_not_found",
          "check_revision_program_mismatch",
          "content_not_found",
          "content_too_large",
          "coverage_gap_not_found",
          "coverage_gap_scope_not_found",
          "coverage_gap_scope_program_mismatch",
          "criterion_candidate_already_accepted",
          "criterion_candidate_already_rejected",
          "criterion_candidate_not_found",
          "criterion_entity_not_found",
          "criterion_entity_program_mismatch",
          "criterion_revision_not_found",
          "csrf_invalid",
          "csrf_required",
          "entity_withdrawal_blocked",
          "idempotency_conflict",
          "identity_already_has_credential",
          "identity_disabled",
          "identity_not_active",
          "identity_not_found",
          "invalid_bootstrap_secret",
          "invalid_credentials",
          "invitation_conflict",
          "invitation_not_found",
          "invitation_not_pending",
          "last_admin_removal",
          "last_curator_required",
          "learner_state_evidence_owner_not_found",
          "learner_state_evidence_owner_program_mismatch",
          "learner_state_target_link_not_found",
          "learner_state_target_not_found",
          "learner_state_target_program_mismatch",
          "llm_curation_suggestion_already_materialized",
          "llm_curation_suggestion_already_rejected",
          "llm_curation_suggestion_not_found",
          "login_already_bound",
          "material_content_already_set",
          "membership_already_active",
          "membership_left",
          "membership_missing",
          "membership_removed",
          "navigation_entity_not_found",
          "navigation_prerequisite_cycle",
          "navigation_relationship_endpoint_kind_mismatch",
          "navigation_relationship_program_mismatch",
          "navigation_relationship_self_reference",
          "navigation_revision_not_found",
          "not_found",
          "participation_required",
          "policy_not_satisfied",
          "program_creation_incomplete",
          "program_curator_required",
          "program_not_found",
          "provider_adapter_not_found",
          "provider_budget_exceeded",
          "provider_execution_failed",
          "provider_output_rejected",
          "quick_check_candidate_already_accepted",
          "quick_check_candidate_already_rejected",
          "quick_check_candidate_not_found",
          "quick_check_entity_not_found",
          "quick_check_entity_program_mismatch",
          "quick_check_revision_not_found",
          "quick_check_revision_program_mismatch",
          "rate_limited",
          "readiness_candidate_already_accepted",
          "readiness_candidate_already_rejected",
          "readiness_candidate_not_found",
          "readiness_entity_not_found",
          "readiness_entity_program_mismatch",
          "readiness_requirement_id_conflict",
          "readiness_requirement_program_mismatch",
          "readiness_requirement_target_not_found",
          "readiness_revision_not_found",
          "readiness_revision_program_mismatch",
          "readiness_scope_not_found",
          "readiness_scope_program_mismatch",
          "revision_not_found",
          "selected_option_not_found",
          "session_expired",
          "session_not_found",
          "session_revoked",
          "source_not_found",
          "source_hard_delete_blocked",
          "source_program_mismatch",
          "suggestion_materialization_rejected",
          "suggestion_policy_not_found",
          "suggestion_rejection_failed",
          "target_identity_disabled",
          "target_identity_not_found",
          "unsupported_participation_kind",
          "validation_failed",
          "worker_already_running"
        ]
      }
    }
  }
};

export const routeContracts = [
  {
    "method": "GET",
    "path": "/operations/health",
    "operationId": "getOperationsHealth",
    "handlerKey": "operations.health.getOperationsHealth",
    "tag": "operations",
    "summary": "Read service health and deployed version.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "health",
        "schema": {
          "ref": "#/components/schemas/HealthResult"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/operations/diagnostics",
    "operationId": "getOperationsDiagnostics",
    "handlerKey": "operations.diagnostics.getOperationsDiagnostics",
    "tag": "operations",
    "summary": "Read Admin-only operational diagnostics.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "POST",
    "path": "/operations/open-answer-evaluator/tick",
    "operationId": "tickOpenAnswerEvaluator",
    "handlerKey": "operations.openAnswerEvaluatorTick.tickOpenAnswerEvaluator",
    "tag": "operations",
    "summary": "Trigger one open-answer evaluator worker tick.",
    "auth": {
      "kind": "session-or-operations-trigger-token"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/EvaluatorTick"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/admin",
    "operationId": "getAdminBoard",
    "handlerKey": "ui.admin.getAdminBoard",
    "tag": "ui",
    "summary": "Serve the private Admin operations board HTML shell.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "html",
        "schema": {
          "ref": "#/components/responses/Html"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/learn",
    "operationId": "getLearnShell",
    "handlerKey": "ui.learn.getLearnShell",
    "tag": "ui",
    "summary": "Serve the learner and curator product HTML shell.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "html",
        "schema": {
          "ref": "#/components/responses/Html"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/identity/bootstrap/status",
    "operationId": "getIdentityBootstrapStatus",
    "handlerKey": "identity.getIdentityBootstrapStatus",
    "tag": "identity",
    "summary": "Read whether first-Admin bootstrap remains available.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "POST",
    "path": "/identity/bootstrap/admin",
    "operationId": "bootstrapFirstAdmin",
    "handlerKey": "identity.bootstrapFirstAdmin",
    "tag": "identity",
    "summary": "Bootstrap the first Admin while no effective Admin exists.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/schemas/AcceptedObjectResult"
        },
        "headers": {
          "Set-Cookie": {
            "ref": "#/components/headers/SessionCookie"
          }
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 429,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/IdentityBootstrap"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/identity/sessions",
    "operationId": "createIdentitySession",
    "handlerKey": "identity.createIdentitySession",
    "tag": "identity",
    "summary": "Sign in with a local password credential.",
    "auth": {
      "kind": "none"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/schemas/AcceptedObjectResult"
        },
        "headers": {
          "Set-Cookie": {
            "ref": "#/components/headers/SessionCookie"
          }
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 429,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/Login"
      },
      "required": false
    }
  },
  {
    "method": "DELETE",
    "path": "/identity/session",
    "operationId": "deleteIdentitySession",
    "handlerKey": "identity.deleteIdentitySession",
    "tag": "identity",
    "summary": "Sign out the current session.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/schemas/AcceptedObjectResult"
        },
        "headers": {
          "Set-Cookie": {
            "ref": "#/components/headers/SessionCookie"
          }
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/identity/session",
    "operationId": "getIdentitySession",
    "handlerKey": "identity.getIdentitySession",
    "tag": "identity",
    "summary": "Resolve the current session and return a CSRF token.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/identity/identities",
    "operationId": "listIdentities",
    "handlerKey": "identity.listIdentities",
    "tag": "identity",
    "summary": "List identities for an Admin session.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "POST",
    "path": "/identity/identities",
    "operationId": "createIdentity",
    "handlerKey": "identity.createIdentity",
    "tag": "identity",
    "summary": "Create an identity as an Admin.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/DisplayName"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/identity/identities/{identityId}/local-password",
    "operationId": "bindLocalPasswordCredential",
    "handlerKey": "identity.bindLocalPasswordCredential",
    "tag": "identity",
    "summary": "Bind a local password credential to an identity.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/LocalPassword"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/identity/identities/{identityId}/disable",
    "operationId": "disableIdentity",
    "handlerKey": "identity.disableIdentity",
    "tag": "identity",
    "summary": "Disable an identity as an Admin.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "DELETE",
    "path": "/identity/identities/{identityId}/admin",
    "operationId": "revokeAdmin",
    "handlerKey": "identity.revokeAdmin",
    "tag": "identity",
    "summary": "Revoke Admin authority.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/identity/identities/{identityId}/admin",
    "operationId": "grantAdmin",
    "handlerKey": "identity.grantAdmin",
    "tag": "identity",
    "summary": "Grant Admin authority.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/identity/identities/{identityId}/operational-access",
    "operationId": "getOperationalAccess",
    "handlerKey": "identity.getOperationalAccess",
    "tag": "identity",
    "summary": "Inspect an identity's operational access.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/identity/audit-events",
    "operationId": "listAuditEvents",
    "handlerKey": "identity.listAuditEvents",
    "tag": "identity",
    "summary": "List redacted identity and operations audit events.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs",
    "operationId": "listPrograms",
    "handlerKey": "program.listPrograms",
    "tag": "programs",
    "summary": "List Program shells visible to the current session.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs",
    "operationId": "createProgram",
    "handlerKey": "program.createProgram",
    "tag": "programs",
    "summary": "Create a Program shell and initial curator membership.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/CreateProgram"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}",
    "operationId": "getProgram",
    "handlerKey": "program.getProgram",
    "tag": "programs",
    "summary": "Read a Program shell.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/participation/{participationKind}",
    "operationId": "getEffectiveParticipation",
    "handlerKey": "program.getEffectiveParticipation",
    "tag": "programs",
    "summary": "Read effective participation for the current or target identity.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      },
      {
        "name": "participationKind",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/program-memberships/me",
    "operationId": "listMyProgramMemberships",
    "handlerKey": "program.listMyProgramMemberships",
    "tag": "programs",
    "summary": "List memberships owned by the current identity.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "DELETE",
    "path": "/programs/{programId}/student-membership",
    "operationId": "leaveProgramAsStudent",
    "handlerKey": "program.leaveProgramAsStudent",
    "tag": "programs",
    "summary": "Leave a Program as a Student.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/student-membership",
    "operationId": "joinProgramAsStudent",
    "handlerKey": "program.joinProgramAsStudent",
    "tag": "programs",
    "summary": "Join or rejoin a self-join Program as a Student.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/events",
    "operationId": "listProgramEvents",
    "handlerKey": "program.listProgramEvents",
    "tag": "programs",
    "summary": "List Program events for an Admin or Program Curator.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/membership-events",
    "operationId": "listProgramMembershipEvents",
    "handlerKey": "program.listProgramMembershipEvents",
    "tag": "programs",
    "summary": "List Program Membership events for an Admin or Program Curator.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PATCH",
    "path": "/programs/{programId}/admission-policy",
    "operationId": "updateProgramAdmissionPolicy",
    "handlerKey": "program.updateProgramAdmissionPolicy",
    "tag": "programs",
    "summary": "Update Program admission policy.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/AdmissionPolicy"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/invitations",
    "operationId": "listProgramInvitations",
    "handlerKey": "program.listProgramInvitations",
    "tag": "programs",
    "summary": "List Program invitations for a Program Curator.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/invitations",
    "operationId": "createProgramInvitation",
    "handlerKey": "program.createProgramInvitation",
    "tag": "programs",
    "summary": "Create a Student-targeted Program invitation.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/CreateInvitation"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/program-invitations/me",
    "operationId": "listMyProgramInvitations",
    "handlerKey": "program.listMyProgramInvitations",
    "tag": "programs",
    "summary": "List invitations addressed to the current Student identity.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ]
  },
  {
    "method": "POST",
    "path": "/program-invitations/{invitationId}/acceptance",
    "operationId": "acceptProgramInvitation",
    "handlerKey": "program.acceptProgramInvitation",
    "tag": "programs",
    "summary": "Accept a Program invitation addressed to the current Student.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "invitationId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/program-invitations/{invitationId}/decline",
    "operationId": "declineProgramInvitation",
    "handlerKey": "program.declineProgramInvitation",
    "tag": "programs",
    "summary": "Decline a Program invitation addressed to the current Student.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "invitationId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/program-invitations/{invitationId}/revocation",
    "operationId": "revokeProgramInvitation",
    "handlerKey": "program.revokeProgramInvitation",
    "tag": "programs",
    "summary": "Revoke a pending Program invitation.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "invitationId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/participants",
    "operationId": "listProgramParticipants",
    "handlerKey": "program.listProgramParticipants",
    "tag": "programs",
    "summary": "List Program participants for a Program Curator or Admin.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "DELETE",
    "path": "/programs/{programId}/participants/student/{identityId}",
    "operationId": "removeProgramStudent",
    "handlerKey": "program.removeProgramStudent",
    "tag": "programs",
    "summary": "Remove a Student participant from a Program.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      },
      {
        "name": "identityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "DELETE",
    "path": "/programs/{programId}/curator-membership",
    "operationId": "leaveProgramAsCurator",
    "handlerKey": "program.leaveProgramAsCurator",
    "tag": "programs",
    "summary": "Leave a Program as a Program Curator.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/admin/program-memberships/recovery",
    "operationId": "recoverProgramMembership",
    "handlerKey": "program.recoverProgramMembership",
    "tag": "programs",
    "summary": "Admin-only exceptional Program Membership recovery.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/MembershipRecovery"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/admin/program-memberships/revocation",
    "operationId": "revokeProgramMembership",
    "handlerKey": "program.revokeProgramMembership",
    "tag": "programs",
    "summary": "Admin-only exceptional Program Membership revocation.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/MembershipRevocation"
      },
      "required": false
    }
  },
  {
    "method": "PUT",
    "path": "/sources/{sourceId}/content",
    "operationId": "setSourceContent",
    "handlerKey": "corpus.setSourceContent",
    "tag": "corpus",
    "summary": "Set or replace a Program source's stored content.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/SetSourceContent" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "sourceId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/sources/{sourceId}/content",
    "operationId": "readSourceContent",
    "handlerKey": "corpus.readSourceContent",
    "tag": "corpus",
    "summary": "Read a Program source's stored content (curator only).",
    "auth": { "kind": "session" },
    "queryParameters": [
      { "name": "limit", "required": false, "schema": { "type": "integer", "minimum": 1, "maximum": 1048576 } },
      { "name": "cursor", "required": false, "schema": { "type": "string", "minLength": 1 } }
    ],
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "sourceId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "DELETE",
    "path": "/sources/{sourceId}/content",
    "operationId": "deleteSourceContent",
    "handlerKey": "corpus.deleteSourceContent",
    "tag": "corpus",
    "summary": "Hard-delete a Program source's stored content (curator only).",
    "auth": { "kind": "session", "csrf": true },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "sourceId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "PUT",
    "path": "/sources/{sourceId}/status",
    "operationId": "setProgramSourceLifecycleStatus",
    "handlerKey": "corpus.setProgramSourceLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate a Program source record.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "sourceId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "DELETE",
    "path": "/sources/{sourceId}",
    "operationId": "deleteProgramSource",
    "handlerKey": "corpus.deleteProgramSource",
    "tag": "corpus",
    "summary": "Hard-delete an unreferenced Program source record.",
    "auth": { "kind": "session", "csrf": true },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "sourceId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "PUT",
    "path": "/materials/revisions/{revisionId}/content",
    "operationId": "setAcceptedMaterialContent",
    "handlerKey": "corpus.setAcceptedMaterialContent",
    "tag": "corpus",
    "summary": "Set accepted material content on a material reference revision (curator only).",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/SetAcceptedMaterialContent" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "revisionId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/materials/{entityId}/content",
    "operationId": "readMaterialContent",
    "handlerKey": "corpus.readMaterialContent",
    "tag": "corpus",
    "summary": "Read accepted material content for a material entity's current revision.",
    "auth": { "kind": "session" },
    "queryParameters": [
      { "name": "limit", "required": false, "schema": { "type": "integer", "minimum": 1, "maximum": 1048576 } },
      { "name": "cursor", "required": false, "schema": { "type": "string", "minLength": 1 } }
    ],
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/materials/revisions/{revisionId}/content",
    "operationId": "readMaterialRevisionContent",
    "handlerKey": "corpus.readMaterialRevisionContent",
    "tag": "corpus",
    "summary": "Read accepted material content for a specific material reference revision.",
    "auth": { "kind": "session" },
    "queryParameters": [
      { "name": "limit", "required": false, "schema": { "type": "integer", "minimum": 1, "maximum": 1048576 } },
      { "name": "cursor", "required": false, "schema": { "type": "string", "minLength": 1 } }
    ],
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "revisionId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/sources",
    "operationId": "listProgramSources",
    "handlerKey": "corpus.listProgramSources",
    "tag": "corpus",
    "summary": "List Program sources.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/sources",
    "operationId": "recordProgramSource",
    "handlerKey": "corpus.recordProgramSource",
    "tag": "corpus",
    "summary": "Record a Program source for curator review.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/ProgramSource"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/corpus-candidates",
    "operationId": "listCorpusCandidates",
    "handlerKey": "corpus.listCorpusCandidates",
    "tag": "corpus",
    "summary": "List Corpus candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/corpus-candidates",
    "operationId": "createCorpusCandidate",
    "handlerKey": "corpus.createCorpusCandidate",
    "tag": "corpus",
    "summary": "Create a Corpus candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/CorpusCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/corpus-candidates/{candidateId}/acceptance",
    "operationId": "acceptCorpusCandidate",
    "handlerKey": "corpus.acceptCorpusCandidate",
    "tag": "corpus",
    "summary": "Accept a Corpus candidate into accepted Program corpus.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/TargetEntity"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/corpus-candidates/{candidateId}/rejection",
    "operationId": "rejectCorpusCandidate",
    "handlerKey": "corpus.rejectCorpusCandidate",
    "tag": "corpus",
    "summary": "Reject a Corpus candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/accepted-corpus",
    "operationId": "listAcceptedCorpus",
    "handlerKey": "corpus.listAcceptedCorpus",
    "tag": "corpus",
    "summary": "List accepted Program corpus.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/corpus/{entityId}/status",
    "operationId": "setAcceptedCorpusLifecycleStatus",
    "handlerKey": "corpus.setAcceptedCorpusLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted Corpus entity.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/accepted-corpus-revisions/{revisionId}",
    "operationId": "getAcceptedCorpusRevision",
    "handlerKey": "corpus.getAcceptedCorpusRevision",
    "tag": "corpus",
    "summary": "Read an accepted Corpus revision.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/corpus-events",
    "operationId": "listCorpusEvents",
    "handlerKey": "corpus.listCorpusEvents",
    "tag": "corpus",
    "summary": "List Corpus events for a Program Curator.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/navigation-candidates",
    "operationId": "listNavigationCandidates",
    "handlerKey": "corpus.listNavigationCandidates",
    "tag": "corpus",
    "summary": "List navigation candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/navigation-candidates",
    "operationId": "createNavigationCandidate",
    "handlerKey": "corpus.createNavigationCandidate",
    "tag": "corpus",
    "summary": "Create a navigation candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/NavigationCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/navigation-candidates/{candidateId}/acceptance",
    "operationId": "acceptNavigationCandidate",
    "handlerKey": "corpus.acceptNavigationCandidate",
    "tag": "corpus",
    "summary": "Accept a navigation candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/navigation-candidates/{candidateId}/rejection",
    "operationId": "rejectNavigationCandidate",
    "handlerKey": "corpus.rejectNavigationCandidate",
    "tag": "corpus",
    "summary": "Reject a navigation candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/navigation",
    "operationId": "getProgramNavigation",
    "handlerKey": "corpus.getProgramNavigation",
    "tag": "corpus",
    "summary": "Read student-safe accepted Program navigation.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/navigation/entities/{entityId}",
    "operationId": "getNavigationEntity",
    "handlerKey": "corpus.getNavigationEntity",
    "tag": "corpus",
    "summary": "Read student-safe navigation entity detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "entityId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/navigation/revisions/{revisionId}",
    "operationId": "getNavigationRevision",
    "handlerKey": "corpus.getNavigationRevision",
    "tag": "corpus",
    "summary": "Read student-safe navigation revision detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/navigation-relationships/{entityId}/status",
    "operationId": "setAcceptedNavigationRelationshipLifecycleStatus",
    "handlerKey": "corpus.setAcceptedNavigationRelationshipLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted navigation relationship.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/assessment-criteria/candidates",
    "operationId": "listAssessmentCriterionCandidates",
    "handlerKey": "corpus.listAssessmentCriterionCandidates",
    "tag": "corpus",
    "summary": "List assessment criterion candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/assessment-criteria/candidates",
    "operationId": "createAssessmentCriterionCandidate",
    "handlerKey": "corpus.createAssessmentCriterionCandidate",
    "tag": "corpus",
    "summary": "Create an assessment criterion candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/AssessmentCriterionCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/assessment-criteria/candidates/{candidateId}/acceptance",
    "operationId": "acceptAssessmentCriterionCandidate",
    "handlerKey": "corpus.acceptAssessmentCriterionCandidate",
    "tag": "corpus",
    "summary": "Accept an assessment criterion candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/TargetEntity"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/assessment-criteria/candidates/{candidateId}/rejection",
    "operationId": "rejectAssessmentCriterionCandidate",
    "handlerKey": "corpus.rejectAssessmentCriterionCandidate",
    "tag": "corpus",
    "summary": "Reject an assessment criterion candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/assessment-criteria",
    "operationId": "listAcceptedAssessmentCriteria",
    "handlerKey": "corpus.listAcceptedAssessmentCriteria",
    "tag": "corpus",
    "summary": "List accepted assessment criteria.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/assessment-criteria/revisions/{revisionId}",
    "operationId": "getAssessmentCriterionRevision",
    "handlerKey": "corpus.getAssessmentCriterionRevision",
    "tag": "corpus",
    "summary": "Read accepted assessment criterion revision detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/assessment-criteria/{entityId}/status",
    "operationId": "setAcceptedAssessmentCriterionLifecycleStatus",
    "handlerKey": "corpus.setAcceptedAssessmentCriterionLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted assessment criterion entity.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/open-answer-checks/candidates",
    "operationId": "listOpenAnswerCheckCandidates",
    "handlerKey": "corpus.listOpenAnswerCheckCandidates",
    "tag": "corpus",
    "summary": "List open-answer check candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/open-answer-checks/candidates",
    "operationId": "createOpenAnswerCheckCandidate",
    "handlerKey": "corpus.createOpenAnswerCheckCandidate",
    "tag": "corpus",
    "summary": "Create an open-answer check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OpenAnswerCheckCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/open-answer-checks/candidates/{candidateId}/acceptance",
    "operationId": "acceptOpenAnswerCheckCandidate",
    "handlerKey": "corpus.acceptOpenAnswerCheckCandidate",
    "tag": "corpus",
    "summary": "Accept an open-answer check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/TargetEntity"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/open-answer-checks/candidates/{candidateId}/rejection",
    "operationId": "rejectOpenAnswerCheckCandidate",
    "handlerKey": "corpus.rejectOpenAnswerCheckCandidate",
    "tag": "corpus",
    "summary": "Reject an open-answer check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/open-answer-checks",
    "operationId": "listAcceptedOpenAnswerChecks",
    "handlerKey": "corpus.listAcceptedOpenAnswerChecks",
    "tag": "corpus",
    "summary": "List accepted open-answer checks.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/open-answer-checks/revisions/{revisionId}",
    "operationId": "getOpenAnswerCheckRevision",
    "handlerKey": "corpus.getOpenAnswerCheckRevision",
    "tag": "corpus",
    "summary": "Read accepted open-answer check revision detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/quick-checks/candidates",
    "operationId": "listQuickCheckCandidates",
    "handlerKey": "corpus.listQuickCheckCandidates",
    "tag": "corpus",
    "summary": "List Quick Check candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/quick-checks/candidates",
    "operationId": "createQuickCheckCandidate",
    "handlerKey": "corpus.createQuickCheckCandidate",
    "tag": "corpus",
    "summary": "Create a Quick Check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/QuickCheckCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/quick-checks/candidates/{candidateId}/acceptance",
    "operationId": "acceptQuickCheckCandidate",
    "handlerKey": "corpus.acceptQuickCheckCandidate",
    "tag": "corpus",
    "summary": "Accept a Quick Check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/TargetEntity"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/quick-checks/candidates/{candidateId}/rejection",
    "operationId": "rejectQuickCheckCandidate",
    "handlerKey": "corpus.rejectQuickCheckCandidate",
    "tag": "corpus",
    "summary": "Reject a Quick Check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/quick-checks/revisions/{revisionId}/curation",
    "operationId": "getQuickCheckRevisionForCuration",
    "handlerKey": "corpus.getQuickCheckRevisionForCuration",
    "tag": "corpus",
    "summary": "Read protected Quick Check curation detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/quick-checks/curation",
    "operationId": "listAcceptedQuickChecksForCuration",
    "handlerKey": "corpus.listAcceptedQuickChecksForCuration",
    "tag": "corpus",
    "summary": "List accepted Quick Checks for curation, including answer keys.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/quick-checks/{entityId}/status",
    "operationId": "setAcceptedQuickCheckLifecycleStatus",
    "handlerKey": "corpus.setAcceptedQuickCheckLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted Quick Check entity.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/readiness-checks/curation",
    "operationId": "listAcceptedReadinessChecksForCuration",
    "handlerKey": "corpus.listAcceptedReadinessChecksForCuration",
    "tag": "corpus",
    "summary": "List accepted Readiness Checks for curation.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/open-answer-checks/{entityId}/status",
    "operationId": "setAcceptedOpenAnswerCheckLifecycleStatus",
    "handlerKey": "corpus.setAcceptedOpenAnswerCheckLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted open-answer check entity.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/quick-checks",
    "operationId": "listQuickCheckDeliveries",
    "handlerKey": "corpus.listQuickCheckDeliveries",
    "tag": "corpus",
    "summary": "List student-safe Quick Check deliveries.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/quick-checks/revisions/{revisionId}",
    "operationId": "getQuickCheckDelivery",
    "handlerKey": "corpus.getQuickCheckDelivery",
    "tag": "corpus",
    "summary": "Read student-safe Quick Check delivery detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/readiness-checks/candidates",
    "operationId": "listReadinessCheckCandidates",
    "handlerKey": "corpus.listReadinessCheckCandidates",
    "tag": "corpus",
    "summary": "List readiness check candidates.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/readiness-checks/candidates",
    "operationId": "createReadinessCheckCandidate",
    "handlerKey": "corpus.createReadinessCheckCandidate",
    "tag": "corpus",
    "summary": "Create a readiness check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/ReadinessCheckCandidate"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/readiness-checks/candidates/{candidateId}/acceptance",
    "operationId": "acceptReadinessCheckCandidate",
    "handlerKey": "corpus.acceptReadinessCheckCandidate",
    "tag": "corpus",
    "summary": "Accept a readiness check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/TargetEntity"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/readiness-checks/candidates/{candidateId}/rejection",
    "operationId": "rejectReadinessCheckCandidate",
    "handlerKey": "corpus.rejectReadinessCheckCandidate",
    "tag": "corpus",
    "summary": "Reject a readiness check candidate.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "candidateId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/readiness-checks/revisions/{revisionId}/curation",
    "operationId": "getReadinessCheckRevisionForCuration",
    "handlerKey": "corpus.getReadinessCheckRevisionForCuration",
    "tag": "corpus",
    "summary": "Read protected readiness check curation detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "revisionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "PUT",
    "path": "/readiness-checks/{entityId}/status",
    "operationId": "setAcceptedReadinessCheckLifecycleStatus",
    "handlerKey": "corpus.setAcceptedReadinessCheckLifecycleStatus",
    "tag": "corpus",
    "summary": "Withdraw or reactivate an accepted readiness check entity.",
    "auth": { "kind": "session", "csrf": true },
    "requestBody": { "contentType": "application/json", "required": true, "schema": { "ref": "#/components/requestBodies/LifecycleStatus" } },
    "responses": [
      { "status": 200, "envelope": "accepted", "schema": { "ref": "#/components/responses/Accepted" } },
      { "status": 400, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 401, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 403, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 404, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 409, "envelope": "rejected", "schema": { "ref": "#/components/responses/Rejected" } },
      { "status": 500, "envelope": "fault", "schema": { "ref": "#/components/responses/Fault" } }
    ],
    "pathParameters": [
      { "name": "entityId", "schema": { "type": "string", "minLength": 1 }, "required": true }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/learner-state-target-links",
    "operationId": "listLearnerStateTargetLinks",
    "handlerKey": "corpus.listLearnerStateTargetLinks",
    "tag": "corpus",
    "summary": "List active learner-state evidence target links.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/learner-state-target-links",
    "operationId": "createLearnerStateTargetLink",
    "handlerKey": "corpus.createLearnerStateTargetLink",
    "tag": "corpus",
    "summary": "Create an active learner-state evidence target link.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/LearnerStateTargetLink"
      },
      "required": false
    }
  },
  {
    "method": "DELETE",
    "path": "/learner-state-target-links/{targetLinkId}",
    "operationId": "deleteLearnerStateTargetLink",
    "handlerKey": "corpus.deleteLearnerStateTargetLink",
    "tag": "corpus",
    "summary": "Delete an active learner-state evidence target link.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "targetLinkId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/open-answer-attempts",
    "operationId": "listOpenAnswerAttempts",
    "handlerKey": "studentWorkspace.listOpenAnswerAttempts",
    "tag": "student-workspace",
    "summary": "List Student-owned open-answer attempts.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/open-answer-attempts",
    "operationId": "submitOpenAnswerAttempt",
    "handlerKey": "studentWorkspace.submitOpenAnswerAttempt",
    "tag": "student-workspace",
    "summary": "Submit a Student-owned open-answer attempt.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OpenAnswerAttempt"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/open-answer-attempts/{attemptId}",
    "operationId": "getOpenAnswerAttempt",
    "handlerKey": "studentWorkspace.getOpenAnswerAttempt",
    "tag": "student-workspace",
    "summary": "Read Student-owned open-answer attempt detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "attemptId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/quick-check-attempts",
    "operationId": "listQuickCheckAttempts",
    "handlerKey": "studentWorkspace.listQuickCheckAttempts",
    "tag": "student-workspace",
    "summary": "List Student-owned Quick Check attempts.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/quick-check-attempts",
    "operationId": "submitQuickCheckAttempt",
    "handlerKey": "studentWorkspace.submitQuickCheckAttempt",
    "tag": "student-workspace",
    "summary": "Submit a Student-owned Quick Check attempt.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/QuickCheckAttempt"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/quick-check-attempts/{attemptId}",
    "operationId": "getQuickCheckAttempt",
    "handlerKey": "studentWorkspace.getQuickCheckAttempt",
    "tag": "student-workspace",
    "summary": "Read Student-owned Quick Check attempt detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "attemptId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/readiness-checks",
    "operationId": "listReadinessCheckDeliveries",
    "handlerKey": "studentWorkspace.listReadinessCheckDeliveries",
    "tag": "student-workspace",
    "summary": "List student-safe readiness check deliveries.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/readiness-check-attempts",
    "operationId": "listReadinessCheckAttempts",
    "handlerKey": "studentWorkspace.listReadinessCheckAttempts",
    "tag": "student-workspace",
    "summary": "List Student-owned readiness check attempts.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/readiness-check-attempts",
    "operationId": "submitReadinessCheckAttempt",
    "handlerKey": "studentWorkspace.submitReadinessCheckAttempt",
    "tag": "student-workspace",
    "summary": "Submit a Student-owned readiness check attempt.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/ReadinessCheckAttempt"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/readiness-check-attempts/{attemptId}",
    "operationId": "getReadinessCheckAttempt",
    "handlerKey": "studentWorkspace.getReadinessCheckAttempt",
    "tag": "student-workspace",
    "summary": "Read Student-owned readiness check attempt detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "attemptId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/learner-state",
    "operationId": "getLearnerState",
    "handlerKey": "studentWorkspace.getLearnerState",
    "tag": "student-workspace",
    "summary": "Read owner-only learner-state summary for a Program.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/learner-state/targets/{targetKind}/{targetId}",
    "operationId": "getLearnerStateTarget",
    "handlerKey": "studentWorkspace.getLearnerStateTarget",
    "tag": "student-workspace",
    "summary": "Read owner-only learner-state target detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "targetKind",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      },
      {
        "name": "targetId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/coverage-gaps",
    "operationId": "listCoverageGaps",
    "handlerKey": "curatorWorkspace.listCoverageGaps",
    "tag": "curator-workspace",
    "summary": "List Curator Workspace coverage-gap diagnostics.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "GET",
    "path": "/programs/{programId}/llm-curation-suggestions",
    "operationId": "listLlmCurationSuggestions",
    "handlerKey": "curatorWorkspace.listLlmCurationSuggestions",
    "tag": "curator-workspace",
    "summary": "List LLM-assisted curation suggestions.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/programs/{programId}/llm-curation-suggestions",
    "operationId": "generateLlmCurationSuggestions",
    "handlerKey": "curatorWorkspace.generateLlmCurationSuggestions",
    "tag": "curator-workspace",
    "summary": "Generate deterministic-provider-backed draft curation suggestions.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "programId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/LlmCurationSuggestionGeneration"
      },
      "required": false
    }
  },
  {
    "method": "GET",
    "path": "/llm-curation-suggestions/{suggestionId}",
    "operationId": "getLlmCurationSuggestion",
    "handlerKey": "curatorWorkspace.getLlmCurationSuggestion",
    "tag": "curator-workspace",
    "summary": "Read LLM-assisted curation suggestion detail.",
    "auth": {
      "kind": "session"
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "suggestionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ]
  },
  {
    "method": "POST",
    "path": "/llm-curation-suggestions/{suggestionId}/acceptance",
    "operationId": "acceptLlmCurationSuggestion",
    "handlerKey": "curatorWorkspace.acceptLlmCurationSuggestion",
    "tag": "curator-workspace",
    "summary": "Materialize a draft candidate from an LLM curation suggestion.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "suggestionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  },
  {
    "method": "POST",
    "path": "/llm-curation-suggestions/{suggestionId}/rejection",
    "operationId": "rejectLlmCurationSuggestion",
    "handlerKey": "curatorWorkspace.rejectLlmCurationSuggestion",
    "tag": "curator-workspace",
    "summary": "Reject an LLM curation suggestion.",
    "auth": {
      "kind": "session",
      "csrf": true
    },
    "responses": [
      {
        "status": 200,
        "envelope": "accepted",
        "schema": {
          "ref": "#/components/responses/Accepted"
        }
      },
      {
        "status": 400,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 401,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 403,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 404,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 409,
        "envelope": "rejected",
        "schema": {
          "ref": "#/components/responses/Rejected"
        }
      },
      {
        "status": 500,
        "envelope": "fault",
        "schema": {
          "ref": "#/components/responses/Fault"
        }
      }
    ],
    "pathParameters": [
      {
        "name": "suggestionId",
        "schema": {
          "type": "string",
          "minLength": 1
        },
        "required": true
      }
    ],
    "requestBody": {
      "contentType": "application/json",
      "schema": {
        "ref": "#/components/requestBodies/OptionalObject"
      },
      "required": false
    }
  }
];

const routeMatchers = routeContracts.map((contract) => ({
  contract,
  pattern: compileRoutePattern(contract.path),
}));

export function matchRoute({ method, pathname }) {
  const normalizedMethod = String(method).toUpperCase();
  for (const { contract, pattern } of routeMatchers) {
    if (contract.method !== normalizedMethod) {
      continue;
    }

    const match = pathname.match(pattern.regex);
    if (!match) {
      continue;
    }

    return {
      status: "matched",
      contract,
      pathParameters: Object.fromEntries(pattern.parameterNames.map((name) => [name, decodeURIComponent(match.groups[name])])),
    };
  }

  return { status: "not_found" };
}

export function extractPathParameterNames(path) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(($0) => $0[1]);
}

function compileRoutePattern(path) {
  const parameterNames = extractPathParameterNames(path);
  const regexSource = path
    .split(/(\{[^}]+\})/g)
    .map((segment) => {
      const parameter = segment.match(/^\{([^}]+)\}$/);
      if (parameter) {
        return `(?<${parameter[1]}>[^/]+)`;
      }
      return escapeRegex(segment);
    })
    .join("");

  return {
    parameterNames,
    regex: new RegExp(`^${regexSource}$`),
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
