'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  LogOut,
  RefreshCw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import SessionManager from '@/components/SessionManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Profile {
  email: string;
  displayName: string;
  jiraEmail: string;
  slackUserId: string;
  managerSlackChannel: string;
}

interface Permission {
  id: string;
  action_type: string;
  permission: 'once' | 'always' | 'never';
  updated_at: string;
}

interface HealthStatus {
  jira: 'ok' | 'error';
  slack: 'ok' | 'error';
  supabase: 'ok' | 'error';
  openai: 'ok' | 'error';
}

// ---------------------------------------------------------------------------
// Device detection
// ---------------------------------------------------------------------------

function detectDevice() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Mobi|Android/i.test(ua)) deviceType = 'mobile';
  else if (/Tablet|iPad/i.test(ua)) deviceType = 'tablet';

  let platform = 'Web';
  if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';
  else if (/iPhone|iPad/i.test(ua)) platform = 'iOS';
  else if (/Android/i.test(ua)) platform = 'Android';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return { deviceName: `${platform} · ${browser}`, deviceType, platform };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#30363D]">
        <h2 className="text-sm font-semibold text-[#E6EDF3] uppercase tracking-wider">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-[#E6EDF3] font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-[#8B949E]">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  readOnly,
  type = 'text',
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full px-3 py-2 rounded-lg border text-sm transition ${
        readOnly
          ? 'bg-[#0D1117] border-[#21262D] text-[#8B949E] cursor-not-allowed'
          : 'bg-[#0D1117] border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#F0A500]/50'
      }`}
    />
  );
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F0A500] hover:bg-[#F0A500]/90 text-black text-sm font-semibold disabled:opacity-60 transition"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      {loading ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

function HealthBadge({ status }: { status: 'ok' | 'error' | null }) {
  if (status === null)
    return <span className="text-xs text-[#8B949E]">—</span>;
  if (status === 'ok')
    return (
      <span className="flex items-center gap-1 text-xs text-[#2EA043]">
        <CheckCircle2 size={12} /> Connected
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-[#F85149]">
      <XCircle size={12} /> Error
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();

  // Profile state
  const [profile, setProfile] = useState<Profile>({
    email: '',
    displayName: '',
    jiraEmail: '',
    slackUserId: '',
    managerSlackChannel: '',
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Integration state (separate save)
  const [integSaving, setIntegSaving] = useState(false);
  const [integSaved, setIntegSaved] = useState(false);

  // Health check
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Permissions
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [resetingPerms, setResetingPerms] = useState(false);

  // Session
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch profile + permissions on mount, register device session
  // ---------------------------------------------------------------------------

  const fetchProfile = useCallback(async () => {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json() as Profile;
      setProfile(data);
    }
    setProfileLoading(false);
  }, []);

  const fetchPermissions = useCallback(async () => {
    const res = await fetch('/api/settings/permissions');
    if (res.ok) {
      const data = await res.json() as { permissions: Permission[] };
      setPermissions(data.permissions);
    }
    setPermsLoading(false);
  }, []);

  const registerSession = useCallback(async () => {
    const stored = localStorage.getItem('devpriority_device_session');
    const { deviceName, deviceType, platform } = detectDevice();

    const res = await fetch('/api/settings/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: stored ?? undefined,
        deviceName,
        deviceType,
        platform,
      }),
    });

    if (res.ok) {
      const data = await res.json() as { sessionId: string | null };
      if (data.sessionId) {
        localStorage.setItem('devpriority_device_session', data.sessionId);
        setCurrentSessionId(data.sessionId);
      }
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
    void fetchPermissions();
    void registerSession();
  }, [fetchProfile, fetchPermissions, registerSession]);

  // ---------------------------------------------------------------------------
  // Save handlers
  // ---------------------------------------------------------------------------

  const saveProfile = async () => {
    setProfileSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: profile.displayName }),
    });
    setProfileSaving(false);
    if (res.ok) {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    }
  };

  const saveIntegrations = async () => {
    setIntegSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraEmail: profile.jiraEmail,
        slackUserId: profile.slackUserId,
        managerSlackChannel: profile.managerSlackChannel,
      }),
    });
    setIntegSaving(false);
    if (res.ok) {
      setIntegSaved(true);
      setTimeout(() => setIntegSaved(false), 2500);
    }
  };

  // ---------------------------------------------------------------------------
  // Test connections
  // ---------------------------------------------------------------------------

  const testConnections = async () => {
    setHealthLoading(true);
    setHealth(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json() as { status: HealthStatus };
      setHealth(data.status);
    } finally {
      setHealthLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Permissions handlers
  // ---------------------------------------------------------------------------

  const updatePermission = async (id: string, permission: string) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, permission: permission as Permission['permission'] } : p)),
    );
    await fetch('/api/settings/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, permission }),
    });
  };

  const resetAllPermissions = async () => {
    setResetingPerms(true);
    await fetch('/api/settings/permissions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setPermissions([]);
    setResetingPerms(false);
  };

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('devpriority_device_session');
    router.push('/login');
  };

  const signOutAll = async () => {
    await fetch('/api/settings/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    await signOut();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (profileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0D1117]">
        <Loader2 size={24} className="text-[#F0A500] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#30363D] bg-[#161B22]/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-[#E6EDF3] transition text-sm"
          >
            <ArrowLeft size={16} />
            Back to Chat
          </Link>
          <span className="text-[#30363D]">/</span>
          <h1 className="text-sm font-semibold text-[#E6EDF3]">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ------------------------------------------------------------------ */}
        {/* Profile */}
        {/* ------------------------------------------------------------------ */}
        <SectionCard title="Profile">
          <div className="space-y-4">
            <FormField label="Email">
              <TextInput value={profile.email} readOnly />
            </FormField>
            <FormField label="Display Name">
              <TextInput
                value={profile.displayName}
                onChange={(v) => setProfile((p) => ({ ...p, displayName: v }))}
                placeholder="Your name (shown in Slack notifications)"
              />
            </FormField>
            <div className="flex items-center gap-3">
              <SaveButton loading={profileSaving} onClick={() => void saveProfile()} />
              {profileSaved && (
                <span className="text-xs text-[#2EA043] flex items-center gap-1">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ------------------------------------------------------------------ */}
        {/* Integration Configuration */}
        {/* ------------------------------------------------------------------ */}
        <SectionCard title="Integration Configuration">
          <div className="space-y-4">
            <FormField label="Jira Email">
              <TextInput
                value={profile.jiraEmail}
                onChange={(v) => setProfile((p) => ({ ...p, jiraEmail: v }))}
                placeholder="you@company.com"
                type="email"
              />
            </FormField>
            <FormField
              label="Slack Member ID"
              hint="Find in Slack: click your profile → ⋯ More → Copy member ID"
            >
              <TextInput
                value={profile.slackUserId}
                onChange={(v) => setProfile((p) => ({ ...p, slackUserId: v }))}
                placeholder="U0XXXXXXXX"
              />
            </FormField>
            <FormField
              label="Manager Slack Channel"
              hint="Channel ID where your manager receives task completion notifications"
            >
              <TextInput
                value={profile.managerSlackChannel}
                onChange={(v) => setProfile((p) => ({ ...p, managerSlackChannel: v }))}
                placeholder="C0XXXXXXXX"
              />
            </FormField>

            {/* Test Connections */}
            <div className="pt-1">
              <button
                onClick={() => void testConnections()}
                disabled={healthLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#30363D] text-[#8B949E] hover:border-[#F0A500]/30 hover:text-[#F0A500] text-sm transition disabled:opacity-60"
              >
                {healthLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Test Connections
              </button>

              {health && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(Object.entries(health) as [keyof HealthStatus, 'ok' | 'error'][]).map(
                    ([key, status]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#21262D] border border-[#30363D]"
                      >
                        <span className="text-sm text-[#E6EDF3] capitalize">{key}</span>
                        <HealthBadge status={status} />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <SaveButton loading={integSaving} onClick={() => void saveIntegrations()} />
              {integSaved && (
                <span className="text-xs text-[#2EA043] flex items-center gap-1">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ------------------------------------------------------------------ */}
        {/* Active Sessions */}
        {/* ------------------------------------------------------------------ */}
        <SectionCard title="Active Sessions">
          <SessionManager
            currentSessionId={currentSessionId}
            onRevokeAll={() => void signOutAll()}
          />
        </SectionCard>

        {/* ------------------------------------------------------------------ */}
        {/* Agent Permissions */}
        {/* ------------------------------------------------------------------ */}
        <SectionCard title="Agent Permissions">
          {permsLoading ? (
            <p className="text-sm text-[#8B949E]">Loading permissions…</p>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-[#8B949E]">
              No saved permissions yet. Permissions are set when the browser agent asks for
              approval.
            </p>
          ) : (
            <div className="space-y-3">
              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-[#21262D] last:border-0"
                >
                  <span className="text-sm text-[#E6EDF3] font-mono">{perm.action_type}</span>
                  <select
                    value={perm.permission}
                    onChange={(e) => void updatePermission(perm.id, e.target.value)}
                    className="text-sm bg-[#21262D] border border-[#30363D] text-[#E6EDF3] rounded-lg px-2 py-1 focus:outline-none focus:border-[#F0A500]/50"
                  >
                    <option value="always">Always allow</option>
                    <option value="once">Ask each time</option>
                    <option value="never">Always deny</option>
                  </select>
                </div>
              ))}
              <button
                onClick={() => void resetAllPermissions()}
                disabled={resetingPerms}
                className="flex items-center gap-2 text-sm text-[#F85149] hover:text-[#F85149]/70 disabled:opacity-50 transition mt-2"
              >
                <Trash2 size={13} />
                {resetingPerms ? 'Resetting…' : 'Reset All Permissions'}
              </button>
            </div>
          )}
        </SectionCard>

        {/* ------------------------------------------------------------------ */}
        {/* Danger Zone */}
        {/* ------------------------------------------------------------------ */}
        <div className="bg-[#161B22] border border-[#F85149]/30 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F85149]/20 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#F85149]" />
            <h2 className="text-sm font-semibold text-[#F85149] uppercase tracking-wider">
              Danger Zone
            </h2>
          </div>
          <div className="px-5 py-5 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[#E6EDF3] font-medium">Sign out</p>
                <p className="text-xs text-[#8B949E]">Sign out from this device only</p>
              </div>
              <button
                onClick={() => void signOut()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#F85149]/40 text-[#F85149] hover:bg-[#F85149]/10 text-sm transition"
              >
                <LogOut size={13} />
                Sign Out
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#30363D]">
              <div>
                <p className="text-sm text-[#E6EDF3] font-medium">Sign out all devices</p>
                <p className="text-xs text-[#8B949E]">
                  Revokes all active sessions and signs out everywhere
                </p>
              </div>
              <button
                onClick={() => void signOutAll()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#F85149]/40 text-[#F85149] hover:bg-[#F85149]/10 text-sm transition whitespace-nowrap"
              >
                <LogOut size={13} />
                Sign Out All
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
