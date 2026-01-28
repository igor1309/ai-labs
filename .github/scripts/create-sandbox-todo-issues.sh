#!/usr/bin/env bash
set -euo pipefail

# Creates GitHub Issues for newly added sandbox entries and TODO.md files.
# Required environment variables:
#   BEFORE_SHA - commit SHA before the push
#   AFTER_SHA  - commit SHA after the push
#   GH_TOKEN   - GitHub token for API access

ensure_label_exists() {
  local name="$1"
  local color="$2"
  local description="$3"
  if ! gh label list --json name --jq ".[].name" | grep -qx "$name"; then
    echo "Creating label: $name"
    gh label create "$name" --color "$color" --description "$description"
  fi
}

BEFORE="${BEFORE_SHA:-}"
AFTER="${AFTER_SHA:-}"

if [[ -z "$AFTER" ]]; then
  echo "Error: AFTER_SHA is required"
  exit 1
fi

# Handle initial push (before is all zeros or missing)
if [[ "$BEFORE" == "0000000000000000000000000000000000000000" ]] || [[ -z "$BEFORE" ]]; then
  BEFORE="4b825dc642cb6eb9a060e54bf8d69288fbee4904"  # empty tree SHA
fi

echo "Comparing $BEFORE to $AFTER"

# Get added and renamed files
DIFF_OUTPUT=$(git diff --name-status "$BEFORE" "$AFTER" 2>/dev/null || true)

if [[ -z "$DIFF_OUTPUT" ]]; then
  echo "No changes detected"
  exit 0
fi

echo "Diff output:"
echo "$DIFF_OUTPUT"

# Track sandbox entries and TODO.md files
declare -A SANDBOX_ENTRIES=()
TODO_FILES=""

while IFS=$'\t' read -r status path newpath; do
  [[ -z "$status" ]] && continue

  # For renames (R followed by percentage), use the new path
  if [[ "$status" =~ ^R[0-9]* ]]; then
    path="$newpath"
    status="A"
  fi

  # Skip if not added
  if [[ "$status" != "A" ]]; then
    continue
  fi

  # Check if file/directory exists at HEAD
  if ! git cat-file -e "HEAD:$path" 2>/dev/null; then
    # Try as directory (check if any file under this path exists)
    if ! git ls-tree HEAD -- "$path" 2>/dev/null | grep -q .; then
      echo "Path does not exist at HEAD: $path"
      continue
    fi
  fi

  # Check for sandbox top-level entries
  if [[ "$path" =~ ^sandbox/([^/]+)(/.*)?$ ]]; then
    entry="${BASH_REMATCH[1]}"
    SANDBOX_ENTRIES["$entry"]=1
  fi

  # Check for TODO.md files
  file_basename=$(basename "$path")
  if [[ "$file_basename" == "TODO.md" ]]; then
    TODO_FILES="$TODO_FILES"$'\n'"$path"
  fi
done <<< "$DIFF_OUTPUT"

# Remove leading newline from TODO_FILES
TODO_FILES="${TODO_FILES#$'\n'}"

echo ""
echo "Detected sandbox entries: ${!SANDBOX_ENTRIES[*]:-none}"
echo "Detected TODO.md files: ${TODO_FILES:-none}"

# Ensure required labels exist
if [[ ${#SANDBOX_ENTRIES[@]} -gt 0 ]]; then
  ensure_label_exists "sandbox" "5319E7" "Experimental sandbox entries"
fi
if [[ -n "$TODO_FILES" ]]; then
  ensure_label_exists "todo" "FBCA04" "TODO.md files requiring attention"
fi

# Create issues for sandbox entries
for entry in "${!SANDBOX_ENTRIES[@]}"; do
  TITLE="[sandbox] $entry"
  echo ""
  echo "Processing sandbox entry: $entry"

  # Check if open issue with exact title exists
  EXISTING=$(gh issue list --state open --search "in:title \"[sandbox] $entry\"" --json title --jq ".[] | select(.title == \"$TITLE\") | .title" 2>/dev/null || true)

  if [[ -n "$EXISTING" ]]; then
    echo "Issue already exists: $TITLE"
    continue
  fi

  BODY="New sandbox entry detected."$'\n'$'\n'"Path: [sandbox/$entry](sandbox/$entry)"

  echo "Creating issue: $TITLE"
  gh issue create --title "$TITLE" --label "sandbox" --body "$BODY"
done

# Create issues for TODO.md files
if [[ -n "$TODO_FILES" ]]; then
  while IFS= read -r todo_path; do
    [[ -z "$todo_path" ]] && continue
    TITLE="[todo] $todo_path"
    echo ""
    echo "Processing TODO.md: $todo_path"

    # Check if open issue with exact title exists
    EXISTING=$(gh issue list --state open --search "in:title \"[todo] $todo_path\"" --json title --jq ".[] | select(.title == \"$TITLE\") | .title" 2>/dev/null || true)

    if [[ -n "$EXISTING" ]]; then
      echo "Issue already exists: $TITLE"
      continue
    fi

    BODY="New TODO.md file detected."$'\n'$'\n'"Path: [$todo_path]($todo_path)"

    echo "Creating issue: $TITLE"
    gh issue create --title "$TITLE" --label "todo" --body "$BODY"
  done <<< "$TODO_FILES"
fi

echo ""
echo "Done."
