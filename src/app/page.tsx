'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, AgentStep } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import InputBar, { type InputBarHandle } from '@/components/InputBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { createClient } from '@/lib/supabase';

interface PostExecutionStatus {
  jiraUpdated: boolean;
  slackNotified: boolean;
  summary: string;
}

interface AgentSessionState {
  sessionId: string;
  ticketKey: string;
  steps: AgentStep[];
  isComplete: boolean;
  isWaitingApproval: boolean;
  awaitingStep: AgentStep | null;
  postExecution: PostExecutionStatus | null;
  startedAt: number;
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentSession, setAgentSession] = useState<AgentSessionState | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Store a ref to the latest agent session for use inside the polling closure
  const agentSessionRef = useRef<AgentSessionState | null>(null);
  agentSessionRef.current = agentSession;

  // Profile — used for Sidebar indicator + onboarding banner
  const [userEmail, setUserEmail] = useState('');
  const [integrationConfigured, setIntegrationConfigured] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Toast for real-time notifications (Jira / Slack updates from agent on another device)
  const [realtimeToast, setRealtimeToast] = useState<string | null>(null);
  // Ref to focus the input via keyboard shortcut
  const inputBarRef = useRef<InputBarHandle>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { email?: string; jiraEmail?: string; slackUserId?: string } | null) => {
        if (!data) return;
        setUserEmail(data.email ?? '');
        setIntegrationConfigured(!!(data.jiraEmail && data.slackUserId));
      })
      .catch(() => {});

    // Get user ID for real-time subscriptions
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    }).catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Real-time sync — notifications table
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { type: string; payload: { ticketKey?: string } };
          const label = row.type === 'jira' ? 'Jira' : row.type === 'slack' ? 'Slack' : row.type;
          const key = row.payload?.ticketKey ? ` for ${row.payload.ticketKey}` : '';
          setRealtimeToast(`✅ ${label} updated${key}`);
          setTimeout(() => setRealtimeToast(null), 5000);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // -------------------------------------------------------------------------
  // Message helpers
  // -------------------------------------------------------------------------

  const addMessage = useCallback((role: ChatMessage['role'], content: string): string => {
    const id = uuidv4();
    setMessages((prev) => [...prev, { id, role, content, timestamp: new Date() }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
  }, []);

  const addCompletionMessage = useCallback((session: AgentSessionState) => {
    // Serialise into a special marker that ChatWindow will render as CompletionCard
    const id = uuidv4();
    const durationMs = Date.now() - session.startedAt;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'assistant' as const,
        content: `__completion__${JSON.stringify({
          ticketKey: session.ticketKey,
          steps: session.steps,
          postExecution: session.postExecution,
          durationMs,
        })}`,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // -------------------------------------------------------------------------
  // Agent polling
  // -------------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sessionId: string) => {
    cancelledRef.current = false;

    pollIntervalRef.current = setInterval(async () => {
      if (cancelledRef.current) { stopPolling(); return; }

      try {
        const res = await fetch(`/api/agent/status?sessionId=${sessionId}`);
        if (!res.ok) { stopPolling(); return; }

        const data = await res.json() as {
          steps: AgentStep[];
          isComplete: boolean;
          isWaitingApproval: boolean;
          awaitingStep: AgentStep | null;
          postExecution: PostExecutionStatus | null;
        };

        setAgentSession((prev) =>
          prev
            ? {
                ...prev,
                steps: data.steps,
                isComplete: data.isComplete,
                isWaitingApproval: data.isWaitingApproval,
                awaitingStep: data.awaitingStep,
                postExecution: data.postExecution,
              }
            : prev,
        );

        // Agent done AND post-execution resolved (or timed out after 30 s)
        const elapsed = Date.now() - (agentSessionRef.current?.startedAt ?? Date.now());
        if (data.isComplete && (data.postExecution !== null || elapsed > 30_000)) {
          stopPolling();
          const finalSession = agentSessionRef.current;
          if (finalSession) {
            addCompletionMessage({ ...finalSession, postExecution: data.postExecution, steps: data.steps });
          }
          setTimeout(() => setAgentSession(null), 500);
        }
      } catch {
        stopPolling();
      }
    }, 1000);
  }, [stopPolling, addCompletionMessage]);

  const handleCancelAgent = useCallback(() => {
    cancelledRef.current = true;
    stopPolling();
    addMessage('assistant', '🛑 Browser agent cancelled. Partial action log has been saved.');
    setAgentSession(null);
  }, [stopPolling, addMessage]);

  // -------------------------------------------------------------------------
  // Permission handlers
  // -------------------------------------------------------------------------

  const handleApproval = useCallback(async (approved: boolean, remember?: 'always' | 'never') => {
    if (!agentSession) return;
    try {
      await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: agentSession.sessionId, approved, remember: remember ?? 'once' }),
      });
    } catch { /* polling continues */ }
  }, [agentSession]);

  // -------------------------------------------------------------------------
  // Agent execution
  // -------------------------------------------------------------------------

  const startAgent = useCallback(async (ticketKey: string | null, taskDescription: string) => {
    try {
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketKey: ticketKey ?? 'TASK-000', taskDescription }),
      });
      if (!res.ok) throw new Error('Failed to start agent');
      const data = await res.json() as { sessionId: string; steps: AgentStep[] };

      const session: AgentSessionState = {
        sessionId: data.sessionId,
        ticketKey: ticketKey ?? 'TASK-000',
        steps: data.steps,
        isComplete: false,
        isWaitingApproval: false,
        awaitingStep: null,
        postExecution: null,
        startedAt: Date.now(),
      };
      setAgentSession(session);
      startPolling(data.sessionId);
    } catch (err) {
      addMessage('assistant', `❌ Could not start browser agent: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  }, [startPolling, addMessage]);

  // -------------------------------------------------------------------------
  // Send handler
  // -------------------------------------------------------------------------

  const handleSend = useCallback(async (text: string) => {
    if (isLoading || agentSession) return;

    addMessage('user', text);
    setIsLoading(true);

    const history = messages.concat({ id: 'temp', role: 'user', content: text, timestamp: new Date() });
    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationHistory: history }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        updateMessage(assistantId, `❌ ${(err as { error?: string }).error ?? 'Something went wrong'}`);
        return;
      }

      const contentType = response.headers.get('Content-Type') ?? '';

      if (contentType.includes('application/json')) {
        const data = await response.json() as { type?: string; ticketKey?: string; message?: string };
        if (data.type === 'take-control') {
          updateMessage(assistantId, data.message ?? 'Starting browser agent…');
          setIsLoading(false);
          await startAgent(data.ticketKey ?? null, text);
          return;
        }
        updateMessage(assistantId, data.message ?? JSON.stringify(data));
        return;
      }

      if (!response.body) {
        updateMessage(assistantId, '❌ No response body received.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        updateMessage(assistantId, fullText);
      }
      if (!fullText.trim()) updateMessage(assistantId, '❌ Received an empty response. Please try again.');
    } catch (err) {
      updateMessage(assistantId, `❌ ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, agentSession, messages, addMessage, updateMessage, startAgent]);

  // -------------------------------------------------------------------------
  // Sidebar actions
  // -------------------------------------------------------------------------

  const handleClearChat = useCallback(() => {
    stopPolling();
    setAgentSession(null);
    setMessages([]);
  }, [stopPolling]);

  const handleDailyDigest = useCallback(async () => {
    if (isLoading || agentSession) return;
    setIsLoading(true);
    const id = uuidv4();
    setMessages((prev) => [...prev, { id, role: 'assistant', content: '⏳ Generating your daily digest…', timestamp: new Date() }]);
    try {
      const res = await fetch('/api/digest');
      const data = await res.json() as { error?: string; digest?: string };
      updateMessage(id, data.error ? `❌ ${data.error}` : data.digest ?? 'No digest generated.');
    } catch (err) {
      updateMessage(id, `❌ ${err instanceof Error ? err.message : 'Failed to generate digest'}`);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, agentSession, updateMessage]);

  const handleReprioritize = useCallback(() => {
    handleSend('Re-prioritize my tickets based on the latest Slack activity');
  }, [handleSend]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K — focus chat input
      if (modifier && e.key === 'k') {
        e.preventDefault();
        inputBarRef.current?.focus();
        return;
      }

      // Cmd/Ctrl + D — daily digest
      if (modifier && e.key === 'd') {
        e.preventDefault();
        void handleDailyDigest();
        return;
      }

      // Escape — cancel agent if running, otherwise blur
      if (e.key === 'Escape') {
        if (agentSession && !agentSession.isComplete) {
          handleCancelAgent();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [agentSession, handleDailyDigest, handleCancelAgent]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D1117]">
      <Sidebar
        onDailyDigest={handleDailyDigest}
        onReprioritize={handleReprioritize}
        onClearChat={handleClearChat}
        userEmail={userEmail || undefined}
        integrationConfigured={integrationConfigured}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-[#30363D] bg-[#161B22] flex items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#E6EDF3]">DevPriority Chat</h2>
            <p className="text-xs text-[#8B949E]">
              {agentSession ? '🤖 Browser agent active' : 'Connected to Jira · Slack · Supabase'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${agentSession ? 'bg-[#58A6FF]' : 'bg-[#2EA043]'} animate-pulse`} />
            <span className="text-xs text-[#8B949E]">{agentSession ? 'Agent' : 'Live'}</span>
          </div>
        </div>

        {/* Onboarding banner */}
        {!integrationConfigured && (
          <div className="shrink-0 mx-4 mt-3 px-4 py-3 rounded-lg bg-[#F0A500]/10 border border-[#F0A500]/30 flex items-center gap-3 text-sm">
            <span className="text-[#F0A500]">⚙️</span>
            <span className="text-[#E6EDF3]">
              Welcome to DevPriority!{' '}
              <Link href="/settings" className="text-[#F0A500] hover:underline font-medium">
                Set up your integrations
              </Link>{' '}
              to connect Jira and Slack.
            </span>
          </div>
        )}

        {/* Real-time toast (Jira/Slack updates from agent) */}
        {realtimeToast && (
          <div className="shrink-0 mx-4 mt-2 px-4 py-2 rounded-lg bg-[#2EA043]/10 border border-[#2EA043]/30 text-xs text-[#2EA043] text-center message-enter">
            {realtimeToast}
          </div>
        )}

        <ErrorBoundary>
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            agentSession={agentSession}
            onApprove={() => handleApproval(true)}
            onDeny={() => handleApproval(false)}
            onAlwaysAllow={() => handleApproval(true, 'always')}
          />
        </ErrorBoundary>

        <InputBar
          ref={inputBarRef}
          onSend={handleSend}
          isLoading={isLoading}
          isAgentRunning={!!agentSession && !agentSession.isComplete}
          onCancelAgent={handleCancelAgent}
        />
      </div>
    </div>
  );
}
