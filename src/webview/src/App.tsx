import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useWebviewMessages } from './hooks/useWebviewMessages';
import { RepoStatus, CommitInfo, MessageToWebview, OperationProgress } from './types';
import { RepositoryCard } from './components/RepositoryCard';
import { RefreshIcon, SearchIcon, GitMeshLogo, FolderOpenIcon, SyncIcon, MoreIcon } from './components/Icons';
import { ContextMenu, MenuItem } from './components/ContextMenu';
import './App.css';

export const App: React.FC = () => {
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [gitTrees, setGitTrees] = useState<Map<string, CommitInfo[]>>(new Map());
  const [loadingTrees, setLoadingTrees] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [operations, setOperations] = useState<Map<string, OperationProgress>>(new Map());
  const [sortMode, setSortMode] = useState<'workspace' | 'status' | 'branch' | 'name'>('workspace');
  const [moreMenuPos, setMoreMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'repoStatusUpdate':
        setRepos(
          (message.data.repos || []).sort(
            (a: RepoStatus, b: RepoStatus) => (a.order ?? 999) - (b.order ?? 999)
          )
        );
        setIsRefreshing(false);
        break;
      case 'gitTreeUpdate':
        setGitTrees(prev => {
          const next = new Map(prev);
          next.set(message.data.repoPath, message.data.commits);
          return next;
        });
        setLoadingTrees(prev => {
          const next = new Set(prev);
          next.delete(message.data.repoPath);
          return next;
        });
        break;
      case 'operationProgress':
        setOperations(prev => {
          const next = new Map(prev);
          next.set(message.data.repoPath, message.data);
          return next;
        });
        break;
      case 'operationComplete':
        setTimeout(() => {
          setOperations(new Map());
        }, 2000);
        break;
      case 'logMessage':
        console.log('Log:', message.data);
        break;
      case 'sortModeUpdate':
        setSortMode(message.data.sortMode || 'workspace');
        break;
    }
  }, []);

  const { postMessage } = useWebviewMessages(handleMessage);

  useEffect(() => {
    postMessage({ type: 'fetchRepos' });
  }, [postMessage]);

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

  const toggleRepoSelection = (repoPath: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repoPath)) {
        next.delete(repoPath);
      } else {
        next.add(repoPath);
      }
      return next;
    });
  };

  const toggleRepoExpand = (repoPath: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repoPath)) {
        next.delete(repoPath);
      } else {
        next.add(repoPath);
        if (!gitTrees.has(repoPath) && !loadingTrees.has(repoPath)) {
          setLoadingTrees(loading => {
            const nextLoading = new Set(loading);
            nextLoading.add(repoPath);
            return nextLoading;
          });
          postMessage({
            type: 'fetchGitTree',
            data: { repoPath, count: 15 }
          });
        }
      }
      return next;
    });
  };

  const handleBulkFetch = () => {
    postMessage({
      type: 'bulkFetch',
      data: { operation: 'fetch', repoPaths: Array.from(selectedRepos) }
    });
  };

  const handleBulkCheckout = () => {
    postMessage({
      type: 'bulkCheckout',
      data: { operation: 'checkout', repoPaths: Array.from(selectedRepos) }
    });
  };

  const handleBulkPush = () => {
    postMessage({
      type: 'bulkPush',
      data: { operation: 'push', repoPaths: Array.from(selectedRepos) }
    });
  };

  const handleBulkReset = () => {
    postMessage({
      type: 'bulkReset',
      data: { operation: 'reset', repoPaths: Array.from(selectedRepos) }
    });
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    postMessage({ type: 'refreshStatus' });
  };

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

  const selectAll = () => {
    setSelectedRepos(new Set(filteredRepos.map(r => r.path)));
  };

  const deselectAll = () => {
    setSelectedRepos(new Set());
  };

  const handleSortChange = (mode: 'workspace' | 'status' | 'branch' | 'name') => {
    setSortMode(mode);
    postMessage({ type: 'setSortMode', data: { sortMode: mode } });
  };

  const dirtyCount = repos.filter(r => r.isDirty).length;
  const cleanCount = repos.filter(r => !r.isDirty && !r.hasUntracked).length;
  const untrackedCount = repos.filter(r => r.hasUntracked && !r.isDirty).length;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-brand">
            <GitMeshLogo />
            <h1>GitMesh</h1>
          </div>
          {repos.length > 0 && (
            <div className="header-stats">
              <span className="stat-pill">{repos.length} repos</span>
              {cleanCount > 0 && <span className="stat-pill stat-clean">{cleanCount} clean</span>}
              {dirtyCount > 0 && <span className="stat-pill stat-dirty">{dirtyCount} modified</span>}
              {untrackedCount > 0 && <span className="stat-pill stat-untracked">{untrackedCount} untracked</span>}
            </div>
          )}
        </div>
        <button
          className={`icon-button refresh-btn ${isRefreshing ? 'spinning' : ''}`}
          onClick={handleRefresh}
          title="Refresh all repositories"
          disabled={isRefreshing}
        >
          <RefreshIcon />
        </button>
      </header>

      {repos.length > 0 && (
        <>
          <div className="search-bar">
            <SearchIcon />
            <input
              type="text"
              placeholder="Filter repositories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>&times;</button>
            )}
          </div>

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

          <div className="action-bar">
            <div className="selection-controls">
              <button className="secondary compact" onClick={selectAll} disabled={filteredRepos.length === 0}>
                Select All
              </button>
              <button className="secondary compact" onClick={deselectAll} disabled={selectedRepos.size === 0}>
                Clear
              </button>
              {selectedRepos.size > 0 && (
                <span className="selection-count">
                  <span className="selection-count-num">{selectedRepos.size}</span> selected
                </span>
              )}
            </div>
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
          </div>
        </>
      )}

      <div className="repo-list">
        {repos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FolderOpenIcon />
            </div>
            <h2>No repositories found</h2>
            <p>Open a workspace containing Git repositories to get started.</p>
            <p className="empty-hint">GitMesh will automatically detect all Git repos in your workspace.</p>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon empty-icon-small">
              <SearchIcon />
            </div>
            <h2>No matching repositories</h2>
            <p>Try a different search term</p>
          </div>
        ) : (
          <div className="repo-grid">
            {filteredRepos.map((repo, index) => (
              <RepositoryCard
                key={repo.path}
                repo={repo}
                isSelected={selectedRepos.has(repo.path)}
                isExpanded={expandedRepos.has(repo.path)}
                commits={gitTrees.get(repo.path) || []}
                isLoadingTree={loadingTrees.has(repo.path)}
                operation={operations.get(repo.path)}
                onToggleSelect={() => toggleRepoSelection(repo.path)}
                onToggleExpand={() => toggleRepoExpand(repo.path)}
                style={{ animationDelay: `${index * 30}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
