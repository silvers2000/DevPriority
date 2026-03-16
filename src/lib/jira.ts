import axios, { AxiosInstance } from 'axios';
import type { JiraTicket } from './types';

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

function getAuthHeader(): string {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL or JIRA_API_TOKEN is not set');
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

function createJiraClient(): AxiosInstance {
  const baseURL = process.env.JIRA_BASE_URL;
  if (!baseURL) throw new Error('JIRA_BASE_URL is not set');
  return axios.create({
    baseURL,
    timeout: 10_000,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Recursively extract plain text from Atlassian Document Format (ADF) nodes
function adfToText(node: Record<string, unknown> | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return (node.text as string) ?? '';
  if (Array.isArray(node.content)) {
    return (node.content as Record<string, unknown>[]).map(adfToText).join('');
  }
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseIssue(issue: any): JiraTicket {
  const f = issue.fields ?? {};

  // Comments — last 10
  const rawComments: unknown[] = f.comment?.comments ?? [];
  const comments = rawComments.slice(-10).map((c: unknown) => {
    const comment = c as Record<string, unknown>;
    return {
      author: (comment.author as Record<string, unknown>)?.displayName as string ?? 'Unknown',
      body: typeof comment.body === 'string'
        ? comment.body
        : adfToText(comment.body as Record<string, unknown>),
      created: comment.created as string ?? '',
    };
  });

  // Linked issues
  const rawLinks: unknown[] = f.issuelinks ?? [];
  const linkedIssues = rawLinks.map((l: unknown) => {
    const link = l as Record<string, unknown>;
    const type = (link.type as Record<string, unknown>)?.name as string ?? 'relates to';
    const outward = link.outwardIssue as Record<string, unknown> | undefined;
    const inward  = link.inwardIssue  as Record<string, unknown> | undefined;
    const linked  = outward ?? inward;
    return {
      type,
      key: linked?.key as string ?? '',
    };
  }).filter(l => l.key);

  return {
    key: issue.key as string,
    summary: f.summary as string ?? '',
    description: typeof f.description === 'string'
      ? f.description
      : adfToText(f.description as Record<string, unknown>),
    priority: {
      name: f.priority?.name ?? 'Medium',
      id:   f.priority?.id   ?? '',
    },
    status: {
      name: f.status?.name ?? '',
      id:   f.status?.id   ?? '',
    },
    assignee: f.assignee?.displayName ?? null,
    dueDate:  f.duedate ?? null,
    storyPoints: f.customfield_10016 ?? f.story_points ?? null,
    comments,
    linkedIssues,
    slackContext: [],
  };
}

// ---------------------------------------------------------------------------
// fetchAssignedTickets
// ---------------------------------------------------------------------------

export async function fetchAssignedTickets(jiraEmail: string): Promise<JiraTicket[]> {
  const t0 = Date.now();
  try {
    const client = createJiraClient();

    // Get account ID first to use in JQL (more reliable than email or currentUser())
    let assigneeClause = `assignee = "${jiraEmail}"`;
    try {
      const { data: myself } = await client.get('/rest/api/3/myself');
      if (myself?.accountId) {
        assigneeClause = `assignee = "${myself.accountId}"`;
        console.log(`[Jira] Using accountId=${myself.accountId}`);
      }
    } catch {
      console.log('[Jira] Could not fetch accountId, falling back to email');
    }

    const jql = `${assigneeClause} AND status != Done ORDER BY priority DESC, updated DESC`;
    const fields = [
      'summary', 'description', 'priority', 'status', 'assignee',
      'duedate', 'customfield_10016', 'comment', 'issuelinks',
    ].join(',');

    const tickets: JiraTicket[] = [];
    const maxResults = 50;
    let startAt = 0;
    let total = Infinity;

    while (tickets.length < total) {
      console.log(`[Jira] fetchAssignedTickets startAt=${startAt}`);
      // POST /rest/api/3/search/jql — new Atlassian endpoint (replaces deprecated GET /rest/api/3/search)
      // Fields MUST be an array in the body; nextPageToken used for pagination but we use maxResults+startAt workaround
      const { data } = await client.post('/rest/api/3/search/jql', {
        jql,
        fields: fields.split(','),
        maxResults,
        nextPageToken: startAt > 0 ? String(startAt) : undefined,
      });

      // New API uses isLast instead of total; fall back to total for older responses
      const isLast: boolean = data.isLast ?? (data.total !== undefined ? tickets.length + (data.issues?.length ?? 0) >= data.total : true);
      total = data.total ?? (isLast ? 0 : Infinity);
      const issues: unknown[] = data.issues ?? [];
      if (issues.length === 0) break;

      tickets.push(...issues.map(parseIssue));
      startAt += issues.length;

      // Stop if last page or we have enough
      if (isLast || startAt >= maxResults) break;
    }

    console.log(`[${new Date().toISOString()}] [Jira] fetchAssignedTickets done ${Date.now() - t0}ms count=${tickets.length}`);
    return tickets;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [Jira] fetchAssignedTickets error ${Date.now() - t0}ms:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// transitionTicket
// ---------------------------------------------------------------------------

export async function transitionTicket(
  ticketKey: string,
  transitionName: string,
): Promise<boolean> {
  try {
    const client = createJiraClient();
    console.log(`[Jira] transitionTicket ${ticketKey} → ${transitionName}`);

    const { data } = await client.get(`/rest/api/3/issue/${ticketKey}/transitions`);
    const transitions: { id: string; name: string }[] = data.transitions ?? [];

    const match = transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
    );
    if (!match) {
      console.error(`[Jira] No transition named "${transitionName}" found for ${ticketKey}. Available: ${transitions.map(t => t.name).join(', ')}`);
      return false;
    }

    await client.post(`/rest/api/3/issue/${ticketKey}/transitions`, {
      transition: { id: match.id },
    });
    console.log(`[Jira] Transitioned ${ticketKey} to "${transitionName}"`);
    return true;
  } catch (err) {
    console.error(`[Jira] transitionTicket error for ${ticketKey}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

export async function addComment(
  ticketKey: string,
  commentBody: string,
): Promise<boolean> {
  try {
    const client = createJiraClient();
    console.log(`[Jira] addComment to ${ticketKey}`);

    await client.post(`/rest/api/3/issue/${ticketKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: commentBody }],
          },
        ],
      },
    });
    return true;
  } catch (err) {
    console.error(`[Jira] addComment error for ${ticketKey}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// updateTicketField — set priority, due date, or assignee directly via API
// ---------------------------------------------------------------------------

export async function updateTicketPriority(
  ticketKey: string,
  priority: string,
): Promise<boolean> {
  try {
    const client = createJiraClient();
    console.log(`[Jira] updateTicketPriority ${ticketKey} → ${priority}`);
    await client.put(`/rest/api/3/issue/${ticketKey}`, {
      fields: { priority: { name: priority } },
    });
    return true;
  } catch (err) {
    console.error(`[Jira] updateTicketPriority error:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function updateTicketDueDate(
  ticketKey: string,
  dueDate: string, // YYYY-MM-DD
): Promise<boolean> {
  try {
    const client = createJiraClient();
    console.log(`[Jira] updateTicketDueDate ${ticketKey} → ${dueDate}`);
    await client.put(`/rest/api/3/issue/${ticketKey}`, {
      fields: { duedate: dueDate },
    });
    return true;
  } catch (err) {
    console.error(`[Jira] updateTicketDueDate error:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// completeTicket
// ---------------------------------------------------------------------------

export async function completeTicket(
  ticketKey: string,
  actionSummary: string,
): Promise<{ transitioned: boolean; commented: boolean }> {
  const timestamp = new Date().toISOString();
  const comment = `✅ Task completed by DevPriority Agent\n\nSummary: ${actionSummary}\nCompleted at: ${timestamp}`;

  const [transitioned, commented] = await Promise.all([
    transitionTicket(ticketKey, 'Done'),
    addComment(ticketKey, comment),
  ]);

  return { transitioned, commented };
}

// ---------------------------------------------------------------------------
// healthCheck  (used by /api/health)
// ---------------------------------------------------------------------------

export async function jiraHealthCheck(): Promise<'ok' | 'error'> {
  try {
    const client = createJiraClient();
    await client.get('/rest/api/3/myself');
    return 'ok';
  } catch {
    return 'error';
  }
}
