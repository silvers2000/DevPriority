'use client';

import { useState } from 'react';
import type { AgentStep } from '@/lib/types';

interface AgentProgressCardProps {
  steps: AgentStep[];
  sessionId: string;
  isComplete?: boolean;
  isWaitingApproval?: boolean;
}

const STATUS_ICON: Record<AgentStep['status'], string> = {
  'done':              '✅',
  'in-progress':       '⏳',
  'pending':           '⏸️',
  'awaiting-approval': '⚠️',
  'error':             '❌',
};

function StepRow({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);
  const icon = STATUS_ICON[step.status];
  const isSpinning = step.status === 'in-progress';

  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#30363D] last:border-0 message-enter">
      {/* Status icon */}
      <span
        className={`text-base mt-0.5 shrink-0 ${isSpinning ? 'animate-spin' : ''}`}
        style={isSpinning ? { display: 'inline-block' } : {}}
      >
        {icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8B949E] tabular-nums font-mono shrink-0">
            {String(step.stepNumber).padStart(2, '0')}
          </span>
          <span
            className={`text-sm truncate ${
              step.status === 'done' ? 'text-[#8B949E] line-through' : 'text-[#E6EDF3]'
            }`}
          >
            {step.description}
          </span>
        </div>

        {/* URL */}
        {step.url && (
          <a
            href={step.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#58A6FF] hover:underline truncate block mt-0.5"
          >
            {step.url}
          </a>
        )}

        {/* Screenshot thumbnail */}
        {step.screenshot && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#F0A500] hover:underline"
            >
              {expanded ? 'Hide screenshot' : 'View screenshot'}
            </button>
            {expanded && (
              <img
                src={step.screenshot}
                alt="Step screenshot"
                className="mt-2 rounded-lg border border-[#30363D] max-w-full max-h-48 object-contain"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentProgressCard({
  steps,
  isComplete = false,
  isWaitingApproval = false,
}: AgentProgressCardProps) {
  const total = steps.length;
  const completed = steps.filter((s) => s.status === 'done').length;
  const current = steps.find((s) => s.status === 'in-progress' || s.status === 'awaiting-approval');
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const taskDescription = steps[0]?.description
    ? steps.map((s) => s.description).slice(0, 1).join('')
    : 'Running task';

  let statusText: string;
  if (isComplete) {
    statusText = '✅ All steps completed';
  } else if (isWaitingApproval) {
    statusText = '⚠️ Waiting for your approval…';
  } else if (current) {
    statusText = `Executing step ${current.stepNumber} of ${total}…`;
  } else {
    statusText = 'Preparing…';
  }

  const isActive = !isComplete;

  return (
    <div className="my-3 message-enter">
      <div
        className={`bg-[#161B22] border border-[#30363D] border-l-4 rounded-xl overflow-hidden shadow-lg ${
          isWaitingApproval ? 'border-l-[#F0A500]' : 'border-l-[#58A6FF]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363D]">
          <span className="text-base">🤖</span>
          <p className="text-sm font-semibold text-[#E6EDF3] truncate flex-1">
            Browser Agent
            <span className="text-[#8B949E] font-normal ml-1">— {taskDescription}</span>
          </p>
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-[#58A6FF] animate-pulse shrink-0" />
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-[#21262D]">
          <div
            className="h-full bg-[#58A6FF] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="px-4 py-1 max-h-64 overflow-y-auto">
          {steps.map((step) => (
            <StepRow key={step.stepNumber} step={step} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#30363D] flex items-center justify-between">
          <p
            className={`text-xs font-medium ${
              isComplete
                ? 'text-[#2EA043]'
                : isWaitingApproval
                ? 'text-[#F0A500]'
                : 'text-[#8B949E]'
            }`}
          >
            {statusText}
          </p>
          <span className="text-xs text-[#484F58]">
            {completed}/{total} steps
          </span>
        </div>
      </div>
    </div>
  );
}
