import * as vscode from 'vscode';
import { OperationProgress } from './types';

export interface QueuedOperation {
  repoPath: string;
  operation: string;
  execute: () => Promise<void | false>;
}

export class OperationQueue {
  private queue: QueuedOperation[] = [];
  private running: Set<string> = new Set();
  private maxConcurrent: number;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onProgress: (progress: OperationProgress) => void,
    maxConcurrent: number = 5
  ) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue(operations: QueuedOperation[]): Promise<void> {
    this.queue.push(...operations);
    
    operations.forEach(op => {
      this.onProgress({
        repoPath: op.repoPath,
        operation: op.operation,
        status: 'pending',
        message: 'Queued'
      });
    });

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
        const operation = this.queue.shift();
        if (!operation) break;

        this.running.add(operation.repoPath);
        this.executeOperation(operation);
      }

      if (this.running.size >= this.maxConcurrent || this.queue.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private async executeOperation(operation: QueuedOperation): Promise<void> {
    this.onProgress({
      repoPath: operation.repoPath,
      operation: operation.operation,
      status: 'running',
      message: 'In progress'
    });

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.outputChannel.appendLine(
        `[OperationQueue] Error in ${operation.operation} for ${operation.repoPath}: ${errorMessage}`
      );

      this.onProgress({
        repoPath: operation.repoPath,
        operation: operation.operation,
        status: 'error',
        error: errorMessage
      });
    } finally {
      this.running.delete(operation.repoPath);
    }
  }

  isRunning(): boolean {
    return this.queue.length > 0 || this.running.size > 0;
  }

  clear() {
    this.queue = [];
  }
}
