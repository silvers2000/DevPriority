import OpenAI from 'openai';
import { completeTicket, addComment } from './jira';
import { sendManagerNotification } from './slack';
import { createAdminClient } from './supabase-server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionLogEntry {
  stepNumber: number;
  actionType: string;
  description: string;
  url: string;
  result?: string;
  error?: string;
  timestamp: string;
}

export interface PostExecutionResult {
  jiraUpdated: boolean;
  slackNotified: boolean;
  summary: string;
  ticketTitle?: string;
}

// ---------------------------------------------------------------------------
// Step 1 — Summarise action log with OpenAI
// ---------------------------------------------------------------------------

async function generateSummary(ticketKey: string, actionLog: ActionLogEntry[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return `Completed ${ticketKey} via browser automation.`;

  try {
    const openai = new OpenAI({ apiKey });
    const logText = actionLog
      .map((e) => `Step ${e.stepNumber} [${e.actionType}]: ${e.description}${e.result ? ` → ${e.result.slice(0, 100)}` : ''}${e.error ? ` ⚠ ${e.error}` : ''}`)
      .join('\n');

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'Summarize the following browser agent action log in 2–3 concise sentences suitable for a Jira comment and Slack notification. Include what was done, key actions taken, and the outcome. Be specific.',
        },
        { role: 'user', content: `Ticket: ${ticketKey}\n\nAction log:\n${logText}` },
      ],
    });
    return res.choices[0]?.message?.content ?? `Completed ${ticketKey} via browser automation.`;
  } catch {
    return `Completed ${ticketKey} via browser automation. ${actionLog.length} step(s) executed.`;
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Persist action log to Supabase
// ---------------------------------------------------------------------------

async function persistActionLog(
  userId: string,
  sessionId: string,
  ticketKey: string,
  actionLog: ActionLogEntry[],
): Promise<string | null> {
  try {
    const admin = createAdminClient();

    // Look up or create the task row
    const { data: existing } = await admin
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('jira_key', ticketKey)
      .maybeSingle();

    let taskId: string | null = existing?.id ?? null;

    if (!taskId) {
      const { data: inserted } = await admin
        .from('tasks')
        .insert({ user_id: userId, jira_key: ticketKey, status: 'Done', updated_at: new Date().toISOString() })
        .select('id')
        .single();
      taskId = inserted?.id ?? null;
    } else {
      await admin
        .from('tasks')
        .update({ status: 'Done', updated_at: new Date().toISOString() })
        .eq('id', taskId);
    }

    // Insert action log entries
    const rows = actionLog.map((e) => ({
      user_id: userId,
      task_id: taskId,
      session_id: sessionId,
      step_number: e.stepNumber,
      action_type: e.actionType,
      url: e.url || null,
      description: e.description,
      result: e.result ?? null,
      screenshot_url: null,
      created_at: e.timestamp,
    }));

    await admin.from('action_logs').insert(rows);
    return taskId;
  } catch (err) {
    console.error('[PostExecution] persistActionLog error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function handleTaskCompletion(
  userId: string,
  sessionId: string,
  ticketKey: string,
  actionLog: ActionLogEntry[],
): Promise<PostExecutionResult> {
  const admin = createAdminClient();

  // Step 1 — summary
  const summary = await generateSummary(ticketKey, actionLog);

  // Fetch user profile for Slack notification
  const { data: profile } = await admin
    .from('users')
    .select('display_name, manager_slack_channel, jira_email')
    .eq('id', userId)
    .maybeSingle();

  const developerName = profile?.display_name ?? 'Developer';
  const jiraBaseUrl = process.env.JIRA_BASE_URL ?? '';
  const jiraLink = jiraBaseUrl ? `${jiraBaseUrl}/browse/${ticketKey}` : '';

  // Step 2 — Jira: transition + comment
  let jiraUpdated = false;
  if (profile?.jira_email || jiraBaseUrl) {
    const completionComment = [
      `✅ Task completed by DevPriority Agent`,
      ``,
      `Summary: ${summary}`,
      ``,
      `Action log (${actionLog.length} step${actionLog.length !== 1 ? 's' : ''}):`,
      ...actionLog.map((e) => `  ${e.stepNumber}. [${e.actionType}] ${e.description}${e.error ? ` ⚠ ${e.error}` : ''}`),
      ``,
      `Completed at: ${new Date().toISOString()}`,
    ].join('\n');

    try {
      const { transitioned, commented } = await completeTicket(ticketKey, summary);
      jiraUpdated = transitioned || commented;

      // If transition failed but commenting succeeded, add a fallback comment
      if (!transitioned && !commented) {
        jiraUpdated = await addComment(ticketKey, completionComment);
      }
    } catch {
      jiraUpdated = false;
    }

    // Small delay before Slack call
    await new Promise((r) => setTimeout(r, 500));
  }

  // Step 3 — Slack manager notification
  let slackNotified = false;
  if (profile?.manager_slack_channel) {
    try {
      slackNotified = await sendManagerNotification(profile.manager_slack_channel, {
        developerName,
        ticketKey,
        ticketTitle: `Task ${ticketKey}`,
        summary,
        completionTime: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        jiraLink,
      });
    } catch {
      slackNotified = false;
    }
  }

  // Step 4 — persist action log + step 5 — update task
  const taskId = await persistActionLog(userId, sessionId, ticketKey, actionLog);

  // Log to notifications
  if (taskId) {
    const notifRows = [
    ...(jiraUpdated ? [{
      user_id: userId,
      task_id: taskId,
      type: 'jira',
      payload: { ticketKey, summary },
      status: 'sent',
      sent_at: new Date().toISOString(),
    }] : []),
    ...(slackNotified ? [{
      user_id: userId,
      task_id: taskId,
      type: 'slack',
      payload: { ticketKey, channel: profile?.manager_slack_channel },
      status: 'sent',
      sent_at: new Date().toISOString(),
    }] : []),
  ];
  if (notifRows.length > 0) {
    try { await admin.from('notifications').insert(notifRows); } catch { /* best-effort */ }
  }
  }

  console.log(`[PostExecution] ${ticketKey} — jira:${jiraUpdated} slack:${slackNotified}`);
  return { jiraUpdated, slackNotified, summary };
}
