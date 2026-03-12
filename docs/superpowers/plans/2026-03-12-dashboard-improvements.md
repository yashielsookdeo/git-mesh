# GitMesh Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance GitMesh with push options, sync, smart checkout, stash operations, UI reorganization (primary + "More" dropdown, per-repo context menu), sort options, auto-refresh on focus, and an extension icon.

**Architecture:** All new git operations plug into the existing `BulkOperations` → `OperationQueue` → `GitRunner` pipeline. The webview gets a reorganized action bar (primary buttons + "More" dropdown), per-repo context menus (right-click + "..." button), and a sort toolbar. Auto-refresh hooks into `vscode.window.onDidChangeWindowState`.

**Tech Stack:** TypeScript, React 18, VS Code Extension API, webpack

**Spec:** `docs/superpowers/specs/2026-03-12-dashboard-improvements-design.md`

---

## File Structure

### Modified Files
| File | Responsibility |
|------|----------------|
| `src/extension/types.ts` | Add new message types, operation types, `pushMode`, `'skipped'` status |
| `src/extension/operationQueue.ts` | Support `execute()` returning `false` to skip automatic success reporting |
| `src/extension/bulkOperations.ts` | Add sync, stash, stash pop executors; modify push and checkout |
| `src/extension/webviewProvider.ts` | Route new messages, push quick pick, sync handler, auto-refresh |
| `src/webview/src/types.ts` | Mirror new types on webview side |
| `src/webview/src/App.tsx` | Reorganized action bar, sort toolbar, context menu state, new message handlers |
| `src/webview/src/App.css` | Styles for dropdown, context menu, sort bar, "..." button, skipped status |
| `src/webview/src/components/RepositoryCard.tsx` | "..." button, right-click handler, skipped indicator |
| `src/webview/src/components/Icons.tsx` | New icons: SyncIcon, MoreIcon, EllipsisIcon, SortIcon, StashIcon |
| `package.json` | Add `"icon": "images/icon.png"` |

### New Files
| File | Responsibility |
|------|----------------|
| `src/webview/src/components/ContextMenu.tsx` | Positioned dropdown menu for per-repo and "More" actions |
| `images/icon.png` | 128x128 extension icon |

---

## Chunk 1: Prerequisite Fixes + Type Foundation

### Task 1: Fix operationComplete bug and update types

**Files:**
- Modify: `src/extension/types.ts`
- Modify: `src/webview/src/types.ts`
- Modify: `src/extension/webviewProvider.ts:265-272`
- Modify: `src/webview/src/App.tsx:47-55`

- [ ] **Step 1: Fix the operationComplete message to include repoPath**

In `src/extension/webviewProvider.ts`, the `handleOperationComplete()` method at line 265 sends `data: {}` with no `repoPath`. The webview's handler at `App.tsx:47` tries to `Map.delete(message.data.repoPath)` which deletes `undefined`. Fix by changing how `onComplete` works — the `OperationQueue` already sends per-repo progress with `'success'` or `'error'` status, so `operationComplete` should clear ALL remaining operations:

In `src/webview/src/App.tsx`, replace the `operationComplete` case (lines 47-55):

```typescript
case 'operationComplete':
  setTimeout(() => {
    setOperations(new Map());
  }, 2000);
  break;
```

- [ ] **Step 2: Update OperationQueue to support skipped operations**

The `OperationQueue.executeOperation()` unconditionally sends `status: 'success'` after `execute()` resolves. When an executor wants to report `'skipped'` (e.g., sync skipping a dirty repo), the queue overwrites it with success. Fix by having `execute()` optionally return `false` to signal the executor already reported its final status.

In `src/extension/operationQueue.ts`, change the `QueuedOperation` interface (line 7):

```typescript
execute: () => Promise<void | false>;
```

In `executeOperation()` (line 54-86), wrap the success reporting in a conditional:

```typescript
try {
  const result = await operation.execute();

  // If execute returns false, it handled its own progress reporting (e.g., skipped)
  if (result !== false) {
    this.onProgress({
      repoPath: operation.repoPath,
      operation: operation.operation,
      status: 'success',
      message: 'Completed successfully'
    });
  }
} catch (error) {
```

This is backwards-compatible — existing executors return `void` (which is not `false`), so they continue to get automatic success reporting.

- [ ] **Step 3: Update extension-side types**

In `src/extension/types.ts`, make these changes:

Add `'skipped'` to `OperationProgress.status` (line 53):
```typescript
status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
```

Extend `BulkOperationRequest.operation` (line 59):
```typescript
operation: 'fetch' | 'checkout' | 'push' | 'reset' | 'sync' | 'stash' | 'stashPop';
```

Add `pushMode` to options (inside the `options` object at line 61-65):
```typescript
options?: {
  branch?: string;
  resetMode?: 'soft' | 'mixed' | 'hard';
  resetCount?: number;
  pushMode?: 'normal' | 'force-with-lease';
};
```

Add new message types to `MessageFromWebview.type` (line 79):
```typescript
type: 'fetchRepos' | 'bulkFetch' | 'bulkCheckout' | 'bulkPush' | 'bulkReset' | 'bulkSync' | 'bulkStash' | 'bulkStashPop' | 'refreshStatus' | 'fetchGitTree' | 'setSortMode' | 'getSortMode';
```

Add to `MessageToWebview.type` (line 74):
```typescript
type: 'repoStatusUpdate' | 'operationProgress' | 'operationComplete' | 'logMessage' | 'gitTreeUpdate' | 'sortModeUpdate';
```

- [ ] **Step 3: Update webview-side types**

In `src/webview/src/types.ts`, mirror the changes:

Add `'skipped'` to `OperationProgress.status` (line 31):
```typescript
status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
```

Update `MessageFromWebview.type` (line 42):
```typescript
type: 'fetchRepos' | 'bulkFetch' | 'bulkCheckout' | 'bulkPush' | 'bulkReset' | 'bulkSync' | 'bulkStash' | 'bulkStashPop' | 'refreshStatus' | 'fetchGitTree' | 'setSortMode' | 'getSortMode';
```

Update `MessageToWebview.type` (line 37):
```typescript
type: 'repoStatusUpdate' | 'operationProgress' | 'operationComplete' | 'logMessage' | 'gitTreeUpdate' | 'sortModeUpdate';
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors (the new types are additive, no consumers break)

- [ ] **Step 6: Commit**

```bash
git add src/extension/types.ts src/webview/src/types.ts src/webview/src/App.tsx src/extension/operationQueue.ts
git commit -m "fix: operationComplete bug, skipped status support, and new type definitions"
```

---

## Chunk 2: Push with Options + Smart Checkout

### Task 2: Push with normal/force-with-lease quick pick

**Files:**
- Modify: `src/extension/webviewProvider.ts:83-109` (handleMessage switch) and `123-137` (handleBulkOperation)
- Modify: `src/extension/bulkOperations.ts:62-85` (executeBulkPush)

- [ ] **Step 1: Extract push into dedicated handler in webviewProvider**

In `src/extension/webviewProvider.ts`, change the `bulkPush` case (line 99-100) from:
```typescript
case 'bulkPush':
  await this.handleBulkOperation(message.data as BulkOperationRequest);
  break;
```
to:
```typescript
case 'bulkPush':
  await this.handleBulkPush(message.data as BulkOperationRequest);
  break;
```

Add the new `handleBulkPush()` method after `handleBulkCheckout()` (after line 157):

```typescript
private async handleBulkPush(request: BulkOperationRequest) {
  const pushMode = await vscode.window.showQuickPick(
    [
      { label: 'Push', description: 'Normal push', value: 'normal' },
      { label: 'Force Push (--force-with-lease)', description: 'Safe force push', value: 'force-with-lease' }
    ],
    {
      placeHolder: 'Select push mode',
      title: 'Push Mode'
    }
  );

  if (!pushMode) {
    return;
  }

  if (pushMode.value === 'force-with-lease') {
    const confirm = await vscode.window.showWarningMessage(
      'Force push will overwrite remote history. Are you sure?',
      { modal: true },
      'Yes, force push'
    );

    if (confirm !== 'Yes, force push') {
      return;
    }
  }

  request.options = { ...request.options, pushMode: pushMode.value as 'normal' | 'force-with-lease' };

  try {
    await this.bulkOperations.executeBulkPush(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Bulk push failed: ${errorMessage}`);
  }
}
```

- [ ] **Step 2: Update executeBulkPush to respect pushMode**

In `src/extension/bulkOperations.ts`, replace the push command at line 76:
```typescript
const result = await this.gitRunner.runGit(repoPath, ['push']);
```
with:
```typescript
const pushArgs = ['push'];
if (request.options?.pushMode === 'force-with-lease') {
  pushArgs.push('--force-with-lease');
}
const result = await this.gitRunner.runGit(repoPath, pushArgs);
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/extension/webviewProvider.ts src/extension/bulkOperations.ts
git commit -m "feat: push with normal and force-with-lease options"
```

### Task 3: Smart checkout (auto-create branch if not exists)

**Files:**
- Modify: `src/extension/bulkOperations.ts:38-60` (executeBulkCheckout)

- [ ] **Step 1: Update checkout to fall back to checkout -b**

In `src/extension/bulkOperations.ts`, replace the execute function inside `executeBulkCheckout` (lines 50-55):

```typescript
execute: async () => {
  const result = await this.gitRunner.runGit(repoPath, ['checkout', request.options!.branch!]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Checkout failed');
  }
}
```

with:

```typescript
execute: async () => {
  const result = await this.gitRunner.runGit(repoPath, ['checkout', request.options!.branch!]);
  if (result.exitCode !== 0) {
    // Branch doesn't exist — try creating it
    const createResult = await this.gitRunner.runGit(repoPath, ['checkout', '-b', request.options!.branch!]);
    if (createResult.exitCode !== 0) {
      throw new Error(createResult.stderr || 'Checkout failed');
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension/bulkOperations.ts
git commit -m "feat: smart checkout creates branch if it does not exist"
```

---

## Chunk 3: Sync Operation

### Task 4: Add executeBulkSync to BulkOperations

**Files:**
- Modify: `src/extension/bulkOperations.ts`

- [ ] **Step 1: Add the sync executor method**

Add this method to the `BulkOperations` class after `executeBulkReset()` (after line 121):

```typescript
async executeBulkSync(request: BulkOperationRequest): Promise<void> {
  this.outputChannel.appendLine(
    `[BulkOperations] Starting bulk sync for ${request.repoPaths.length} repos`
  );

  const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
    repoPath,
    operation: 'sync',
    execute: async () => {
      // Check for uncommitted changes
      const statusResult = await this.gitRunner.runGit(repoPath, ['status', '--porcelain']);
      if (statusResult.stdout.trim().length > 0) {
        this.onProgress({
          repoPath,
          operation: 'sync',
          status: 'skipped',
          message: 'Skipped: uncommitted changes'
        });
        return false; // Signal queue to skip automatic success reporting
      }

      // Detect default branch
      const defaultBranch = await this.detectDefaultBranch(repoPath);

      // Get current branch
      const branchResult = await this.gitRunner.runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const currentBranch = branchResult.stdout.trim();

      // Fetch
      this.onProgress({
        repoPath,
        operation: 'sync',
        status: 'running',
        message: 'Fetching...'
      });
      const fetchResult = await this.gitRunner.runGit(repoPath, ['fetch', '--all', '--prune']);
      if (fetchResult.exitCode !== 0) {
        throw new Error(fetchResult.stderr || 'Fetch failed');
      }

      // Pull only if on default branch
      if (currentBranch === defaultBranch) {
        this.onProgress({
          repoPath,
          operation: 'sync',
          status: 'running',
          message: 'Pulling...'
        });
        const pullResult = await this.gitRunner.runGit(repoPath, ['pull', '--ff-only']);
        if (pullResult.exitCode !== 0) {
          throw new Error(pullResult.stderr || 'Pull --ff-only failed');
        }
      }
    }
  }));

  await this.operationQueue.enqueue(operations);
  this.onComplete();
}

private async detectDefaultBranch(repoPath: string): Promise<string> {
  // Try to auto-detect from remote
  await this.gitRunner.runGit(repoPath, ['remote', 'set-head', 'origin', '--auto']);
  const result = await this.gitRunner.runGit(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);

  if (result.exitCode === 0 && result.stdout.trim()) {
    // Output is like "refs/remotes/origin/main" — extract branch name
    const ref = result.stdout.trim();
    return ref.replace('refs/remotes/origin/', '');
  }

  // Fallback: check if "main" exists, then "master"
  const mainCheck = await this.gitRunner.runGit(repoPath, ['rev-parse', '--verify', 'refs/heads/main']);
  if (mainCheck.exitCode === 0) {
    return 'main';
  }

  const masterCheck = await this.gitRunner.runGit(repoPath, ['rev-parse', '--verify', 'refs/heads/master']);
  if (masterCheck.exitCode === 0) {
    return 'master';
  }

  return 'main';
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension/bulkOperations.ts
git commit -m "feat: add bulk sync with default branch detection"
```

### Task 5: Route sync messages in webviewProvider

**Files:**
- Modify: `src/extension/webviewProvider.ts:83-109`

- [ ] **Step 1: Add bulkSync case to handleMessage switch**

In `src/extension/webviewProvider.ts`, add after the `bulkReset` case (after line 104):

```typescript
case 'bulkSync':
  await this.handleBulkSync(message.data as BulkOperationRequest);
  break;
```

- [ ] **Step 2: Add handleBulkSync method**

Add after the `handleBulkPush` method:

```typescript
private async handleBulkSync(request: BulkOperationRequest) {
  try {
    await this.bulkOperations.executeBulkSync(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Bulk sync failed: ${errorMessage}`);
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/extension/webviewProvider.ts
git commit -m "feat: route sync messages in webview provider"
```

---

## Chunk 4: Stash Operations

### Task 6: Add stash and stash pop executors

**Files:**
- Modify: `src/extension/bulkOperations.ts`

- [ ] **Step 1: Add executeBulkStash method**

Add to `BulkOperations` class after `executeBulkSync`:

```typescript
async executeBulkStash(request: BulkOperationRequest): Promise<void> {
  this.outputChannel.appendLine(
    `[BulkOperations] Starting bulk stash for ${request.repoPaths.length} repos`
  );

  const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
    repoPath,
    operation: 'stash',
    execute: async () => {
      // Check if there's anything to stash
      const statusResult = await this.gitRunner.runGit(repoPath, ['status', '--porcelain']);
      if (statusResult.stdout.trim().length === 0) {
        this.onProgress({
          repoPath,
          operation: 'stash',
          status: 'skipped',
          message: 'Nothing to stash'
        });
        return false;
      }

      const result = await this.gitRunner.runGit(repoPath, ['stash', 'push', '-m', 'GitMesh bulk stash']);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || 'Stash failed');
      }
    }
  }));

  await this.operationQueue.enqueue(operations);
  this.onComplete();
}

async executeBulkStashPop(request: BulkOperationRequest): Promise<void> {
  this.outputChannel.appendLine(
    `[BulkOperations] Starting bulk stash pop for ${request.repoPaths.length} repos`
  );

  const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
    repoPath,
    operation: 'stashPop',
    execute: async () => {
      // Check if there are stash entries
      const listResult = await this.gitRunner.runGit(repoPath, ['stash', 'list']);
      if (listResult.stdout.trim().length === 0) {
        this.onProgress({
          repoPath,
          operation: 'stashPop',
          status: 'skipped',
          message: 'No stash entries'
        });
        return false;
      }

      const result = await this.gitRunner.runGit(repoPath, ['stash', 'pop']);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || 'Stash pop failed');
      }
    }
  }));

  await this.operationQueue.enqueue(operations);
  this.onComplete();
}
```

- [ ] **Step 2: Route stash messages in webviewProvider**

In `src/extension/webviewProvider.ts`, add cases to `handleMessage` switch:

```typescript
case 'bulkStash':
  await this.handleBulkStash(message.data as BulkOperationRequest);
  break;
case 'bulkStashPop':
  await this.handleBulkStashPop(message.data as BulkOperationRequest);
  break;
```

Add handler methods:

```typescript
private async handleBulkStash(request: BulkOperationRequest) {
  try {
    await this.bulkOperations.executeBulkStash(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Bulk stash failed: ${errorMessage}`);
  }
}

private async handleBulkStashPop(request: BulkOperationRequest) {
  try {
    await this.bulkOperations.executeBulkStashPop(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Bulk stash pop failed: ${errorMessage}`);
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/extension/bulkOperations.ts src/extension/webviewProvider.ts
git commit -m "feat: add bulk stash and stash pop operations"
```

---

## Chunk 5: Auto-Refresh on Window Focus

### Task 7: Add window focus listener

**Files:**
- Modify: `src/extension/webviewProvider.ts:17-37` (constructor)

- [ ] **Step 1: Add focus listener and debounce tracking**

In `src/extension/webviewProvider.ts`, add a class property after `currentRepos` (line 15):

```typescript
private lastRefreshTime: number = 0;
```

At the end of the constructor (after line 36, before the closing `}`), add:

```typescript
// Auto-refresh on window focus
const focusDisposable = vscode.window.onDidChangeWindowState((state) => {
  if (state.focused && this.panel) {
    const now = Date.now();
    if (now - this.lastRefreshTime > 2000) {
      this.lastRefreshTime = now;
      this.refreshStatus();
    }
  }
});
this.disposables.push(focusDisposable);
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension/webviewProvider.ts
git commit -m "feat: auto-refresh repo status on window focus"
```

---

## Chunk 6: Sort Options + Persistence

### Task 8: Add sort mode persistence in extension

**Files:**
- Modify: `src/extension/webviewProvider.ts`

- [ ] **Step 1: Add sort mode message handlers**

In the `handleMessage` switch, add cases:

```typescript
case 'setSortMode':
  await this.context.globalState.update('gitmesh.sortMode', message.data?.sortMode || 'workspace');
  break;
case 'getSortMode':
  this.postMessage({
    type: 'sortModeUpdate',
    data: { sortMode: this.context.globalState.get('gitmesh.sortMode', 'workspace') }
  });
  break;
```

- [ ] **Step 2: Send initial sort mode on panel creation**

In the `show()` method, after the `onDidReceiveMessage` setup (after line 64), add:

```typescript
// Send persisted sort mode to webview
this.postMessage({
  type: 'sortModeUpdate',
  data: { sortMode: this.context.globalState.get('gitmesh.sortMode', 'workspace') }
});
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/extension/webviewProvider.ts
git commit -m "feat: persist sort mode preference in global state"
```

### Task 9: Add sort UI and logic in webview

**Files:**
- Modify: `src/webview/src/App.tsx`
- Modify: `src/webview/src/App.css`

- [ ] **Step 1: Add sort state and message handler**

In `src/webview/src/App.tsx`, add state after `operations` state (line 16):

```typescript
const [sortMode, setSortMode] = useState<'workspace' | 'status' | 'branch' | 'name'>('workspace');
```

Add a case to `handleMessage` (inside the switch, before the closing `}`):

```typescript
case 'sortModeUpdate':
  setSortMode(message.data.sortMode || 'workspace');
  break;
```

- [ ] **Step 2: Update filteredRepos to apply sorting**

Replace the `filteredRepos` useMemo (lines 68-76) with:

```typescript
const filteredRepos = useMemo(() => {
  let result = repos;

  if (searchQuery.trim()) {
    const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    result = result.filter(repo => {
      const statusText = repo.isDirty ? 'modified' : repo.hasUntracked ? 'untracked' : 'clean';
      const searchable = `${repo.alias || ''} ${repo.name} ${repo.branch} ${statusText}`.toLowerCase();
      return keywords.every(kw => searchable.includes(kw));
    });
  }

  const sorted = [...result];
  switch (sortMode) {
    case 'status':
      sorted.sort((a, b) => {
        const statusOrder = (r: RepoStatus) => r.isDirty ? 0 : r.hasUntracked ? 1 : 2;
        const diff = statusOrder(a) - statusOrder(b);
        return diff !== 0 ? diff : (a.order ?? 999) - (b.order ?? 999);
      });
      break;
    case 'branch':
      sorted.sort((a, b) => {
        const diff = a.branch.localeCompare(b.branch);
        return diff !== 0 ? diff : (a.order ?? 999) - (b.order ?? 999);
      });
      break;
    case 'name':
      sorted.sort((a, b) => {
        const nameA = (a.alias || a.name).toLowerCase();
        const nameB = (b.alias || b.name).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    case 'workspace':
    default:
      // Already sorted by order from the extension
      break;
  }

  return sorted;
}, [repos, searchQuery, sortMode]);
```

- [ ] **Step 3: Add sort mode change handler**

Add after the `deselectAll` function (after line 152):

```typescript
const handleSortChange = (mode: 'workspace' | 'status' | 'branch' | 'name') => {
  setSortMode(mode);
  postMessage({ type: 'setSortMode', data: { sortMode: mode } });
};
```

- [ ] **Step 4: Add sort bar UI**

After the search bar `</div>` (after line 199), add a sort bar:

```tsx
<div className="sort-bar">
  <span className="sort-label">Sort:</span>
  {(['workspace', 'status', 'branch', 'name'] as const).map(mode => (
    <button
      key={mode}
      className={`sort-option ${sortMode === mode ? 'active' : ''}`}
      onClick={() => handleSortChange(mode)}
    >
      {mode === 'workspace' ? 'Workspace Order' : mode.charAt(0).toUpperCase() + mode.slice(1)}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Add sort bar styles**

In `src/webview/src/App.css`, add after the search bar styles (after line 158):

```css
/* ── Sort Bar ── */
.sort-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--gm-md);
  font-size: 11px;
}

.sort-label {
  color: var(--vscode-descriptionForeground);
  margin-right: 4px;
  font-weight: 500;
}

.sort-option {
  padding: 2px 8px;
  font-size: 11px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  border: 1px solid transparent;
  border-radius: var(--gm-radius);
  cursor: pointer;
}

.sort-option:hover:not(:disabled) {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.sort-option.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
```

- [ ] **Step 6: Add skipped status style**

In `src/webview/src/App.css`, add after the `.operation-indicator.error` rule (after line 462):

```css
.operation-indicator.skipped {
  color: var(--vscode-descriptionForeground);
}
```

- [ ] **Step 7: Verify build**

Run: `npm run compile`
Expected: Compiles without errors

- [ ] **Step 8: Commit**

```bash
git add src/webview/src/App.tsx src/webview/src/App.css
git commit -m "feat: add sort options with workspace order default"
```

---

## Chunk 7: UI Reorganization — Action Bar + Icons

### Task 10: Add new icons

**Files:**
- Modify: `src/webview/src/components/Icons.tsx`

- [ ] **Step 1: Add SyncIcon, MoreIcon, and EllipsisIcon**

In `src/webview/src/components/Icons.tsx`, add after the `GitMeshLogo` component (after line 75):

```tsx
export const SyncIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2.006 8.267L.78 9.5 0 8.73l2.09-2.07.76.01 2.09 2.12-.76.76-1.167-1.18a5 5 0 0 0 9.4 1.96l.72.26a5.75 5.75 0 0 1-10.8-2.32h-.327zM13.994 7.733l1.227-1.233.78.77-2.09 2.07-.76-.01-2.09-2.12.76-.76 1.167 1.18a5 5 0 0 0-9.4-1.96l-.72-.26a5.75 5.75 0 0 1 10.8 2.32h.327z" />
    </svg>
);

export const MoreIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
);

export const EllipsisIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
    </svg>
);

export const SkipIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM5 7.25h6v1.5H5v-1.5z" />
    </svg>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/src/components/Icons.tsx
git commit -m "feat: add sync, more, ellipsis, and skip icons"
```

### Task 11: Reorganize action bar with primary buttons + More dropdown

**Files:**
- Create: `src/webview/src/components/ContextMenu.tsx`
- Modify: `src/webview/src/App.tsx`
- Modify: `src/webview/src/App.css`

- [ ] **Step 1: Create the ContextMenu component**

Create `src/webview/src/components/ContextMenu.tsx`:

```tsx
import React, { useEffect, useRef, useCallback } from 'react';

export interface MenuItem {
  label: string;
  action: string;
  danger?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onSelect: (action: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const focusIndex = useRef(0);

  const focusItem = useCallback((index: number) => {
    const menu = menuRef.current;
    if (!menu) return;
    const buttons = menu.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    if (buttons[index]) {
      focusIndex.current = index;
      buttons[index].focus();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusItem(Math.min(focusIndex.current + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusItem(Math.max(focusIndex.current - 1, 0));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    // Focus first item
    requestAnimationFrame(() => focusItem(0));

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, items.length, focusItem]);

  // Adjust position so menu doesn't overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 1000,
  };

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      {items.map((item) => (
        <button
          key={item.action}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          onClick={() => {
            onSelect(item.action);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Add context menu and dropdown styles**

In `src/webview/src/App.css`, add at the end:

```css
/* ── Context Menu / Dropdown ── */
.context-menu {
  background: var(--vscode-menu-background, var(--vscode-sideBar-background));
  border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
  border-radius: var(--gm-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  min-width: 160px;
  padding: 4px 0;
  animation: fadeIn 0.1s ease;
}

.context-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  color: var(--vscode-menu-foreground, var(--vscode-foreground));
  border: none;
  border-radius: 0;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
}

.context-menu-item:hover,
.context-menu-item:focus {
  background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
  color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
  outline: none;
}

.context-menu-item.danger {
  color: var(--vscode-errorForeground, #f85149);
}

.context-menu-item.danger:hover,
.context-menu-item.danger:focus {
  background: rgba(248, 81, 73, 0.1);
}

/* More dropdown wrapper */
.more-dropdown {
  position: relative;
}

/* Repo card ellipsis button */
.repo-actions-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  border: none;
  border-radius: var(--gm-radius);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--gm-fast), background var(--gm-fast);
}

.repo-card:hover .repo-actions-btn,
.repo-actions-btn:focus {
  opacity: 1;
}

.repo-actions-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
```

- [ ] **Step 3: Reorganize action bar in App.tsx**

In `src/webview/src/App.tsx`, update imports to include the new icons and ContextMenu:

```typescript
import { RefreshIcon, SearchIcon, GitMeshLogo, FolderOpenIcon, SyncIcon, MoreIcon } from './components/Icons';
import { ContextMenu, MenuItem } from './components/ContextMenu';
```

Add state for the "More" dropdown after `sortMode` state:

```typescript
const [moreMenuPos, setMoreMenuPos] = useState<{ x: number; y: number } | null>(null);
```

Add the Sync handler after `handleRefresh` (after line 144):

```typescript
const handleBulkSync = () => {
  postMessage({
    type: 'bulkSync',
    data: { operation: 'sync', repoPaths: Array.from(selectedRepos) }
  });
};

const handleBulkStash = () => {
  postMessage({
    type: 'bulkStash',
    data: { operation: 'stash', repoPaths: Array.from(selectedRepos) }
  });
};

const handleBulkStashPop = () => {
  postMessage({
    type: 'bulkStashPop',
    data: { operation: 'stashPop', repoPaths: Array.from(selectedRepos) }
  });
};
```

Replace the `<div className="bulk-actions">` block (lines 215-228) with:

```tsx
<div className="bulk-actions">
  <button className="action-btn" onClick={handleBulkSync} disabled={selectedRepos.size === 0} title="Sync repositories">
    <SyncIcon /> Sync
  </button>
  <button className="action-btn" onClick={handleBulkPush} disabled={selectedRepos.size === 0} title="Push to remote">
    Push
  </button>
  <div className="more-dropdown">
    <button
      className="action-btn secondary"
      disabled={selectedRepos.size === 0}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMoreMenuPos({ x: rect.left, y: rect.bottom + 4 });
      }}
    >
      <MoreIcon /> More
    </button>
    {moreMenuPos && (
      <ContextMenu
        items={[
          { label: 'Fetch', action: 'fetch' },
          { label: 'Checkout', action: 'checkout' },
          { label: 'Stash', action: 'stash' },
          { label: 'Stash Pop', action: 'stashPop' },
          { label: 'Reset', action: 'reset', danger: true },
        ]}
        position={moreMenuPos}
        onSelect={(action) => {
          switch (action) {
            case 'fetch': handleBulkFetch(); break;
            case 'checkout': handleBulkCheckout(); break;
            case 'stash': handleBulkStash(); break;
            case 'stashPop': handleBulkStashPop(); break;
            case 'reset': handleBulkReset(); break;
          }
        }}
        onClose={() => setMoreMenuPos(null)}
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify build**

Run: `npm run compile`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```bash
git add src/webview/src/components/ContextMenu.tsx src/webview/src/App.tsx src/webview/src/App.css
git commit -m "feat: reorganize action bar with primary buttons and More dropdown"
```

---

## Chunk 8: Per-Repo Context Menu

### Task 12: Add context menu to RepositoryCard

**Files:**
- Modify: `src/webview/src/components/RepositoryCard.tsx`
- Modify: `src/webview/src/App.tsx`

- [ ] **Step 1: Update RepositoryCard props and add menu triggers**

In `src/webview/src/components/RepositoryCard.tsx`, update the imports:

```typescript
import { ChevronIcon, GitBranchIcon, FolderIcon, CheckIcon, EllipsisIcon, SkipIcon } from './Icons';
```

Add `onContextAction` to the props interface (after `onToggleExpand`):

```typescript
onContextAction: (action: string) => void;
```

Add it to the destructured props:

```typescript
onContextAction,
```

Add the right-click handler after `handleCheckboxClick`:

```typescript
const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  onContextAction('__open_menu__:' + e.clientX + ':' + e.clientY);
};

const handleEllipsisClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  const rect = e.currentTarget.getBoundingClientRect();
  onContextAction('__open_menu__:' + rect.left + ':' + (rect.bottom + 4));
};
```

Add `onContextMenu={handleContextMenu}` to the outer `<div className="repo-card ...">`:

```tsx
<div className={`repo-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`} style={style} onContextMenu={handleContextMenu}>
```

Add the "..." button in `repo-card-right`, before the chevron div:

```tsx
<button className="repo-actions-btn" onClick={handleEllipsisClick} title="More actions">
  <EllipsisIcon />
</button>
```

Update the operation indicator to handle `'skipped'` status (replace the operation block, lines 78-85):

```tsx
{operation && (
  <div className={`operation-indicator ${operation.status}`}>
    {operation.status === 'running' && <div className="loading-spinner" />}
    {operation.status === 'success' && <CheckIcon />}
    {operation.status === 'skipped' && <SkipIcon />}
    <span className="operation-label">{operation.operation}</span>
    {operation.message && <span>{operation.message}</span>}
    {operation.error && <span>{operation.error}</span>}
  </div>
)}
```

- [ ] **Step 2: Handle per-repo context actions in App.tsx**

In `src/webview/src/App.tsx`, add state for the repo context menu:

```typescript
const [repoMenuState, setRepoMenuState] = useState<{ pos: { x: number; y: number }; repoPath: string } | null>(null);
```

Add a handler function:

```typescript
const handleRepoContextAction = (repoPath: string, action: string) => {
  if (action.startsWith('__open_menu__:')) {
    const parts = action.split(':');
    setRepoMenuState({
      pos: { x: parseFloat(parts[1]), y: parseFloat(parts[2]) },
      repoPath
    });
    return;
  }

  const data = { operation: action, repoPaths: [repoPath] };
  switch (action) {
    case 'sync': postMessage({ type: 'bulkSync', data }); break;
    case 'push': postMessage({ type: 'bulkPush', data }); break;
    case 'fetch': postMessage({ type: 'bulkFetch', data }); break;
    case 'checkout': postMessage({ type: 'bulkCheckout', data }); break;
    case 'stash': postMessage({ type: 'bulkStash', data }); break;
    case 'stashPop': postMessage({ type: 'bulkStashPop', data }); break;
    case 'reset': postMessage({ type: 'bulkReset', data }); break;
  }
};
```

Pass the handler to RepositoryCard:

```tsx
onContextAction={(action) => handleRepoContextAction(repo.path, action)}
```

Add the repo context menu render (inside the repo-grid div, after the map):

```tsx
{repoMenuState && (
  <ContextMenu
    items={[
      { label: 'Sync', action: 'sync' },
      { label: 'Push', action: 'push' },
      { label: 'Fetch', action: 'fetch' },
      { label: 'Checkout', action: 'checkout' },
      { label: 'Stash', action: 'stash' },
      { label: 'Stash Pop', action: 'stashPop' },
      { label: 'Reset', action: 'reset', danger: true },
    ]}
    position={repoMenuState.pos}
    onSelect={(action) => handleRepoContextAction(repoMenuState.repoPath, action)}
    onClose={() => setRepoMenuState(null)}
  />
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run compile`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/webview/src/components/RepositoryCard.tsx src/webview/src/App.tsx
git commit -m "feat: add per-repo context menu with right-click and ellipsis button"
```

---

## Chunk 9: Extension Icon + Final Polish

### Task 13: Create and add extension icon

**Files:**
- Create: `images/icon.png`
- Modify: `package.json`

- [ ] **Step 1: Create the icon directory and generate PNG**

Create a Node.js script to generate a 128x128 PNG from the GitMeshLogo SVG. The SVG uses a 16x16 viewBox with 4 circles (nodes) at corners connected by lines (mesh pattern).

```bash
mkdir -p images
```

Create a simple SVG file and use it. Since the extension needs a static PNG (no CSS variables), use a fixed color scheme — `#007ACC` (VS Code blue) on transparent background:

Create `images/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 16 16" fill="none">
  <circle cx="4" cy="4" r="2" fill="#007ACC" />
  <circle cx="12" cy="4" r="2" fill="#007ACC" />
  <circle cx="4" cy="12" r="2" fill="#007ACC" />
  <circle cx="12" cy="12" r="2" fill="#007ACC" />
  <line x1="4" y1="6" x2="4" y2="10" stroke="#007ACC" stroke-width="1.2" />
  <line x1="12" y1="6" x2="12" y2="10" stroke="#007ACC" stroke-width="1.2" />
  <line x1="6" y1="4" x2="10" y2="4" stroke="#007ACC" stroke-width="1.2" />
  <line x1="6" y1="12" x2="10" y2="12" stroke="#007ACC" stroke-width="1.2" />
  <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="#007ACC" stroke-width="1" opacity="0.4" />
  <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="#007ACC" stroke-width="1" opacity="0.4" />
</svg>
```

Convert SVG to PNG using one of:
- If `sharp` is available: `npx sharp-cli -i images/icon.svg -o images/icon.png -w 128 -h 128`
- If on macOS: `qlmanage -t -s 128 -o images images/icon.svg` then rename
- Or use `sips` or any converter available

If no converter is available, the SVG can be used directly — VS Code marketplace accepts SVG via `"icon": "images/icon.svg"` though PNG is preferred.

- [ ] **Step 2: Add icon to package.json**

In `package.json`, add after the `"license"` field (after line 33):

```json
"icon": "images/icon.png",
```

(Or `"icon": "images/icon.svg"` if PNG conversion wasn't possible)

- [ ] **Step 3: Commit**

```bash
git add images/ package.json
git commit -m "feat: add GitMesh extension icon"
```

### Task 14: Bump version and final build verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version to 0.3.0**

In `package.json`, change version (line 5):
```json
"version": "0.3.0",
```

- [ ] **Step 2: Full build and package test**

Run: `npm run compile && npm run package`
Expected: Builds successfully and produces `gitmesh-0.3.0.vsix`

- [ ] **Step 3: Verify VSIX contents include new files**

Run: `npx vsce ls | head -30`
Expected: Should list `images/icon.png`, `out/extension/extension.js`, `out/webview/bundle.js`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.3.0 for dashboard improvements release"
```

- [ ] **Step 5: Push to trigger release**

```bash
git push origin main
```

Expected: Release pipeline auto-bumps to 0.3.1, creates tag, publishes GitHub Release with VSIX.
