'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap,
  RefreshCw,
  Trash2,
  Monitor,
  Menu,
  X,
  CheckCircle2,
  XCircle,
  Settings,
  Loader2,
} from 'lucide-react';

interface SidebarProps {
  onDailyDigest?: () => void;
  onReprioritize?: () => void;
  onClearChat?: () => void;
  userEmail?: string;
  integrationConfigured?: boolean;
}

type IntegrationStatus = 'ok' | 'error' | 'loading';

export default function Sidebar({
  onDailyDigest,
  onReprioritize,
  onClearChat,
  userEmail = 'developer@company.com',
  integrationConfigured = true,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<Record<string, IntegrationStatus>>({
    Jira: 'loading',
    Slack: 'loading',
    Supabase: 'loading',
    OpenAI: 'loading',
  });
  const [healthChecking, setHealthChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json() as { status: Record<string, string> };
        setHealthStatus({
          Jira: data.status.jira === 'ok' ? 'ok' : 'error',
          Slack: data.status.slack === 'ok' ? 'ok' : 'error',
          Supabase: data.status.supabase === 'ok' ? 'ok' : 'error',
          OpenAI: data.status.openai === 'ok' ? 'ok' : 'error',
        });
      }
    } catch {
      setHealthStatus({ Jira: 'error', Slack: 'error', Supabase: 'error', OpenAI: 'error' });
    } finally {
      setHealthChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const content = (
    <div className="flex flex-col h-full w-[280px] bg-[#161B22] border-r border-[#30363D] shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#30363D]">
        <h1 className="text-xl font-semibold text-white tracking-tight">
          Dev<span className="text-[#F0A500]">Priority</span>
        </h1>
        <p className="text-xs text-[#8B949E] mt-0.5">AI Developer Co-pilot</p>
      </div>

      {/* User */}
      <div className="px-5 py-4 border-b border-[#30363D] flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#F0A500]/20 border border-[#F0A500]/40 flex items-center justify-center text-[#F0A500] font-semibold text-sm uppercase">
          {userEmail.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-[#E6EDF3] truncate font-medium">{userEmail}</p>
          <p className="text-xs text-[#8B949E]">Active</p>
        </div>
      </div>

      {/* Integration Status */}
      <div className="px-5 py-4 border-b border-[#30363D]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium">
            Integrations
          </p>
          <button
            onClick={() => void checkHealth()}
            disabled={healthChecking}
            className="text-[#484F58] hover:text-[#8B949E] disabled:opacity-40 transition"
            title="Refresh integration status"
          >
            {healthChecking ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </button>
        </div>
        <div className="space-y-2">
          {Object.entries(healthStatus).map(([name, status]) => (
            <div key={name} className="flex items-center justify-between">
              <span className="text-sm text-[#E6EDF3]">{name}</span>
              <div className="flex items-center gap-1.5">
                {status === 'loading' ? (
                  <Loader2 size={12} className="text-[#8B949E] animate-spin" />
                ) : status === 'ok' ? (
                  <>
                    <CheckCircle2 size={13} className="text-[#2EA043]" />
                    <span className="text-xs text-[#2EA043]">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle size={13} className="text-[#F85149]" />
                    <span className="text-xs text-[#F85149]">Error</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-5 py-4 border-b border-[#30363D]">
        <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium mb-3">
          Quick Actions
        </p>
        <div className="space-y-2">
          <button
            onClick={onDailyDigest}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#F0A500]/30 text-[#F0A500] hover:bg-[#F0A500]/10 text-sm font-medium transition"
          >
            <Zap size={14} />
            Daily Digest
          </button>
          <button
            onClick={onReprioritize}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#F0A500]/30 hover:text-[#F0A500] text-sm font-medium transition"
          >
            <RefreshCw size={14} />
            Re-prioritize
          </button>
          <button
            onClick={onClearChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#F85149]/30 hover:text-[#F85149] text-sm font-medium transition"
          >
            <Trash2 size={14} />
            Clear Chat
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="px-5 py-4">
        <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium mb-3">
          Active Sessions
        </p>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#21262D] border border-[#30363D]">
          <Monitor size={14} className="text-[#58A6FF] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-[#E6EDF3] font-medium truncate">This Device</p>
            <p className="text-xs text-[#8B949E]">Chrome · Web</p>
          </div>
          <div className="ml-auto w-2 h-2 rounded-full bg-[#2EA043] shrink-0" />
        </div>
      </div>

      {/* Settings link */}
      <div className="px-5 pb-5 mt-auto">
        <Link
          href="/settings"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#F0A500]/30 hover:text-[#F0A500] text-sm font-medium transition"
        >
          <Settings size={14} />
          Settings
          {!integrationConfigured && (
            <span className="ml-auto w-2 h-2 rounded-full bg-[#F0A500] shrink-0" title="Integrations not configured" />
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">{content}</div>

      {/* Mobile hamburger */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#161B22] border border-[#30363D] text-[#8B949E] hover:text-[#E6EDF3]"
        >
          <Menu size={18} />
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="relative flex h-full">{content}</div>
            <div
              className="flex-1 bg-black/60"
              onClick={() => setMobileOpen(false)}
            >
              <button className="absolute top-4 right-4 p-2 text-[#8B949E] hover:text-white">
                <X size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
