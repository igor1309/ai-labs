// Package gittest is an in-memory fake of the ports the composition root
// builds from the git adapter (ADR-017 rule 3, seam 5): the calls'
// workspaces, the verifier's clean copies, the reaper's discard, the
// content namer and differ, the state of a borrowed worktree, and the git
// input sources. A test records a
// repository's revisions as file trees; the fake answers from them and runs
// no git.
//
// It knows no ignore rules, hooks, binary files or lock files: every file a
// directory holds is its content. A test whose claim needs them runs on
// real git.
package gittest

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Fake answers for the repositories a test recorded. Checkouts and clean
// copies are directories under its scratch directory; the zero Fake knows
// no repository, so it makes none.
type Fake struct {
	scratch string

	mu           sync.Mutex
	repositories []*Repository
	// contents are the file trees of every revision recorded and every
	// identity named, by revision or identity.
	contents map[string]tree
}

// tree is a directory's files, by slash-separated path.
type tree map[string]string

// New is a fake that makes its checkouts and clean copies under scratch,
// a directory the test owns.
func New(scratch string) *Fake { return &Fake{scratch: scratch} }

// Repository is a repository recorded at a root directory: its branches
// and the revisions committed on them.
type Repository struct {
	fake *Fake
	root string
	// branches are each branch's latest revision; head is the branch HEAD
	// names.
	branches map[string]string
	head     string
	// parents are each revision's parent; the first has none.
	parents map[string]string
}

// Record records a repository whose root is root, with no revision yet.
// Its directory is the test's: the fake writes nothing there.
func (f *Fake) Record(root string) *Repository {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := &Repository{fake: f, root: filepath.Clean(root), branches: map[string]string{}, parents: map[string]string{}}
	f.repositories = append(f.repositories, r)
	return r
}

// Commit records a revision of files, by slash-separated path, on branch,
// and checks branch out: its parent is the branch's latest revision, or
// for a new branch, HEAD's. It returns the revision.
func (r *Repository) Commit(branch string, files map[string]string) string {
	f := r.fake
	f.mu.Lock()
	defer f.mu.Unlock()
	parent, ok := r.branches[branch]
	if !ok {
		parent = r.branches[r.head]
	}
	content := tree{}
	for path, text := range files {
		content[path] = text
	}
	revision := hash("commit", parent, content.identity())
	f.record(revision, content)
	r.parents[revision] = parent
	r.branches[branch], r.head = revision, branch
	return revision
}

// resolve resolves name as git rev-parse does in the repository: HEAD, a
// branch, or a revision recorded in it. The fake is locked.
func (r *Repository) resolve(name string) (string, error) {
	if name == "HEAD" {
		name = r.head
	}
	if revision, ok := r.branches[name]; ok {
		return revision, nil
	}
	if _, ok := r.parents[name]; ok {
		return name, nil
	}
	return "", fmt.Errorf("%s: unknown revision %q", r.root, name)
}

// mergeBase is the latest revision both a and b descend from, or are.
func (r *Repository) mergeBase(a, b string) (string, error) {
	ancestors := map[string]bool{}
	for at := a; at != ""; at = r.parents[at] {
		ancestors[at] = true
	}
	for at := b; at != ""; at = r.parents[at] {
		if ancestors[at] {
			return at, nil
		}
	}
	return "", fmt.Errorf("%s: %s and %s have no common revision", r.root, a, b)
}

// Left lists what is under the scratch directory: the checkouts and clean
// copies made and not yet released or discarded.
func (f *Fake) Left() ([]string, error) {
	entries, err := os.ReadDir(f.scratch)
	if err != nil {
		return nil, err
	}
	var left []string
	for _, entry := range entries {
		left = append(left, filepath.Join(f.scratch, entry.Name()))
	}
	return left, nil
}

// record keeps a file tree under its revision or identity. The fake is
// locked.
func (f *Fake) record(name string, content tree) {
	if f.contents == nil {
		f.contents = map[string]tree{}
	}
	f.contents[name] = content
}

// content is the file tree a revision or identity names.
func (f *Fake) content(name string) (tree, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	content, ok := f.contents[name]
	if !ok {
		return nil, fmt.Errorf("unknown revision or identity %q", name)
	}
	return content, nil
}

// repository is the recorded repository dir is in, the innermost one.
func (f *Fake) repository(dir string) (*Repository, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	dir = filepath.Clean(dir)
	var found *Repository
	for _, r := range f.repositories {
		rel, err := filepath.Rel(r.root, dir)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		if found == nil || len(r.root) > len(found.root) {
			found = r
		}
	}
	if found == nil {
		return nil, fmt.Errorf("%s: not in a repository the fake recorded", dir)
	}
	return found, nil
}

// Root is the root of the recorded repository cwd is in.
func (f *Fake) Root(_ context.Context, cwd string) (string, error) {
	r, err := f.repository(cwd)
	if err != nil {
		return "", err
	}
	return r.root, nil
}

// RepositoryIdentity names the recorded repository dir is in, as its
// .git under its root.
func (f *Fake) RepositoryIdentity(_ context.Context, dir string) (string, error) {
	r, err := f.repository(dir)
	if err != nil {
		return "", err
	}
	return filepath.Join(r.root, ".git"), nil
}

// SameRepository says whether both directories are in one recorded
// repository.
func (f *Fake) SameRepository(ctx context.Context, first, second string) (bool, error) {
	a, err := f.RepositoryIdentity(ctx, first)
	if err != nil {
		return false, err
	}
	b, err := f.RepositoryIdentity(ctx, second)
	return a == b, err
}

// Checkout writes revision's tree to a directory of its own under the
// scratch directory; release removes it.
func (f *Fake) Checkout(_ context.Context, repository, revision string) (string, func() error, error) {
	content, err := f.revisionOf(repository, revision)
	if err != nil {
		return "", nil, err
	}
	parent, err := os.MkdirTemp(f.scratch, "checkout-")
	if err != nil {
		return "", nil, err
	}
	dir := filepath.Join(parent, "workspace")
	if err := content.write(dir); err != nil {
		return "", nil, errors.Join(err, os.RemoveAll(parent))
	}
	return dir, func() error { return os.RemoveAll(parent) }, nil
}

// revisionOf is the tree of revision, resolved in the repository at root.
func (f *Fake) revisionOf(root, revision string) (tree, error) {
	r, err := f.repository(root)
	if err != nil {
		return nil, err
	}
	f.mu.Lock()
	resolved, err := r.resolve(revision)
	f.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return f.content(resolved)
}

// Place names the directory the clean copies of call are made in, under
// the scratch directory; nothing is made there.
func (f *Fake) Place(call string) string {
	return filepath.Join(f.scratch, "copy-"+call, "workspace")
}

// Copy writes revision's tree at dir, a directory Place named, and applies
// patch to it. It refuses with app.ErrPlaceTaken when something is there
// already, and removes a copy it cannot finish.
func (f *Fake) Copy(ctx context.Context, repository, dir, revision string, patch []byte) error {
	if err := f.made(dir); err != nil {
		return err
	}
	parent := filepath.Dir(dir)
	if err := os.Mkdir(parent, 0o700); errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("%s: %w", parent, app.ErrPlaceTaken)
	} else if err != nil {
		return err
	}
	content, err := f.revisionOf(repository, revision)
	if err == nil {
		err = content.write(dir)
	}
	if err == nil && len(patch) > 0 {
		err = f.Apply(ctx, dir, patch, false)
	}
	if err != nil {
		return errors.Join(err, os.RemoveAll(parent))
	}
	return nil
}

// Discard removes a checkout or clean copy the fake made; one already gone
// is success, and a directory the fake could not have made is refused.
func (f *Fake) Discard(_ context.Context, _, dir string) error {
	if err := f.made(dir); err != nil {
		return err
	}
	return os.RemoveAll(filepath.Dir(dir))
}

// made refuses a directory that is not a checkout or clean copy's under
// the scratch directory.
func (f *Fake) made(dir string) error {
	parent := filepath.Dir(dir)
	base := filepath.Base(parent)
	if f.scratch == "" || filepath.Base(dir) != "workspace" || filepath.Dir(parent) != filepath.Clean(f.scratch) ||
		!strings.HasPrefix(base, "checkout-") && !strings.HasPrefix(base, "copy-") {
		return fmt.Errorf("%s is not a checkout Agister made", dir)
	}
	return nil
}

// Identity names dir's files, every one of them, and keeps them under that
// name for Changes; revision does not change what is named.
func (f *Fake) Identity(_ context.Context, dir, _ string) (string, error) {
	content, err := read(dir)
	if err != nil {
		return "", err
	}
	identity := content.identity()
	f.mu.Lock()
	f.record(identity, content)
	f.mu.Unlock()
	return identity, nil
}

// State is the worktree at dir as git status would read it: HEAD is the
// branch its repository checked out last, and revision's tree the identity
// of revision's files. The fake knows no index, submodule or ignore rule:
// nothing is staged or dirty in a submodule, and every file is content, so
// an untracked one changes the identity.
func (f *Fake) State(_ context.Context, dir, revision string) (app.WorktreeState, error) {
	r, err := f.repository(dir)
	if err != nil {
		return app.WorktreeState{}, err
	}
	f.mu.Lock()
	head, err := r.resolve("HEAD")
	f.mu.Unlock()
	if err != nil {
		return app.WorktreeState{}, err
	}
	content, err := f.revisionOf(r.root, revision)
	if err != nil {
		return app.WorktreeState{}, err
	}
	return app.WorktreeState{Head: head, Tree: content.identity()}, nil
}

// Changes is the patch from one recorded content, a revision or an
// identity, to another; empty when they are the same.
func (f *Fake) Changes(_ context.Context, _, from, to string) ([]byte, error) {
	a, err := f.content(from)
	if err != nil {
		return nil, err
	}
	b, err := f.content(to)
	if err != nil {
		return nil, err
	}
	return diff(a, b), nil
}

// Apply applies a patch Changes made to dir's files; with check, it only
// checks that the whole patch applies. A patch that does not apply changes
// nothing. The patch is checked against dir's files as they are and as it
// leaves them, so a file may become a directory and back: it removes before
// it writes.
func (f *Fake) Apply(_ context.Context, dir string, patch []byte, check bool) error {
	content, err := read(dir)
	if err != nil {
		return err
	}
	files, _, err := applied(content, patch)
	if err != nil {
		return err
	}
	if check {
		return nil
	}
	for _, file := range files {
		if file.new == nil {
			if err := remove(dir, filepath.Join(dir, filepath.FromSlash(file.path))); err != nil {
				return err
			}
		}
	}
	for _, file := range files {
		if file.new == nil {
			continue
		}
		path := filepath.Join(dir, filepath.FromSlash(file.path))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(*file.new), 0o600); err != nil {
			return err
		}
	}
	return nil
}

// Rebuild names the content revision has, in the repository dir is in,
// with patch applied, as Identity names a directory's, and keeps it under
// that name for Changes. Nothing is written.
func (f *Fake) Rebuild(_ context.Context, dir, revision string, patch []byte) (string, error) {
	r, err := f.repository(dir)
	if err != nil {
		return "", err
	}
	content, err := f.revisionOf(r.root, revision)
	if err != nil {
		return "", err
	}
	_, produced, err := applied(content, patch)
	if err != nil {
		return "", err
	}
	identity := produced.identity()
	f.mu.Lock()
	f.record(identity, produced)
	f.mu.Unlock()
	return identity, nil
}

// applied is content with patch applied, and the files the patch changes;
// an error when the patch does not apply.
func applied(content tree, patch []byte) ([]change, tree, error) {
	files, err := parse(patch)
	if err != nil {
		return nil, nil, err
	}
	produced := tree{}
	for path, text := range content {
		produced[path] = text
	}
	for _, file := range files {
		text, ok := content[file.path]
		if ok != (file.old != nil) || ok && text != *file.old {
			return nil, nil, fmt.Errorf("patch does not apply: %s is not as the patch expects", file.path)
		}
		if file.new == nil {
			delete(produced, file.path)
		} else {
			produced[file.path] = *file.new
		}
	}
	for path := range produced {
		for at := path; strings.Contains(at, "/"); {
			at = at[:strings.LastIndexByte(at, '/')]
			if _, ok := produced[at]; ok {
				return nil, nil, fmt.Errorf("patch does not apply: %s would be both a file and a directory", at)
			}
		}
	}
	return files, produced, nil
}

// remove removes a file under dir and the directories its removal leaves
// empty, as git does, so a file may take a directory's place.
func remove(dir, path string) error {
	if err := os.Remove(path); err != nil {
		return err
	}
	for at := filepath.Dir(path); at != filepath.Clean(dir); at = filepath.Dir(at) {
		if os.Remove(at) != nil {
			break
		}
	}
	return nil
}

// Revision is the git.revision input: {rev} resolved to a revision.
func (f *Fake) Revision() app.InputProvider {
	return input(func(r *Repository, args map[string]string) (app.Resolved, error) {
		revision, err := r.resolve(args["rev"])
		return app.Resolved{Value: revision, Identity: revision, Revision: true}, err
	}, f)
}

// MergeBase is the git.merge_base input: the merge base of {base, head}.
func (f *Fake) MergeBase() app.InputProvider {
	return input(func(r *Repository, args map[string]string) (app.Resolved, error) {
		base, head, err := pair(r, args)
		if err != nil {
			return app.Resolved{}, err
		}
		revision, err := r.mergeBase(base, head)
		return app.Resolved{Value: revision, Identity: revision, Revision: true}, err
	}, f)
}

// Diff is the git.diff input: the patch from the merge base of {base,
// head} to head.
func (f *Fake) Diff() app.InputProvider {
	return input(func(r *Repository, args map[string]string) (app.Resolved, error) {
		from, to, err := changed(r, args)
		if err != nil {
			return app.Resolved{}, err
		}
		patch := string(diff(from, to))
		return app.Resolved{Value: patch, Identity: digest(patch)}, nil
	}, f)
}

// ChangedFiles is the git.changed_files input: the paths that differ from
// the merge base of {base, head} to head.
func (f *Fake) ChangedFiles() app.InputProvider {
	return input(func(r *Repository, args map[string]string) (app.Resolved, error) {
		from, to, err := changed(r, args)
		if err != nil {
			return app.Resolved{}, err
		}
		var files []string
		for _, path := range paths(from, to) {
			if !same(from, to, path) {
				files = append(files, path)
			}
		}
		return app.Resolved{Value: files, Identity: digest(strings.Join(files, "\n"))}, nil
	}, f)
}

// inputFunc is an input source resolved in the repository of the call's
// directory.
type inputFunc struct {
	resolve func(r *Repository, args map[string]string) (app.Resolved, error)
	fake    *Fake
}

func input(resolve func(r *Repository, args map[string]string) (app.Resolved, error), f *Fake) inputFunc {
	return inputFunc{resolve: resolve, fake: f}
}

func (i inputFunc) Resolve(_ context.Context, spec app.InputSpec) (app.Resolved, error) {
	r, err := i.fake.repository(spec.Cwd)
	if err != nil {
		return app.Resolved{}, err
	}
	i.fake.mu.Lock()
	defer i.fake.mu.Unlock()
	return i.resolve(r, spec.Args)
}

// pair resolves {base, head}. The fake is locked.
func pair(r *Repository, args map[string]string) (string, string, error) {
	base, err := r.resolve(args["base"])
	if err != nil {
		return "", "", err
	}
	head, err := r.resolve(args["head"])
	return base, head, err
}

// changed is the trees of the merge base of {base, head} and of head,
// refused when they are the same. The fake is locked.
func changed(r *Repository, args map[string]string) (tree, tree, error) {
	base, head, err := pair(r, args)
	if err != nil {
		return nil, nil, err
	}
	from, err := r.mergeBase(base, head)
	if err != nil {
		return nil, nil, err
	}
	a, b := r.fake.contents[from], r.fake.contents[head]
	if len(diff(a, b)) == 0 {
		return nil, nil, fmt.Errorf("no changes between %s and %s", args["base"], args["head"])
	}
	return a, b, nil
}

// read is the tree of dir's files. A file that is neither a regular file
// nor a directory is refused: the fake does not name it.
func read(dir string) (tree, error) {
	content := tree{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("%s: the fake names regular files only", path)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(dir, path)
		content[filepath.ToSlash(rel)] = string(data)
		return err
	})
	return content, err
}

// write writes the tree's files under dir.
func (t tree) write(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	for path, text := range t {
		full := filepath.Join(dir, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o700); err != nil {
			return err
		}
		if err := os.WriteFile(full, []byte(text), 0o600); err != nil {
			return err
		}
	}
	return nil
}

// identity names the tree by its paths and their contents.
func (t tree) identity() string {
	var parts []string
	for _, path := range paths(t, nil) {
		parts = append(parts, path, t[path])
	}
	return hash(append([]string{"tree"}, parts...)...)
}

// hash is a 40-digit hex name of parts, as long as git's.
func hash(parts ...string) string {
	sum := sha1.New()
	for _, part := range parts {
		sum.Write([]byte(strconv.Itoa(len(part)) + ":" + part))
	}
	return hex.EncodeToString(sum.Sum(nil))
}

func digest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// paths are the paths of both trees, sorted, each once.
func paths(a, b tree) []string {
	seen := map[string]bool{}
	var all []string
	for _, t := range []tree{a, b} {
		for path := range t {
			if !seen[path] {
				seen[path] = true
				all = append(all, path)
			}
		}
	}
	sort.Strings(all)
	return all
}

// same says whether path is in both trees, or neither, with one content.
func same(a, b tree, path string) bool {
	x, inA := a[path]
	y, inB := b[path]
	return inA == inB && x == y
}

// diff is the patch from a to b: for each path that differs, its whole old
// content removed and its whole new content added, in the shape of a
// unified diff.
func diff(a, b tree) []byte {
	var out bytes.Buffer
	for _, path := range paths(a, b) {
		if same(a, b, path) {
			continue
		}
		before, inA := a[path]
		after, inB := b[path]
		from, to := "a/"+path, "b/"+path
		if !inA {
			from = "/dev/null"
		}
		if !inB {
			to = "/dev/null"
		}
		removed, added := lines(before), lines(after)
		fmt.Fprintf(&out, "diff --git a/%s b/%s\n--- %s\n+++ %s\n@@ -%s +%s @@\n", path, path, from, to, span(len(removed)), span(len(added)))
		for _, side := range []struct {
			op    byte
			lines []string
		}{{'-', removed}, {'+', added}} {
			for _, line := range side.lines {
				out.WriteByte(side.op)
				out.WriteString(line)
				if !strings.HasSuffix(line, "\n") {
					out.WriteString("\n" + noNewline + "\n")
				}
			}
		}
	}
	return out.Bytes()
}

// span is a hunk's range of count lines from the first.
func span(count int) string {
	if count == 0 {
		return "0,0"
	}
	return "1," + strconv.Itoa(count)
}

// lines splits text into its lines, each with its newline; the last may
// have none.
func lines(text string) []string {
	var split []string
	for text != "" {
		end := strings.IndexByte(text, '\n') + 1
		if end == 0 {
			end = len(text)
		}
		split = append(split, text[:end])
		text = text[end:]
	}
	return split
}

// change is one file of a patch: its content before and after, nil where
// the file is absent.
type change struct {
	path     string
	old, new *string
}

// noNewline marks a patch line whose file ends without a newline.
const noNewline = `\ No newline at end of file`

// parse reads a patch diff made.
func parse(patch []byte) ([]change, error) {
	lines := strings.Split(strings.TrimSuffix(string(patch), "\n"), "\n")
	if len(patch) == 0 {
		lines = nil
	}
	at := 0
	next := func() string {
		if at == len(lines) {
			return ""
		}
		at++
		return lines[at-1]
	}
	malformed := func(line string) error { return fmt.Errorf("not a patch the fake made: %q", line) }
	// side reads count lines of a hunk, each prefixed with op, as the
	// content they make.
	side := func(op byte, count int) (*string, error) {
		var text strings.Builder
		for range count {
			line := next()
			if line == "" || line[0] != op {
				return nil, malformed(line)
			}
			text.WriteString(line[1:])
			if at < len(lines) && lines[at] == noNewline {
				at++
			} else {
				text.WriteString("\n")
			}
		}
		content := text.String()
		return &content, nil
	}
	var changes []change
	for at < len(lines) {
		if header := next(); !strings.HasPrefix(header, "diff --git ") {
			return nil, malformed(header)
		}
		from, to, hunk := next(), next(), next()
		var removed, added int
		if _, err := fmt.Sscanf(hunk, "@@ -%d,%d +%d,%d @@", new(int), &removed, new(int), &added); err != nil {
			return nil, malformed(hunk)
		}
		var c change
		var err error
		if c.old, err = side('-', removed); err != nil {
			return nil, err
		}
		if c.new, err = side('+', added); err != nil {
			return nil, err
		}
		switch {
		case strings.HasPrefix(from, "--- a/"):
			c.path = strings.TrimPrefix(from, "--- a/")
		case from == "--- /dev/null":
			c.old = nil
		default:
			return nil, malformed(from)
		}
		switch {
		case strings.HasPrefix(to, "+++ b/"):
			c.path = strings.TrimPrefix(to, "+++ b/")
		case to == "+++ /dev/null":
			c.new = nil
		default:
			return nil, malformed(to)
		}
		changes = append(changes, c)
	}
	return changes, nil
}
