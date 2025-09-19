#!/bin/bash

PACKAGE="kwin"

# Get the latest the version
VERSION=$(dnf info "$PACKAGE" 2>/dev/null | awk '/^Version/ {print $3; exit}')

if [ -z "$VERSION" ]; then
  echo "Unable to parse version from $VERSION_BUILD."
  exit 0
fi

# Fetch upstream tag
TAG="v$VERSION"
echo "Fetching tag $TAG from upstream..."
git fetch --no-tags upstream "refs/tags/$TAG:refs/upstream/$TAG"

# Clear git note on the root commit
ROOT_COMMIT=$(git rev-list --max-parents=0 HEAD)

if git notes show "$ROOT_COMMIT" &>/dev/null; then
  git notes remove "$ROOT_COMMIT"
fi

# Mark branch as the build source in the git note
BRANCH="customize/$TAG"
echo "Marking $BRANCH as the build branch..."
git notes add -m "$BRANCH" "$ROOT_COMMIT"
git push origin refs/notes/commits --force

# Branch off tag
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH already exists."
  git checkout "$BRANCH"
  exit 0
fi

echo "Creating branch $BRANCH from upstream tag..."
git checkout "refs/upstream/$TAG" -b "$BRANCH"
