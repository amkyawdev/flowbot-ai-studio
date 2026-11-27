import type { WorkflowGraph } from '@flowbot/shared';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  /** Built PWA served from the same Worker (web/dist). */
  ASSETS: Fetcher;
  EXECUTION_QUEUE: Queue<QueueMessage>;
  CREDENTIAL_MASTER_KEY: string;
  AUTH_SESSION_SECRET: string;
  APP_BASE_URL?: string;
  CORS_ORIGINS?: string;
  ZILLIZ_ENDPOINT?: string;
  /** Canonical Zilliz credential (Worker secret). Never exposed to the client. */
  ZILLIZ_API_KEY?: string;
  ZILLIZ_COLLECTION?: string;
  TELEGRAM_API_URL?: string;
}

export interface QueueMessage {
  kind: 'execute-workflow';
  workspaceId: string;
  executionId: string;
  workflowId: string;
  input?: Record<string, unknown>;
  triggerType?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
}

export interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  graph_json: string;
  version: number;
  status: string;
  webhook_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotRow {
  id: string;
  workspace_id: string;
  name: string;
  username: string;
  token_enc: string;
  webhook_secret_enc: string;
  webhook_path: string | null;
  webhook_status: string;
  ai_provider: string;
  prompt_config_json: string;
  commands_json: string;
  menu_json: string;
  keyboard_json: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionRow {
  id: string;
  workspace_id: string;
  workflow_id: string | null;
  status: string;
  trigger_type: string;
  input_json: string;
  error_message: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface CredentialRow {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  data_enc: string;
  meta_json: string;
  created_at: string;
  updated_at: string;
}

export interface PublicWorkflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  graph: WorkflowGraph;
  version: number;
  status: string;
  webhookPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeExecutionContext {
  env: Env;
  workspaceId: string;
  executionId: string;
  triggerType: string;
  input: Record<string, unknown>;
  outputs: Record<string, Record<string, unknown>>;
  vault: {
    get(credentialId: string): Promise<Record<string, string>>;
    botToken(botId: string): Promise<string>;
  };
  /** Resolve the credential used by an agent row (provider-specific). */
  vaultForAgent(agent: Record<string, unknown>): Promise<Record<string, string>>;
  /** Read a produced output from another node output map (current execution). */
  output(handleId: string): unknown;
  log(level: 'info' | 'warn' | 'error', nodeId: string | null, nodeType: string | null, message: string, data?: unknown): Promise<void>;
}

export interface NodeExecutorResult {
  outputs: Record<string, unknown>;
  skip?: boolean;
}

export interface NodeExecutor {
  execute(ctx: NodeExecutionContext, node: import('@flowbot/shared').FlowNode, opts?: { errorHolder?: unknown }): Promise<NodeExecutorResult>;
}