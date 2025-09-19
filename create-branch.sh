#!/bin/bash

PACKAGE="kwin"

# Get latest stable version, build number from dnf
VERSION_BUILD=$(dnf check-update "$PACKAGE" 2>/dev/null | awk "/^$PACKAGE\./ { print \$2 }" | head -n1)

if [ -z "$VERSION_BUILD" ]; then
  echo "No update found for $PACKAGE, or already up to date."
  exit 0
fi

# Extract the version
VERSION=$(echo "$VERSION_BUILD" | sed 's/-.*//')

if [ -z "$VERSION" ]; then
  echo "Unable to parse version from $VERSION_BUILD."
  exit 0
fi

# Fetch upstream tag
TAG="v$VERSION"
echo "Fetching tag $TAG from upstream..."
git fetch --no-tags upstream "refs/tags/$TAG:refs/upstream/$TAG"

# Branch off tag
BRANCH="customize/$TAG"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH already exists."
  git checkout "$BRANCH"
  exit 0
fi

echo "Creating branch $BRANCH from upstream tag..."
git checkout "refs/upstream/$TAG" -b "$BRANCH"

