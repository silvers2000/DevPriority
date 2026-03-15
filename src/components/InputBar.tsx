'use client';

import { useRef, useState, useCallback, forwardRef, useImperativeHandle, KeyboardEvent } from 'react';
import { ArrowUp, Loader2, StopCircle } from 'lucide-react';

interface InputBarProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  isAgentRunning?: boolean;
  onCancelAgent?: () => void;
}

export interface InputBarHandle {
  focus: () => void;
}

const MAX_CHARS = 2000;

const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar({
  onSend,
  isLoading,
  isAgentRunning = false,
  onCancelAgent,
}, ref) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 4 + 24;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length > MAX_CHARS) return;
    setValue(e.target.value);
    resizeTextarea();
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || isAgentRunning) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charsLeft = MAX_CHARS - value.length;
  const nearLimit = charsLeft < 200;

  // Agent running state — replace input with cancel UI
  if (isAgentRunning) {
    return (
      <div className="shrink-0 bg-[#161B22] border-t border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="flex-1 flex items-center gap-3 bg-[#21262D] border border-[#30363D] rounded-xl px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-[#58A6FF] animate-pulse shrink-0" />
            <p className="text-sm text-[#8B949E]">
              Browser agent is running… Chat is paused
            </p>
          </div>
          {onCancelAgent && (
            <button
              onClick={onCancelAgent}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#F85149]/40 text-[#F85149] hover:bg-[#F85149]/10 text-sm font-medium transition"
            >
              <StopCircle size={15} />
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-[#484F58] text-center mt-2">
          The agent will stop after the current step completes
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 bg-[#161B22] border-t border-[#30363D] px-4 py-3">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        <div className="flex-1 relative bg-[#21262D] border border-[#30363D] rounded-xl focus-within:border-[#F0A500]/60 focus-within:ring-1 focus-within:ring-[#F0A500]/20 transition">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask DevPriority anything… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="w-full resize-none bg-transparent text-[#E6EDF3] placeholder-[#484F58] text-sm px-4 py-3 pr-20 rounded-xl focus:outline-none disabled:opacity-50 leading-6"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          {value.length > 0 && (
            <span
              className={`absolute right-3 bottom-3 text-xs tabular-nums transition ${
                nearLimit ? 'text-[#F0A500]' : 'text-[#484F58]'
              }`}
            >
              {charsLeft}
            </span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-[#F0A500] hover:bg-[#FFB800] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <Loader2 size={16} className="text-black animate-spin" />
          ) : (
            <ArrowUp size={16} className="text-black" strokeWidth={2.5} />
          )}
        </button>
      </div>

      <p className="text-xs text-[#484F58] text-center mt-2">
        Say &ldquo;take control&rdquo; to let DevPriority act on your behalf
      </p>
    </div>
  );
});

export default InputBar;
