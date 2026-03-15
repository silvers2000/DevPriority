'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage, AgentStep } from '@/lib/types';
import MessageBubble from './MessageBubble';
import StreamingDots from './StreamingDots';
import AgentProgressCard from './AgentProgressCard';
import PermissionGate from './PermissionGate';
import CompletionCard from './CompletionCard';
import { MessageSquare } from 'lucide-react';

interface AgentSessionState {
  sessionId: string;
  steps: AgentStep[];
  isComplete: boolean;
  isWaitingApproval: boolean;
  awaitingStep: AgentStep | null;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  agentSession?: AgentSessionState | null;
  onApprove?: () => void;
  onDeny?: () => void;
  onAlwaysAllow?: () => void;
}

export default function ChatWindow({
  messages,
  isLoading,
  agentSession,
  onApprove,
  onDeny,
  onAlwaysAllow,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, agentSession]);

  if (messages.length === 0 && !isLoading && !agentSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#F0A500]/10 border border-[#F0A500]/20 flex items-center justify-center mb-5">
          <MessageSquare size={24} className="text-[#F0A500]" />
        </div>
        <h2 className="text-lg font-semibold text-[#E6EDF3] mb-2">
          Welcome to DevPriority
        </h2>
        <p className="text-sm text-[#8B949E] max-w-sm leading-relaxed">
          Ask me what to work on, or say{' '}
          <span className="text-[#F0A500] font-medium">&ldquo;take control&rdquo;</span>{' '}
          to let me handle a task for you.
        </p>
        <div className="mt-8 flex flex-wrap gap-2 justify-center">
          {[
            'What should I work on today?',
            'Show me my critical tickets',
            'Summarize Slack activity for DEV-123',
            'Take control and close PROJ-456',
          ].map((hint) => (
            <span
              key={hint}
              className="text-xs text-[#8B949E] border border-[#30363D] rounded-full px-3 py-1.5 hover:border-[#F0A500]/30 hover:text-[#F0A500] cursor-default transition"
            >
              {hint}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map((msg) => {
          // Inline agent progress (historical)
          if (msg.agentProgress) {
            return (
              <AgentProgressCard
                key={msg.id}
                steps={msg.agentProgress}
                sessionId=""
              />
            );
          }
          // Completion card marker
          if (msg.content.startsWith('__completion__')) {
            try {
              const payload = JSON.parse(msg.content.slice('__completion__'.length)) as {
                ticketKey: string;
                steps: AgentStep[];
                postExecution: { jiraUpdated: boolean; slackNotified: boolean; summary: string } | null;
                durationMs: number;
              };
              return (
                <CompletionCard
                  key={msg.id}
                  ticketKey={payload.ticketKey}
                  steps={payload.steps}
                  postExecution={payload.postExecution ?? { jiraUpdated: false, slackNotified: false, summary: '' }}
                  durationMs={payload.durationMs}
                />
              );
            } catch {
              return <MessageBubble key={msg.id} message={msg} />;
            }
          }
          return <MessageBubble key={msg.id} message={msg} />;
        })}

        {/* Live agent session card */}
        {agentSession && (
          <>
            <AgentProgressCard
              steps={agentSession.steps}
              sessionId={agentSession.sessionId}
              isComplete={agentSession.isComplete}
              isWaitingApproval={agentSession.isWaitingApproval}
            />
            {agentSession.isWaitingApproval && agentSession.awaitingStep && onApprove && onDeny && onAlwaysAllow && (
              <PermissionGate
                step={agentSession.awaitingStep}
                onApprove={onApprove}
                onDeny={onDeny}
                onAlwaysAllow={onAlwaysAllow}
              />
            )}
          </>
        )}

        {isLoading && (
          <div className="flex justify-start mb-4 message-enter">
            <div className="w-7 h-7 rounded-full bg-[#F0A500]/20 border border-[#F0A500]/40 flex items-center justify-center text-[#F0A500] text-xs font-bold shrink-0 mt-0.5 mr-2.5">
              D
            </div>
            <div className="bg-[#21262D] border border-[#30363D] px-4 py-3 rounded-2xl rounded-tl-sm">
              <StreamingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
