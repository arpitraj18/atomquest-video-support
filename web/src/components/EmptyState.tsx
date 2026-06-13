import React from 'react';
import type { LucideIcon } from 'lucide-react';
import './EmptyState.css';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__desc">{description}</p>
      {action && (
        <button className="btn btn-primary" onClick={action.onClick} style={{ marginTop: 'var(--sp-4)' }}>
          {action.label}
        </button>
      )}
    </div>
  );
};
