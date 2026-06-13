import React from 'react';
import { Mic, MicOff, Video, VideoOff, Circle, Share2, PhoneOff } from 'lucide-react';
import './Controls.css';

interface ControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isRecording: boolean;
  isAgent: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleRecording: () => void;
  onShareFile: () => void;
  onEndCall: () => void;
  disabled?: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  audioEnabled,
  videoEnabled,
  isRecording,
  isAgent,
  onToggleAudio,
  onToggleVideo,
  onToggleRecording,
  onShareFile,
  onEndCall,
  disabled,
}) => {
  return (
    <div className="controls">
      <div className="controls__group">
        {/* Mic */}
        <button
          className={`controls__btn ${!audioEnabled ? 'controls__btn--off' : ''}`}
          onClick={onToggleAudio}
          disabled={disabled}
          title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          id="btn-toggle-audio"
        >
          {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera */}
        <button
          className={`controls__btn ${!videoEnabled ? 'controls__btn--off' : ''}`}
          onClick={onToggleVideo}
          disabled={disabled}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          id="btn-toggle-video"
        >
          {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Recording (agent only) */}
        {isAgent && (
          <button
            className={`controls__btn controls__btn--record ${isRecording ? 'controls__btn--recording' : ''}`}
            onClick={onToggleRecording}
            disabled={disabled}
            title={isRecording ? 'Stop recording' : 'Start recording'}
            id="btn-toggle-recording"
          >
            <Circle size={20} fill={isRecording ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Share file */}
        <button
          className="controls__btn"
          onClick={onShareFile}
          disabled={disabled}
          title="Share a file"
          id="btn-share-file"
        >
          <Share2 size={20} />
        </button>
      </div>

      {/* End call */}
      <button
        className="controls__btn controls__btn--end"
        onClick={onEndCall}
        disabled={disabled}
        title="End call"
        id="btn-end-call"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
};
