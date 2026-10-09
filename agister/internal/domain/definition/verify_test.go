package definition_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// verifyingProcess is a process with a checkout that needs a clean
// worktree and the given verify block, indented under verify:.
func verifyingProcess(verify string) string {
	return `schema: agister.process/v1alpha1
name: p
type: process
prompt: review
uses: agent:a
input:
  instruction: Implement it.
  values:
    candidate_revision: {source: git.revision, rev: HEAD}
workspace:
  revision: candidate_revision
  clean: true
output:
  format: text
verify:
` + verify
}

const verifyBlock = `  command: go test ./...
  timeout: 10m
  max_attempts: 3
  instruction: The verification command failed. Fix the cause, not the check.
`

func TestVerifyIsParsedAsDeclared(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(verifyBlock)))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if process.Verify == nil || !reflect.DeepEqual(*process.Verify, want) {
		t.Fatalf("verify = %+v", process.Verify)
	}
	without, err := definition.ParseProcess(doc(definition.KindProcess, "p", strings.TrimSuffix(verifyingProcess(""), "verify:\n")))
	if err != nil || without.Verify != nil {
		t.Fatalf("a process without verify: %+v, %v", without.Verify, err)
	}
}

// Rule 1: every field is required, and there is no default for any of them.
func TestVerifyWithoutAFieldIsInvalid(t *testing.T) {
	t.Parallel()
	for _, field := range []string{"command", "timeout", "max_attempts", "instruction"} {
		t.Run(field, func(t *testing.T) {
			t.Parallel()
			var kept []string
			for _, line := range strings.SplitAfter(verifyBlock, "\n") {
				if !strings.HasPrefix(line, "  "+field+":") {
					kept = append(kept, line)
				}
			}
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Join(kept, ""))))
			if err == nil || !strings.Contains(err.Error(), "verify."+field+": is required") {
				t.Fatalf("err = %v", err)
			}
		})
	}
	cases := map[string]struct{ verify, want string }{
		"empty command":     {strings.Replace(verifyBlock, "go test ./...", `""`, 1), "verify.command: must not be empty"},
		"empty instruction": {strings.Replace(verifyBlock, "The verification command failed. Fix the cause, not the check.", `""`, 1), "verify.instruction: must not be empty"},
		"zero timeout":      {strings.Replace(verifyBlock, "10m", "0s", 1), `verify.timeout: invalid duration "0s"`},
		"negative timeout":  {strings.Replace(verifyBlock, "10m", "-1m", 1), `verify.timeout: invalid duration "-1m"`},
		"unknown field":     {verifyBlock + "  on_failure: stop\n", "verify.on_failure: unknown field"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(c.verify)))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// Rule 2: the first run is attempt 1, so fewer is invalid, never clamped.
func TestVerifyMaxAttemptsBelowOneIsInvalid(t *testing.T) {
	t.Parallel()
	for _, attempts := range []string{"0", "-1"} {
		t.Run(attempts, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Replace(verifyBlock, "max_attempts: 3", "max_attempts: "+attempts, 1))))
			if err == nil || !strings.Contains(err.Error(), "verify.max_attempts: must be at least 1") {
				t.Fatalf("err = %v", err)
			}
		})
	}
	if _, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(strings.Replace(verifyBlock, "max_attempts: 3", "max_attempts: 1", 1)))); err != nil {
		t.Fatalf("one attempt: %v", err)
	}
}

// ADR-025 rule 3: verification proves the run's changes from the pinned
// revision.
func TestVerifyWithoutARevisionIsInvalid(t *testing.T) {
	t.Parallel()
	text := strings.Replace(verifyingProcess(verifyBlock), "  revision: candidate_revision\n", "", 1)
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
	if err == nil || !strings.Contains(err.Error(), "verify: requires workspace.revision") {
		t.Fatalf("err = %v", err)
	}
}

// The ceiling of verify.max_attempts is a service setting, 1 unless set.
func TestServiceMaxVerifyAttempts(t *testing.T) {
	t.Parallel()
	base := "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"read\"]\nwriting = []\n"
	cases := []struct {
		setting string
		want    int
		problem string
	}{
		{"", 1, ""},
		{"max_verify_attempts = 3\n", 3, ""},
		{"max_verify_attempts = 0\n", 0, "max_verify_attempts: must be a positive integer"},
		{"max_verify_attempts = \"3\"\n", 0, "max_verify_attempts: must be a positive integer"},
	}
	for _, c := range cases {
		service, err := definition.ParseService(doc(definition.KindService, "service", base+c.setting))
		if c.problem == "" && (err != nil || service.MaxVerifyAttempts != c.want) {
			t.Errorf("%q: %d, %v", c.setting, service.MaxVerifyAttempts, err)
		}
		if c.problem != "" && (err == nil || !strings.Contains(err.Error(), c.problem)) {
			t.Errorf("%q: err = %v", c.setting, err)
		}
	}
}

const verification = `schema: agister.verify/v1alpha1
name: repo
command: go test ./...
timeout: 10m
max_attempts: 3
instruction: The verification command failed. Fix the cause, not the check.
`

// ADR-010 rule 1: a verification document holds the four fields of the
// inline block.
func TestVerificationIsParsedAsDeclared(t *testing.T) {
	t.Parallel()
	parsed, err := definition.ParseVerify(doc(definition.KindVerify, "repo", verification))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if parsed.Name != "repo" || !reflect.DeepEqual(parsed.Verify, want) || parsed.Source.Kind != definition.KindVerify {
		t.Fatalf("verification = %+v", parsed)
	}
}

func TestVerificationWithoutAFieldOrWithAnotherIsInvalid(t *testing.T) {
	t.Parallel()
	for _, field := range []string{"command", "timeout", "max_attempts", "instruction"} {
		t.Run(field, func(t *testing.T) {
			t.Parallel()
			var kept []string
			for _, line := range strings.SplitAfter(verification, "\n") {
				if !strings.HasPrefix(line, field+":") {
					kept = append(kept, line)
				}
			}
			_, err := definition.ParseVerify(doc(definition.KindVerify, "repo", strings.Join(kept, "")))
			if err == nil || !strings.Contains(err.Error(), "\n  "+field+": is required") {
				t.Fatalf("err = %v", err)
			}
		})
	}
	cases := map[string]struct{ text, want string }{
		"unknown key":       {verification + "on_failure: stop\n", "on_failure: unknown field"},
		"another's name":    {strings.Replace(verification, "name: repo", "name: other", 1), `name: "other" does not match its definition name "repo"`},
		"another schema":    {strings.Replace(verification, "agister.verify/", "agister.process/", 1), `schema: must be "agister.verify/v1alpha1"`},
		"zero attempts":     {strings.Replace(verification, "max_attempts: 3", "max_attempts: 0", 1), "max_attempts: must be at least 1"},
		"zero timeout":      {strings.Replace(verification, "10m", "0s", 1), `timeout: invalid duration "0s"`},
		"empty command":     {strings.Replace(verification, "go test ./...", `""`, 1), "command: must not be empty"},
		"not a text file":   {"\x00", "not a UTF-8 text file"},
		"a process's field": {verification + "uses: agent:a\n", "uses: unknown field"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseVerify(doc(definition.KindVerify, "repo", c.text))
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want %q", err, c.want)
			}
		})
	}
}

// namingProcess is a process with a checkout whose verify is the scalar
// given.
func namingProcess(verify string) string {
	return strings.TrimSuffix(verifyingProcess(""), "\n") + " " + verify + "\n"
}

// ADR-010 rule 2: verify is the inline fields or one reference.
func TestAProcessNamesItsVerification(t *testing.T) {
	t.Parallel()
	process, err := definition.ParseProcess(doc(definition.KindProcess, "p", namingProcess("verify:repo")))
	if err != nil || process.VerifyName != "repo" || process.Verify != nil {
		t.Fatalf("name %q, verify %+v, %v", process.VerifyName, process.Verify, err)
	}
	inline, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(verifyBlock)))
	if err != nil || inline.VerifyName != "" || inline.Verify == nil {
		t.Fatalf("inline: name %q, verify %+v, %v", inline.VerifyName, inline.Verify, err)
	}
	for _, reference := range []string{`"verify:"`, "verify:Not A Name", "verify:../repo", "repo", "process-policy:repo", "[verify:repo]"} {
		t.Run(reference, func(t *testing.T) {
			t.Parallel()
			process, err := definition.ParseProcess(doc(definition.KindProcess, "p", namingProcess(reference)))
			if err == nil || !strings.Contains(err.Error(), "verify: must be") || process.VerifyName != "" {
				t.Fatalf("name %q, err = %v", process.VerifyName, err)
			}
		})
	}
}

// Rule 2: a second verify does not replace the first, in either order.
func TestAProcessDeclaringVerifyTwiceIsInvalid(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"inline, then a reference": verifyingProcess(verifyBlock) + "verify: verify:repo\n",
		"a reference, then inline": namingProcess("verify:repo") + "verify:\n" + verifyBlock,
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
			if err == nil || !strings.Contains(err.Error(), "verify: is declared more than once") {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

// A process that names a verification is held to the pinned checkout, as
// one with the inline block is.
func TestANamedVerificationWithoutARevisionIsInvalid(t *testing.T) {
	t.Parallel()
	text := strings.Replace(namingProcess("verify:repo"), "  revision: candidate_revision\n", "", 1)
	_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
	if err == nil || !strings.Contains(err.Error(), "verify: requires workspace.revision") {
		t.Fatalf("err = %v", err)
	}
}

// ADR-025 rule 3: verification proves the run's changes from a clean
// start, inline or named, so its process declares workspace.clean: true.
func TestVerifyWithoutACleanWorktreeIsInvalid(t *testing.T) {
	t.Parallel()
	for name, text := range map[string]string{
		"inline":   verifyingProcess(verifyBlock),
		"named":    namingProcess("verify:repo"),
		"not true": verifyingProcess(verifyBlock),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			value := ""
			if name == "not true" {
				value = "  clean: false\n"
			}
			text = strings.Replace(text, "  clean: true\n", value, 1)
			_, err := definition.ParseProcess(doc(definition.KindProcess, "p", text))
			if err == nil || !strings.Contains(err.Error(), "verify: requires workspace.clean: true") {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

// ADR-025 rule 3: a process without verify may declare workspace.clean,
// which is false unless set.
func TestWorkspaceCleanIsParsed(t *testing.T) {
	t.Parallel()
	clean, err := definition.ParseProcess(doc(definition.KindProcess, "p", strings.TrimSuffix(verifyingProcess(""), "verify:\n")))
	if err != nil || !clean.Clean {
		t.Fatalf("clean: %+v, %v", clean, err)
	}
	without, err := definition.ParseProcess(doc(definition.KindProcess, "p", strings.Replace(strings.TrimSuffix(verifyingProcess(""), "verify:\n"), "  clean: true\n", "", 1)))
	if err != nil || without.Clean {
		t.Fatalf("without: %+v, %v", without, err)
	}
	_, err = definition.ParseProcess(doc(definition.KindProcess, "p", strings.Replace(verifyingProcess(verifyBlock), "clean: true", "clean: yes please", 1)))
	if err == nil || !strings.Contains(err.Error(), "workspace.clean") {
		t.Fatalf("a clean that is not a boolean: err = %v", err)
	}
}

// ADR-025: a verification's where, inline or in a document, whatever its
// value, is obsolete: it is read with a warning that names ADR-025 and says
// it is ignored, and is no problem.
func TestWhereIsObsoleteInlineAndInADocument(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"workspace", "copy", `""`} {
		t.Run(value, func(t *testing.T) {
			t.Parallel()
			process, err := definition.ParseProcess(doc(definition.KindProcess, "p", verifyingProcess(verifyBlock+"  where: "+value+"\n")))
			if err != nil || len(process.Obsolete) != 1 || !strings.HasPrefix(process.Obsolete[0], "verify.where: is obsolete and ignored (ADR-025)") {
				t.Fatalf("inline: %q, %v", process.Obsolete, err)
			}
			parsed, err := definition.ParseVerify(doc(definition.KindVerify, "repo", verification+"where: "+value+"\n"))
			if err != nil || len(parsed.Verify.Obsolete) != 1 || !strings.HasPrefix(parsed.Verify.Obsolete[0], "where: is obsolete and ignored (ADR-025)") {
				t.Fatalf("document: %q, %v", parsed.Verify.Obsolete, err)
			}
		})
	}
	without, err := definition.ParseVerify(doc(definition.KindVerify, "repo", verification))
	if err != nil || len(without.Verify.Obsolete) != 0 {
		t.Fatalf("without: %q, %v", without.Verify.Obsolete, err)
	}
}
