'use client';

import type { AgentStep } from '@/lib/types';

interface PermissionGateProps {
  step: AgentStep;
  onApprove: () => void;
  onDeny: () => void;
  onAlwaysAllow: () => void;
}

export default function PermissionGate({
  step,
  onApprove,
  onDeny,
  onAlwaysAllow,
}: PermissionGateProps) {
  return (
    <div className="my-3 message-enter">
      <div
        className="bg-[#161B22] rounded-xl overflow-hidden shadow-2xl"
        style={{
          border: '1px solid #F0A500',
          animation: 'permissionPulse 2s ease-in-out infinite',
        }}
      >
        <style>{`
          @keyframes permissionPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(240,165,0,0.0); }
            50% { box-shadow: 0 0 0 6px rgba(240,165,0,0.12); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F0A500]/10 border-b border-[#F0A500]/30">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-[#F0A500]">Approval Required</p>
            <p className="text-xs text-[#8B949E]">The agent will pause until you respond</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium mb-1">
              The agent wants to:
            </p>
            <p className="text-sm text-[#E6EDF3] font-medium">{step.description}</p>
          </div>

          {step.url && (
            <div>
              <p className="text-xs text-[#8B949E] uppercase tracking-wider font-medium mb-1">
                On page:
              </p>
              <a
                href={step.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#58A6FF] hover:underline break-all"
              >
                {step.url}
              </a>
            </div>
          )}

          <div className="bg-[#21262D] border border-[#30363D] rounded-lg px-3 py-2">
            <p className="text-xs text-[#8B949E]">
              This action may make permanent changes (submit, send, update, or delete something).
              Review the details above before approving.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-[#30363D] flex flex-wrap gap-2">
          <button
            onClick={onApprove}
            className="flex-1 min-w-[100px] py-2 bg-[#F0A500] hover:bg-[#FFB800] text-black text-sm font-semibold rounded-lg transition"
          >
            Approve
          </button>
          <button
            onClick={onAlwaysAllow}
            className="flex-1 min-w-[100px] py-2 border border-[#2EA043] text-[#2EA043] hover:bg-[#2EA043]/10 text-sm font-medium rounded-lg transition"
          >
            Always Allow
          </button>
          <button
            onClick={onDeny}
            className="flex-1 min-w-[100px] py-2 border border-[#F85149] text-[#F85149] hover:bg-[#F85149]/10 text-sm font-medium rounded-lg transition"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
