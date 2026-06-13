import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, listSessions, getSessionHistory, recordingDownloadUrl, fileDownloadUrl, endSession, apiFetch, type SessionWithParticipants, type SessionHistory } from '../lib/api';
import { formatRelative, formatTime, formatBytes } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export const AgentConsole: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<SessionWithParticipants[]>([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedSessionHistory, setSelectedSessionHistory] = useState<SessionHistory | null>(null);
  const [agentStatus, setAgentStatus] = useState<'online' | 'busy' | 'away'>('online');

  const queuedSessions = sessions.filter(s => s.status !== 'ended' && s.queueStatus === 'queued');
  const activeSessions = sessions.filter(s => s.status !== 'ended' && s.queueStatus !== 'queued');
  const pastSessions = sessions.filter(s => s.status === 'ended');

  // Load initial status from user object if available
  useEffect(() => {
     if (user && (user as any).status) {
        setAgentStatus((user as any).status);
     }
  }, [user]);

  const fetchSessions = useCallback(async () => {
    try {
      const { sessions: s } = await listSessions();
      setSessions(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Quick poll for queue
    return () => clearInterval(interval);
  }, [fetchSessions]);



  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { inviteCode } = await createSession(title.trim() || undefined);
      toast('success', `Session created! Invite code: ${inviteCode}`);
      setTitle('');
      await fetchSessions();
    } catch {
      toast('error', 'Could not create session.');
    } finally {
      setCreating(false);
    }
  };

  const copyInviteLink = async (inviteCode: string) => {
    const link = `${window.location.origin}/join/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('success', 'Invite link copied to clipboard.');
    } catch {
      toast('info', `Invite link: ${link}`);
    }
  };

  const handleEndSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to end this session?')) return;
    try {
      await endSession(sessionId);
      toast('success', 'Session ended.');
      await fetchSessions();
    } catch {
      toast('error', 'Could not end session.');
    }
  };

  const handleViewHistory = async (sessionId: string) => {
    try {
      const history = await getSessionHistory(sessionId);
      setSelectedSessionHistory(history);
    } catch {
      toast('error', 'Could not load session history.');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen flex">
      {/* TopNavBar */}
      <header className="fixed w-full top-0 z-40 bg-surface border-b border-surface-variant shadow-sm flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 lg:pl-[312px]">
        <div className="flex items-center gap-4">
          <button aria-label="Toggle Menu" className="lg:hidden p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="font-headline-md text-primary font-bold">Atomberg Support</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${agentStatus === 'online' ? 'bg-success' : 'bg-warning'}`}></span>
            <select 
              value={agentStatus}
              onChange={(e) => {
                 const st = e.target.value as 'online' | 'busy' | 'away';
                 setAgentStatus(st);
                 apiFetch('/api/auth/status', { method: 'POST', body: JSON.stringify({ status: st }) });
              }}
              className="bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer"
            >
               <option value="online">Online</option>
               <option value="busy">Busy</option>
               <option value="away">Away</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Toggle Dark Mode" className="p-2 rounded-full text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-variant/50" onClick={toggleDarkMode}>
              <span className="material-symbols-outlined">dark_mode</span>
            </button>
            <button aria-label="Help" className="p-2 rounded-full text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-variant/50">
              <span className="material-symbols-outlined">help</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-sm text-on-surface-variant block">{user?.name}</span>
             <div className="w-8 h-8 rounded-full overflow-hidden border border-surface-variant shadow-sm shrink-0 bg-surface-variant flex items-center justify-center">
               <span className="material-symbols-outlined text-on-surface-variant">person</span>
             </div>
          </div>
        </div>
      </header>

      {/* SideNavBar */}
      <nav className="fixed left-0 top-0 h-full w-[280px] bg-surface-container shadow-lg hidden lg:flex flex-col z-50 p-4 gap-2 border-r border-surface-variant/20">
        <div className="mb-8 px-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
             <span className="material-symbols-outlined text-primary text-2xl">support_agent</span>
          </div>
          <div>
            <div className="font-headline-md text-headline-md font-bold text-on-surface truncate">Expert Portal</div>
            <div className="font-label-sm text-label-sm text-on-surface-variant opacity-80">Atomberg Engineering</div>
          </div>
        </div>
        <button onClick={() => document.getElementById('input-session-title')?.focus()} className="mb-6 w-full py-3 px-4 rounded-lg bg-primary-container text-white font-label-md text-label-md font-semibold hover:opacity-90 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Start New Session
        </button>
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">dashboard</span>
            Dashboard
          </button>
          <button onClick={() => navigate('/console')} className="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-surface rounded-lg font-label-md text-label-md active:opacity-80 transition-opacity w-full text-left">
            <span className="material-symbols-outlined filled-icon">video_chat</span>
            Sessions
          </button>
          <button onClick={() => toast('info', 'Coming soon!')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">confirmation_number</span>
            Tickets
          </button>
          <button onClick={() => toast('info', 'Coming soon!')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">inventory_2</span>
            Inventory
          </button>
          <button onClick={() => toast('info', 'Coming soon!')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">settings</span>
            Settings
          </button>
        </div>
        <div className="pt-4 mt-4 border-t border-surface-variant/50 flex flex-col gap-1">
          <button onClick={() => toast('info', 'Coming soon!')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">contact_support</span>
            Help Center
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">logout</span>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content Canvas */}
      <main className="lg:ml-[280px] pt-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto pb-12 w-full">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-headline-lg text-headline-lg md:font-display-lg md:text-display-lg text-primary font-bold">Sessions</h2>
            <p className="text-on-surface-variant mt-1">Manage your support sessions and invite customers.</p>
          </div>
        </div>

        {/* Create Session */}
        <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 mb-8">
          <h3 className="font-title-lg text-on-surface mb-4">Create New Session</h3>
          <form className="flex gap-4" onSubmit={handleCreate}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title (e.g. Renesa Fan Setup)"
              className="flex-1 bg-surface border border-surface-variant rounded-lg px-4 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              id="input-session-title"
            />
            <button
              type="submit"
              className="bg-primary-container text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary-container/90 transition-colors disabled:opacity-50"
              disabled={creating}
            >
              {creating ? <span className="spinner" /> : <><span className="material-symbols-outlined">add</span> Create</>}
            </button>
          </form>
        </section>

        {/* Incoming Queue */}
        {queuedSessions.length > 0 && (
          <section className="mb-12">
            <h3 className="font-title-lg text-on-surface mb-4 flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
               </span>
               Incoming Queue ({queuedSessions.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {queuedSessions.map((s) => (
                 <div key={s.id} className="bg-warning/10 rounded-xl p-6 shadow-sm border border-warning/30 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                       <h4 className="font-title-lg text-on-surface font-bold truncate pr-2">{s.title}</h4>
                       <span className="bg-warning text-on-primary font-label-sm px-2 py-1 rounded shrink-0">WAITING</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                       <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">schedule</span>
                          <span>{formatRelative(s.createdAt)}</span>
                       </div>
                    </div>
                    <button 
                       onClick={() => navigate(`/call/${s.id}`)}
                       className="w-full mt-2 bg-primary hover:bg-primary/90 text-on-primary font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
                    >
                       <span className="material-symbols-outlined">call</span>
                       Accept Request
                    </button>
                 </div>
              ))}
            </div>
            <hr className="my-10 border-t-2 border-surface-variant/50 border-dashed" />
          </section>
        )}

        {/* Session List */}
        <section>
           <h3 className="font-title-lg text-on-surface mb-4">Active Calls</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {activeSessions.map((s) => (
                <div key={s.id} className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col gap-4 group hover:border-primary/30 transition-colors">
                   <div className="flex justify-between items-start">
                      <h4 className="font-title-lg text-on-surface font-bold truncate pr-2">{s.title || 'Untitled Session'}</h4>
                      {s.status === 'live' ? (
                         <span className="bg-success/10 text-success font-label-sm px-2 py-1 rounded border border-success/20 flex items-center gap-1 shrink-0">
                           <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span> LIVE
                         </span>
                      ) : (
                         <span className="bg-secondary/10 text-secondary font-label-sm px-2 py-1 rounded border border-secondary/20 shrink-0">
                           READY
                         </span>
                      )}
                   </div>
                   
                   <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                      <div className="flex items-center gap-1" title="Created">
                         <span className="material-symbols-outlined text-[16px]">schedule</span>
                         <span>{formatRelative(s.createdAt)}</span>
                      </div>
                      {s.activeParticipants != null && s.activeParticipants > 0 && (
                         <div className="flex items-center gap-1 text-success font-medium">
                            <span className="material-symbols-outlined text-[16px]">group</span>
                            <span>{s.activeParticipants} active</span>
                         </div>
                      )}
                   </div>

                   <div className="bg-surface p-3 rounded-lg border border-surface-variant flex justify-between items-center mt-auto">
                      <div>
                         <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Invite Code</div>
                         <div className="font-mono font-bold text-on-surface">{s.inviteCode}</div>
                      </div>
                      <button 
                         onClick={() => copyInviteLink(s.inviteCode)}
                         className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                         title="Copy Link"
                      >
                         <span className="material-symbols-outlined">content_copy</span>
                      </button>
                   </div>

                   <div className="flex gap-2 mt-2">
                      <button 
                         onClick={() => navigate(`/call/${s.id}`)}
                         className="flex-1 bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
                      >
                         <span className="material-symbols-outlined">video_camera_front</span>
                         Join
                      </button>
                      <button 
                         onClick={() => handleEndSession(s.id)}
                         className="px-4 bg-error/10 hover:bg-error/20 text-error font-bold rounded-lg transition-colors flex justify-center items-center"
                         title="End Session"
                      >
                         <span className="material-symbols-outlined">close</span>
                      </button>
                   </div>
                </div>
             ))}
             {activeSessions.length === 0 && (
               <div className="col-span-full py-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl border border-surface-variant/50 border-dashed">
                 <span className="material-symbols-outlined text-4xl mb-2 opacity-50">videocam</span>
                 <p>No active sessions. Create one above to get started.</p>
               </div>
             )}
           </div>

           <hr className="my-10 border-t-2 border-surface-variant/50 border-dashed" />

           <h3 className="font-title-lg text-on-surface mb-4">Past Sessions</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {pastSessions.map((s) => (
                <div key={s.id} className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col gap-4 group hover:border-primary/30 transition-colors">
                   <div className="flex justify-between items-start">
                      <h4 className="font-title-lg text-on-surface font-bold truncate pr-2">{s.title || 'Untitled Session'}</h4>
                      <span className="bg-surface-variant text-on-surface-variant font-label-sm px-2 py-1 rounded border border-outline-variant/30 shrink-0">
                        ENDED
                      </span>
                   </div>
                   
                   <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                      <div className="flex items-center gap-1" title="Created">
                         <span className="material-symbols-outlined text-[16px]">schedule</span>
                         <span>{formatRelative(s.createdAt)}</span>
                      </div>
                   </div>

                   <button 
                      onClick={() => handleViewHistory(s.id)}
                      className="w-full mt-auto bg-surface-container-high hover:bg-surface-variant text-primary font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
                   >
                      <span className="material-symbols-outlined">history</span>
                      View History
                   </button>
                </div>
             ))}
             {pastSessions.length === 0 && (
               <div className="col-span-full py-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl border border-surface-variant/50 border-dashed">
                 <p>No past sessions found.</p>
               </div>
             )}
           </div>
        </section>
      </main>

      {/* History Modal */}
      {selectedSessionHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-surface-variant">
            <div className="p-6 border-b border-surface-variant flex justify-between items-center bg-surface-container">
              <div>
                <h2 className="font-headline-sm font-bold text-primary">{selectedSessionHistory.session.title}</h2>
                <div className="font-mono text-sm text-on-surface-variant mt-1">ID: #{selectedSessionHistory.session.id.slice(0, 8)} • Expert: {selectedSessionHistory.session.agentName}</div>
              </div>
              <button onClick={() => setSelectedSessionHistory(null)} className="p-2 rounded-full hover:bg-surface-variant/50 text-on-surface-variant transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              
              {/* Disposition & Feedback */}
              {(selectedSessionHistory.session.disposition || selectedSessionHistory.session.csatScore) && (
                 <section className="bg-surface-container rounded-xl p-4 border border-surface-variant grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                       <h3 className="font-label-sm uppercase text-on-surface-variant tracking-wider mb-2">Outcome</h3>
                       <div className="font-bold text-on-surface mb-1">
                          {selectedSessionHistory.session.disposition || 'Not logged'}
                       </div>
                       {selectedSessionHistory.session.dispositionNotes && (
                          <div className="text-sm text-on-surface-variant italic">"{selectedSessionHistory.session.dispositionNotes}"</div>
                       )}
                    </div>
                    <div>
                       <h3 className="font-label-sm uppercase text-on-surface-variant tracking-wider mb-2">Customer Feedback</h3>
                       <div className="font-bold text-on-surface mb-1 flex items-center gap-1">
                          {selectedSessionHistory.session.csatScore ? (
                             <>
                                {[1,2,3,4,5].map(s => (
                                   <span key={s} className={`material-symbols-outlined text-[18px] ${s <= selectedSessionHistory.session.csatScore! ? 'text-warning filled-icon' : 'text-surface-variant'}`}>star</span>
                                ))}
                             </>
                          ) : 'No rating'}
                       </div>
                       {selectedSessionHistory.session.csatComment && (
                          <div className="text-sm text-on-surface-variant italic">"{selectedSessionHistory.session.csatComment}"</div>
                       )}
                    </div>
                 </section>
              )}

              {/* Recordings */}
              <section>
                <h3 className="font-title-md font-bold border-b border-surface-variant pb-2 mb-4 text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">videocam</span>
                  Recordings
                </h3>
                {selectedSessionHistory.recordings.length === 0 ? (
                  <p className="text-on-surface-variant text-sm italic">No recordings were captured during this session.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedSessionHistory.recordings.map((rec) => (
                      <div key={rec.id} className="bg-surface p-4 rounded-xl border border-surface-variant flex flex-col justify-between shadow-sm">
                        <div className="mb-4">
                          <div className="font-label-sm uppercase text-on-surface-variant tracking-wider flex justify-between items-center">
                            <span>Status: {rec.status}</span>
                            {rec.sizeBytes && <span className="text-xs">{formatBytes(rec.sizeBytes)}</span>}
                          </div>
                          <div className="font-mono text-sm mt-2 text-on-surface">Started: {formatTime(rec.startedAt)}</div>
                        </div>
                        <a 
                          href={recordingDownloadUrl(selectedSessionHistory.session.id, rec.id)}
                          className={`w-full py-2 rounded-lg font-label-md font-bold text-center transition-colors flex items-center justify-center gap-2 ${rec.status === 'ready' ? 'bg-primary-container text-white hover:bg-primary-container/90' : 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed'}`}
                          onClick={(e) => { if (rec.status !== 'ready') e.preventDefault(); }}
                        >
                          <span className="material-symbols-outlined text-[18px]">download</span>
                          Download .webm
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Chat Transcript */}
              <section>
                <h3 className="font-title-md font-bold border-b border-surface-variant pb-2 mb-4 text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">chat</span>
                  Chat Transcript
                </h3>
                {selectedSessionHistory.messages.length === 0 ? (
                  <p className="text-on-surface-variant text-sm italic">No chat messages were sent during this session.</p>
                ) : (
                  <div className="bg-surface rounded-xl border border-surface-variant p-4 flex flex-col gap-3 max-h-[300px] overflow-y-auto">
                    {selectedSessionHistory.messages.map((msg) => (
                      <div key={msg.id} className="text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold ${msg.senderRole === 'agent' ? 'text-primary' : 'text-success'}`}>{msg.senderName}</span>
                          <span className="font-mono text-[10px] text-on-surface-variant">{formatTime(msg.createdAt)}</span>
                        </div>
                        <div className="text-on-surface bg-surface-container-lowest p-2 rounded border border-surface-variant">
                          {msg.body}
                          {msg.fileId && (
                            <a
                              href={fileDownloadUrl(selectedSessionHistory.session.id, msg.fileId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 mt-2 text-primary font-medium bg-primary/10 w-fit px-2 py-1 rounded"
                            >
                              <span className="material-symbols-outlined text-[14px]">attachment</span> Download Attachment
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Event Log */}
              <section>
                <h3 className="font-title-md font-bold border-b border-surface-variant pb-2 mb-4 text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant">list_alt</span>
                  Event Log
                </h3>
                {selectedSessionHistory.events.length === 0 ? (
                  <p className="text-on-surface-variant text-sm italic">No events logged.</p>
                ) : (
                  <div className="bg-surface rounded-xl border border-surface-variant p-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-on-surface-variant font-label-sm uppercase border-b border-surface-variant">
                        <tr>
                          <th className="pb-2 pr-4 font-mono">Time</th>
                          <th className="pb-2 pr-4">Event</th>
                          <th className="pb-2">Actor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSessionHistory.events.map((evt) => (
                          <tr key={evt.id} className="border-b border-surface-variant/30 last:border-0">
                            <td className="py-2 pr-4 font-mono text-on-surface-variant whitespace-nowrap">{formatTime(evt.createdAt)}</td>
                            <td className="py-2 pr-4 text-on-surface">{evt.type}</td>
                            <td className="py-2 font-medium">{evt.actorName || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
