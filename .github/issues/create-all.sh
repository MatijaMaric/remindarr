#!/usr/bin/env bash
# Creates GitHub issues from all markdown files in this directory.
# Requires: gh CLI authenticated (gh auth login)
#
# Usage: ./.github/issues/create-all.sh
# Dry run: DRY_RUN=1 ./.github/issues/create-all.sh

set -euo pipefail

REPO="MatijaMaric/remindarr"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for file in "$SCRIPT_DIR"/[0-9]*.md; do
  [ -f "$file" ] || continue

  # Extract title from frontmatter
  title=$(sed -n 's/^title: "\(.*\)"/\1/p' "$file")
  if [ -z "$title" ]; then
    echo "SKIP: No title found in $file"
    continue
  fi

  # Extract labels from frontmatter
  labels=$(sed -n 's/^labels: \["\(.*\)"\]/\1/p' "$file" | sed 's/", "/,/g')

  # Extract body (everything after the closing ---)
  body=$(sed '1,/^---$/d; 1,/^---$/d' "$file")

  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: Would create issue:"
    echo "  Title: $title"
    echo "  Labels: $labels"
    echo "  Body: $(echo "$body" | head -3)..."
    echo ""
  else
    echo "Creating: $title"
    gh issue create \
      --repo "$REPO" \
      --title "$title" \
      --label "$labels" \
      --body "$body" 2>&1 || echo "  FAILED: $file"
    sleep 1  # Rate limit courtesy
  fi
done

echo "Done."
