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
}
