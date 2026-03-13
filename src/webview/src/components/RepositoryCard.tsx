import React from 'react';
import { RepoStatus, CommitInfo, OperationProgress } from '../types';
import { GitTree } from './GitTree';
import { ChevronIcon, GitBranchIcon, FolderIcon, CheckIcon, EllipsisIcon, SkipIcon } from './Icons';

interface RepositoryCardProps {
    repo: RepoStatus;
    isSelected: boolean;
    isExpanded: boolean;
    commits: CommitInfo[];
    isLoadingTree: boolean;
    operation?: OperationProgress;
    onContextAction: (action: string) => void;
    onToggleSelect: () => void;
    onToggleExpand: () => void;
    style?: React.CSSProperties;
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({
    repo,
    isSelected,
    isExpanded,
    commits,
    isLoadingTree,
    operation,
    onContextAction,
    onToggleSelect,
    onToggleExpand,
    style,
}) => {
    const handleCheckboxClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleSelect();
    };

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

    return (
        <div className={`repo-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`} style={style} onContextMenu={handleContextMenu}>
            <div className="repo-card-header" onClick={onToggleExpand}>
                <div className="repo-card-left">
                    <div className="repo-checkbox" onClick={handleCheckboxClick}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => { }}
                        />
                    </div>
                    <div className="repo-icon">
                        <FolderIcon />
                    </div>
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
                </div>
                <div className="repo-card-right">
                    <div className="repo-status-badges">
                        {repo.isDirty ? (
                            <span className="badge dirty">Modified</span>
                        ) : repo.hasUntracked ? (
                            <span className="badge untracked">Untracked</span>
                        ) : (
                            <span className="badge clean">Clean</span>
                        )}
                    </div>
                    <div className="repo-sync-status">
                        {repo.ahead > 0 && <span className="ahead">&uarr;{repo.ahead}</span>}
                        {repo.behind > 0 && <span className="behind">&darr;{repo.behind}</span>}
                    </div>
                    <button className="repo-actions-btn" onClick={handleEllipsisClick} title="More actions">
                        <EllipsisIcon />
                    </button>
                    <div className="repo-chevron">
                        <ChevronIcon expanded={isExpanded} />
                    </div>
                </div>
            </div>
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
            <div className={`repo-card-content ${isExpanded ? 'show' : ''}`}>
                <div className="repo-card-content-inner">
                    <GitTree commits={commits} loading={isLoadingTree} />
                </div>
            </div>
        </div>
    );
};
