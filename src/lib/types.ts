export interface SlackMessage {
  channel: string;
  channelName: string;
  user: string;
  userName: string;
  text: string;
  timestamp: string;
  threadTs: string | null;
  isThread: boolean;
  mentionsTicket: string | null;
}

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  priority: {
    name: string;
    id: string;
  };
  status: {
    name: string;
    id: string;
  };
  assignee: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  comments: {
    author: string;
    body: string;
    created: string;
  }[];
  linkedIssues: {
    type: string;
    key: string;
  }[];
  slackContext: SlackMessage[];
}

export interface EnrichedTicket extends JiraTicket {
  urgencyScore: number;
  slackMentions: number;
  priorityReason: string;
}

export interface AgentStep {
  stepNumber: number;
  totalSteps: number;
  description: string;
  url: string;
  status: 'pending' | 'in-progress' | 'done' | 'awaiting-approval' | 'error';
  screenshot?: string;
  tabInfo?: {
    title: string;
    favicon?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentProgress?: AgentStep[];
}

export interface AgentPermission {
  actionType: string;
  permission: 'once' | 'always' | 'never';
}

export interface UserProfile {
  id: string;
  email: string;
  jiraEmail: string;
  slackUserId: string;
  managerSlackChannel: string;
}
