import { WebClient } from '@slack/web-api';
import type { SlackMessage } from './types';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getClient(): WebClient {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) throw new Error('SLACK_USER_TOKEN is not set');
  return new WebClient(token);
}

// Small delay to respect Slack rate limits (Tier 2 = 20 req/min for most endpoints)
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// User display name cache
// ---------------------------------------------------------------------------

const userNameCache = new Map<string, string>();

async function resolveUserName(client: WebClient, userId: string): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  try {
    const res = await client.users.info({ user: userId });
    const name =
      res.user?.profile?.display_name ||
      res.user?.profile?.real_name ||
      res.user?.name ||
      userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    userNameCache.set(userId, userId);
    return userId;
  }
}

// ---------------------------------------------------------------------------
// fetchUserChannels
// ---------------------------------------------------------------------------

export async function fetchUserChannels(
  slackUserId: string,
): Promise<{ id: string; name: string }[]> {
  try {
    const client = getClient();
    console.log(`[Slack] fetchUserChannels for ${slackUserId}`);

    const channels: { id: string; name: string }[] = [];
    let cursor: string | undefined;

    do {
      const res = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 200,
        cursor,
      });

      for (const ch of res.channels ?? []) {
        if (ch.is_member && ch.id && ch.name) {
          channels.push({ id: ch.id, name: ch.name });
        }
      }

      cursor = res.response_metadata?.next_cursor || undefined;
      if (cursor) await sleep(200);
    } while (cursor);

    // Filter to channels the specified user is in (the token's user is typically the same)
    console.log(`[Slack] Found ${channels.length} channels`);
    return channels;
  } catch (err) {
    console.error('[Slack] fetchUserChannels error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// fetchRecentMessages
// ---------------------------------------------------------------------------

const JIRA_TICKET_RE = /[A-Z]+-\d+/g;

export async function fetchRecentMessages(
  channelIds: string[],
  days = 7,
): Promise<SlackMessage[]> {
  const client = getClient();
  const oldest = String(Math.floor((Date.now() - days * 86_400_000) / 1000));
  const allMessages: SlackMessage[] = [];

  for (const channelId of channelIds) {
    try {
      console.log(`[Slack] fetchRecentMessages channel=${channelId}`);

      // Resolve channel name
      let channelName = channelId;
      try {
        const info = await client.conversations.info({ channel: channelId });
        channelName = info.channel?.name ?? channelId;
      } catch { /* ignore */ }

      const res = await client.conversations.history({
        channel: channelId,
        oldest,
        limit: 200,
      });

      const messages = res.messages ?? [];

      for (const msg of messages) {
        if (!msg.ts || !msg.user) continue;

        const userName = await resolveUserName(client, msg.user);
        const text = msg.text ?? '';
        const ticketMatches = text.match(JIRA_TICKET_RE);

        const parsed: SlackMessage = {
          channel: channelId,
          channelName,
          user: msg.user,
          userName,
          text,
          timestamp: msg.ts,
          threadTs: msg.thread_ts ?? null,
          isThread: false,
          mentionsTicket: ticketMatches ? ticketMatches[0] : null,
        };
        allMessages.push(parsed);

        // Fetch replies for threads with ticket mentions or active threads
        if (msg.reply_count && msg.reply_count > 0 && msg.thread_ts) {
          try {
            await sleep(100);
            const threadRes = await client.conversations.replies({
              channel: channelId,
              ts: msg.thread_ts,
              oldest,
              limit: 50,
            });

            for (const reply of threadRes.messages ?? []) {
              if (!reply.ts || !reply.user || reply.ts === msg.ts) continue;
              const replyUserName = await resolveUserName(client, reply.user);
              const replyText = reply.text ?? '';
              const replyTickets = replyText.match(JIRA_TICKET_RE);

              allMessages.push({
                channel: channelId,
                channelName,
                user: reply.user,
                userName: replyUserName,
                text: replyText,
                timestamp: reply.ts,
                threadTs: reply.thread_ts ?? null,
                isThread: true,
                mentionsTicket: replyTickets ? replyTickets[0] : null,
              });
            }
          } catch (threadErr) {
            console.error(`[Slack] Error fetching thread replies:`, threadErr instanceof Error ? threadErr.message : threadErr);
          }
        }
      }

      // Rate-limit pause between channels
      await sleep(300);
    } catch (err) {
      console.error(`[Slack] Error fetching channel ${channelId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Sort by timestamp descending
  allMessages.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
  return allMessages;
}

// ---------------------------------------------------------------------------
// sendManagerNotification
// ---------------------------------------------------------------------------

interface ManagerNotification {
  developerName: string;
  ticketKey: string;
  ticketTitle: string;
  summary: string;
  completionTime: string;
  jiraLink: string;
}

export async function sendManagerNotification(
  channelId: string,
  notification: ManagerNotification,
): Promise<boolean> {
  try {
    const client = getClient();
    const { developerName, ticketKey, ticketTitle, summary, completionTime, jiraLink } = notification;

    console.log(`[Slack] sendManagerNotification to ${channelId} for ${ticketKey}`);

    await client.chat.postMessage({
      channel: channelId,
      text: `✅ Task Completed by ${developerName}: ${ticketKey} — ${ticketTitle}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `✅ Task Completed by ${developerName}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Ticket:* <${jiraLink}|${ticketKey}> — ${ticketTitle}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*What was done:* ${summary}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Completed at ${completionTime} via DevPriority Agent`,
            },
          ],
        },
      ],
    });

    return true;
  } catch (err) {
    console.error('[Slack] sendManagerNotification error:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// healthCheck  (used by /api/health)
// ---------------------------------------------------------------------------

export async function slackHealthCheck(): Promise<'ok' | 'error'> {
  try {
    const client = getClient();
    const res = await client.auth.test();
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
