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
        await this.handleBulkPush(message.data as BulkOperationRequest);
        break;
      case 'bulkReset':
        await this.handleBulkReset(message.data as BulkOperationRequest);
        break;
      case 'bulkSync':
        await this.handleBulkSync(message.data as BulkOperationRequest);
        break;
      case 'bulkStash':
        await this.handleBulkStash(message.data as BulkOperationRequest);
        break;
      case 'bulkStashPop':
        await this.handleBulkStashPop(message.data as BulkOperationRequest);
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

  private async handleBulkPush(request: BulkOperationRequest) {
    const items = [
      { label: 'Push', description: 'Normal push', value: 'normal' as const },
      { label: 'Force Push (--force-with-lease)', description: 'Safe force push', value: 'force-with-lease' as const }
    ];

    const pushMode = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select push mode',
      title: 'Push Mode'
    });

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

    request.options = { ...request.options, pushMode: pushMode.value };

    try {
      await this.bulkOperations.executeBulkPush(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Bulk push failed: ${errorMessage}`);
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

  private async handleBulkSync(request: BulkOperationRequest) {
    try {
      await this.bulkOperations.executeBulkSync(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Bulk sync failed: ${errorMessage}`);
    }
  }

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
