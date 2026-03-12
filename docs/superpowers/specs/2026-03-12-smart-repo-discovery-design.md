# Smart Repo Discovery & Search Improvements

## Problem

GitMesh rescans the filesystem on every activation, clearing and repopulating its repo cache. This causes:
1. **Duplicate repos** when overlapping workspace folders discover the same git repo via different scan paths
2. **UI flicker** as the repo list rebuilds from scratch each time
3. **Broken search** that doesn't work at all
4. **No ordering** — repos appear in arbitrary scan order, not the user's preferred structure

## Design

### 1. Workspace-First Repository Source

Replace the current `RepoDiscovery` class with a new `RepoSource` class that uses two sources in priority order:

**Source A — `.code-workspace` file parser:**
- Use `vscode.workspace.workspaceFile` API to get the active workspace file URI (if present)
- Parse as JSONC using the `jsonc-parser` package (required because workspace files contain `//` and `/* */` comments that `JSON.parse()` cannot handle)
- Read the `folders` array; for each entry:
  - Resolve `path` relative to the workspace file's directory
  - Check for `.git` directory — only include if it's a git repo
  - Store the `name` field as the repo's **alias** (display name)
  - Store the array index as the repo's **order**
- Commented-out entries are automatically excluded by the JSONC parser

**Source B — Filesystem scanner (fallback):**
- Existing recursive scan logic (max depth 5, skip node_modules etc.)
- Only runs for workspace folders NOT covered by a workspace file
- Repos found here get no alias (use folder name) and are ordered after all workspace-file repos

**Deduplication:**
- All discovered paths are resolved to absolute paths via `path.resolve()`
- A `Set<string>` of known paths prevents any repo from appearing twice
- Workspace-file entries take priority — if the scanner finds a repo already known from the workspace file, it's skipped

**No workspace file / first activation:**
- If `vscode.workspace.workspaceFile` is undefined, skip Source A entirely and use Source B only
- If no cache exists, show empty state until scan completes (same as current behavior)

### 2. Persistent Cache

**Storage:** VS Code `globalState` with the following structure (defined in `types.ts`):
```typescript
interface RepoCache {
  repos: Array<{
    path: string;       // absolute path
    alias?: string;     // from workspace file name field
    order: number;      // position in list
  }>;
  workspaceFileHash: string;  // SHA-256 of workspace file content (empty string if no workspace file)
  workspaceFoldersHash: string; // hash of workspace folder URIs (for no-workspace-file case)
  lastScanTimestamp: number;
}
```

**Activation flow:**
1. Load cached repos from `globalState` → send to webview immediately (no flicker)
2. Background: read workspace file (or workspace folder list), compute content hash
3. If hash matches cache → skip re-scan, start status polling
4. If hash differs (or no cache) → re-resolve repos, update cache, push diff to webview

**Cache invalidation:**
- Workspace file content hash change triggers re-parse
- For no-workspace-file case: hash the list of `vscode.workspace.workspaceFolders` URIs
- TTL fallback: re-scan if `lastScanTimestamp` is older than 24 hours
- Deleted repos: during re-scan, verify each cached path still has a `.git` directory; remove stale entries

**File watcher:** Watch the specific active workspace file (from `vscode.workspace.workspaceFile`) for changes. On save, re-parse and update the repo list live. Scoped to the single active file, not a glob.

### 3. Search Fix & Keyword Search

**Current bug:** Search filter in `App.tsx` is non-functional.

**Fix:**
- Build a searchable string per repo: `"${alias} ${folderName} ${branch} ${statusText}"` where `statusText` is derived from `isDirty`/`hasUntracked` booleans (e.g., `isDirty` → "modified", `hasUntracked` → "untracked", neither → "clean")
- Case-insensitive matching
- Space-separated keywords use AND logic — all keywords must match against the searchable string
- Example: `pos modified` → shows POS repos with uncommitted changes

### 4. Ordering

- Repos from the workspace file appear in their **exact file order** (array index)
- Repos from filesystem scan appear after workspace-file repos, sorted alphabetically
- Search results preserve this ordering (filtered, not re-sorted)

### 5. Alias Display

- Workspace-file repos show their `name` field as the **primary display name** (e.g., "POS - Stitch Core")
- Folder path shown as secondary/dimmer text below the alias
- Repos without an alias (from scanner) show folder name as primary

### 6. Type Changes

Extend `RepoStatus` in BOTH `src/extension/types.ts` AND `src/webview/src/types.ts` (both copies must be updated together):
```typescript
interface RepoStatus {
  path: string;
  name: string;
  alias?: string;      // NEW: display name from workspace file
  order: number;       // NEW: sort position
  branch: string;
  isDirty: boolean;    // KEPT: existing boolean field
  hasUntracked: boolean; // KEPT: existing boolean field
  lastUpdated: number; // KEPT: existing field
  ahead: number;
  behind: number;
}
```

### 7. Data Flow: Alias & Order Through the Pipeline

The `webviewProvider.ts` holds a `Map<string, { alias?: string; order: number }>` populated by RepoSource. When StatusPoller returns polled statuses, webviewProvider merges alias/order into each `RepoStatus` before posting to the webview. This keeps StatusPoller unchanged — it continues to poll by path and return raw git status. The merge happens in one place.

```
RepoSource → { path, alias, order }[] → webviewProvider (holds metadata map)
StatusPoller → { path, isDirty, ... }[] → webviewProvider (merges alias/order) → webview
```

## Files Changed

| File | Change |
|------|--------|
| `src/extension/repoDiscovery.ts` | Replace with `RepoSource` — workspace parser + dedup scanner + cache |
| `src/extension/webviewProvider.ts` | Hold alias/order metadata map, merge into polled statuses, load from cache on activation |
| `src/extension/types.ts` | Add `alias`, `order` fields to `RepoStatus`; add `RepoCache` interface |
| `src/webview/src/types.ts` | Add `alias`, `order` fields to `RepoStatus` (mirror extension types) |
| `src/webview/src/App.tsx` | Fix search (keyword AND matching), sort by order field |
| `src/webview/src/components/RepositoryCard.tsx` | Display alias as primary name, folder path as secondary |

## Files Unchanged

- `statusPoller.ts` — no changes needed; alias/order merged by webviewProvider after polling
- `gitRunner.ts` — no changes needed
- `bulkOperations.ts` — no changes needed
- `operationQueue.ts` — no changes needed
- `commands.ts` — no changes needed

## Out of Scope

- Manual add/remove UI
- Settings page (workspace file IS the configuration)
- Changes to git tree/commit history display
- Changes to bulk operations
