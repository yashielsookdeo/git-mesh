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
