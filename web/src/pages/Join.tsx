import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { describeInvite, acceptInvite, ApiRequestError, type InviteInfo } from '../lib/api';
import { useToast } from '../components/Toast';

type JoinStep = 'loading' | 'preview' | 'joining' | 'error';

export const Join: React.FC = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<JoinStep>('loading');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const _audioContextRef = useRef<AudioContext | null>(null);
  const _analyserRef = useRef<AnalyserNode | null>(null);
  const [_micVolume, _setMicVolume] = useState(0);
  const [mediaError, setMediaError] = useState('');
  const [networkPing, setNetworkPing] = useState<number | null>(null);

  useEffect(() => {
    if (!inviteCode) { setStep('error'); setErrorMsg('No invite code provided.'); return; }

    const startPing = Date.now();
    describeInvite(inviteCode)
      .then((data) => {
        setNetworkPing(Date.now() - startPing);
        setInfo(data);
        if (!data.joinable) {
          setStep('error');
          setErrorMsg('This session has already ended or is no longer accepting participants.');
        } else {
          setStep('preview');
        }
      })
      .catch((err) => {
        setStep('error');
        setErrorMsg(err instanceof ApiRequestError ? err.message : 'Could not find this invite.');
      });
  }, [inviteCode]);

  useEffect(() => {
    if (step === 'preview' && !stream && !mediaError) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(s => {
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => {
          setMediaError('Could not access camera or microphone. Please check your browser permissions.');
        });
    }
  }, [step, stream, mediaError]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !inviteCode) return;
    setStep('joining');
    try {
      const { session } = await acceptInvite(inviteCode, displayName.trim());
      // Release camera so CallRoom can acquire it
      stream?.getTracks().forEach(t => t.stop());
      navigate(`/call/${session.id}`);
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not join. Please try again.';
      toast('error', msg);
      setStep('preview');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-surface rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-outline-variant/30">
        
        {/* Left Side: Media Preview */}
        <div className="w-full md:w-1/2 bg-surface-dark relative p-6 flex flex-col justify-center items-center min-h-[300px]">
          {mediaError ? (
            <div className="text-center p-6 bg-error/10 rounded-2xl">
               <span className="material-symbols-outlined text-4xl text-error mb-2">videocam_off</span>
               <p className="text-on-surface font-medium">{mediaError}</p>
            </div>
          ) : (
            <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden relative shadow-lg">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>
          )}
          {networkPing !== null && (
             <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md text-white text-[11px] px-2 py-1 rounded-md flex items-center gap-1">
                <span className={`material-symbols-outlined text-[14px] ${networkPing < 150 ? 'text-success' : 'text-warning'}`}>network_check</span>
                Ping: {networkPing}ms
             </div>
          )}
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 text-on-surface-variant">
              <span className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
              <p>Loading session details...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center text-center gap-4">
              <span className="material-symbols-outlined text-6xl text-error">error</span>
              <h2 className="text-2xl font-bold text-on-surface">Unable to join</h2>
              <p className="text-on-surface-variant">{errorMsg}</p>
            </div>
          )}

          {(step === 'preview' || step === 'joining') && info && (
            <>
              <div className="mb-8">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                  <span className="material-symbols-outlined text-2xl">video_camera_front</span>
                </div>
                <h1 className="text-3xl font-bold text-on-surface mb-2">{info.title || 'Support Session'}</h1>
                <p className="text-on-surface-variant text-lg">
                  with <span className="font-medium text-primary">{info.agentName}</span>
                </p>
              </div>

              <form onSubmit={handleJoin} className="flex flex-col gap-6">
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-2">Your Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    autoFocus
                    required
                    maxLength={50}
                    disabled={step === 'joining'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={step === 'joining' || !displayName.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 text-lg"
                >
                  {step === 'joining' ? (
                    <span className="spinner border-on-primary" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
                  ) : (
                    <>Join Session <span className="material-symbols-outlined">arrow_forward</span></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
