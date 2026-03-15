'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import type { ChatMessage } from '@/lib/types';
import type { Components } from 'react-markdown';

interface MessageBubbleProps {
  message: ChatMessage;
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="my-2 rounded-lg bg-[#161B22] border border-[#30363D] p-4 overflow-x-auto">
          <code
            className={`font-mono text-xs text-[#E6EDF3] ${className ?? ''}`}
            {...props}
          >
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code
        className="font-mono text-xs bg-[#161B22] border border-[#30363D] rounded px-1.5 py-0.5 text-[#F0A500]"
        {...props}
      >
        {children}
      </code>
    );
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-sm">{children}</li>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-[#E6EDF3]">{children}</strong>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#58A6FF] hover:underline"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-[#F0A500]/60 pl-3 text-[#8B949E] italic my-2">
        {children}
      </blockquote>
    );
  },
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 message-enter">
        <div className="max-w-[75%]">
          <div className="bg-[#F0A500] text-black text-sm px-4 py-2.5 rounded-2xl rounded-br-sm font-medium leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
          <p className="text-xs text-[#484F58] text-right mt-1">
            {format(new Date(message.timestamp), 'h:mm a')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4 message-enter">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-[#F0A500]/20 border border-[#F0A500]/40 flex items-center justify-center text-[#F0A500] text-xs font-bold shrink-0 mt-0.5 mr-2.5">
        D
      </div>
      <div className="max-w-[85%]">
        <div className="bg-[#21262D] border border-[#30363D] text-[#E6EDF3] text-sm px-4 py-3 rounded-2xl rounded-tl-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <p className="text-xs text-[#484F58] mt-1">
          {format(new Date(message.timestamp), 'h:mm a')}
        </p>
      </div>
    </div>
  );
}
