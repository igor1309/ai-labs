# Repository implement process verifies Agister's checks

The repository's own `implement` process now declares `verify` (Agister's
checks), and `service.toml` allows 3 verification attempts. Apply this
settings change exactly, in this checkout:

```diff
diff --git a/.agister/processes/implement.yaml b/.agister/processes/implement.yaml
index 693992d2..67c2a8dd 100644
--- a/.agister/processes/implement.yaml
+++ b/.agister/processes/implement.yaml
@@ -7,9 +7,10 @@ policy: process-policy:implement
 input:
   instruction: >-
     Implement the task given as input brief in this checkout of the
-    candidate. Do not commit; Agister keeps your changes. Run the checks the
-    brief asks for and report each with its exit code and final line; list
-    every file you changed, repository-relative.
+    candidate. Do not commit; Agister keeps your changes. Agister runs the
+    verification command after your turn; run any further checks the brief
+    asks for and report each with its exit code and final line; list every
+    file you changed, repository-relative.
   params:
     candidate: {default: HEAD}
     brief: {}
@@ -24,3 +25,15 @@ output:
   format: json
   schema: implementation
   require_valid: true
+
+# Agister's own checks, run in the checkout with the operator's authority
+# after each valid turn; the node completes only when they pass.
+verify:
+  command: >-
+    cd agister && test -z "$(gofmt -l .)" && go vet ./... &&
+    go test -count=1 ./... && go test -race -count=1 ./internal/app/...
+  timeout: 15m
+  max_attempts: 3
+  instruction: >-
+    The verification command failed on your changes. Fix the cause in the
+    code; do not weaken, skip or delete a check or a test.
diff --git a/.agister/service.toml b/.agister/service.toml
index 5acb8da3..6f594a21 100644
--- a/.agister/service.toml
+++ b/.agister/service.toml
@@ -3,6 +3,7 @@ schema = "agister.service/v1alpha1"
 # Hard limits no policy may exceed. Retries are not supported yet.
 max_timeout = "1h"
 max_attempts = 1
+max_verify_attempts = 3
 
 # The permission vocabulary. Policies and runtime mappings may use only these.
 permissions = [
```

With it, `TestRepositoryProcessesRunOnFakeRuntimes`
(`agister/cmd/agister/repo_settings_test.go`) fails for `implement`: the
real verify command runs inside the test's temporary repository, fails, the
fake agent's repair changes nothing, and the call ends budget exhausted.

Make the test handle processes that declare `verify`, keeping it hermetic
and fast: the real command must never run inside the test (it would run
the module's own tests, including this one). In the test's temporary
repository only, give every process that declares `verify` a fixture
command that passes, and assert that its run completed with one passing
verification attempt recorded. The repository's real settings stay
unchanged apart from the diff above. Every other process keeps today's
assertions.

Add a mutation to `agister/testdata/revert-checks/repo-settings.spec`
that the new assertion catches.

Agister runs the verification command after your turn. From the
repository root, also run `scripts/revert-check.py
agister/testdata/revert-checks/repo-settings.spec` and report it with its
exit code and final line. List every file you changed. Do not commit.
