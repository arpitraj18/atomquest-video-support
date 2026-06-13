import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken, uploadFile } from '../lib/api';
import {
  createSocket,
  ClientEvents,
  ServerEvents,
  type Socket,
  type JoinedPayload,
  type PresenceParticipant,
  type ChatMessagePayload,
  type PeerMediaPayload,
  type RecordingStatusPayload,
  type SessionEndedPayload,
} from '../lib/socket';
import { createRtcConnection, type RtcHandle } from '../lib/rtc';
import { formatDuration } from '../lib/format';
import { ChatPanel, type ChatMsg } from '../components/ChatPanel';
import { PostCallSurvey } from '../components/PostCallSurvey';
import { useToast } from '../components/Toast';

type CallState = 'connecting' | 'in-call' | 'reconnecting' | 'ended';

export const CallRoom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ── State ── */
  const [callState, setCallState] = useState<CallState>('connecting');
  const [selfInfo, setSelfInfo] = useState<PresenceParticipant | null>(null);
  const [peer, setPeer] = useState<PresenceParticipant | null>(null);
  const [, setSessionTitle] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [endedBy, setEndedBy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const rtcRef = useRef<RtcHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const customerVideoRef = useRef<HTMLVideoElement>(null);
  const techVideoRef = useRef<HTMLVideoElement>(null);

  /* ── Cleanup helper ── */
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    rtcRef.current?.close();
    socketRef.current?.disconnect();
    rtcRef.current = null;
    socketRef.current = null;
  }, []);

  /* ── Connect ── */
  useEffect(() => {
    const token = getToken();
    if (!token || !sessionId) {
      setErrorMessage('No auth token found. Please log in again.');
      return;
    }

    const socket = createSocket(token, sessionId);
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      setErrorMessage(err.message === 'unauthorized' ? 'Authentication failed. Please log in again.' : 'Could not connect to the server.');
      setCallState('ended');
    });

    socket.on(ServerEvents.Joined, async (payload: JoinedPayload) => {
      // Clean up any stale connection from a previous join in the same session
      if (rtcRef.current) {
        rtcRef.current.close?.();
        rtcRef.current = null;
      }

      setSelfInfo(payload.self);
      setSessionTitle(payload.session.title || 'Video Call');
      setIsRecording(payload.recording.active);
      if (payload.chatHistory) {
        setMessages(payload.chatHistory as ChatMsg[]);
      }

      if (payload.peers.length > 0) {
        setPeer(payload.peers[0]!);
      }

      // Start RTC
      try {
        const rtc = await createRtcConnection({
          socket,
          onRemoteTrack: (stream) => setRemoteStream(stream),
          onConnectionState: (state) => {
            if (state === 'connected') setCallState('in-call');
            if (state === 'disconnected' || state === 'failed') setCallState('reconnecting');
          },
          onError: (err) => toast('error', err.message),
        });
        rtcRef.current = rtc;
        setAudioEnabled(rtc.audioEnabled);
        setVideoEnabled(rtc.videoEnabled);
        setCallState('in-call');

        // Start elapsed timer
        const start = Date.now();
        timerRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to start media.';
        setErrorMessage(msg);
        setCallState('ended');
      }
    });

    socket.on(ServerEvents.PeerJoined, ({ participant }: { participant: PresenceParticipant }) => {
      setPeer(participant);
      toast('info', `${participant.displayName} joined the call.`);
    });

    socket.on(ServerEvents.PeerLeft, ({ participantId }: { participantId: string }) => {
      setPeer((prev) => {
        if (prev?.participantId === participantId) {
          setRemoteStream(null);
          return null;
        }
        return prev;
      });
      toast('info', 'The other participant left the call.');
    });

    socket.on(ServerEvents.PeerMedia, (payload: PeerMediaPayload) => {
      setPeer((prev) =>
        prev?.participantId === payload.participantId
          ? { ...prev, audioEnabled: payload.audioEnabled, videoEnabled: payload.videoEnabled }
          : prev,
      );
    });

    socket.on(ServerEvents.ChatMessage, (payload: ChatMessagePayload) => {
      setMessages((prev) => [...prev, payload.message as ChatMsg]);
    });

    socket.on(ServerEvents.RecordingStatus, (payload: RecordingStatusPayload) => {
      const active = payload.status === 'recording';
      setIsRecording(active);
      setIsTogglingRecording(false);
      toast('info', active ? 'Recording started.' : 'Recording stopped.');
    });

    socket.on(ServerEvents.SessionEnded, (payload: SessionEndedPayload) => {
      setEndedBy(`${payload.endedBy.name} (${payload.endedBy.role})`);
      setCallState('ended');
      setShowSurvey(true);
      cleanup();
    });

    socket.on(ServerEvents.Errored, ({ message }: { message: string }) => {
      toast('error', message);
    });

    return () => {
      cleanup();
    };
  }, [sessionId, cleanup, toast]);

  // Attach streams to video elements
  useEffect(() => {
    if (customerVideoRef.current) {
      if (peer?.role === 'customer' || selfInfo?.role === 'customer') {
          if (customerVideoRef.current.srcObject !== remoteStream) {
            customerVideoRef.current.srcObject = remoteStream;
          }
      }
    }
  }, [remoteStream, peer, selfInfo]);

  useEffect(() => {
    if (techVideoRef.current && rtcRef.current?.localStream) {
       if (techVideoRef.current.srcObject !== rtcRef.current.localStream) {
         techVideoRef.current.srcObject = rtcRef.current.localStream;
       }
    }
  }, [callState, audioEnabled, videoEnabled]); // Re-run when state changes

  useEffect(() => {
    let interval: number | undefined;
    if (isRecording) {
      const start = Date.now();
      setRecordingElapsed(0);
      interval = window.setInterval(() => {
        setRecordingElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      setRecordingElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);


  /* ── Handlers ── */
  const handleToggleAudio = () => {
    if (rtcRef.current) {
      const enabled = rtcRef.current.toggleAudio();
      setAudioEnabled(enabled);
    }
  };

  const handleToggleVideo = () => {
    if (rtcRef.current) {
      const enabled = rtcRef.current.toggleVideo();
      setVideoEnabled(enabled);
    }
  };

  const handleToggleScreenShare = useCallback(async () => {
    if (!rtcRef.current) return;
    const isSharing = await rtcRef.current.toggleScreenShare();
    setIsScreenSharing(isSharing);
    if (isSharing) toast('info', 'You are now presenting your screen.');
  }, [toast]);

  const handleFlipCamera = useCallback(async () => {
    if (!rtcRef.current) return;
    try {
       await rtcRef.current.flipCamera();
    } catch (err) {
       toast('error', err instanceof Error ? err.message : 'Could not flip camera.');
    }
  }, [toast]);


  const handleToggleRecording = () => {
    const socket = socketRef.current;
    if (!socket || isTogglingRecording) return;
    setIsTogglingRecording(true);
    if (isRecording) {
      socket.emit(ClientEvents.RecordingStop);
    } else {
      socket.emit(ClientEvents.RecordingStart);
    }
  };

  const handleSendMessage = (body: string) => {
    socketRef.current?.emit(ClientEvents.ChatSend, { body });
  };

  const handleFileUpload = async (file: File) => {
    if (!sessionId) return;
    try {
      const result = await uploadFile(sessionId, file);
      socketRef.current?.emit(ClientEvents.FileShare, { fileId: result.file.id });
      toast('success', `File "${result.file.name}" shared.`);
    } catch {
      toast('error', 'Failed to upload file.');
    }
  };

  const handleEndCall = () => {
    if (selfInfo?.role === 'agent') {
      socketRef.current?.emit(ClientEvents.SessionEnd);
    } else {
      cleanup();
      setEndedBy(null);
      setCallState('ended');
      setShowSurvey(false);
    }
  };

  const handleLeave = () => {
    if (selfInfo?.role === 'customer' && !showSurvey && callState === 'ended' && !endedBy) {
       setLeaving(true);
       setShowSurvey(true);
       return;
    }
    cleanup();
    if (selfInfo?.role === 'agent') {
      navigate('/console');
    } else {
      navigate('/');
    }
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
  };

  /* ── Render ── */
  if (errorMessage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div className="bg-surface-container p-8 rounded-xl border border-error/30 text-center max-w-md">
          <h2 className="text-error font-headline-md mb-2">Unable to join</h2>
          <p className="text-on-surface-variant mb-6">{errorMessage}</p>
          <button className="bg-primary-container text-white px-6 py-2 rounded-lg font-bold" onClick={() => navigate('/')}>
            Go back
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="bg-surface text-on-surface h-screen flex flex-col overflow-hidden font-body-md transition-colors duration-300">
      {/* TopNavBar */}
      <header className="bg-surface/60 backdrop-blur-md shadow-md flex justify-between items-center w-full px-6 h-20 z-50 transition-all duration-300 border-b border-surface-variant">
        <div className="flex items-center gap-4">
          <div className="font-headline-md text-primary font-bold flex items-center gap-4">
            Atomberg Support
            <span className="font-mono text-sm text-on-surface-variant border-l border-surface-variant pl-4 py-1">
              {formatDuration(elapsed)}
            </span>
          </div>
          {isRecording && (
            <span className="font-label-sm px-3 py-1.5 rounded-full border flex items-center gap-2 transition-colors bg-error/10 text-error border-error/20 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-error"></span>
              REC {formatDuration(recordingElapsed)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button aria-label="Toggle Dark Mode" className="p-2 rounded-full hover:bg-surface-variant/20 transition-all duration-300 text-on-surface-variant" onClick={toggleDarkMode}>
            <span className="material-symbols-outlined">dark_mode</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden p-gutter gap-gutter bg-surface-container-low">
        
        {/* Left Panel: Customer Profile & Product History */}
        <aside className="w-[320px] flex flex-col gap-4 overflow-y-auto hide-scrollbar hidden lg:flex">
          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 p-5 flex flex-col gap-3">
            <h3 className="font-label-sm text-outline uppercase tracking-wider border-b border-outline-variant/20 pb-1">Session Details</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-label-md"><span className="text-on-surface-variant">Session ID</span><span className="font-mono font-bold">#{sessionId?.slice(0, 8)}</span></div>
              <div className="flex justify-between text-label-md"><span className="text-on-surface-variant">State</span><span className="">{callState}</span></div>
              <div className="flex justify-between text-label-md">
                <span className="text-on-surface-variant">Participants</span>
                <div className="flex gap-1">
                  {selfInfo && <span className={`bg-primary/10 text-primary px-1.5 rounded text-[10px]`}>{selfInfo.role}</span>}
                  {peer && <span className={`bg-success/10 text-success px-1.5 rounded text-[10px]`}>{peer.role}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-4 border-b border-outline-variant/20 pb-4">
              <div className="w-14 h-14 rounded-full bg-surface-variant border-2 border-surface-container-high flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant text-2xl">person</span>
              </div>
              <div>
                <h2 className="font-title-lg text-on-surface font-bold">{peer?.displayName || 'Waiting...'}</h2>
                <p className="font-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  Remote Client
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 p-5 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title-lg text-on-surface font-bold">Active Device</h3>
              <span className="bg-primary/10 text-primary font-label-sm px-2 py-1 rounded border border-primary/20">WIFI PAIRED</span>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded-lg border border-primary/20 mb-4 shadow-inner relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10"></div>
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-surface-variant/30 rounded-lg flex items-center justify-center border border-outline-variant/30">
                  <span className="material-symbols-outlined text-primary text-3xl">mode_fan</span>
                </div>
                <div>
                  <h4 className="font-label-md font-bold text-on-surface">Renesa Smart Fan</h4>
                  <p className="font-label-sm text-on-surface-variant font-mono mt-1">SN: 8492-AX-991</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar pr-2">
              <h4 className="font-label-sm text-outline uppercase tracking-wider mb-3 border-b border-outline-variant/20 pb-1">Telemetrics</h4>
              <ul className="space-y-3">
                <li className="flex justify-between items-center text-body-md">
                  <span className="text-on-surface-variant">Firmware</span>
                  <span className="font-mono text-on-surface font-medium bg-surface-container-high px-2 py-0.5 rounded text-sm">v2.4.1</span>
                </li>
                <li className="flex justify-between items-center text-body-md">
                  <span className="text-on-surface-variant">Power Draw</span>
                  <span className="font-mono text-on-surface font-medium">12W / 28W</span>
                </li>
                <li className="flex justify-between items-center text-body-md">
                  <span className="text-on-surface-variant">Error Log</span>
                  <span className="font-mono text-secondary font-medium">E-04 (Motor Comm)</span>
                </li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Center: Video Feed Canvas */}
        <section className="flex-1 flex flex-col relative bg-black rounded-2xl overflow-hidden shadow-lg border border-outline-variant/20">
          
          {/* Main Video Feed (Remote) */}
          <div className="absolute inset-0 z-0">
            {remoteStream ? (
               <video ref={customerVideoRef} autoPlay playsInline className={`w-full h-full object-cover ${!peer?.videoEnabled ? 'opacity-0' : ''}`} />
            ) : (
               <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container text-on-surface-variant p-8 text-center">
                  <div className="spinner mb-6" style={{ width: '48px', height: '48px', borderWidth: '4px' }}></div>
                  <h3 className="text-2xl font-bold text-on-surface mb-2">
                     {selfInfo?.role === 'customer' ? 'Waiting for an agent' : 'Waiting for remote video...'}
                  </h3>
                  <p className="text-lg">
                     {selfInfo?.role === 'customer' ? "You're next in the queue! Estimated wait: ~2 mins" : "Connecting to peer"}
                  </p>
               </div>
            )}
            {peer && !peer.videoEnabled && (
               <div className="absolute inset-0 flex items-center justify-center bg-surface-container">
                  <div className="w-24 h-24 rounded-full bg-surface-variant flex items-center justify-center">
                     <span className="material-symbols-outlined text-4xl text-on-surface-variant">videocam_off</span>
                  </div>
               </div>
            )}
          </div>

          {/* Local PIP (Bottom Right) */}
          <div className="absolute bottom-24 right-6 w-48 h-32 bg-surface-dark rounded-xl overflow-hidden border-2 border-surface-variant shadow-xl z-20">
            <video ref={techVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!videoEnabled && !isScreenSharing ? 'opacity-0' : ''}`} />
            {!videoEnabled && !isScreenSharing && (
               <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <span className="material-symbols-outlined text-white/50">videocam_off</span>
               </div>
            )}
            <div className="absolute bottom-1 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">You {isScreenSharing ? '(Presenting)' : ''}</div>
          </div>

          {/* Video Overlay UI (Top) */}
          <div className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/60 to-transparent z-10 flex flex-col gap-3 pointer-events-none">
            {isRecording && (
               <div className="w-full max-w-md mx-auto bg-error/95 backdrop-blur-md text-white px-4 py-2.5 rounded-xl border border-white/20 flex items-center justify-center gap-2 shadow-lg shadow-error/20 pointer-events-auto">
                  <span className="material-symbols-outlined text-[18px] animate-pulse">radio_button_checked</span>
                  <span className="font-bold text-sm tracking-wide">This call is being recorded for quality assurance.</span>
               </div>
            )}
            <div className="flex justify-between items-start w-full">
              <div className="flex gap-2">
                <span className="bg-black/40 backdrop-blur-md text-white font-label-sm px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-success">videocam</span> HD
                </span>
                <span className="bg-black/40 backdrop-blur-md text-white font-label-sm px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-success">network_check</span> Stable
                </span>
              </div>
            </div>
          </div>

          {/* Controls Bar (Bottom Google Meet style) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl border border-surface-variant transition-all">
            <button 
              onClick={handleToggleAudio}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm ${audioEnabled ? 'bg-surface-variant text-on-surface hover:bg-surface-variant/80' : 'bg-error text-white hover:bg-error/90'}`}
              title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              <span className={`material-symbols-outlined text-xl ${audioEnabled ? '' : 'filled-icon'}`}>
                {audioEnabled ? 'mic' : 'mic_off'}
              </span>
            </button>
            <button 
              onClick={handleToggleVideo}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm ${videoEnabled ? 'bg-surface-variant text-on-surface hover:bg-surface-variant/80' : 'bg-error text-white hover:bg-error/90'}`}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              <span className={`material-symbols-outlined text-xl ${videoEnabled ? '' : 'filled-icon'}`}>
                {videoEnabled ? 'videocam' : 'videocam_off'}
              </span>
            </button>
            <button 
              onClick={handleFlipCamera}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm bg-surface-variant text-on-surface hover:bg-surface-variant/80 ${!videoEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Flip camera"
              disabled={!videoEnabled}
            >
              <span className="material-symbols-outlined text-xl">flip_camera_ios</span>
            </button>
            <button 
              onClick={handleToggleScreenShare}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm ${isScreenSharing ? 'bg-primary text-on-primary hover:bg-primary/90' : 'bg-surface-variant text-on-surface hover:bg-surface-variant/80'}`}
              title={isScreenSharing ? 'Stop presenting' : 'Present screen'}
            >
              <span className="material-symbols-outlined text-xl">
                {isScreenSharing ? 'cancel_presentation' : 'present_to_all'}
              </span>
            </button>
            
            {selfInfo?.role === 'agent' && (
              <>
                <div className="w-px h-8 bg-surface-variant mx-1"></div>
                <button 
                  onClick={handleToggleRecording}
                  disabled={isTogglingRecording}
                  className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm ${isRecording && !isTogglingRecording ? 'bg-error text-white animate-pulse shadow-lg' : 'bg-surface-variant text-on-surface hover:bg-surface-variant/80'}`}
                  title={isRecording && isTogglingRecording ? 'Preparing recording...' : (!isRecording && isTogglingRecording ? 'Starting recording...' : (isRecording ? 'Stop Recording' : 'Start Recording'))}
                >
                  {isTogglingRecording ? (
                    <span className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
                  ) : (
                    <span className="material-symbols-outlined text-xl">fiber_manual_record</span>
                  )}
                </button>
                {isRecording && isTogglingRecording && (
                  <span className="text-label-sm font-bold text-on-surface-variant animate-pulse ml-1 mr-1">Preparing...</span>
                )}
              </>
            )}
            
            <div className="w-px h-8 bg-surface-variant mx-1"></div>
            
            <button 
              onClick={handleEndCall}
              className="w-12 h-12 flex items-center justify-center bg-error hover:bg-error/90 text-white rounded-full transition-all duration-300 shadow-sm ml-1"
              title="End Call"
            >
              <span className="material-symbols-outlined text-xl">call_end</span>
            </button>
          </div>
        </section>

        {/* Right Panel: Participants & Chat */}
        <aside className="w-[340px] flex flex-col gap-4">
          
          {/* Participants List */}
          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 p-4">
             <h3 className="font-label-sm uppercase text-on-surface-variant tracking-wider mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">group</span>
                Members Present
             </h3>
             <div className="flex flex-col gap-2">
                {selfInfo && (
                   <div className="flex items-center justify-between p-2 rounded-lg bg-surface-variant/30">
                      <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                            {selfInfo.displayName.charAt(0).toUpperCase()}
                         </div>
                         <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{selfInfo.displayName} (You)</span>
                            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">{selfInfo.role}</span>
                         </div>
                      </div>
                   </div>
                )}
                {peer && (
                   <div className="flex items-center justify-between p-2 rounded-lg bg-surface-variant/30">
                      <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-sm">
                            {peer.displayName.charAt(0).toUpperCase()}
                         </div>
                         <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{peer.displayName}</span>
                            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">{peer.role}</span>
                         </div>
                      </div>
                      <div className="flex gap-1 text-on-surface-variant">
                         <span className="material-symbols-outlined text-[16px]">{peer.audioEnabled ? 'mic' : 'mic_off'}</span>
                         <span className="material-symbols-outlined text-[16px]">{peer.videoEnabled ? 'videocam' : 'videocam_off'}</span>
                      </div>
                   </div>
                )}
             </div>
          </div>

          <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 flex-1 flex flex-col overflow-hidden relative">
             {/* Note: We reuse the existing ChatPanel component which already has its own styles, 
                 we wrap it here to fit the new layout grid. */}
             {sessionId && (
                <div className="flex-1 flex flex-col h-full bg-surface relative [&_.chat-panel]:border-0 [&_.chat-panel]:shadow-none [&_.chat-panel]:h-full [&_.chat-panel]:rounded-none">
                   <ChatPanel
                     messages={messages}
                     sessionId={sessionId}
                     onSend={handleSendMessage}
                     onFileUpload={handleFileUpload}
                     disabled={callState === 'ended'}
                   />
                </div>
             )}
          </div>
        </aside>

      </main>

      {/* Overlays (Ended, Connecting) */}
      {callState === 'ended' && !showSurvey && (
        <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-surface p-8 rounded-xl max-w-sm w-full text-center border border-outline-variant/30 shadow-2xl">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-4">call_end</span>
            {endedBy ? (
              <>
                <h2 className="text-2xl font-bold mb-2">Call Ended</h2>
                <p className="text-on-surface-variant mb-6">Ended by {endedBy}</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">You left the call</h2>
                <p className="text-on-surface-variant mb-6">The session is still active.</p>
              </>
            )}
            <div className="flex gap-4 justify-center">
              {!endedBy && selfInfo?.role === 'customer' && sessionId && (
                <button className="bg-primary-container text-white px-6 py-2 rounded-lg font-bold" onClick={() => window.location.reload()}>
                  Rejoin
                </button>
              )}
              <button className="bg-surface-variant text-on-surface px-6 py-2 rounded-lg font-bold" onClick={handleLeave}>
                {selfInfo?.role === 'agent' ? 'Go back to console' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSurvey && sessionId && selfInfo && (
         <PostCallSurvey 
            sessionId={sessionId} 
            role={selfInfo.role} 
            onComplete={() => {
               setShowSurvey(false);
               if (leaving) navigate('/');
            }} 
         />
      )}
      
      {callState === 'connecting' && (
        <div className="absolute inset-0 bg-surface z-[100] flex items-center justify-center">
           <div className="text-center">
              <div className="spinner mb-4 inline-block w-8 h-8"></div>
              <p className="text-on-surface-variant">Connecting to call...</p>
           </div>
        </div>
      )}
    </div>
  );
};
