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
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?: string;
  error?: string;
}

export interface BulkOperationRequest {
  operation: 'fetch' | 'checkout' | 'push' | 'reset' | 'sync' | 'stash' | 'stashPop';
  repoPaths: string[];
  options?: {
    branch?: string;
    resetMode?: 'soft' | 'mixed' | 'hard';
    resetCount?: number;
    pushMode?: 'normal' | 'force-with-lease';
  };
}

export interface GitTreeRequest {
  repoPath: string;
  count?: number;
}

export interface MessageToWebview {
  type: 'repoStatusUpdate' | 'operationProgress' | 'operationComplete' | 'logMessage' | 'gitTreeUpdate' | 'sortModeUpdate';
  data: any;
}

export interface MessageFromWebview {
  type: 'fetchRepos' | 'bulkFetch' | 'bulkCheckout' | 'bulkPush' | 'bulkReset' | 'bulkSync' | 'bulkStash' | 'bulkStashPop' | 'refreshStatus' | 'fetchGitTree' | 'setSortMode' | 'getSortMode';
  data?: any;
}

