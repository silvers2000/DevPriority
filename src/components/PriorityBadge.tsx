type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

const styles: Record<Priority, string> = {
  Critical: 'bg-[#F85149]/15 text-[#F85149] border-[#F85149]/30',
  High:     'bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30',
  Medium:   'bg-[#D29922]/15 text-[#D29922] border-[#D29922]/30',
  Low:      'bg-[#2EA043]/15 text-[#2EA043] border-[#2EA043]/30',
};

export default function PriorityBadge({ priority }: { priority: string }) {
  const key = priority as Priority;
  const cls = styles[key] ?? 'bg-[#8B949E]/15 text-[#8B949E] border-[#8B949E]/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {priority}
    </span>
  );
}
