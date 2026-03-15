'use client';

import { useState } from 'react';
import type { AgentStep } from '@/lib/types';

interface PostExecutionStatus {
  jiraUpdated: boolean;
  slackNotified: boolean;
  summary: string;
}

interface CompletionCardProps {
  ticketKey: string;
  steps: AgentStep[];
  postExecution: PostExecutionStatus;
  durationMs?: number;
}

const STATUS = (ok: boolean) =>
  ok ? (
    <span className="text-[#2EA043]">✅</span>
  ) : (
    <span className="text-[#F85149]">❌</span>
  );

export default function CompletionCard({
  ticketKey,
  steps,
  postExecution,
  durationMs,
}: CompletionCardProps) {
  const [logsOpen, setLogsOpen] = useState(false);

  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? '';
  const jiraLink = jiraBaseUrl ? `${jiraBaseUrl}/browse/${ticketKey}` : null;

  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const minutes = durationMs != null ? Math.round(durationMs / 60_000) : null;

  return (
    <div className="my-3 message-enter">
      <div className="bg-[#161B22] border border-[#30363D] border-l-4 border-l-[#2EA043] rounded-xl overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363D]">
          <span className="text-base">✅</span>
          <p className="text-sm font-semibold text-[#E6EDF3]">
            Task{' '}
            {jiraLink ? (
              <a
                href={jiraLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#58A6FF] hover:underline"
              >
                {ticketKey}
              </a>
            ) : (
              <span className="text-[#58A6FF]">{ticketKey}</span>
            )}{' '}
            completed
          </p>
        </div>

        {/* Summary */}
        {postExecution.summary && (
          <div className="px-4 py-3 border-b border-[#30363D]">
            <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium mb-1">Summary</p>
            <p className="text-sm text-[#E6EDF3] leading-relaxed">{postExecution.summary}</p>
          </div>
        )}

        {/* Status rows */}
        <div className="px-4 py-3 space-y-2 border-b border-[#30363D]">
          <div className="flex items-center gap-2 text-sm">
            {STATUS(postExecution.jiraUpdated)}
            <span className="text-[#E6EDF3]">
              Jira:{' '}
              <span className="text-[#8B949E]">
                {postExecution.jiraUpdated
                  ? 'Ticket transitioned to Done + summary comment posted'
                  : 'Could not update Jira (check credentials)'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {STATUS(postExecution.slackNotified)}
            <span className="text-[#E6EDF3]">
              Slack:{' '}
              <span className="text-[#8B949E]">
                {postExecution.slackNotified
                  ? 'Manager notified'
                  : 'Could not send Slack notification (check config)'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#58A6FF]">📝</span>
            <span className="text-[#8B949E]">
              {completedSteps} step{completedSteps !== 1 ? 's' : ''} executed
              {minutes != null ? ` in ~${minutes} min` : ''}
            </span>
          </div>
        </div>

        {/* Expandable action log */}
        <div className="px-4 py-2.5">
          <button
            onClick={() => setLogsOpen(!logsOpen)}
            className="text-xs text-[#8B949E] hover:text-[#F0A500] transition"
          >
            {logsOpen ? '▲ Hide' : '▼ View'} action log ({steps.length} steps)
          </button>

          {logsOpen && (
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {steps.map((s) => (
                <div key={s.stepNumber} className="flex items-start gap-2 text-xs py-1 border-b border-[#21262D] last:border-0">
                  <span className="text-[#484F58] tabular-nums font-mono shrink-0 mt-0.5">
                    {String(s.stepNumber).padStart(2, '0')}
                  </span>
                  <span
                    className={
                      s.status === 'done'
                        ? 'text-[#8B949E] line-through'
                        : s.status === 'error'
                        ? 'text-[#F85149]'
                        : 'text-[#E6EDF3]'
                    }
                  >
                    {s.description}
                  </span>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-[#58A6FF] hover:underline shrink-0"
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
