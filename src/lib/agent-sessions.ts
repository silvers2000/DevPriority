/**
 * In-process session store for active browser agent sessions.
 * Fine for single-server MVP; replace with Redis for multi-instance.
 */
import type { AgentStep } from './types';
import { BrowserAgent } from './browser-agent';

export interface PostExecutionStatus {
  jiraUpdated: boolean;
  slackNotified: boolean;
  summary: string;
}

export interface AgentSession {
  sessionId: string;
  userId: string;
  ticketKey: string;
  steps: AgentStep[];
  currentStep: number;
  isComplete: boolean;
  isWaitingApproval: boolean;
  awaitingStep: AgentStep | null;
  agent: BrowserAgent;
  /** Called by the approve route to resolve the pending permission prompt */
  resolveApproval?: (approved: boolean) => void;
  started: boolean;
  postExecution?: PostExecutionStatus;
}

// Global map — survives across requests in the same Node.js process
declare global {
  // eslint-disable-next-line no-var
  var __agentSessions: Map<string, AgentSession> | undefined;
}

if (!global.__agentSessions) {
  global.__agentSessions = new Map<string, AgentSession>();
}

export const agentSessions: Map<string, AgentSession> = global.__agentSessions;
