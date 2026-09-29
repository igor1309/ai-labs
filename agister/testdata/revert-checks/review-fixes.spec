# Review fixes: background recovery failures are observable, and an input
# value may use the resolved text of an earlier one. Each mutation undoes
# one fix, and the listed tests must fail with it.
# Run: scripts/revert-check.py <this file>
module: agister

# A failed reap is reported, not dropped.
[a reap that cannot list runs fails]
file: internal/app/reap.go
find: return fmt.Errorf("listing abandoned runs: %w", err)
replace: return nil
test: ./internal/app TestAReapThatCannotListRunsFails
test: ./cmd/agister TestBuiltReaperLogsAFailedReap

[a reap that cannot record a run's event fails]
file: internal/app/reap.go
find: \t\terrs = append(errs, fmt.Errorf("recording the reap: %w", err))\n
replace: \t\t_ = err\n
test: ./internal/app TestAReapThatCannotRecordARunFails

[a reap that cannot finish a run fails]
file: internal/app/reap.go
find: \t\terrs = append(errs, fmt.Errorf("finishing the run: %w", err))\n
replace: \t\t_ = err\n
test: ./internal/app TestAReapThatCannotRecordARunFails

[the reap returns what failed for its runs]
file: internal/app/reap.go
find: \t\tif err := c.reap(ctx, handle, record, live, liveErr); err != nil {\n\t\t\terrs = append(errs, err)\n\t\t}
replace: \t\t_ = c.reap(ctx, handle, record, live, liveErr)
test: ./internal/app TestAReapThatCannotRecordARunFails

[one run that cannot be recorded does not stop the reap]
file: internal/app/reap.go
find: \t\t\terrs = append(errs, err)\n\t\t}\n\t}\n\treturn errors.Join(errs...)
replace: \t\t\treturn err\n\t\t}\n\t}\n\treturn errors.Join(errs...)
test: ./internal/app TestAReapThatCannotRecordARunFails

[the reap returns every run's failure, not the first]
file: internal/app/reap.go
find: \t\t}\n\t}\n\treturn errors.Join(errs...)\n
replace: \t\t}\n\t}\n\tif len(errs) > 0 {\n\t\treturn errs[0]\n\t}\n\treturn nil\n
test: ./internal/app TestAReapThatCannotRecordARunFails

[an unrecorded event's step failures are in the error]
file: internal/app/reap.go
find: \t\tif len(failures) > 0 {\n\t\t\terr = fmt.Errorf(
replace: \t\tif false {\n\t\t\terr = fmt.Errorf(
test: ./internal/app TestAReapThatCannotRecordARunFails

[a failed reap is reported]
file: internal/app/background.go
find: \t\t\tb.Report(err)\n
replace: \t\t\t_ = err\n
test: ./internal/app TestAFailedReapIsReported
test: ./cmd/agister TestBuiltReaperLogsAFailedReap

[a reap that succeeds is not reported]
file: internal/app/background.go
find: err != nil && b.Report != nil {
replace: b.Report != nil {
test: ./internal/app TestAFailedReapIsReported

[the composition root logs a failed reap]
file: cmd/agister/main.go
find: \t\tReport: func(err error) { log.Error("reaping abandoned runs failed", "error", err.Error()) },\n
replace: 
test: ./cmd/agister TestBuiltReaperLogsAFailedReap

# ${value.<name>}: an input value uses an earlier value's resolved text.
[a value refers only to values declared before it]
file: internal/domain/definition/documents.go
find: \t\t\tif !hasValue(process.Values, reference) {\n\t\t\t\tp.add(field, "refers to ${value
replace: \t\t\tif false {\n\t\t\t\tp.add(field, "refers to ${value
test: ./internal/domain/definition TestValuesReferToValuesDeclaredBeforeThem

[a value reference binds to the value's resolved text]
file: internal/domain/definition/documents.go
find: \t\t\tvalue, ok := values[match[2]]
replace: \t\t\tvalue, ok := params[match[2]]
test: ./internal/domain/definition TestValuesReferToValuesDeclaredBeforeThem
test: ./internal/app TestInputsUseTheValuesResolvedBeforeThem

[references bind in one pass]
file: internal/domain/definition/documents.go
find: \t\tbound[key] = reference.ReplaceAllStringFunc(arg, func(text string) string {
replace: \t\targ = reference.ReplaceAllStringFunc(arg, func(text string) string { if m := reference.FindStringSubmatch(text); m[1] == "param" { return params[m[2]] }; return text })\n\t\tbound[key] = reference.ReplaceAllStringFunc(arg, func(text string) string {
test: ./internal/domain/definition TestValuesReferToValuesDeclaredBeforeThem

[a value with no text cannot be referred to]
file: internal/domain/definition/documents.go
find: \t\t\tif !ok {\n\t\t\t\tmissing = append(missing, match[2])
replace: \t\t\tif !ok && false {\n\t\t\t\tmissing = append(missing, match[2])
test: ./internal/domain/definition TestValuesReferToValuesDeclaredBeforeThem
test: ./internal/app TestRefusalsComeBeforeEffects

[a call keeps each resolved text for the values after it]
file: internal/app/calls.go
find: \t\t\ttexts[value.Name] = text\n
replace: \t\t\t_ = text\n
test: ./internal/app TestInputsUseTheValuesResolvedBeforeThem

[a value that cannot be bound refuses the call]
file: internal/app/calls.go
find: \t\targs, err := value.Bind(params, texts)\n\t\tif err != nil {
replace: \t\targs, err := value.Bind(params, texts)\n\t\tif false {
test: ./internal/app TestRefusalsComeBeforeEffects

[a shipped diff or changed-files value binds its revisions to the values resolved before it]
file: ../.agister/processes/tests_review_codex.yaml
find: diff: {source: git.diff, base: "${value.base_revision}", head: "${value.candidate_revision}"}
replace: diff: {source: git.diff, base: "${param.base}", head: "${param.candidate}"}
test: ./internal/domain/definition TestShippedRevisionInputsUseTheValuesResolvedBeforeThem
