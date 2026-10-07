package pages

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Skills: the skill folders the runtimes of the shown settings load, in
// the repo and the user's home, and each skill's SKILL.md (ADR-011); and
// the skills of the settings layers, which settings name (ADR-021).
// Nothing here writes, and nothing of a skill is read but its SKILL.md.

// SkillHomes are the home folders the skill folders are found under, from
// pages' own environment: a call started with another environment loads
// other folders.
type SkillHomes struct {
	// Home is the user's home ($HOME); without it no home folder is read.
	Home string
	// CodexHome is $CODEX_HOME, empty for its default ~/.codex.
	CodexHome string
	// PiAgentDir is $PI_CODING_AGENT_DIR, empty for its default ~/.pi/agent.
	PiAgentDir string
}

// SkillHomesFrom reads the skill homes from getenv; userHome stands in for
// an unset HOME.
func SkillHomesFrom(getenv func(string) string, userHome string) SkillHomes {
	home := getenv("HOME")
	if home == "" {
		home = userHome
	}
	return SkillHomes{Home: home, CodexHome: getenv("CODEX_HOME"), PiAgentDir: getenv("PI_CODING_AGENT_DIR")}
}

// A skill folder's state when its skills could not be listed.
const (
	FolderMissing      = "missing"
	FolderBrokenLink   = "broken_link"
	FolderNotDirectory = "not_a_directory"
	// FolderNotFollowed: a folder inside another (synced/, .system/) that
	// is a symlinked directory, below that folder's top level.
	FolderNotFollowed = "not_followed"
)

// A skill's state when its SKILL.md was not read.
const (
	SkillTooLarge   = "too_large"
	SkillOutside    = "outside_skill"
	SkillBrokenLink = "broken_link"
	SkillMissing    = "missing"
	SkillNotAFile   = "not_a_file"
	// SkillLinkedFolder: a settings skill whose folder is a symbolic link,
	// which Agister refuses and pages does not follow (ADR-021 rule 1).
	SkillLinkedFolder = "linked_folder"
)

// The checks that fail on the front matter.
const (
	failedNoFront     = "no front matter"
	failedName        = "name is missing or empty"
	failedDescription = "description is missing or empty"
)

// SkillsReply is what /api/skills answers.
type SkillsReply struct {
	Path string `json:"path"`
	// Home: the path is Agister home, so only the home folders are read.
	Home bool `json:"home"`
	// Adapters are the runtime adapters of the runtimes the settings
	// define, repo over home.
	Adapters []string      `json:"adapters"`
	Folders  []SkillFolder `json:"folders"`
	// Settings are the skills the settings layers hold (ADR-021), the
	// repo's first: what an agent's or a process's skills name.
	Settings []SettingsSkill `json:"settings"`
}

// SettingsSkill is a skill of a settings layer, skills/<name>/SKILL.md,
// with its layer's scope, repo or home. Its checks are a skill's, and one
// more: the folder holds SKILL.md alone, as Agister refuses one that holds
// anything else (ADR-021 rule 1). It is the page's one source of a
// settings skill's existence and layer (D-16): a skill that is there is
// listed whatever its state, so a broken repo skill still goes over
// home's, as it does in Agister.
type SettingsSkill struct {
	Scope string `json:"scope"`
	Skill
}

// SkillFolder is one folder a runtime loads skills from.
type SkillFolder struct {
	// Scope is repo or home.
	Scope string `json:"scope"`
	// Folder is the folder as the table of ADR-011 names it.
	Folder string `json:"folder"`
	Path   string `json:"path"`
	Real   string `json:"real,omitempty"`
	Link   string `json:"link,omitempty"`
	// Adapters are the runtime adapters that load this folder.
	Adapters []string `json:"adapters"`
	State    string   `json:"state,omitempty"`
	Skills   []Skill  `json:"skills"`
}

// Skill is one entry of a skill folder.
type Skill struct {
	// Name is the entry's name in its folder.
	Name string `json:"name"`
	Path string `json:"path"`
	Real string `json:"real,omitempty"`
	Link string `json:"link,omitempty"`
	// State is set when SKILL.md was not read; Content is then empty.
	State   string `json:"state,omitempty"`
	Content string `json:"content,omitempty"`
	// Description is the front matter's, when it has one.
	Description string `json:"description,omitempty"`
	Checks      Checks `json:"checks"`
}

// Checks are the structural checks of a skill (ADR-011 rule 7), nothing
// more: a pass says nothing of what the skill does.
type Checks struct {
	Passed bool     `json:"passed"`
	Failed []string `json:"failed,omitempty"`
}

// folderSpec is a row of ADR-011's table: where an adapter loads skills.
type folderSpec struct {
	scope, name, path string
	// nested: the folder sits in another (synced/, .system/), whose
	// listing leaves it out.
	nested bool
	// grouped: the skills sit one level down, in groups
	// (synced/<id>/<name>/SKILL.md).
	grouped bool
}

// skillFolderSpecs are the folders adapter loads, in the repo at repo
// (none when empty) and in homes.
func skillFolderSpecs(adapter, repo string, homes SkillHomes) []folderSpec {
	var specs []folderSpec
	inRepo := func(rel ...string) {
		if repo == "" {
			return
		}
		for _, r := range rel {
			specs = append(specs, folderSpec{scope: "repo", name: r, path: filepath.Join(repo, filepath.FromSlash(r))})
		}
	}
	inHome := func(name, path string, nested, grouped bool) {
		if filepath.IsAbs(homes.Home) && filepath.IsAbs(path) {
			specs = append(specs, folderSpec{scope: "home", name: name, path: path, nested: nested, grouped: grouped})
		}
	}
	user := func(rel string) { inHome("~/"+rel, filepath.Join(homes.Home, filepath.FromSlash(rel)), false, false) }
	// Claude Code's synced skills, which OpenCode was seen to load with the
	// rest of ~/.claude/skills.
	synced := func() {
		inHome("~/.claude/skills/synced", filepath.Join(homes.Home, ".claude", "skills", "synced"), true, true)
	}
	switch adapter {
	case "claude-code":
		inRepo(".claude/skills")
		user(".claude/skills")
		synced()
	case "codex":
		inRepo(".agents/skills", ".codex/skills")
		user(".agents/skills")
		name, dir := "~/.codex/skills", filepath.Join(homes.Home, ".codex", "skills")
		if homes.CodexHome != "" {
			name, dir = "$CODEX_HOME/skills", filepath.Join(homes.CodexHome, "skills")
		}
		inHome(name, dir, false, false)
		inHome(name+"/.system", filepath.Join(dir, ".system"), true, false)
	case "pi":
		inRepo(".agents/skills", ".pi/skills")
		user(".agents/skills")
		name, dir := "~/.pi/agent/skills", filepath.Join(homes.Home, ".pi", "agent", "skills")
		if homes.PiAgentDir != "" {
			name, dir = "$PI_CODING_AGENT_DIR/skills", filepath.Join(homes.PiAgentDir, "skills")
		}
		inHome(name, dir, false, false)
	case "opencode":
		inRepo(".agents/skills", ".claude/skills", ".opencode/skills")
		user(".agents/skills")
		user(".claude/skills")
		synced()
		user(".config/opencode/skills")
	}
	return specs
}

// ReadSkills reads the skill folders adapters load in the repo at repo
// (home folders only when repo is empty) and in homes: repo folders first,
// each folder once with every adapter that loads it.
func ReadSkills(repo string, adapters []string, homes SkillHomes) []SkillFolder {
	return readSkills(repo, adapters, homes, os.ReadFile)
}

// readSkills is ReadSkills reading each SKILL.md with read, the only file
// contents it reads.
func readSkills(repo string, adapters []string, homes SkillHomes, read func(string) ([]byte, error)) []SkillFolder {
	var order []string
	byPath := map[string]*SkillFolder{}
	specs := map[string]folderSpec{}
	for _, scope := range []string{"repo", "home"} {
		for _, adapter := range adapters {
			for _, spec := range skillFolderSpecs(adapter, repo, homes) {
				if spec.scope != scope {
					continue
				}
				f := byPath[spec.path]
				if f == nil {
					f = &SkillFolder{Scope: spec.scope, Folder: spec.name, Path: spec.path}
					byPath[spec.path] = f
					order = append(order, spec.path)
					specs[spec.path] = spec
				}
				if !contains(f.Adapters, adapter) {
					f.Adapters = append(f.Adapters, adapter)
				}
			}
		}
	}
	folders := make([]SkillFolder, 0, len(order))
	for _, path := range order {
		f := byPath[path]
		readFolder(f, specs[path], byPath, read)
		folders = append(folders, *f)
	}
	return folders
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// readFolder lists f's skills. A nested folder (synced/, .system/) is not
// followed when it is a symlink; entries that are folders of their own
// are left to their own listing. A grouped folder's skills are read from
// its groups.
func readFolder(f *SkillFolder, spec folderSpec, folders map[string]*SkillFolder, read func(string) ([]byte, error)) {
	f.Skills = []Skill{}
	info, err := os.Lstat(f.Path)
	if err != nil {
		f.State = FolderMissing
		return
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		f.Link, _ = os.Readlink(f.Path)
		if spec.nested {
			f.State = FolderNotFollowed
			return
		}
	}
	real, err := filepath.EvalSymlinks(f.Path)
	if err != nil {
		f.State = FolderBrokenLink
		return
	}
	f.Real = real
	if info, err := os.Stat(real); err != nil || !info.IsDir() {
		f.State = FolderNotDirectory
		return
	}
	entries, err := os.ReadDir(real)
	if err != nil {
		f.State = FolderMissing
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		// Hidden entries (.git, .DS_Store) are not skills; .system is read
		// as a folder of its own.
		if strings.HasPrefix(name, ".") || folders[filepath.Join(f.Path, name)] != nil {
			continue
		}
		if spec.grouped {
			f.Skills = append(f.Skills, readGroup(filepath.Join(f.Path, name), filepath.Join(real, name), read)...)
			continue
		}
		if skill, ok := readSkill(filepath.Join(f.Path, name), filepath.Join(real, name), name, read); ok {
			f.Skills = append(f.Skills, skill)
		}
	}
}

// readGroup reads the skills of a group (synced/<id>), at path as the
// folder names it and at inReal inside the folder's real path. A group
// that is a symlinked directory is below the folder's top level and is not
// followed; a plain file is no group.
func readGroup(path, inReal string, read func(string) ([]byte, error)) []Skill {
	info, err := os.Lstat(inReal)
	if err != nil || !info.IsDir() {
		return nil
	}
	entries, err := os.ReadDir(inReal)
	if err != nil {
		return nil
	}
	var skills []Skill
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if skill, ok := readSkill(filepath.Join(path, name), filepath.Join(inReal, name), name, read); ok {
			skills = append(skills, skill)
		}
	}
	return skills
}

// readSkill reads the skill entry name, at path as the folder names it and
// at inReal inside the folder's real path, its SKILL.md with read. A plain
// file is no skill.
func readSkill(path, inReal, name string, read func(string) ([]byte, error)) (Skill, bool) {
	s := Skill{Name: name, Path: path}
	info, err := os.Lstat(inReal)
	if err != nil {
		return s, false
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		s.Link, _ = os.Readlink(inReal)
		real, err := filepath.EvalSymlinks(inReal)
		if err != nil {
			return failed(s, SkillBrokenLink, "the link does not resolve"), true
		}
		s.Real = real
		if info, err := os.Stat(real); err != nil || !info.IsDir() {
			return s, false
		}
	} else if !info.IsDir() {
		return s, false
	} else {
		s.Real = inReal
	}

	file := filepath.Join(s.Real, "SKILL.md")
	if _, err := os.Lstat(file); err != nil {
		return failed(s, SkillMissing, "SKILL.md is missing"), true
	}
	realFile, err := filepath.EvalSymlinks(file)
	if err != nil {
		return failed(s, SkillBrokenLink, "SKILL.md's link does not resolve"), true
	}
	if !within(s.Real, realFile) {
		return failed(s, SkillOutside, "SKILL.md is outside its skill"), true
	}
	fileInfo, err := os.Stat(realFile)
	if err != nil || !fileInfo.Mode().IsRegular() {
		return failed(s, SkillNotAFile, "SKILL.md is not a file"), true
	}
	if fileInfo.Size() > fileCap {
		return failed(s, SkillTooLarge, "SKILL.md is over 256 KB"), true
	}
	data, err := read(realFile)
	if err != nil {
		return failed(s, SkillMissing, "SKILL.md cannot be read"), true
	}
	s.Content = string(data)
	s.Description, s.Checks = check(data, name)
	return s, true
}

// settingsSkillFile is the one file a settings skill's folder holds.
const settingsSkillFile = "SKILL.md"

// readSettingsSkills reads the skills of the settings layer dir, a
// .agister folder: each folder in its skills/, its SKILL.md with read, the
// only file it reads. As Agister lists them, a symbolic link there is a
// skill too, a broken one, and is not followed; a file is no skill. Only a
// skills/ that does not exist holds no skills: one that cannot be listed is
// an error, as Agister refuses a call for it rather than take home's.
func readSettingsSkills(scope, dir string, read func(string) ([]byte, error)) ([]SettingsSkill, error) {
	skills := []SettingsSkill{}
	root := filepath.Join(dir, "skills")
	entries, err := os.ReadDir(root)
	if errors.Is(err, fs.ErrNotExist) {
		return skills, nil
	}
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		path := filepath.Join(root, entry.Name())
		switch {
		case entry.Type()&fs.ModeSymlink != 0:
			s := Skill{Name: entry.Name(), Path: path}
			s.Link, _ = os.Readlink(path)
			skills = append(skills, SettingsSkill{Scope: scope, Skill: failed(s, SkillLinkedFolder,
				"the folder is a symbolic link: a skill is a folder holding its SKILL.md")})
		case entry.IsDir():
			skills = append(skills, SettingsSkill{Scope: scope, Skill: readSettingsSkill(path, entry.Name(), read)})
		}
	}
	return skills, nil
}

// readSettingsSkill reads the settings skill name at path. Its SKILL.md is
// read only when it is a regular file, not a link, within the size limit;
// then the checks of any skill run on it, and its name is compared as
// written, as Agister compares it: a padded name is not the folder's. A
// folder holding anything else fails one more check, which names what it
// holds and reads none of it.
func readSettingsSkill(path, name string, read func(string) ([]byte, error)) Skill {
	s := Skill{Name: name, Path: path}
	entries, err := os.ReadDir(path)
	if err != nil {
		return failed(s, SkillMissing, "the folder cannot be read")
	}
	var others []string
	for _, entry := range entries {
		if entry.Name() != settingsSkillFile {
			others = append(others, entry.Name())
		}
	}
	file := filepath.Join(path, settingsSkillFile)
	info, err := os.Lstat(file)
	switch {
	case err != nil:
		s = failed(s, SkillMissing, "SKILL.md is missing")
	case !info.Mode().IsRegular():
		s = failed(s, SkillNotAFile, "SKILL.md is not a regular file")
	case info.Size() > fileCap:
		s = failed(s, SkillTooLarge, "SKILL.md is over 256 KB")
	default:
		data, err := read(file)
		if err != nil {
			s = failed(s, SkillMissing, "SKILL.md cannot be read")
			break
		}
		s.Content = string(data)
		s.Description, s.Checks = check(data, name)
		if declared := literalName(data); declared != name && strings.TrimSpace(declared) == name {
			s.Checks = Checks{Failed: append(s.Checks.Failed, fmt.Sprintf("name %q is not the folder's name %s", declared, name))}
		}
	}
	if len(others) > 0 {
		s.Checks = Checks{Failed: append(s.Checks.Failed,
			"holds "+strings.Join(others, ", ")+" beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call")}
	}
	return s
}

func failed(s Skill, state, check string) Skill {
	s.State = state
	s.Checks = Checks{Failed: []string{check}}
	return s
}

// within: path is dir or below it.
func within(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// check runs the structural checks of ADR-011 rule 7 on a SKILL.md of the
// skill folder folder, and returns its description.
func check(data []byte, folder string) (string, Checks) {
	front, err := frontMatter(data)
	if err != nil {
		return "", Checks{Failed: []string{err.Error()}}
	}
	var fails []string
	name := text(front["name"])
	description := text(front["description"])
	if name == "" {
		fails = append(fails, failedName)
	}
	if description == "" {
		fails = append(fails, failedDescription)
	}
	if name != "" && name != folder {
		fails = append(fails, "name "+name+" is not the folder's name "+folder)
	}
	return description, Checks{Passed: len(fails) == 0, Failed: fails}
}

// literalName is the front matter's name as written, untrimmed; empty when
// it has none.
func literalName(data []byte) string {
	front, err := frontMatter(data)
	if err != nil {
		return ""
	}
	name, _ := front["name"].(string)
	return name
}

func text(v any) string {
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

// frontMatter parses the YAML between a SKILL.md's opening --- line and the
// next one.
func frontMatter(data []byte) (map[string]any, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	lines := strings.SplitAfter(string(data), "\n")
	if strings.TrimRight(lines[0], "\r\n") != "---" {
		return nil, errors.New(failedNoFront)
	}
	for i := 1; i < len(lines); i++ {
		if strings.TrimRight(lines[i], " \t\r\n") != "---" {
			continue
		}
		front := map[string]any{}
		if err := yaml.Unmarshal([]byte(strings.Join(lines[1:i], "")), &front); err != nil {
			return nil, errors.New("front matter does not parse: " + err.Error())
		}
		return front, nil
	}
	return nil, errors.New("front matter does not parse: no closing ---")
}

// runtimeAdapters are the adapters of the runtimes the settings in dirs
// define, a later dir's runtime file replacing an earlier one's of the same
// name, as the page composes them: only the files settings admits, so a
// file the page never gets replaces nothing; one that does not parse still
// does. A runtime file holding a second YAML document is refused, as
// Agister refuses it.
func runtimeAdapters(read func(string) ([]byte, error), dirs ...string) ([]string, error) {
	byStem := map[string]string{}
	for _, dir := range dirs {
		files, err := settings(dir, read)
		if err != nil {
			continue
		}
		var names []string
		for rel := range files {
			name, ok := strings.CutPrefix(rel, "runtimes/")
			if ext := filepath.Ext(name); ok && !strings.Contains(name, "/") && (ext == ".yaml" || ext == ".yml") {
				names = append(names, name)
			}
		}
		sort.Strings(names)
		for _, name := range names {
			stem := strings.TrimSuffix(name, filepath.Ext(name))
			adapter, err := runtimeAdapter([]byte(files["runtimes/"+name]))
			if err != nil {
				return nil, statusError{http.StatusUnprocessableEntity, filepath.Join(dir, "runtimes", name) + ": " + err.Error()}
			}
			byStem[stem] = adapter
		}
	}
	adapters := []string{}
	for _, adapter := range byStem {
		if adapter != "" && !contains(adapters, adapter) {
			adapters = append(adapters, adapter)
		}
	}
	sort.Strings(adapters)
	return adapters, nil
}

// errNotOneDocument is Agister's problem for a settings file holding more
// than one YAML document (parseOneYAML).
var errNotOneDocument = errors.New("must hold exactly one YAML document")

// runtimeAdapter is the adapter a runtime file names, empty when it names
// none or does not parse. A second document after the first, even an
// empty one, is errNotOneDocument.
func runtimeAdapter(data []byte) (string, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	var document yaml.Node
	if err := decoder.Decode(&document); err != nil {
		return "", nil
	}
	var next yaml.Node
	if err := decoder.Decode(&next); !errors.Is(err, io.EOF) {
		return "", errNotOneDocument
	}
	var doc struct {
		Adapter string `yaml:"adapter"`
	}
	if document.Decode(&doc) != nil {
		return "", nil
	}
	return doc.Adapter, nil
}

// skillsAt answers /api/skills for path: a repo's absolute path, or ~,
// reading each file with read.
func skillsAt(path, agisterHome string, homes SkillHomes, read func(string) ([]byte, error)) (SkillsReply, error) {
	dir := filepath.Join(path, ".agister")
	if path == Home {
		dir = agisterHome
	}
	if !filepath.IsAbs(dir) {
		return SkillsReply{}, badRequest("path must be absolute or ~: " + path)
	}
	if !isDir(dir) {
		return SkillsReply{}, notFound("no .agister folder at " + dir)
	}
	reply := SkillsReply{Path: path, Home: filepath.Clean(dir) == filepath.Clean(agisterHome)}
	repo := ""
	reply.Settings = []SettingsSkill{}
	if reply.Home {
		adapters, err := runtimeAdapters(read, agisterHome)
		if err != nil {
			return SkillsReply{}, err
		}
		reply.Adapters = adapters
	} else {
		repo = filepath.Clean(path)
		adapters, err := runtimeAdapters(read, agisterHome, dir)
		if err != nil {
			return SkillsReply{}, err
		}
		reply.Adapters = adapters
		repoSkills, err := readSettingsSkills("repo", dir, read)
		if err != nil {
			return SkillsReply{}, err
		}
		reply.Settings = repoSkills
	}
	homeSkills, err := readSettingsSkills("home", agisterHome, read)
	if err != nil {
		return SkillsReply{}, err
	}
	reply.Settings = append(reply.Settings, homeSkills...)
	reply.Folders = readSkills(repo, reply.Adapters, homes, read)
	return reply, nil
}
