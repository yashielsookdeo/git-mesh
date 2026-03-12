# Smart Repo Discovery & Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitMesh load repos from `.code-workspace` files with persistent caching, deduplication, workspace ordering, alias display, and working keyword search.

**Architecture:** Replace `RepoDiscovery` with `RepoSource` that reads the active workspace file via `vscode.workspace.workspaceFile`, parses JSONC, and caches results in `globalState`. The webview provider merges alias/order metadata into polled statuses before sending to the React UI. Search is fixed with AND-keyword matching across alias, name, branch, and status text.

**Tech Stack:** TypeScript, VS Code Extension API, `jsonc-parser` npm package, React 18

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/extension/types.ts` | Shared types for extension side | Modify: add `alias?`, `order?` to `RepoStatus`; add `RepoCache`, `RepoMetadata` interfaces |
| `src/webview/src/types.ts` | Shared types for webview side | Modify: add `alias?`, `order?` to `RepoStatus` |
| `src/extension/repoSource.ts` | Workspace file parser + filesystem scanner + cache | Create (replaces `repoDiscovery.ts`) |
| `src/extension/repoDiscovery.ts` | Old discovery logic | Delete |
| `src/extension/extension.ts` | Extension entry point | Modify: pass `ExtensionContext` to webview provider |
| `src/extension/webviewProvider.ts` | Webview panel + message bridge | Modify: use `RepoSource`, hold metadata map, merge alias/order |
| `src/webview/src/App.tsx` | Main React UI | Modify: fix search, defensive sort by order |
| `src/webview/src/components/RepositoryCard.tsx` | Repo card component | Modify: show alias as primary name, path as secondary |

---

## Chunk 1: Dependencies & Types

### Task 1: Install jsonc-parser

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npm install jsonc-parser
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('jsonc-parser')"
```

Expected: no error

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jsonc-parser dependency for workspace file parsing"
```

---

### Task 2: Update both type files

**Files:**
- Modify: `src/extension/types.ts`
- Modify: `src/webview/src/types.ts`

Both `alias` and `order` are **optional** on `RepoStatus` so that `StatusPoller.getRepoStatus()` continues to compile without changes. The webview provider merges these fields in before sending to the webview.

- [ ] **Step 1: Update extension types**

Replace `src/extension/types.ts` with:

```typescript
import * as vscode from 'vscode';

export interface RepoStatus {
  path: string;
  name: string;
  alias?: string;
  order?: number;
  branch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  hasUntracked: boolean;
  lastUpdated: number;
}

export interface RepoMetadata {
  path: string;
  alias?: string;
  order: number;
}

export interface RepoCache {
  repos: RepoMetadata[];
  workspaceFileHash: string;
  workspaceFoldersHash: string;
  lastScanTimestamp: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
  refs: string[];
}

export interface GitTreeData {
  repoPath: string;
  commits: CommitInfo[];
}

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface OperationProgress {
  repoPath: string;
  operation: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  error?: string;
}

export interface BulkOperationRequest {
  operation: 'fetch' | 'checkout' | 'push' | 'reset';
  repoPaths: string[];
  options?: {
    branch?: string;
    resetMode?: 'soft' | 'mixed' | 'hard';
    resetCount?: number;
  };
}

export interface GitTreeRequest {
  repoPath: string;
  count?: number;
}

export interface MessageToWebview {
  type: 'repoStatusUpdate' | 'operationProgress' | 'operationComplete' | 'logMessage' | 'gitTreeUpdate';
  data: any;
}

export interface MessageFromWebview {
  type: 'fetchRepos' | 'bulkFetch' | 'bulkCheckout' | 'bulkPush' | 'bulkReset' | 'refreshStatus' | 'fetchGitTree';
  data?: any;
}
```

- [ ] **Step 2: Update webview types**

Replace `src/webview/src/types.ts` with:

```typescript
export interface RepoStatus {
  path: string;
  name: string;
  alias?: string;
  order?: number;
  branch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
  hasUntracked: boolean;
  lastUpdated: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
  refs: string[];
}

export interface GitTreeData {
  repoPath: string;
  commits: CommitInfo[];
}

export interface OperationProgress {
  repoPath: string;
  operation: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  error?: string;
}

export interface MessageToWebview {
  type: 'repoStatusUpdate' | 'operationProgress' | 'operationComplete' | 'logMessage' | 'gitTreeUpdate';
  data: any;
}

export interface MessageFromWebview {
  type: 'fetchRepos' | 'bulkFetch' | 'bulkCheckout' | 'bulkPush' | 'bulkReset' | 'refreshStatus' | 'fetchGitTree';
  data?: any;
}
```

- [ ] **Step 3: Verify both compile**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npx tsc --noEmit && npx webpack --mode development
```

Expected: no errors (both `alias` and `order` are optional, so existing code is unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/extension/types.ts src/webview/src/types.ts
git commit -m "feat: add alias, order, RepoCache, RepoMetadata types to both extension and webview"
```

---

## Chunk 2: RepoSource + Wiring (Single Compilable Unit)

Tasks 3, 4, and 5 are committed together so that the codebase compiles at every commit.

### Task 3: Create RepoSource class

**Files:**
- Create: `src/extension/repoSource.ts`

- [ ] **Step 1: Create the RepoSource file**

Create `src/extension/repoSource.ts`:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { promisify } from 'util';
import * as jsonc from 'jsonc-parser';
import { RepoMetadata, RepoCache } from './types';

const readdir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

const CACHE_KEY = 'gitmesh.repoCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

interface WorkspaceFolder {
  name?: string;
  path: string;
}

export class RepoSource {
  private watcher: vscode.FileSystemWatcher | undefined;
  private workspaceFileWatcher: vscode.FileSystemWatcher | undefined;
  private metadataMap: Map<string, RepoMetadata> = new Map();

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  getMetadataMap(): Map<string, RepoMetadata> {
    return this.metadataMap;
  }

  async loadCached(): Promise<RepoMetadata[]> {
    const cached = this.globalState.get<RepoCache>(CACHE_KEY);
    if (!cached || !cached.repos.length) {
      return [];
    }

    this.outputChannel.appendLine(
      `[RepoSource] Loaded ${cached.repos.length} repos from cache`
    );

    this.metadataMap.clear();
    for (const repo of cached.repos) {
      this.metadataMap.set(repo.path, repo);
    }

    return cached.repos;
  }

  async discoverRepos(): Promise<RepoMetadata[]> {
    this.outputChannel.appendLine('[RepoSource] Starting repository discovery');

    const cached = this.globalState.get<RepoCache>(CACHE_KEY);
    const knownPaths = new Set<string>();
    const repos: RepoMetadata[] = [];

    // Source A: workspace file
    const workspaceFileUri = vscode.workspace.workspaceFile;
    let currentWorkspaceHash = '';
    let currentFoldersHash = '';

    if (workspaceFileUri && workspaceFileUri.scheme === 'file') {
      const content = await readFile(workspaceFileUri.fsPath, 'utf-8');
      currentWorkspaceHash = crypto.createHash('sha256').update(content).digest('hex');

      // Check if cache is still valid
      if (
        cached &&
        cached.workspaceFileHash === currentWorkspaceHash &&
        Date.now() - cached.lastScanTimestamp < CACHE_TTL_MS
      ) {
        // Verify cached paths still exist
        const validRepos: RepoMetadata[] = [];
        for (const repo of cached.repos) {
          const gitPath = path.join(repo.path, '.git');
          if (await pathExists(gitPath)) {
            validRepos.push(repo);
            knownPaths.add(repo.path);
          }
        }

        if (validRepos.length === cached.repos.length) {
          this.outputChannel.appendLine(
            `[RepoSource] Cache valid, ${validRepos.length} repos unchanged`
          );
          this.updateMetadataMap(validRepos);
          return validRepos;
        }
      }

      // Parse workspace file
      const parsed = jsonc.parse(content) as { folders?: WorkspaceFolder[] };
      const workspaceDir = path.dirname(workspaceFileUri.fsPath);

      if (parsed.folders) {
        for (let i = 0; i < parsed.folders.length; i++) {
          const folder = parsed.folders[i];
          const resolvedPath = path.resolve(workspaceDir, folder.path);
          const gitPath = path.join(resolvedPath, '.git');

          if (await pathExists(gitPath)) {
            if (!knownPaths.has(resolvedPath)) {
              knownPaths.add(resolvedPath);
              repos.push({
                path: resolvedPath,
                alias: folder.name,
                order: i,
              });
            }
          }
        }
      }

      this.outputChannel.appendLine(
        `[RepoSource] Found ${repos.length} repos from workspace file`
      );
    }

    // Source B: filesystem scan (fallback — only when no workspace file)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && (!workspaceFileUri || workspaceFileUri.scheme !== 'file')) {
      const folderUris = workspaceFolders.map(f => f.uri.toString()).sort().join('|');
      currentFoldersHash = crypto.createHash('sha256').update(folderUris).digest('hex');

      // Check folder-based cache
      if (
        cached &&
        cached.workspaceFoldersHash === currentFoldersHash &&
        Date.now() - cached.lastScanTimestamp < CACHE_TTL_MS
      ) {
        const validRepos: RepoMetadata[] = [];
        for (const repo of cached.repos) {
          const gitPath = path.join(repo.path, '.git');
          if (await pathExists(gitPath)) {
            validRepos.push(repo);
          }
        }

        if (validRepos.length === cached.repos.length) {
          this.outputChannel.appendLine(
            `[RepoSource] Folder cache valid, ${validRepos.length} repos unchanged`
          );
          this.updateMetadataMap(validRepos);
          return validRepos;
        }
      }

      let scanOrder = repos.length;
      for (const folder of workspaceFolders) {
        const scanned = await this.scanDirectory(folder.uri.fsPath);
        for (const repoPath of scanned) {
          const resolved = path.resolve(repoPath);
          if (!knownPaths.has(resolved)) {
            knownPaths.add(resolved);
            repos.push({
              path: resolved,
              alias: undefined,
              order: scanOrder++,
            });
          }
        }
      }

      // Sort scanned repos alphabetically and re-assign order
      const scannedRepos = repos.filter(r => r.alias === undefined);
      scannedRepos.sort((a, b) => path.basename(a.path).localeCompare(path.basename(b.path)));
      const workspaceRepoCount = repos.length - scannedRepos.length;
      for (let i = 0; i < scannedRepos.length; i++) {
        scannedRepos[i].order = workspaceRepoCount + i;
      }
    }

    // Save to cache
    await this.globalState.update(CACHE_KEY, {
      repos,
      workspaceFileHash: currentWorkspaceHash,
      workspaceFoldersHash: currentFoldersHash,
      lastScanTimestamp: Date.now(),
    } as RepoCache);

    this.outputChannel.appendLine(
      `[RepoSource] Discovery complete: ${repos.length} repositories`
    );

    this.updateMetadataMap(repos);
    return repos;
  }

  private updateMetadataMap(repos: RepoMetadata[]) {
    this.metadataMap.clear();
    for (const repo of repos) {
      this.metadataMap.set(repo.path, repo);
    }
  }

  private async scanDirectory(
    dirPath: string,
    depth: number = 0,
    maxDepth: number = 5
  ): Promise<string[]> {
    if (depth > maxDepth) {
      return [];
    }

    const repos: string[] = [];

    try {
      const gitPath = path.join(dirPath, '.git');
      if (await pathExists(gitPath)) {
        const gitStat = await fsStat(gitPath);
        if (gitStat.isDirectory() || gitStat.isFile()) {
          repos.push(dirPath);
          return repos;
        }
      }

      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
          const subPath = path.join(dirPath, entry.name);
          const subRepos = await this.scanDirectory(subPath, depth + 1, maxDepth);
          repos.push(...subRepos);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.outputChannel.appendLine(
          `[RepoSource] Error scanning ${dirPath}: ${error.message}`
        );
      }
    }

    return repos;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules', '.vscode', '.idea', 'dist', 'build',
      'out', 'target', '.next', '.nuxt', 'vendor', '__pycache__'
    ];
    return skipDirs.includes(name) || name.startsWith('.');
  }

  setupWatcher(onChange: () => void) {
    // Watch for .git directory changes (new/deleted repos)
    if (this.watcher) {
      this.watcher.dispose();
    }
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.git');
    this.watcher.onDidCreate(() => {
      this.outputChannel.appendLine('[RepoSource] Git directory created, refreshing');
      onChange();
    });
    this.watcher.onDidDelete(() => {
      this.outputChannel.appendLine('[RepoSource] Git directory deleted, refreshing');
      onChange();
    });

    // Watch the active workspace file for changes
    if (this.workspaceFileWatcher) {
      this.workspaceFileWatcher.dispose();
    }
    const workspaceFileUri = vscode.workspace.workspaceFile;
    if (workspaceFileUri && workspaceFileUri.scheme === 'file') {
      const pattern = new vscode.RelativePattern(
        path.dirname(workspaceFileUri.fsPath),
        path.basename(workspaceFileUri.fsPath)
      );
      this.workspaceFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.workspaceFileWatcher.onDidChange(() => {
        this.outputChannel.appendLine('[RepoSource] Workspace file changed, refreshing');
        onChange();
      });
    }
  }

  dispose() {
    if (this.watcher) {
      this.watcher.dispose();
    }
    if (this.workspaceFileWatcher) {
      this.workspaceFileWatcher.dispose();
    }
  }
}
```

---

### Task 4: Update extension.ts to pass ExtensionContext

**Files:**
- Modify: `src/extension/extension.ts`

- [ ] **Step 1: Pass context to GitMeshWebviewProvider**

Update `src/extension/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { GitMeshWebviewProvider } from './webviewProvider';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('GitMesh');
  outputChannel.appendLine('GitMesh extension activated');

  const webviewProvider = new GitMeshWebviewProvider(context.extensionUri, outputChannel, context);

  registerCommands(context, webviewProvider, outputChannel);

  outputChannel.appendLine('GitMesh commands registered');
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}
```

---

### Task 5: Update webviewProvider to use RepoSource

**Files:**
- Modify: `src/extension/webviewProvider.ts`
- Delete: `src/extension/repoDiscovery.ts`

- [ ] **Step 1: Replace RepoDiscovery with RepoSource and add metadata merging**

Replace `src/extension/webviewProvider.ts` with:

```typescript
import * as vscode from 'vscode';
import { MessageFromWebview, MessageToWebview, RepoStatus, BulkOperationRequest, OperationProgress, GitTreeRequest } from './types';
import { GitRunner } from './gitRunner';
import { RepoSource } from './repoSource';
import { StatusPoller } from './statusPoller';
import { BulkOperations } from './bulkOperations';

export class GitMeshWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private gitRunner: GitRunner;
  private repoSource: RepoSource;
  private statusPoller: StatusPoller;
  private bulkOperations: BulkOperations;
  private currentRepos: string[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext
  ) {
    this.gitRunner = new GitRunner(outputChannel);
    this.repoSource = new RepoSource(context.globalState, outputChannel);
    this.statusPoller = new StatusPoller(
      this.gitRunner,
      outputChannel,
      (statuses) => this.handleStatusUpdate(statuses)
    );
    this.bulkOperations = new BulkOperations(
      this.gitRunner,
      outputChannel,
      (progress) => this.handleOperationProgress(progress),
      () => this.handleOperationComplete()
    );

    this.repoSource.setupWatcher(() => this.refreshRepos());
  }

  public show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'gitmeshDashboard',
      'GitMesh Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')
        ]
      }
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: MessageFromWebview) => this.handleMessage(message),
      null,
      this.disposables
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
      },
      null,
      this.disposables
    );
  }

  public postMessage(message: MessageToWebview) {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  private async handleMessage(message: MessageFromWebview) {
    this.outputChannel.appendLine(`Received message: ${message.type}`);

    switch (message.type) {
      case 'fetchRepos':
        await this.refreshRepos();
        break;
      case 'refreshStatus':
        await this.refreshStatus();
        break;
      case 'bulkFetch':
        await this.handleBulkOperation(message.data as BulkOperationRequest);
        break;
      case 'bulkCheckout':
        await this.handleBulkCheckout(message.data as BulkOperationRequest);
        break;
      case 'bulkPush':
        await this.handleBulkOperation(message.data as BulkOperationRequest);
        break;
      case 'bulkReset':
        await this.handleBulkReset(message.data as BulkOperationRequest);
        break;
      case 'fetchGitTree':
        await this.handleFetchGitTree(message.data as GitTreeRequest);
        break;
    }
  }

  private async handleFetchGitTree(request: GitTreeRequest) {
    this.outputChannel.appendLine(`[WebviewProvider] Fetching git tree for ${request.repoPath}`);
    const commits = await this.gitRunner.getGitLog(request.repoPath, request.count || 20);
    this.postMessage({
      type: 'gitTreeUpdate',
      data: {
        repoPath: request.repoPath,
        commits
      }
    });
  }

  private async handleBulkOperation(request: BulkOperationRequest) {
    try {
      switch (request.operation) {
        case 'fetch':
          await this.bulkOperations.executeBulkFetch(request);
          break;
        case 'push':
          await this.bulkOperations.executeBulkPush(request);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Bulk ${request.operation} failed: ${errorMessage}`);
    }
  }

  private async handleBulkCheckout(request: BulkOperationRequest) {
    const branch = await vscode.window.showInputBox({
      prompt: 'Enter branch name to checkout',
      placeHolder: 'main'
    });

    if (!branch) {
      return;
    }

    request.options = { ...request.options, branch };

    try {
      await this.bulkOperations.executeBulkCheckout(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Bulk checkout failed: ${errorMessage}`);
    }
  }

  private async handleBulkReset(request: BulkOperationRequest) {
    const resetMode = await vscode.window.showQuickPick(
      ['soft', 'mixed', 'hard'],
      {
        placeHolder: 'Select reset mode',
        title: 'Reset Mode'
      }
    );

    if (!resetMode) {
      return;
    }

    if (resetMode === 'hard') {
      const confirm = await vscode.window.showWarningMessage(
        'Hard reset will discard all uncommitted changes. Are you sure?',
        { modal: true },
        'Yes, reset hard'
      );

      if (confirm !== 'Yes, reset hard') {
        return;
      }
    }

    const resetCountStr = await vscode.window.showInputBox({
      prompt: 'Number of commits to reset (HEAD~N)',
      value: '1',
      validateInput: (value) => {
        const num = parseInt(value, 10);
        return isNaN(num) || num < 1 ? 'Must be a positive number' : null;
      }
    });

    if (!resetCountStr) {
      return;
    }

    request.options = {
      ...request.options,
      resetMode: resetMode as 'soft' | 'mixed' | 'hard',
      resetCount: parseInt(resetCountStr, 10)
    };

    try {
      await this.bulkOperations.executeBulkReset(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Bulk reset failed: ${errorMessage}`);
    }
  }

  private async refreshRepos() {
    this.outputChannel.appendLine('[WebviewProvider] Refreshing repositories');

    // Load from cache for instant display
    const cached = await this.repoSource.loadCached();
    if (cached.length > 0 && this.currentRepos.length === 0) {
      // Only use cache for initial load to avoid double-poll
      this.currentRepos = cached.map(r => r.path);
    }

    // Discover repos (returns cached if hash matches, or fresh scan)
    const discovered = await this.repoSource.discoverRepos();
    const discoveredPaths = discovered.map(r => r.path);

    // Update poller with final repo list
    this.currentRepos = discoveredPaths;
    this.statusPoller.setRepos(this.currentRepos);
    this.statusPoller.startPolling(5000);
  }

  private async refreshStatus() {
    this.outputChannel.appendLine('[WebviewProvider] Refreshing status');
    const statuses = await this.statusPoller.pollOnce();
    this.handleStatusUpdate(statuses);
  }

  private handleStatusUpdate(statuses: RepoStatus[]) {
    // Merge alias and order from RepoSource metadata
    const metadataMap = this.repoSource.getMetadataMap();
    const enriched = statuses.map(status => {
      const meta = metadataMap.get(status.path);
      return {
        ...status,
        alias: meta?.alias,
        order: meta?.order ?? 999,
      };
    });

    // Sort by order
    enriched.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    this.postMessage({
      type: 'repoStatusUpdate',
      data: { repos: enriched }
    });
  }

  private handleOperationProgress(progress: OperationProgress) {
    this.postMessage({
      type: 'operationProgress',
      data: progress
    });
  }

  private handleOperationComplete() {
    this.postMessage({
      type: 'operationComplete',
      data: {}
    });

    this.refreshStatus();
  }

  dispose() {
    this.statusPoller.dispose();
    this.repoSource.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'bundle.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>GitMesh Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

- [ ] **Step 2: Delete old repoDiscovery.ts**

```bash
rm src/extension/repoDiscovery.ts
```

- [ ] **Step 3: Verify full extension compiles**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit all three files together**

```bash
git add src/extension/repoSource.ts src/extension/extension.ts src/extension/webviewProvider.ts
git rm src/extension/repoDiscovery.ts
git commit -m "feat: replace RepoDiscovery with RepoSource

Workspace-first repo discovery with JSONC parsing, persistent
globalState cache, path-based deduplication, and metadata merging.
Repos load from cache instantly, then verify in background."
```

---

## Chunk 3: Search Fix & UI Updates

### Task 6: Fix search with keyword AND matching and defensive sort

**Files:**
- Modify: `src/webview/src/App.tsx`

- [ ] **Step 1: Replace the filteredRepos logic and add defensive sort on receive**

In `src/webview/src/App.tsx`, replace the `repoStatusUpdate` handler (line 21) with:

```typescript
      case 'repoStatusUpdate':
        setRepos(
          (message.data.repos || []).sort(
            (a: RepoStatus, b: RepoStatus) => (a.order ?? 999) - (b.order ?? 999)
          )
        );
        setIsRefreshing(false);
        break;
```

Then replace the `filteredRepos` useMemo (lines 64-71) with:

```typescript
  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repos;
    const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return repos.filter(repo => {
      const statusText = repo.isDirty ? 'modified' : repo.hasUntracked ? 'untracked' : 'clean';
      const searchable = `${repo.alias || ''} ${repo.name} ${repo.branch} ${statusText}`.toLowerCase();
      return keywords.every(kw => searchable.includes(kw));
    });
  }, [repos, searchQuery]);
```

- [ ] **Step 2: Verify webview compiles**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npx webpack --mode development
```

Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src/webview/src/App.tsx
git commit -m "fix: search with AND keyword matching across alias, name, branch, status"
```

---

### Task 7: Update RepositoryCard to show alias

**Files:**
- Modify: `src/webview/src/components/RepositoryCard.tsx`
- Modify: `src/webview/src/App.css`

- [ ] **Step 1: Show alias as primary name, path as secondary**

In `src/webview/src/components/RepositoryCard.tsx`, replace the `repo-info` div (lines 48-54) with:

```tsx
                    <div className="repo-info">
                        <div className="repo-name">{repo.alias || repo.name}</div>
                        {repo.alias && (
                            <div className="repo-path">{repo.name}</div>
                        )}
                        <div className="repo-branch">
                            <GitBranchIcon />
                            <span>{repo.branch}</span>
                        </div>
                    </div>
```

- [ ] **Step 2: Add CSS for the secondary path text**

In `src/webview/src/App.css`, add after the existing `.repo-name` styles:

```css
.repo-path {
  font-size: 0.75em;
  opacity: 0.6;
  margin-top: 1px;
}
```

- [ ] **Step 3: Verify webview compiles**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npx webpack --mode development
```

Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src/webview/src/components/RepositoryCard.tsx src/webview/src/App.css
git commit -m "feat: display workspace alias as primary name, folder path as secondary"
```

---

## Chunk 4: Build & Verify

### Task 8: Full build and package

**Files:** None (verification only)

- [ ] **Step 1: Full compile**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npm run compile
```

Expected: both tsc and webpack succeed with no errors

- [ ] **Step 2: Package VSIX**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npm run package
```

Expected: `.vsix` file generated successfully

- [ ] **Step 3: Verify the VSIX contains repoSource.js and not repoDiscovery.js**

```bash
cd /Users/yashielsookdeo/Developer/yashielsookdeo/git-mesh
npx @vscode/vsce ls | grep -E 'repoSource|repoDiscovery'
```

Expected: shows `out/extension/repoSource.js`, does NOT show `out/extension/repoDiscovery.js`
