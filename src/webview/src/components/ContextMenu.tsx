import React, { useEffect, useRef, useCallback } from 'react';

export interface MenuItem {
  label: string;
  action: string;
  danger?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onSelect: (action: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const focusIndex = useRef(0);

  const focusItem = useCallback((index: number) => {
    const menu = menuRef.current;
    if (!menu) return;
    const buttons = menu.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    if (buttons[index]) {
      focusIndex.current = index;
      buttons[index].focus();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusItem(Math.min(focusIndex.current + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusItem(Math.max(focusIndex.current - 1, 0));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    // Focus first item
    requestAnimationFrame(() => focusItem(0));

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, items.length, focusItem]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 1000,
  };

  return (
    <div className="context-menu" ref={menuRef} style={style}>
      {items.map((item) => (
        <button
          key={item.action}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          onClick={() => {
            onSelect(item.action);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
