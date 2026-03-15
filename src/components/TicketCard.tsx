import PriorityBadge from './PriorityBadge';

interface TicketCardProps {
  ticket: {
    key: string;
    summary: string;
    priority: string;
    status: string;
  };
}

const priorityBorder: Record<string, string> = {
  Critical: 'border-l-[#F85149]',
  High:     'border-l-[#F0A500]',
  Medium:   'border-l-[#D29922]',
  Low:      'border-l-[#2EA043]',
};

export default function TicketCard({ ticket }: TicketCardProps) {
  const borderColor = priorityBorder[ticket.priority] ?? 'border-l-[#8B949E]';
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 my-2 rounded-lg bg-[#0D1117] border border-[#30363D] border-l-4 ${borderColor}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-mono font-medium text-[#58A6FF]">
            {ticket.key}
          </span>
          <PriorityBadge priority={ticket.priority} />
          <span className="text-xs text-[#8B949E] border border-[#30363D] rounded px-1.5 py-0.5">
            {ticket.status}
          </span>
        </div>
        <p className="text-sm text-[#E6EDF3] leading-snug">{ticket.summary}</p>
      </div>
    </div>
  );
}
