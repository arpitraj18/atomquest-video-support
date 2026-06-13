import React, { useEffect, useRef } from 'react';
import { getInitials } from '../lib/format';
import './VideoTile.css';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  role: 'agent' | 'customer';
  audioEnabled: boolean;
  videoEnabled: boolean;
  isLocal?: boolean;
  muted?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  stream,
  name,
  role,
  audioEnabled,
  videoEnabled,
  isLocal = false,
  muted = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && videoEnabled) {
      el.srcObject = stream;
    } else {
      el.srcObject = null;
    }
  }, [stream, videoEnabled]);

  return (
    <div className={`video-tile ${isLocal ? 'video-tile--local' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted || isLocal}
        className={`video-tile__video ${!videoEnabled ? 'video-tile__video--hidden' : ''}`}
      />

      {!videoEnabled && (
        <div className="video-tile__avatar">
          <span className="video-tile__initials">{getInitials(name)}</span>
        </div>
      )}

      <div className="video-tile__overlay">
        <div className="video-tile__info">
          <span className={`video-tile__role badge badge-${role}`}>{role}</span>
          <span className="video-tile__name">{name}</span>
          {isLocal && <span className="video-tile__you">(you)</span>}
        </div>
        <div className="video-tile__indicators">
          {!audioEnabled && (
            <span className="video-tile__muted-icon" title="Muted">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .87-.16 1.71-.46 2.49" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
          )}
          {!videoEnabled && (
            <span className="video-tile__cam-off-icon" title="Camera off">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                <path d="M15 11a3 3 0 1 0-6 0" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
