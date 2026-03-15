# DevPriority

AI-powered developer productivity tool that integrates Jira, Slack, and a browser automation agent to help developers prioritize work and execute tasks autonomously.

<!-- Screenshot placeholder -->
<!-- ![DevPriority Chat Interface](docs/screenshot.png) -->

## Features

- **AI Chat** — Ask what to work on and get prioritized Jira tickets enriched with Slack context
- **Daily Digest** — One-click AI summary of your most urgent tickets and Slack activity
- **Browser Agent** — Say "take control of PROJ-123" and watch the agent handle it in a real browser
- **Permission Gate** — Approve or deny sensitive agent actions in real time
- **Post-Execution Updates** — Automatic Jira ticket closure and Slack manager notification after task completion
- **Settings** — Manage integrations; view active sessions; manage agent permissions
- **Live Health** — Sidebar shows real-time connection status for all integrations
- **Keyboard Shortcuts** — `Cmd/Ctrl+K` to focus chat, `Cmd/Ctrl+D` for daily digest, `Esc` to cancel agent

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth + DB | Supabase (PostgreSQL + RLS + Realtime) |
| AI | OpenAI GPT-4o / GPT-4o-mini |
| Browser Automation | Playwright (headless Chromium) |
| Jira | Atlassian REST API v3 |
| Slack | Slack Web API (`@slack/web-api`) |
| Styling | Tailwind CSS (dark theme) |
| Language | TypeScript |

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key (GPT-4o access)
- A Jira Cloud account with an API token
- A Slack workspace with a User OAuth token

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/devpriority.git
cd devpriority
npm install        # also runs playwright install chromium
```

### 2. Environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.local
```

See the [Environment Variables](#environment-variables) section below for details.

### 3. Supabase setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In the SQL editor, run each migration file in order:
   ```
   supabase/migrations/001_create_users.sql
   supabase/migrations/002_create_sessions.sql
   supabase/migrations/003_create_tasks.sql
   supabase/migrations/004_create_action_logs.sql
   supabase/migrations/005_create_digests.sql
   supabase/migrations/006_create_notifications.sql
   supabase/migrations/006b_create_permissions.sql
   supabase/migrations/007_enable_rls.sql
   ```
3. Enable Realtime for the `notifications` and `sessions` tables in **Database → Replication**
4. Copy your project URL and keys to `.env.local`

### 4. Slack app setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add these **User Token Scopes**:
   - `channels:history`, `channels:read`
   - `groups:history`, `groups:read`
   - `users:read`
   - `chat:write`
3. Install the app to your workspace and copy the **User OAuth Token** (`xoxp-...`)
4. Set `SLACK_USER_TOKEN` in `.env.local`
5. Find your Slack Member ID: click your profile → ⋯ More → **Copy member ID**

### 5. Jira setup

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create a new API token
3. Set `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `JIRA_BASE_URL` (e.g. `https://yourcompany.atlassian.net`) in `.env.local`

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, then go to **Settings** to connect your integrations.

## Project Structure

```
devpriority/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/          # execute, status, approve routes
│   │   │   ├── chat/           # streaming chat route
│   │   │   ├── digest/         # daily digest route
│   │   │   ├── health/         # integration health check
│   │   │   ├── settings/       # profile, sessions, permissions
│   │   │   ├── jira/           # jira proxy routes
│   │   │   └── slack/          # slack proxy routes
│   │   ├── login/              # auth page
│   │   ├── settings/           # settings page
│   │   └── page.tsx            # main chat page
│   ├── components/
│   │   ├── AgentProgressCard   # live browser agent progress
│   │   ├── ChatWindow          # message list renderer
│   │   ├── CompletionCard      # post-execution summary card
│   │   ├── ErrorBoundary       # React error boundary
│   │   ├── InputBar            # chat input (forwardRef)
│   │   ├── MessageBubble       # single chat message
│   │   ├── PermissionGate      # approve/deny agent actions
│   │   ├── SessionManager      # active session list (realtime)
│   │   ├── Sidebar             # navigation + live integration status
│   │   └── StreamingDots       # typing indicator
│   └── lib/
│       ├── agent-planner.ts    # LLM step planner
│       ├── agent-sessions.ts   # in-process session store
│       ├── browser-agent.ts    # Playwright automation engine
│       ├── context-builder.ts  # urgency scoring + context
│       ├── jira.ts             # Jira API client
│       ├── openai.ts           # OpenAI streaming wrapper
│       ├── permission-manager.ts
│       ├── post-execution.ts   # Jira close + Slack notify
│       ├── prompts.ts          # system prompt templates
│       ├── rate-limiter.ts     # in-memory rate limiting
│       ├── slack.ts            # Slack API client
│       ├── supabase.ts         # browser Supabase client
│       ├── supabase-server.ts  # server Supabase client
│       └── types.ts            # shared TypeScript types
└── supabase/migrations/        # SQL schema files
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server only) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key with GPT-4o access |
| `JIRA_BASE_URL` | ⚠️ | Jira Cloud base URL (e.g. `https://yourcompany.atlassian.net`) |
| `JIRA_EMAIL` | ⚠️ | Email associated with the Jira API token |
| `JIRA_API_TOKEN` | ⚠️ | Jira API token |
| `SLACK_USER_TOKEN` | ⚠️ | Slack User OAuth token (`xoxp-...`) |
| `NEXT_PUBLIC_JIRA_BASE_URL` | Optional | Jira base URL for client-side ticket links |
| `NEXT_PUBLIC_APP_NAME` | Optional | App display name (default: DevPriority) |

✅ = required for the app to run · ⚠️ = required for that integration to work

## Security Notes

- **Secrets never reach the client.** `JIRA_API_TOKEN`, `SLACK_USER_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` are server-only variables, never prefixed with `NEXT_PUBLIC_`.
- **All API routes are auth-protected.** Every `/api/*` route validates the Supabase session before processing.
- **Row-Level Security.** All seven Supabase tables enforce RLS policies so users can only access their own data.
- **Rate limiting.** `/api/chat` and `/api/agent/execute` are limited to 10 requests per user per minute.
- **Input sanitization.** User messages are trimmed, null-byte-stripped, and capped at 2000 characters. `ticketKey` is validated against a strict regex before use.
- **Content-Security-Policy** headers are set on all responses, restricting scripts, styles, and connections.

## License

MIT
