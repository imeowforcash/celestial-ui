import React, { ReactNode, memo } from 'react';
import { cn } from '@/utils/ui';
import styles from './SidebarButton.module.css';

interface SidebarButtonProps {
  onClick?: () => void;
  children: ReactNode;
  isActive?: boolean;
}

const SidebarButton: React.FC<SidebarButtonProps> = memo(({ onClick, children, isActive }) => {
  return (
    <button 
      className={cn(styles.btn, isActive && styles.active)}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

SidebarButton.displayName = 'SidebarButton';

export default SidebarButton;
