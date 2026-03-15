import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevPriority',
  description: 'AI Task Prioritization + Agentic Execution',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0D1117] text-[#E6EDF3]">
        {children}
      </body>
    </html>
  );
}
