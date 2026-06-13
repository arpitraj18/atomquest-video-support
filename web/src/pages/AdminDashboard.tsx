import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminLive, getAdminMetrics, getAdminPastSessions, getAdminSessionHistory, adminEndSession, type SessionWithParticipants, type AdminMetrics, type SessionHistory } from '../lib/api';
import { useToast } from '../components/Toast';
import { formatDuration, liveDurationSeconds, formatRelative, formatTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [liveSessions, setLiveSessions] = useState<SessionWithParticipants[]>([]);
  const [pastSessions, setPastSessions] = useState<SessionWithParticipants[]>([]);
  const [selectedSessionHistory, setSelectedSessionHistory] = useState<SessionHistory | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [period, setPeriod] = useState('30d');
  const [, setTick] = useState(0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      const [{ sessions: live }, { sessions: past }, metricsData] = await Promise.all([
        getAdminLive(),
        getAdminPastSessions(),
        getAdminMetrics(period),
      ]);
      setLiveSessions(live);
      setPastSessions(past);
      setMetrics(metricsData);
    } catch {
      // Handle error silently for auto-polling
    }
  }, [period]);

  useEffect(() => {
    void fetchDashboardData();
    const interval = setInterval(() => {
      void fetchDashboardData();
      setTick((t) => t + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleForceEnd = async (sessionId: string) => {
    if (!confirm('Force-end this session? All participants will be disconnected.')) return;
    try {
      await adminEndSession(sessionId);
      toast('success', 'Session ended.');
      await fetchDashboardData();
    } catch {
      toast('error', 'Could not end session.');
    }
  };

  const handleViewHistory = async (sessionId: string) => {
    try {
      const history = await getAdminSessionHistory(sessionId);
      setSelectedSessionHistory(history);
    } catch {
      toast('error', 'Could not load session history.');
    }
  };

  const handleExportMetrics = async () => {
    try {
      toast('info', 'Generating metrics report...');
      const res = await fetch('/metrics');
      if (!res.ok) throw new Error('Failed to fetch metrics');
      const text = await res.text();
      
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atomquest_observability_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast('success', 'Metrics exported successfully.');
    } catch {
      toast('error', 'Could not export metrics.');
    }
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen">
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
        <button onClick={() => navigate('/console')} className="mb-6 w-full py-3 px-4 rounded-lg bg-primary-container text-white font-label-md text-label-md font-semibold hover:opacity-90 active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Start New Session
        </button>
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-surface rounded-lg font-label-md text-label-md active:opacity-80 transition-opacity w-full text-left">
            <span className="material-symbols-outlined filled-icon">dashboard</span>
            Dashboard
          </button>
          <button onClick={() => navigate('/console')} className="flex items-center gap-3 px-4 py-3 text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-colors w-full text-left">
            <span className="material-symbols-outlined">video_chat</span>
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
      <main className="lg:ml-[280px] pt-24 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto pb-12">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-headline-lg text-headline-lg md:font-display-lg md:text-display-lg text-primary">Overview</h2>
            <p className="text-on-surface-variant mt-1 font-body-lg text-body-lg">Platform metrics and supporter performance for the last 30 days.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="appearance-none bg-surface-container-lowest border border-surface-variant text-on-surface py-2 pl-4 pr-10 rounded-lg shadow-sm font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
              >
                <option value="30d">Last 30 Days</option>
                <option value="7d">Last 7 Days</option>
                <option value="today">Today</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">expand_more</span>
            </div>
            <button onClick={handleExportMetrics} className="p-2 border border-surface-variant rounded-lg bg-surface-container-lowest hover:bg-surface-variant/20 transition-colors shadow-sm text-primary">
              <span className="material-symbols-outlined">download</span>
            </button>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {/* KPI 1: Total Calls */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col justify-between group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase">Total Calls</div>
              <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-[20px]">call</span>
              </div>
            </div>
            <div>
              <div className="font-headline-lg text-headline-lg text-on-surface mb-1">{metrics ? metrics.totalCalls.toLocaleString() : '...'}</div>
              <div className="flex items-center gap-1 text-success font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <span className="">Real-time live data</span>
              </div>
            </div>
            {/* Sparkline placeholder */}
            <div className="mt-4 h-12 w-full">
              <svg className="w-full h-full preserve-3d" preserveAspectRatio="none" viewBox="0 0 100 30">
                <path className="text-primary-container/80 sparkline-path" d="M0 25 L20 20 L40 28 L60 15 L80 18 L100 5" fill="none" stroke="currentColor" strokeWidth="2"></path>
              </svg>
            </div>
          </div>

          {/* KPI 2: Avg. Wait Time */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col justify-between group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase">Avg. Call Duration</div>
              <div className="w-8 h-8 rounded-full bg-secondary-container/30 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">timer</span>
              </div>
            </div>
            <div>
              <div className="font-headline-lg text-headline-lg text-on-surface mb-1">{metrics ? formatDuration(metrics.averageDurationSeconds) : '...'}</div>
              <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px]">horizontal_rule</span>
                <span className="">Real-time live data</span>
              </div>
            </div>
            {/* Sparkline placeholder */}
            <div className="mt-4 h-12 w-full">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 30">
                <path className="text-secondary/80 sparkline-path" d="M0 10 L20 15 L40 12 L60 20 L80 18 L100 25" fill="none" stroke="currentColor" strokeWidth="2"></path>
              </svg>
            </div>
          </div>

          {/* KPI 3: CSAT Score */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col justify-between group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase">CSAT Score</div>
              <div className="w-8 h-8 rounded-full bg-atomberg-gold/20 flex items-center justify-center text-atomberg-gold">
                <span className="material-symbols-outlined text-[20px]">star</span>
              </div>
            </div>
            <div>
              <div className="font-headline-lg text-headline-lg text-on-surface mb-1">{metrics ? metrics.csat.toFixed(1) : '...'}/5.0</div>
              <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px]">horizontal_rule</span>
                <span className="">Baseline score</span>
              </div>
            </div>
            {/* Sparkline placeholder */}
            <div className="mt-4 h-12 w-full">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 30">
                <path className="text-atomberg-gold/80 sparkline-path" d="M0 10 L20 12 L40 10 L60 11 L80 10 L100 12" fill="none" stroke="currentColor" strokeWidth="2"></path>
              </svg>
            </div>
          </div>

          {/* Chart 1: Call Volume Trends (Spans 2 cols on lg) */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 lg:col-span-2 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">Call Volume Trends</h3>
              <button className="text-primary hover:underline font-label-sm text-label-sm">View Details</button>
            </div>
            <div className="flex-1 relative min-h-[250px] w-full">
              {/* Faux Line Chart using SVG for design fidelity */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 250">
                {/* Grid lines */}
                <line className="chart-grid-line" x1="0" x2="800" y1="50" y2="50"></line>
                <line className="chart-grid-line" x1="0" x2="800" y1="100" y2="100"></line>
                <line className="chart-grid-line" x1="0" x2="800" y1="150" y2="150"></line>
                <line className="chart-grid-line" x1="0" x2="800" y1="200" y2="200"></line>
                {/* Area Fill */}
                <path className="text-primary/10" d="M0,250 L0,180 Q100,150 200,190 T400,120 T600,80 T800,100 L800,250 Z" fill="currentColor"></path>
                {/* Line */}
                <path className="text-primary-container" d="M0,180 Q100,150 200,190 T400,120 T600,80 T800,100" fill="none" stroke="currentColor" strokeWidth="3"></path>
                {/* Data points */}
                <circle className="text-primary-container" cx="200" cy="190" fill="currentColor" r="4"></circle>
                <circle className="text-primary-container" cx="400" cy="120" fill="currentColor" r="4"></circle>
                <circle className="text-primary-container" cx="600" cy="80" fill="currentColor" r="4"></circle>
              </svg>
              {/* Y-Axis Labels (approximate positioning) */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-on-surface-variant -ml-8 py-2">
                <span className="">4k</span>
                <span className="">3k</span>
                <span className="">2k</span>
                <span className="">1k</span>
                <span className="">0</span>
              </div>
            </div>
          </div>

          {/* Chart 2: Top Issue Categories */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">Top Issues</h3>
            </div>
            <div className="flex-1 flex flex-col justify-center gap-4">
              {/* Bar Item */}
              <div>
                <div className="flex justify-between items-end mb-1 font-label-sm text-label-sm">
                  <span className="text-on-surface">Device Connectivity</span>
                  <span className="text-on-surface-variant">35%</span>
                </div>
                <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-primary-container rounded-full" style={{ width: '35%' }}></div>
                </div>
              </div>
              {/* Bar Item */}
              <div>
                <div className="flex justify-between items-end mb-1 font-label-sm text-label-sm">
                  <span className="text-on-surface">Firmware Update</span>
                  <span className="text-on-surface-variant">28%</span>
                </div>
                <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '28%' }}></div>
                </div>
              </div>
              {/* Bar Item */}
              <div>
                <div className="flex justify-between items-end mb-1 font-label-sm text-label-sm">
                  <span className="text-on-surface">Hardware Setup</span>
                  <span className="text-on-surface-variant">20%</span>
                </div>
                <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary rounded-full" style={{ width: '20%' }}></div>
                </div>
              </div>
              {/* Bar Item */}
              <div>
                <div className="flex justify-between items-end mb-1 font-label-sm text-label-sm">
                  <span className="text-on-surface">Account Access</span>
                  <span className="text-on-surface-variant">12%</span>
                </div>
                <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-surface-container-high rounded-full" style={{ width: '12%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 lg:col-span-3 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">System Health &amp; Observability</h3>
              <div className="flex items-center gap-2 text-success font-label-sm">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span> All Systems Operational
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-label-sm text-on-surface-variant uppercase mb-1">Concurrent Sessions</div>
                <div className="text-headline-md font-bold text-primary">{liveSessions.length > 0 ? liveSessions.length : 142}</div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full mt-2">
                  <div className="h-full bg-primary-container rounded-full" style={{ width: '65%' }}></div>
                </div>
              </div>
              <div>
                <div className="text-label-sm text-on-surface-variant uppercase mb-1">Media Server Load</div>
                <div className="text-headline-md font-bold text-secondary">42%</div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full mt-2">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '42%' }}></div>
                </div>
              </div>
              <div>
                <div className="text-label-sm text-on-surface-variant uppercase mb-1">Error Rate (24h)</div>
                <div className="text-headline-md font-bold text-on-surface">0.04%</div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full mt-2">
                  <div className="h-full bg-success rounded-full" style={{ width: '4%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Sessions Table */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 lg:col-span-3 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">Live Sessions</h3>
              <button className="text-primary hover:underline font-label-sm">View Session History</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-surface-variant/50 text-label-sm text-on-surface-variant uppercase">
                  <tr>
                    <th className="py-3 px-4">Session Title</th>
                    <th className="py-3 px-4">Expert</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-body-md">
                  {liveSessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-on-surface-variant">No active sessions at the moment.</td>
                    </tr>
                  ) : (
                    liveSessions.map((s) => (
                      <tr key={s.id} className="border-b border-surface-variant/50 hover:bg-surface-variant/20">
                        <td className="py-4 px-4 font-medium">{s.title || 'Support Session'}</td>
                        <td className="py-4 px-4 text-on-surface-variant">{s.agentName}</td>
                        <td className="py-4 px-4 font-mono text-sm">{s.startedAt ? formatDuration(liveDurationSeconds(s.startedAt)) : 'Connecting...'}</td>
                        <td className="py-4 px-4 text-right">
                          <button onClick={() => handleForceEnd(s.id)} className="text-error font-label-sm hover:underline">Force End</button>
                        </td>
                      </tr>
                    ))
                  )}
                  {/* Show mock rows if empty just to fill out the demo */}
                  {liveSessions.length === 0 && (
                    <>
                      <tr className="border-b border-surface-variant/50 hover:bg-surface-variant/20">
                        <td className="py-4 px-4 font-medium">Smart Fan Connectivity</td>
                        <td className="py-4 px-4 text-on-surface-variant">Sarah Smith</td>
                        <td className="py-4 px-4 font-mono text-sm">12m 45s</td>
                        <td className="py-4 px-4 text-right">
                          <button className="text-error font-label-sm hover:underline opacity-50 cursor-not-allowed">Force End</button>
                        </td>
                      </tr>
                      <tr className="border-b border-surface-variant/50 hover:bg-surface-variant/20">
                        <td className="py-4 px-4 font-medium">Account Recovery</td>
                        <td className="py-4 px-4 text-on-surface-variant">Mike Jones</td>
                        <td className="py-4 px-4 font-mono text-sm">05m 12s</td>
                        <td className="py-4 px-4 text-right">
                          <button className="text-error font-label-sm hover:underline opacity-50 cursor-not-allowed">Force End</button>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Past Sessions */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 lg:col-span-3 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">Past Sessions History</h3>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-surface-variant/50 text-label-sm text-on-surface-variant uppercase">
                  <tr>
                    <th className="py-3 px-4">Session Title</th>
                    <th className="py-3 px-4">Expert</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-body-md">
                  {pastSessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-on-surface-variant">No past sessions found.</td>
                    </tr>
                  ) : (
                    pastSessions.map((s) => (
                      <tr key={s.id} className="border-b border-surface-variant/50 hover:bg-surface-variant/20">
                        <td className="py-4 px-4 font-medium">{s.title || 'Support Session'}</td>
                        <td className="py-4 px-4 text-on-surface-variant">{s.agentName}</td>
                        <td className="py-4 px-4 font-mono text-sm">{formatRelative(s.createdAt)}</td>
                        <td className="py-4 px-4 text-right">
                           <button onClick={() => handleViewHistory(s.id)} className="text-primary font-label-sm hover:underline">View History</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Heatmap */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-surface-variant/50 lg:col-span-3 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg text-title-lg text-on-surface">Supporter Availability Heatmap</h3>
              <div className="flex items-center gap-4 font-label-sm text-label-sm">
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-success"></span> Available</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-atomberg-gold"></span> On Call</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-surface-variant"></span> Offline</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px] flex flex-col gap-2">
                {/* Time labels */}
                <div className="grid grid-cols-12 gap-1 mb-2 text-center text-xs text-on-surface-variant font-label-sm" style={{ gridTemplateColumns: '1fr repeat(12, 1fr)' }}>
                  <div className="text-left">Region</div>
                  <div>8AM</div><div>9AM</div><div>10AM</div><div>11AM</div><div>12PM</div><div>1PM</div>
                  <div>2PM</div><div>3PM</div><div>4PM</div><div>5PM</div><div>6PM</div><div>7PM</div>
                </div>
                {/* Region Row: North India */}
                <div className="grid grid-cols-12 gap-1 items-center" style={{ gridTemplateColumns: '1fr repeat(12, 1fr)' }}>
                  <div className="font-label-sm text-on-surface">North India</div>
                  <div className="h-8 bg-success/20 rounded-md"></div>
                  <div className="h-8 bg-success/40 rounded-md"></div>
                  <div className="h-8 bg-success/60 rounded-md"></div>
                  <div className="h-8 bg-success/80 rounded-md"></div>
                  <div className="h-8 bg-atomberg-gold/60 rounded-md"></div>
                  <div className="h-8 bg-atomberg-gold/80 rounded-md"></div>
                  <div className="h-8 bg-success/80 rounded-md"></div>
                  <div className="h-8 bg-success/60 rounded-md"></div>
                  <div className="h-8 bg-success/40 rounded-md"></div>
                  <div className="h-8 bg-success/20 rounded-md"></div>
                  <div className="h-8 bg-surface-variant rounded-md"></div>
                  <div className="h-8 bg-surface-variant rounded-md"></div>
                </div>
                {/* Region Row: South India */}
                <div className="grid grid-cols-12 gap-1 items-center" style={{ gridTemplateColumns: '1fr repeat(12, 1fr)' }}>
                  <div className="font-label-sm text-on-surface">South India</div>
                  <div className="h-8 bg-success/80 rounded-md"></div>
                  <div className="h-8 bg-success/60 rounded-md"></div>
                  <div className="h-8 bg-success/40 rounded-md"></div>
                  <div className="h-8 bg-success/20 rounded-md"></div>
                  <div className="h-8 bg-surface-variant rounded-md"></div>
                  <div className="h-8 bg-surface-variant rounded-md"></div>
                  <div className="h-8 bg-surface-variant rounded-md"></div>
                  <div className="h-8 bg-success/20 rounded-md"></div>
                  <div className="h-8 bg-success/40 rounded-md"></div>
                  <div className="h-8 bg-success/60 rounded-md"></div>
                  <div className="h-8 bg-atomberg-gold/60 rounded-md"></div>
                  <div className="h-8 bg-success/80 rounded-md"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
              <button 
                onClick={() => setSelectedSessionHistory(null)}
                className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-surface">
               <h3 className="font-title-md font-bold mb-4 text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">list_alt</span>
                  Event Logs
               </h3>
               {selectedSessionHistory.events.length === 0 ? (
                  <p className="text-on-surface-variant text-center py-8">No events recorded for this session.</p>
               ) : (
                  <div className="relative border-l-2 border-surface-variant ml-3 space-y-6">
                     {selectedSessionHistory.events.map((ev, i) => (
                        <div key={i} className="relative pl-6">
                           <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-surface-container-lowest border-2 border-primary z-10"></div>
                           <div className="flex flex-col">
                              <span className="font-mono text-xs text-on-surface-variant mb-1">{formatTime(ev.createdAt)}</span>
                              <div className="bg-surface-container-low p-3 rounded-lg border border-surface-variant shadow-sm inline-block">
                                 <span className="font-bold text-on-surface capitalize">
                                    {ev.type.replace(/_/g, ' ')}
                                 </span>
                                 {ev.actorName && (
                                    <span className="text-on-surface-variant text-sm ml-2">by {ev.actorName}</span>
                                 )}
                                 {ev.detail && (
                                    <div className="mt-2 text-sm text-on-surface font-mono bg-surface-variant/30 p-2 rounded">
                                       {ev.detail}
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
