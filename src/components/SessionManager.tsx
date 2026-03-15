'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase';

interface Session {
  id: string;
  device_name: string | null;
  device_type: string | null;
  platform: string | null;
  last_seen: string;
  is_active: boolean;
}

interface SessionManagerProps {
  currentSessionId: string | null;
  onRevokeAll?: () => void;
}

function DeviceIcon({ deviceType }: { deviceType: string | null }) {
  if (deviceType === 'mobile') return <Smartphone size={14} className="text-[#58A6FF] shrink-0" />;
  if (deviceType === 'tablet') return <Tablet size={14} className="text-[#58A6FF] shrink-0" />;
  return <Monitor size={14} className="text-[#58A6FF] shrink-0" />;
}

export default function SessionManager({ currentSessionId, onRevokeAll }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/sessions');
      if (res.ok) {
        const data = await res.json() as { sessions: Session[] };
        setSessions(data.sessions);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();

    // Real-time subscription so new logins appear instantly
    const supabase = createClient();
    const channel = supabase
      .channel('sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        void fetchSessions();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchSessions]);

  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await fetch('/api/settings/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setRevoking('all');
    try {
      await fetch('/api/settings/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      onRevokeAll?.();
    } finally {
      setRevoking(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-[#8B949E] py-2">Loading sessions…</p>;
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-[#8B949E] py-2">No active sessions found.</p>;
  }

  const otherSessions = sessions.filter((s) => s.id !== currentSessionId);

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isCurrent = session.id === currentSessionId;
        const lastSeenDate = new Date(session.last_seen);
        const isValidDate = !isNaN(lastSeenDate.getTime());

        return (
          <div
            key={session.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
              isCurrent
                ? 'border-[#F0A500]/30 bg-[#F0A500]/5'
                : 'border-[#30363D] bg-[#21262D]'
            }`}
          >
            <DeviceIcon deviceType={session.device_type} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#E6EDF3] font-medium truncate">
                {session.device_name ?? 'Unknown device'}
                {isCurrent && (
                  <span className="ml-2 text-xs text-[#F0A500]">(This device)</span>
                )}
              </p>
              <p className="text-xs text-[#8B949E]">
                {session.platform ?? 'Web'} ·{' '}
                {isValidDate
                  ? formatDistanceToNow(lastSeenDate, { addSuffix: true })
                  : 'recently'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-2 h-2 rounded-full ${
                  isCurrent ? 'bg-[#2EA043] animate-pulse' : 'bg-[#484F58]'
                }`}
              />
              {!isCurrent && (
                <button
                  onClick={() => void revokeSession(session.id)}
                  disabled={revoking === session.id}
                  className="text-xs text-[#F85149] hover:text-[#F85149]/70 disabled:opacity-50 transition"
                >
                  {revoking === session.id ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {otherSessions.length > 1 && (
        <button
          onClick={() => void revokeAll()}
          disabled={revoking === 'all'}
          className="text-xs text-[#F85149] hover:text-[#F85149]/70 disabled:opacity-50 transition mt-1"
        >
          {revoking === 'all' ? 'Revoking all…' : 'Revoke all other sessions'}
        </button>
      )}
    </div>
  );
}
