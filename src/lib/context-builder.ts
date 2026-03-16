import type { JiraTicket, SlackMessage, EnrichedTicket } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const URGENCY_KEYWORDS = [
  'urgent', 'asap', 'blocker', 'blocking', 'critical', 'down',
  'broken', 'production', 'prod', 'outage', 'hotfix', 'emergency',
];

const BASE_PRIORITY_SCORE: Record<string, number> = {
  Highest:  80,
  Critical: 80,
  High:     60,
  Medium:   40,
  Low:      20,
  Lowest:   10,
};

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function daysDiff(dateStr: string | null, fromNow = true): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return null;
  const diff = (d - Date.now()) / MS_PER_DAY;
  return fromNow ? diff : -diff; // negative = in the past
}

function containsUrgencyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

function summarizeSlackContext(messages: SlackMessage[]): string {
  if (messages.length === 0) return '';

  const channelCounts: Record<string, number> = {};
  let urgentCount = 0;

  for (const m of messages) {
    channelCounts[m.channelName] = (channelCounts[m.channelName] ?? 0) + 1;
    if (containsUrgencyKeyword(m.text)) urgentCount++;
  }

  const channelSummary = Object.entries(channelCounts)
    .map(([ch, n]) => `${n}x in #${ch}`)
    .join(', ');

  const urgentNote = urgentCount > 0
    ? ` (${urgentCount} message${urgentCount > 1 ? 's' : ''} with urgent language)`
    : '';

  return `Mentioned ${messages.length} time${messages.length > 1 ? 's' : ''}: ${channelSummary}${urgentNote}.`;
}

// ---------------------------------------------------------------------------
// buildContext
// ---------------------------------------------------------------------------

export function buildContext(
  tickets: JiraTicket[],
  slackMessages: SlackMessage[],
): EnrichedTicket[] {
  const now = Date.now();

  return tickets
    .map((ticket): EnrichedTicket => {
      // 1. Attach matching Slack messages
      const relatedSlack = slackMessages.filter(
        (m) => m.text.includes(ticket.key) || m.mentionsTicket === ticket.key,
      );

      const reasons: string[] = [];

      // 2. Base priority score
      const priorityName = ticket.priority.name;
      const base = BASE_PRIORITY_SCORE[priorityName] ?? 40;
      reasons.push(`${priorityName} base priority`);
      let score = base;

      // 3. Slack recency boost
      const recentMessages24h = relatedSlack.filter(
        (m) => now - parseFloat(m.timestamp) * 1000 < MS_PER_DAY,
      );
      const recentMessages3d = relatedSlack.filter(
        (m) => now - parseFloat(m.timestamp) * 1000 < 3 * MS_PER_DAY,
      );

      if (recentMessages24h.length > 0) {
        score += 15;
        reasons.push('mentioned in Slack in last 24h');
      } else if (recentMessages3d.length > 0) {
        score += 10;
        reasons.push('mentioned in Slack in last 3 days');
      }

      // 4. Slack volume boost (cap +20)
      const volumeBoost = Math.min(relatedSlack.length * 5, 20);
      if (volumeBoost > 0) {
        score += volumeBoost;
        reasons.push(`mentioned ${relatedSlack.length} time${relatedSlack.length > 1 ? 's' : ''} in Slack`);
      }

      // 5. Urgency keyword boost (cap +20)
      const urgentMessages = relatedSlack.filter((m) => containsUrgencyKeyword(m.text));
      const keywordBoost = Math.min(urgentMessages.length * 10, 20);
      if (keywordBoost > 0) {
        score += keywordBoost;
        const uniqueChannels = urgentMessages
          .map((m) => `#${m.channelName}`)
          .filter((ch, i, arr) => arr.indexOf(ch) === i);
        const channels = uniqueChannels.join(', ');
        reasons.push(`urgent language in ${channels}`);
      }

      // 6. Due date proximity
      const daysUntilDue = daysDiff(ticket.dueDate);
      if (daysUntilDue !== null) {
        if (daysUntilDue <= 0) {
          score += 15;
          reasons.push('due today');
        } else if (daysUntilDue <= 1) {
          score += 10;
          reasons.push('due tomorrow');
        } else if (daysUntilDue <= 7) {
          score += 5;
          reasons.push('due this week');
        }
      }

      // 7. Ticket age penalty (stale with no Slack activity)
      const lastComment = ticket.comments.at(-1);
      const lastActivity = lastComment
        ? new Date(lastComment.created).getTime()
        : null;
      const daysOld = lastActivity
        ? (now - lastActivity) / MS_PER_DAY
        : null;
      if (daysOld !== null && daysOld > 7 && relatedSlack.length === 0) {
        score += 5;
        reasons.push(`stale (${Math.floor(daysOld)}d since last activity)`);
      }

      // 8. Blocked penalty
      const isBlocked = ticket.linkedIssues.some(
        (l) => l.type.toLowerCase().includes('blocked'),
      );
      if (isBlocked) {
        score -= 20;
        reasons.push('blocked by another issue');
      }

      // Clamp 0-100
      score = Math.max(0, Math.min(100, score));

      return {
        ...ticket,
        slackContext: relatedSlack,
        urgencyScore: score,
        slackMentions: relatedSlack.length,
        priorityReason: reasons.join(' + '),
      };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

// ---------------------------------------------------------------------------
// serializeForLLM
// ---------------------------------------------------------------------------

const CHAR_LIMIT = 16_000; // ~4000 tokens @ ~4 chars/token

export function serializeForLLM(
  enrichedTickets: EnrichedTicket[],
  userQuestion: string,
  rawSlackMessages: SlackMessage[] = [],
): string {
  const lines: string[] = ['=== JIRA + SLACK CONTEXT ===', ''];

  if (enrichedTickets.length === 0) {
    lines.push('NO JIRA TICKETS FOUND assigned to this user. DO NOT invent or fabricate any tickets.');
    if (rawSlackMessages.length > 0) {
      lines.push('');
      lines.push('=== RECENT SLACK MESSAGES ===');
      for (const m of rawSlackMessages.slice(0, 20)) {
        lines.push(`[${m.channel}] ${m.username}: ${m.text}`);
      }
    }
    lines.push('');
    lines.push('=== USER QUESTION ===', userQuestion);
    return lines.join('\n');
  }

  let totalChars = 0;

  for (const t of enrichedTickets) {
    const slackSummary = summarizeSlackContext(t.slackContext);
    const linked = t.linkedIssues.length > 0
      ? t.linkedIssues.map((l) => `${l.type}: ${l.key}`).join(', ')
      : 'none';

    const block = [
      `Ticket: ${t.key}`,
      `Summary: ${t.summary}`,
      `Status: ${t.status.name} | Priority: ${t.priority.name} | Urgency Score: ${t.urgencyScore}/100`,
      `Why urgent: ${t.priorityReason}`,
      t.dueDate ? `Due: ${t.dueDate}` : null,
      `Linked issues: ${linked}`,
      slackSummary ? `Slack: ${slackSummary}` : null,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    if (totalChars + block.length > CHAR_LIMIT) break;
    lines.push(block);
    totalChars += block.length;
  }

  lines.push('=== USER QUESTION ===', userQuestion);
  return lines.join('\n');
}
