import * as vscode from 'vscode';
import { GitRunner } from './gitRunner';
import { OperationQueue, QueuedOperation } from './operationQueue';
import { BulkOperationRequest, OperationProgress } from './types';

export class BulkOperations {
  private operationQueue: OperationQueue;

  constructor(
    private readonly gitRunner: GitRunner,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onProgress: (progress: OperationProgress) => void,
    private readonly onComplete: () => void
  ) {
    this.operationQueue = new OperationQueue(outputChannel, onProgress, 5);
  }

  async executeBulkFetch(request: BulkOperationRequest): Promise<void> {
    this.outputChannel.appendLine(
      `[BulkOperations] Starting bulk fetch for ${request.repoPaths.length} repos`
    );

    const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
      repoPath,
      operation: 'fetch',
      execute: async () => {
        const result = await this.gitRunner.runGit(repoPath, ['fetch', '--all', '--prune']);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || 'Fetch failed');
        }
      }
    }));

    await this.operationQueue.enqueue(operations);
    this.onComplete();
  }

  async executeBulkCheckout(request: BulkOperationRequest): Promise<void> {
    if (!request.options?.branch) {
      throw new Error('Branch name is required for checkout operation');
    }

    this.outputChannel.appendLine(
      `[BulkOperations] Starting bulk checkout to ${request.options.branch} for ${request.repoPaths.length} repos`
    );

    const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
      repoPath,
      operation: 'checkout',
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
    }));

    await this.operationQueue.enqueue(operations);
    this.onComplete();
  }

  async executeBulkPush(request: BulkOperationRequest): Promise<void> {
    this.outputChannel.appendLine(
      `[BulkOperations] Starting bulk push for ${request.repoPaths.length} repos`
    );

    const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
      repoPath,
      operation: 'push',
      execute: async () => {
        const statusResult = await this.gitRunner.runGit(repoPath, ['status', '--porcelain']);
        if (statusResult.stdout.trim().length > 0) {
          throw new Error('Repository has uncommitted changes');
        }

        const pushArgs = ['push'];
        if (request.options?.pushMode === 'force-with-lease') {
          pushArgs.push('--force-with-lease');
        }
        const result = await this.gitRunner.runGit(repoPath, pushArgs);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || 'Push failed');
        }
      }
    }));

    await this.operationQueue.enqueue(operations);
    this.onComplete();
  }

  async executeBulkReset(request: BulkOperationRequest): Promise<void> {
    const resetMode = request.options?.resetMode || 'mixed';
    const resetCount = request.options?.resetCount || 1;

    this.outputChannel.appendLine(
      `[BulkOperations] Starting bulk reset (${resetMode}) HEAD~${resetCount} for ${request.repoPaths.length} repos`
    );

    const operations: QueuedOperation[] = request.repoPaths.map(repoPath => ({
      repoPath,
      operation: 'reset',
      execute: async () => {
        const resetArg = `HEAD~${resetCount}`;
        const args = ['reset'];

        if (resetMode === 'soft') {
          args.push('--soft');
        } else if (resetMode === 'hard') {
          args.push('--hard');
        } else {
          args.push('--mixed');
        }

        args.push(resetArg);

        const result = await this.gitRunner.runGit(repoPath, args);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || 'Reset failed');
        }
      }
    }));

    await this.operationQueue.enqueue(operations);
    this.onComplete();
  }

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
}
