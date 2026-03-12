# GitMesh Dashboard Improvements — Design Spec

**Date:** 2026-03-12
**Version:** 0.3.0 (minor bump — new features, backwards compatible)

## Overview

Enhance the GitMesh dashboard with improved git operations, smarter UI organization, and quality-of-life features. All changes build on the existing architecture (BulkOperations + OperationQueue + GitRunner).

## 0. Prerequisite Bug Fix

### operationComplete handler
The current `operationComplete` handler in `App.tsx` receives `data: {}` (no `repoPath`) from the extension, so `Map.delete(undefined)` never clears operation indicators. Fix: either send `repoPath` per-repo in the extension's completion message, or clear all operations on `operationComplete`. This must be fixed before adding new multi-step operations (Sync) that depend on correct progress display.

### Updated Type Definitions
Extend `BulkOperationRequest.operation` union to include new operations:
```typescript
operation: 'fetch' | 'checkout' | 'push' | 'reset' | 'sync' | 'stash' | 'stashPop';
```

Add `'skipped'` to `OperationProgress.status` for repos skipped during sync/stash:
```typescript
status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
```

## 1. Push with Options

### Behavior
- Clicking the "Push" button (bulk or per-repo) shows a VS Code quick pick dialog:
  - **Push** — `git push`
  - **Force Push (--force-with-lease)** — `git push --force-with-lease`
- Selecting "Force Push" shows a confirmation warning dialog before executing
- Existing safety check retained: verify no uncommitted changes before pushing

### Implementation
- Extract push handling from the generic `handleBulkOperation()` in `webviewProvider.ts` into a dedicated `handleBulkPush()` method (following the pattern of `handleBulkCheckout()` and `handleBulkReset()`), then add the quick pick dialog there
- Add `pushMode?: 'normal' | 'force-with-lease'` to `BulkOperationRequest.options`
- Modify `executeBulkPush()` in `bulkOperations.ts` to use `['push', '--force-with-lease']` when `pushMode` is set

### Git Commands
| Mode | Command |
|------|---------|
| Normal | `git push` |
| Force | `git push --force-with-lease` |

## 2. Sync Operation

### Behavior
- New primary action button "Sync" in the action bar
- Per-repo logic:
  1. **Detect default branch:** Run `git remote set-head origin --auto` to ensure `origin/HEAD` is set, then `git symbolic-ref refs/remotes/origin/HEAD` → parse branch name. Fallback chain: `main` → `master`.
  2. **Skip dirty repos:** If repo has uncommitted changes → skip, report "Skipped: uncommitted changes"
  3. **Fetch:** `git fetch --all --prune` (consistent with existing bulk fetch)
  4. **If on default branch:** `git pull --ff-only`
  5. **If on feature branch:** Fetch only (already done in step 3)
- Progress indicator per repo shows: "Fetching..." → "Pulling..." → "Synced" / "Fetch only (feature branch)" / "Skipped: uncommitted changes"

### Implementation
- Add `bulkSync` message type to `MessageFromWebview`
- Add `executeBulkSync()` to `BulkOperations` class
- Sync is a multi-step operation per repo (fetch then conditional pull), implemented as a single queued operation with internal steps
- Add "Sync" button to webview action bar as a primary button

### Git Commands
| Step | Command |
|------|---------|
| Auto-detect HEAD | `git remote set-head origin --auto` |
| Detect default branch | `git symbolic-ref refs/remotes/origin/HEAD` |
| Fetch | `git fetch --all --prune` |
| Pull (default branch only) | `git pull --ff-only` |

## 3. Smart Checkout

### Behavior
- Existing Checkout button behavior unchanged: shows input dialog for branch name
- Per-repo logic enhanced:
  1. Try `git checkout <branch>`
  2. If exit code is non-zero → automatically try `git checkout -b <branch>`. If that also fails, report the error.
- If branch already exists on some repos and not others, it handles both cases automatically

### Implementation
- Modify `executeBulkCheckout()` in `bulkOperations.ts`
- Check exit code of first `git checkout` attempt
- If non-zero, fall back to `git checkout -b`; if both fail, throw error

### Git Commands
| Step | Command |
|------|---------|
| Switch to existing | `git checkout <branch>` |
| Create + switch | `git checkout -b <branch>` |

## 4. Bulk Stash / Stash Pop

### Behavior
- Two new operations in the "More" dropdown: "Stash" and "Stash Pop"
- **Stash:** `git stash push -m "GitMesh bulk stash"` per selected repo
  - Skips clean repos with "Nothing to stash"
- **Stash Pop:** `git stash pop` per selected repo
  - Skips repos with no stash entries with "No stash entries"
  - Conflicts from pop show as `'error'` status in the progress indicator with the conflict message (consistent with existing error handling pattern in OperationQueue)

### Implementation
- Add `bulkStash` and `bulkStashPop` message types
- Add `executeBulkStash()` and `executeBulkStashPop()` to `BulkOperations`
- Stash checks dirty status before running; stash pop checks `git stash list` output

### Git Commands
| Operation | Command |
|-----------|---------|
| Stash | `git stash push -m "GitMesh bulk stash"` |
| Stash Pop | `git stash pop` |
| Check stash exists | `git stash list` |

## 5. UI Reorganization

### Action Bar
- **Primary buttons** (always visible): **Sync**, **Push**
- **"More" dropdown button:** Fetch, Checkout, Stash, Stash Pop, Reset
- Selection controls (Select All / Clear) remain unchanged

### Per-Repo Context Menu
- **"..." icon button** on each repo card (top-right area, next to chevron), visible on hover
- **Right-click** on repo card opens the same menu
- Menu options: Sync, Push, Fetch, Checkout, Stash, Stash Pop, Reset
- Operates on that single repo — passes `[repo.path]` to existing bulk operation handlers
- No need to select the repo first

### Implementation
- Webview sends per-repo operations with single-element `repoPaths` array
- Add `ContextMenu` component that renders a positioned dropdown
- Attach `onContextMenu` handler to `RepositoryCard`
- Add "..." button with `onClick` that opens the same menu
- Menu dismisses on click outside or Escape key
- Keyboard accessible: arrow keys navigate, Enter selects

## 6. Sort Options

### Behavior
- Sort dropdown above the repo grid: "Sort: Workspace Order"
- Options:
  - **Workspace Order** (default) — uses `order` field from workspace file parsing
  - **Status** — dirty first (isDirty takes precedence), then untracked, then clean
  - **Branch** — alphabetical by branch name
  - **Name** — alphabetical by display name (alias or folder name)
- Selection persisted in VS Code `globalState` so it remembers across sessions

### Implementation
- Add `sortMode` message type for webview ↔ extension communication
- Store sort preference in `context.globalState`
- Sort logic lives in the webview `useMemo` that produces `filteredRepos`
- Default sort always applies workspace `order` as tiebreaker

## 7. Auto-Refresh on Window Focus

### Behavior
- When VS Code window regains focus → trigger a status refresh
- Debounced with 2-second cooldown to avoid rapid re-triggers
- Only refreshes status (`git status` poll), does not re-discover repos

### Implementation
- Register `vscode.window.onDidChangeWindowState` inside `WebviewProvider` constructor, add to `this.disposables`
- When `windowState.focused === true` and cooldown elapsed → call `refreshStatus()`
- Track last refresh timestamp for debounce

## 8. Extension Icon

### Behavior
- The GitMesh mesh logo (4 nodes connected by lines in a grid pattern) used as the extension icon
- Appears in VS Code extension sidebar, marketplace listing, and Cursor

### Implementation
- Export the existing `GitMeshLogo` SVG design as a 128x128 PNG
- Save to `images/icon.png`
- Add `"icon": "images/icon.png"` to `package.json`

## File Changes Summary

### Modified Files
| File | Changes |
|------|---------|
| `src/extension/types.ts` | Add `bulkSync`, `bulkStash`, `bulkStashPop` message types, `pushMode` and sync-related options |
| `src/extension/webviewProvider.ts` | Handle new message types, push options quick pick, sync routing |
| `src/extension/bulkOperations.ts` | Add `executeBulkSync()`, `executeBulkStash()`, `executeBulkStashPop()`, modify `executeBulkPush()` and `executeBulkCheckout()` |
| `src/extension/extension.ts` | Add `onDidChangeWindowState` listener for auto-refresh |
| `src/webview/src/App.tsx` | Reorganize action bar (primary + More dropdown), add sort dropdown, add context menu handling |
| `src/webview/src/App.css` | Styles for dropdown menus, context menu, sort bar, hover "..." button |
| `src/webview/src/components/RepositoryCard.tsx` | Add "..." button, right-click handler |
| `src/webview/src/types.ts` | Add new message types to webview-side types |
| `package.json` | Add `"icon": "images/icon.png"`, bump version |

### New Files
| File | Purpose |
|------|---------|
| `src/webview/src/components/ContextMenu.tsx` | Reusable dropdown/context menu component |
| `src/webview/src/components/DropdownMenu.tsx` | "More" dropdown button component for action bar |
| `images/icon.png` | 128x128 extension icon |

## Non-Goals
- Rebase operations (too conflict-prone for bulk use)
- Bulk commit/staging (too complex, better handled per-repo)
- Branch deletion (destructive, better as manual operation)
- Pull with merge (Sync uses `--ff-only` for safety)
