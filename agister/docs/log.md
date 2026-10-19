# Changes

- LAB-324: each call records its permission plan and resolved process
  environment; reuse requires the same environment.

- LAB-322: a run keeps the bytes of each settings file its record
  names, beside the record, and its export takes them.

- LAB-321: each call records the settings files it ran under, with
  their digests, and a reuse takes a call only under the same ones.

- LAB-320: Calls record the HEAD they left and pinned calls keep their changes as a patch, included in exports and reuse. Continuations and session steps accept the HEAD a call committed.
