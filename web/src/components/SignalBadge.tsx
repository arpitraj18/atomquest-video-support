import React from 'react';
import './SignalBadge.css';

export type SignalVariant = 'live' | 'recording' | 'connected' | 'offline';

interface SignalBadgeProps {
  variant: SignalVariant;
  label?: string;
  size?: 'sm' | 'md';
}

const variantConfig: Record<SignalVariant, { className: string; defaultLabel: string }> = {
  live:      { className: 'signal--live',      defaultLabel: 'LIVE' },
  recording: { className: 'signal--recording', defaultLabel: 'REC' },
  connected: { className: 'signal--connected', defaultLabel: 'CONNECTED' },
  offline:   { className: 'signal--offline',   defaultLabel: 'OFFLINE' },
};

export const SignalBadge: React.FC<SignalBadgeProps> = ({ variant, label, size = 'md' }) => {
  const config = variantConfig[variant];
  return (
    <span className={`signal-badge ${config.className} signal--${size}`}>
      <span className="signal-dot">
        {variant !== 'offline' && <span className="signal-ring" />}
      </span>
      <span className="signal-label">{label ?? config.defaultLabel}</span>
    </span>
  );
};
