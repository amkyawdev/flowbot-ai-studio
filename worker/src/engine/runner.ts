import type { Env, ExecutionRow, NodeExecutionContext, WorkflowRow, NodeExecutorResult } from '../types';
import type { WorkflowGraph } from '@flowbot/shared';
import { topoSort, getNodeDefinition, findTrigger } from '@flowbot/shared';
import { makeCredentialResolver, type CredentialResolver } from './vault';
import { getExecutor, getPath } from './executors';

const SECRET_KEY_RE = /(token|key|secret|password|authorization|bearer|credential)/i;

/** Recursively redact likely-secret fields before writing execution logs. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redactForLog(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

/** Enqueue a background workflow execution via Cloudflare Queues. */
export async function enqueueExecution(
  env: Env,
  msg: { workspaceId: string; executionId: string; workflowId: string; input?: Record<string, unknown>; triggerType?: string },
): Promise<void> {
  await env.EXECUTION_QUEUE.send({ kind: 'execute-workflow', ...msg });
}

/**
 * Execute a workflow within the Worker runtime (sync, or via queue consumer).
 * Validates the graph, orders nodes topologically, executes each with typed
 * inputs resolved from upstream outputs, applies bounded retries and timeouts,
 * routes errors to the error handler node when present, and records the run.
 */
export async function runWorkflowInWorker(
  env: Env,
  args: { workspaceId: string; workflowId: string; executionId: string; input?: Record<string, unknown>; triggerType?: string },
): Promise<void> {
  const { workspaceId, workflowId, executionId, triggerType = 'manual' } = args;
  const input: Record<string, unknown> = args.input ?? {};

  const wf = await env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND workspace_id = ?')
    .bind(workflowId, workspaceId).first<WorkflowRow>();
  if (!wf) throw new Error('Workflow not found');

  const graph = JSON.parse(wf.graph_json) as WorkflowGraph;
  const resolver = makeCredentialResolver(env, workspaceId);
  let seq = 0;

  const log = async (level: 'info' | 'warn' | 'error', nodeId: string | null, nodeType: string | null, message: string, data?: unknown) => {
    seq += 1;
    await env.DB.prepare(
      'INSERT INTO execution_logs (id, execution_id, seq, node_id, node_type, level, message, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ).bind(`el_${crypto.randomUUID()}`, executionId, seq, nodeId, nodeType, level, message, data ? JSON.stringify(redactForLog(data)) : '{}').run();
  };

  const finish = async (status: string, error?: string, startedAt = Date.now()) => {
    await env.DB.prepare(
      'UPDATE executions SET status = ?, error_message = ?, finished_at = ?, duration_ms = ? WHERE id = ?',
    ).bind(status, error ?? '', new Date().toISOString(), Date.now() - startedAt, executionId).run();
  };

  const startedAt = Date.now();
  const order = topoSort(graph);
  if (!order) {
    await log('error', null, null, 'Workflow contains a cycle and cannot run.');
    await finish('error', 'Graph cycle detected', startedAt);
    return;
  }

  const trigger = findTrigger(graph);
  const outputsByNode: Record<string, Record<string, unknown>> = {};

  /** Context passed to executors. */
  const ctx: NodeExecutionContext = {
    env,
    workspaceId,
    executionId,
    triggerType,
    input,
    outputs: outputsByNode,
    vault: resolver,
    async vaultForAgent(agent) {
      const provider = String(agent.provider || 'openai');
      const credId = agent.credential_id as string | undefined;
      if (credId) return resolver.get(credId);
      // Fall back to a provider credential in the vault.
      const row = await env.DB.prepare(
        'SELECT id FROM credentials WHERE workspace_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1',
      ).bind(workspaceId, provider).first<{ id: string }>();
      if (row) return resolver.get(row.id);
      return {};
    },
    output(handleId: string) {
      // Resolve from the most recent single source in topo order.
      return getPath(input, handleId);
    },
    async log(level, nodeId, nodeType, message, data) {
      await log(level, nodeId, nodeType, message, data);
    },
  };

  await log('info', null, null, `Workflow "${wf.name}" started (trigger: ${triggerType})`);

  let hadError = false;
  let errorHolder: unknown = null;
  const errorHandlerNode = graph.nodes.find((n) => n.type === 'errorHandler');

  for (const nodeId of order) {
    const node = graph.nodes.find((n) => n.id === nodeId)!;
    const def = getNodeDefinition(node.type);
    if (!def) {
      await log('error', node.id, node.type, `Unknown node type: ${node.type}`);
      hadError = true;
      continue;
    }

    // Resolve inputs from upstream outputs.
    const inputs: Record<string, unknown> = {};
    let hasInputs = true;
    const incoming = graph.edges.filter((e) => e.target === node.id);
    // For error handler, feed errorHolder.
    if (node.type === 'errorHandler' && errorHolder !== null) {
      inputs.error = errorHolder;
    } else if (node.type === 'errorHandler') {
      // No error to handle; skip.
      await log('info', node.id, node.type, 'No error to handle, skipping');
      continue;
    } else if (incoming.length === 0) {
      // Only the trigger may run with no inputs.
      if (node.id !== trigger?.id) {
        await log('info', node.id, node.type, 'Skipped (no upstream trigger)');
        continue;
      }
    } else {
      // Resolve each incoming edge: take the source node's output value.
      for (const edge of incoming) {
        const srcOut = outputsByNode[edge.source];
        if (!srcOut || !edge.sourceHandle) continue;
        const value = srcOut[edge.sourceHandle];
        // Map to the target input port (if named) else a generic "value" slot.
        const targetKey = edge.targetHandle || 'value';
        if (value !== undefined) inputs[targetKey] = value;
      }
      // A node may legitimately run with config-only inputs (edge exists but
      // upstream produced no typed value). Only skip if it has inputs AND
      // received none and has no configured data of its own.
      const hasConfig = Object.keys(node.data ?? {}).length > 0;
      hasInputs = Object.keys(inputs).length > 0 || hasConfig;
      if (!hasInputs) {
        await log('info', node.id, node.type, 'Skipped (upstream produced no output on this branch)');
        continue;
      }
    }

    await log('info', node.id, node.type, `Running ${def.name}`);

    const executor = getExecutor(node.type);
    if (!executor) {
      await log('error', node.id, node.type, `No executor for node type: ${node.type}`);
      hadError = true;
      continue;
    }

    const attempt = async (): Promise<NodeExecutorResult> => {
      // Provide executor with a richer output() that reads from upstream outputs.
      const execCtx: NodeExecutionContext = {
        ...ctx,
        output(handleId: string) {
          const resolved = inputs[handleId];
          if (resolved !== undefined) return resolved;
          const anyInput = Object.values(inputs)[0];
          return anyInput;
        },
      };
      return executor.execute(execCtx, node, { errorHolder });
    };

    const timeoutMs = def.timeoutMs ?? 60_000;
    try {
      const result = await runNode(timeoutMs, def.name, def.retryable ?? false, attempt, (err, attemptNum) =>
        log('warn', node.id, node.type, `Retry ${attemptNum}/2 after error: ${err}`),
      );
      outputsByNode[node.id] = result.outputs ?? {};
      await log('info', node.id, node.type, `${def.name} completed`, { outputs: result.outputs });
    } catch (e) {
      const err = e as Error;
      await log('error', node.id, node.type, `${def.name} failed: ${err.message}`);
      if (errorHandlerNode) {
        errorHolder = { nodeId: node.id, nodeType: node.type, message: err.message, node: node.data };
        await log('info', errorHandlerNode.id, errorHandlerNode.type, 'Routing error to error handler');
        // Reprocess error handler node at the end (after loop via flag).
        hadError = false;
      } else {
        hadError = true;
        break;
      }
    }
  }

  // Run the error handler once it has been fed (handled inline above if it comes after).
  if (errorHolder !== null && errorHandlerNode) {
    const executor = getExecutor('errorHandler');
    if (executor) {
      try {
        await log('info', errorHandlerNode.id, errorHandlerNode.type, 'Handling workflow error');
        const execCtx: NodeExecutionContext = {
          ...ctx,
          output: () => errorHolder,
        };
        const result = await withTimeout(30_000, () => executor.execute(execCtx, errorHandlerNode, { errorHolder }), 'Error Handler');
        outputsByNode[errorHandlerNode.id] = result.outputs ?? {};
        await log('info', errorHandlerNode.id, errorHandlerNode.type, 'Error handler completed', { outputs: result.outputs });
        hadError = false;
      } catch (e) {
        hadError = true;
        await log('error', errorHandlerNode.id, errorHandlerNode.type, `Error handler failed: ${(e as Error).message}`);
      }
    }
  }

  await log('info', null, null, hadError ? 'Workflow finished with errors' : 'Workflow completed successfully');
  await finish(hadError ? 'error' : 'success', hadError ? 'One or more nodes failed' : undefined, startedAt);
}

function withTimeout<T>(ms: number, fn: () => Promise<T>, label: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return (async () => {
    try {
      return await fn();
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error(`${label} timed out after ${ms}ms`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();
}

/** Execute a node with a timeout and bounded retries (max 2 retries when retryable). */
async function runNode(
  timeoutMs: number,
  label: string,
  retryable: boolean,
  attempt: () => Promise<NodeExecutorResult>,
  onRetry: (err: string, attemptNum: number) => Promise<void>,
): Promise<NodeExecutorResult> {
  const maxRetries = retryable ? 2 : 0;
  let lastErr: Error | null = null;
  for (let attemptNum = 0; attemptNum <= maxRetries; attemptNum++) {
    try {
      return await withTimeout(timeoutMs, attempt, label);
    } catch (e) {
      lastErr = e as Error;
      if (attemptNum < maxRetries) {
        await onRetry(lastErr.message, attemptNum + 1);
      } else {
        throw lastErr;
      }
    }
  }
  throw lastErr;
}

/** Sync-run helper used by webhook and telegram triggers. */
export async function createAndRunWorkflow(
  env: Env,
  args: { workspaceId: string; workflowId: string; input?: Record<string, unknown>; triggerType?: string },
): Promise<string | null> {
  const executionId = `ex_${crypto.randomUUID().replace(/-/g, '')}`;
  await env.DB.prepare(
    'INSERT INTO executions (id, workspace_id, workflow_id, status, trigger_type, input_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    executionId,
    args.workspaceId,
    args.workflowId,
    'running',
    args.triggerType ?? 'manual',
    JSON.stringify(args.input ?? {}),
    new Date().toISOString(),
  ).run();
  await runWorkflowInWorker(env, { ...args, executionId });
  return executionId;
}