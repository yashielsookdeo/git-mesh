# CodeRabbit Config + Push-to-Main Release Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `.coderabbit.yaml` for focused PR reviews and update `release.yml` to auto-bump the patch version and publish a GitHub Release on every push to `main`.

**Architecture:** Two independent changes — (1) a new `.coderabbit.yaml` at the repo root that configures CodeRabbit's AI review behavior, and (2) a rewrite of `.github/workflows/release.yml` to trigger on push to `main`, bump the patch version, commit it back with `[skip ci]`, tag, and publish a GitHub Release with the packaged VSIX attached.

**Tech Stack:** GitHub Actions, CodeRabbit YAML config, npm versioning, `softprops/action-gh-release@v2`

---

### Task 1: Add `.coderabbit.yaml`

**Files:**
- Create: `.coderabbit.yaml`

**Step 1: Create the file**

Create `.coderabbit.yaml` at the repo root with this exact content:

```yaml
# CodeRabbit configuration
# Docs: https://docs.coderabbit.ai/guides/configure-coderabbit

language: "en-US"

reviews:
  profile: "assertive"
  request_changes_workflow: false
  high_level_summary: true
  poem: false
  review_status: true
  collapse_walkthrough: false
  auto_review:
    enabled: true
    drafts: false
  path_instructions:
    - path: "src/**/*.ts"
      instructions: |
        Focus on: strict TypeScript typing (avoid `any`), correct VS Code API usage,
        proper error handling, and security (no shell injection, no unsanitised inputs).
        Flag missing `dispose()` calls on VS Code resources.
    - path: "src/webview/**/*.tsx"
      instructions: |
        Focus on: React performance (unnecessary re-renders, missing `useCallback`/`useMemo`),
        XSS risks via postMessage (always validate message origin and shape),
        and accessibility (ARIA labels, keyboard navigation).
    - path: ".github/workflows/**"
      instructions: |
        Focus on: secret exposure (no secrets in logs or env), overly broad permissions
        (principle of least privilege), supply chain risks (pin action versions to SHA),
        and injection via untrusted inputs in `run:` steps.

tools:
  markdownlint:
    enabled: false
  shellcheck:
    enabled: true
```

**Step 2: Verify the file parses correctly**

CodeRabbit uses standard YAML. Validate locally:

```bash
npx js-yaml .coderabbit.yaml
```

Expected: prints the parsed object with no errors.

**Step 3: Commit**

```bash
git add .coderabbit.yaml
git commit -m "chore: add coderabbit config with security and performance focus"
```

---

### Task 2: Update `release.yml` — push-to-main trigger with auto-bump

**Files:**
- Modify: `.github/workflows/release.yml`

**Context:** The current `release.yml` triggers on `v*` tags. We're replacing that with a push-to-main trigger that:
1. Compiles and packages the VSIX
2. Bumps the patch version in `package.json` (no git tag from npm)
3. Commits the bump back to `main` with `[skip ci]` to prevent re-triggering
4. Creates a git tag and pushes it
5. Creates a GitHub Release with the VSIX attached

**Step 1: Replace `.github/workflows/release.yml` entirely**

```yaml
name: Release Extension

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  release:
    # Skip if this push was the automated version bump commit
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          # Fetch full history so git can push back to main
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compile extension
        run: npm run compile

      - name: Package VSIX
        run: npm run package

      - name: Bump patch version
        run: npm version patch --no-git-tag-version

      - name: Get new version
        id: version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT

      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Commit version bump
        run: |
          git add package.json
          git commit -m "chore: bump version to v${{ steps.version.outputs.version }} [skip ci]"

      - name: Create and push tag
        run: |
          git tag "v${{ steps.version.outputs.version }}"
          git push origin main --follow-tags

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: "v${{ steps.version.outputs.version }}"
          name: "v${{ steps.version.outputs.version }}"
          files: ./*.vsix
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload VSIX artifact
        uses: actions/upload-artifact@v4
        with:
          name: gitmesh-release-${{ steps.version.outputs.version }}
          path: '*.vsix'
          retention-days: 90
```

**Step 2: Verify the YAML is valid**

```bash
npx js-yaml .github/workflows/release.yml
```

Expected: prints the parsed object with no errors.

**Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "chore: trigger release on push to main with auto patch bump"
```

---

### Task 3: Update WORKFLOWS.md to reflect new behaviour

**Files:**
- Modify: `.github/WORKFLOWS.md`

**Step 1: Update the release workflow section**

Find the `### 2. Release Extension` section and update it to document:
- New trigger: push to `main` (not tags)
- Auto-bump behaviour and `[skip ci]` guard
- Remove the manual `npm version` + `git push --tags` steps from "Creating a Release"
- New "Creating a Release" is: just push to main

The updated "Creating a Release" section should read:

```markdown
## Creating a Release

Releases are fully automatic. Every push to `main` triggers:

1. Compile and package the VSIX
2. Auto-bump the patch version in `package.json`
3. Commit the version bump back to `main` with `[skip ci]` (prevents loop)
4. Create and push a git tag (e.g. `v0.1.2`)
5. Publish a GitHub Release with the `.vsix` attached and auto-generated release notes

**To release:** just push to `main`. No manual steps needed.

**To bump minor or major:** update `package.json` version manually before pushing,
and the workflow will bump patch on top of that.
```

**Step 2: Commit**

```bash
git add .github/WORKFLOWS.md
git commit -m "docs: update workflows doc to reflect push-to-main release trigger"
```

---

## Testing the Release Workflow

After pushing these changes to `main`, the workflow will run immediately (since it's a push to main). Verify:

1. Go to the **Actions** tab on GitHub
2. Confirm the "Release Extension" workflow ran (and skipped for the version-bump commit)
3. Check that a new **Release** appears in the Releases section with a `.vsix` attached
4. Confirm `package.json` version was bumped in the latest commit

If the workflow fails on `git push origin main --follow-tags`, the repo may require branch protection rules to allow the `GITHUB_TOKEN` to push. In that case, you'll need to either:
- Disable "Require status checks" for the bot push, or
- Use a Personal Access Token (PAT) stored as a secret instead of `GITHUB_TOKEN`
