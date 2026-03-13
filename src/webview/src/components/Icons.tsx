import React from 'react';

export const ChevronIcon: React.FC<{ expanded?: boolean }> = ({ expanded }) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
        }}
    >
        <path d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z" />
    </svg>
);

export const GitBranchIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 6.5a3.5 3.5 0 0 0-3.5-3.5 3.44 3.44 0 0 0-2.35.93l-1.4-1.4a.75.75 0 0 0-1.06 1.06l1.4 1.4A3.44 3.44 0 0 0 6.16 7H3a1 1 0 0 0-1 1v1a4.5 4.5 0 0 0 4.5 4.5h1A4.5 4.5 0 0 0 12 9V8a1 1 0 0 0-1-1H7.84a1.94 1.94 0 0 1 .02-.22A1.5 1.5 0 0 1 10.5 5a1.5 1.5 0 0 1 1.5 1.5.75.75 0 0 0 1.5 0A3.5 3.5 0 0 0 14 6.5zM7.5 12h-1A2.5 2.5 0 0 1 4 9.5V9h6v.5A2.5 2.5 0 0 1 7.5 12z" />
    </svg>
);

export const GitCommitIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="11" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

export const FolderIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14.5 3H7.71l-.85-.85L6.51 2h-5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13h-12V7h4.49l.35-.15.86-.86H14v5.5zM6.51 6l-.35.15-.86.86H2v-4h4.29l.85.85.36.15H14v2H6.51z" />
    </svg>
);

export const FolderOpenIcon: React.FC = () => (
    <svg width="64" height="64" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.5 14h11l2-6H6.5l-2 6H1.5zm0-12v11h2.3l1.7-5.1.3-.9H14V3H7.71l-.85-.85L6.51 2H1.5zm12 4H6.51l-.35.15-.86.86H2V3h4.29l.85.85.36.15H13v3z" />
    </svg>
);

export const RefreshIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c.024.097.04.182.04.271a3.75 3.75 0 1 1-.942-2.467l.262-.375-.758-1.224a5.25 5.25 0 1 0 1.988 4.066c0-.09-.003-.181-.009-.271l.01-.004-.047-.32c.027-.257.192-1.537.854-2.621l.084-.136 1.282-.435z" />
    </svg>
);

export const SearchIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
    </svg>
);

export const CheckIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
    </svg>
);

export const GitMeshLogo: React.FC = () => (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="4" r="2" fill="var(--vscode-button-background)" />
        <circle cx="12" cy="4" r="2" fill="var(--vscode-button-background)" />
        <circle cx="4" cy="12" r="2" fill="var(--vscode-button-background)" />
        <circle cx="12" cy="12" r="2" fill="var(--vscode-button-background)" />
        <line x1="4" y1="6" x2="4" y2="10" stroke="var(--vscode-button-background)" strokeWidth="1.2" />
        <line x1="12" y1="6" x2="12" y2="10" stroke="var(--vscode-button-background)" strokeWidth="1.2" />
        <line x1="6" y1="4" x2="10" y2="4" stroke="var(--vscode-button-background)" strokeWidth="1.2" />
        <line x1="6" y1="12" x2="10" y2="12" stroke="var(--vscode-button-background)" strokeWidth="1.2" />
        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="var(--vscode-button-background)" strokeWidth="1" opacity="0.4" />
        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="var(--vscode-button-background)" strokeWidth="1" opacity="0.4" />
    </svg>
);

export const SyncIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2.006 8.267L.78 9.5 0 8.73l2.09-2.07.76.01 2.09 2.12-.76.76-1.167-1.18a5 5 0 0 0 9.4 1.96l.72.26a5.75 5.75 0 0 1-10.8-2.32h-.327zM13.994 7.733l1.227-1.233.78.77-2.09 2.07-.76-.01-2.09-2.12.76-.76 1.167 1.18a5 5 0 0 0-9.4-1.96l-.72-.26a5.75 5.75 0 0 1 10.8 2.32h.327z" />
    </svg>
);

export const MoreIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
);

export const EllipsisIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm5 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
    </svg>
);

export const SkipIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM5 7.25h6v1.5H5v-1.5z" />
    </svg>
);
