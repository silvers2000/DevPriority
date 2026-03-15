import OpenAI from 'openai';
import type { AgentStep, EnrichedTicket } from './types';

// ---------------------------------------------------------------------------
// Types for LLM-generated steps (richer than AgentStep for planning)
// ---------------------------------------------------------------------------

interface PlannerStep {
  stepNumber: number;
  description: string;
  url?: string;
  actionType: 'navigate' | 'click' | 'fill' | 'screenshot' | 'extract' | 'wait' | 'submit';
  selector?: string;
  value?: string;
  isSensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
}

const PLANNER_SYSTEM = `You are a browser automation planner for a developer productivity tool.
Given a task description, output a JSON array of concrete browser steps needed to complete it.

Each step MUST follow this schema exactly:
{
  "stepNumber": <integer, 1-based>,
  "description": "<human-readable description of what this step does>",
  "url": "<full URL if this step requires navigation, else omit>",
  "actionType": "<one of: navigate | click | fill | screenshot | extract | wait | submit>",
  "selector": "<CSS selector if clicking/filling/extracting, else omit>",
  "value": "<text to type for fill actions, milliseconds for wait, else omit>",
  "isSensitive": <true if this involves a form submit, send message, deployment, delete, merge, or login>
}

Rules:
- Use real, specific URLs (Jira base URL, GitHub, etc.) from the context provided
- Be precise with CSS selectors (prefer aria labels, data-testid, or stable class names)
- Mark isSensitive: true for ANY action that makes a permanent change or sends a message
- Include a screenshot step at the end to confirm completion
- Output ONLY valid JSON array — no markdown, no explanation, no code fences

Example output:
[
  {"stepNumber":1,"description":"Navigate to Jira ticket","url":"https://company.atlassian.net/browse/PROJ-123","actionType":"navigate","isSensitive":false},
  {"stepNumber":2,"description":"Click transition button","actionType":"click","selector":"[data-testid='transition-button']","isSensitive":true},
  {"stepNumber":3,"description":"Take confirmation screenshot","actionType":"screenshot","isSensitive":false}
]`;

function mapToAgentSteps(plannerSteps: PlannerStep[], total: number): AgentStep[] {
  return plannerSteps.map((s) => ({
    stepNumber: s.stepNumber,
    totalSteps: total,
    description: s.description,
    url: s.url ?? '',
    status: 'pending' as const,
    // Store extra planner fields in tabInfo for executor access
    tabInfo: {
      title: s.actionType,
      favicon: JSON.stringify({
        actionType: s.actionType,
        selector: s.selector,
        value: s.value,
        isSensitive: s.isSensitive ?? false,
      }),
    },
  }));
}

const FALLBACK_STEP: AgentStep = {
  stepNumber: 1,
  totalSteps: 1,
  description: 'Could not generate a plan. Please clarify the task.',
  url: '',
  status: 'error',
};

// ---------------------------------------------------------------------------
// planBrowserActions
// ---------------------------------------------------------------------------

export async function planBrowserActions(
  taskDescription: string,
  ticketContext: EnrichedTicket,
): Promise<AgentStep[]> {
  const openai = getClient();

  const jiraBaseUrl = process.env.JIRA_BASE_URL ?? 'https://your-company.atlassian.net';
  const contextBlock = `
Task: ${taskDescription}
Ticket: ${ticketContext.key} — ${ticketContext.summary}
Status: ${ticketContext.status.name} | Priority: ${ticketContext.priority.name}
Jira URL: ${jiraBaseUrl}/browse/${ticketContext.key}
Linked issues: ${ticketContext.linkedIssues.map((l) => `${l.type}: ${l.key}`).join(', ') || 'none'}
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: contextBlock },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as PlannerStep[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [FALLBACK_STEP];
    }

    return mapToAgentSteps(parsed, parsed.length);
  } catch (err) {
    console.error('[AgentPlanner] planBrowserActions error:', err instanceof Error ? err.message : err);
    return [FALLBACK_STEP];
  }
}

// ---------------------------------------------------------------------------
// replanOnError
// ---------------------------------------------------------------------------

export async function replanOnError(
  failedStep: AgentStep,
  error: string,
  remainingSteps: AgentStep[],
): Promise<AgentStep[]> {
  const openai = getClient();

  const context = `
A browser automation step failed and needs replanning.

Failed step ${failedStep.stepNumber}: "${failedStep.description}"
URL attempted: ${failedStep.url || 'none'}
Error: ${error}

Remaining steps that were planned (now potentially invalid):
${remainingSteps.map((s) => `${s.stepNumber}. ${s.description}`).join('\n')}

Please output a revised JSON array of steps to complete the remaining work, accounting for the error.
Renumber steps starting from ${failedStep.stepNumber}.
`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: context },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '';
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as PlannerStep[];

    if (!Array.isArray(parsed) || parsed.length === 0) return remainingSteps;
    return mapToAgentSteps(parsed, parsed.length);
  } catch {
    return remainingSteps; // Fall back to original remaining steps
  }
}
