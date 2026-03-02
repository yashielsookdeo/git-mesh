# Design: CodeRabbit Config + Push-to-Main Release Workflow

**Date:** 2026-03-02
**Status:** Approved

---

## Goals

1. Add `.coderabbit.yaml` with focused, high-signal PR reviews (security, performance, TypeScript quality — no nitpicks).
2. Update the release workflow to trigger on push to `main`, auto-bump the patch version, and publish a GitHub Release with the packaged VSIX.

---

## 1. Release Workflow

### Approach (Approach A — modify `release.yml`)

Replace the existing tag-based trigger with a `push: branches: [main]` trigger. Add an auto-bump step and prevent infinite loop via `[skip ci]` in the version commit message.

### Flow

1. Push to `main` triggers the workflow (skipped if commit contains `[skip ci]`)
2. Checkout, setup Node 20, `npm ci`
3. Compile (`tsc`) and bundle (webpack)
4. Package VSIX (`npm run package`)
5. Bump patch version: `npm version patch --no-git-tag-version` (updates `package.json` only, no git tag yet)
6. Read the new version from `package.json`
7. Commit `package.json` with message `chore: bump version to vX.Y.Z [skip ci]`
8. Create git tag `vX.Y.Z`
9. Push commit + tag back to `main` (requires `contents: write` permission)
10. Create GitHub Release via `softprops/action-gh-release@v1`:
    - Attach `*.vsix`
    - Auto-generate release notes
    - Tag: `vX.Y.Z`
    - Not draft, not prerelease

### Key decisions

- `--no-git-tag-version` used so the workflow controls the tag, not `npm version`
- `[skip ci]` in commit message prevents the version-bump commit from re-triggering the workflow
- Existing `package.yml` (build on PR/push) remains unchanged — it still runs on PRs to validate the build

---

## 2. `.coderabbit.yaml`

### Focus areas

| Area | Rationale |
|---|---|
| Security | Extension + webview postMessage surface area is a real attack vector |
| Performance | React webview runs inside VS Code — re-renders and heavy ops matter |
| TypeScript best practices | Strict typing and proper VS Code API usage prevent subtle bugs |
| Concise, high-signal only | No cosmetic nitpicks — only flag real issues |

### Path-specific instructions

- `src/**/*.ts` — VS Code API correctness, strict typing, error handling, no shell injection
- `src/webview/**/*.tsx` — React re-render hygiene, XSS via postMessage, accessibility
- `.github/workflows/**` — secret exposure, permission scoping, supply chain risks

### Suppressed noise

- Markdown lint disabled (no doc style nitpicks)
- `request_changes_workflow: false` (reviews are advisory, not blocking)
- Poem/haiku summaries disabled
