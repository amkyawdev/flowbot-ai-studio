export type NodeCategory =
  | 'trigger'
  | 'action'
  | 'logic'
  | 'ai'
  | 'data'
  | 'vector'
  | 'error';

export type PortType =
  | 'any'
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'json'
  | 'message';

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
}

export type ConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'json'
  | 'secret'
  | 'credential'
  | 'bot'
  | 'agent'
  | 'intent'
  | 'code';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  placeholder?: string;
  help?: string;
  default?: unknown;
  options?: { value: string; label: string }[];
  required?: boolean;
  rows?: number;
}

export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
  inputs: PortDef[];
  outputs: PortDef[];
  config: ConfigField[];
  defaults: Record<string, unknown>;
  timeoutMs?: number;
  retryable?: boolean;
}

/** Node instance as stored in a workflow graph. */
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/** Typed edge between two nodes. */
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type ExecutionState = 'idle' | 'running' | 'success' | 'error' | 'stopped';

export interface NodeRunOutput {
  outputs: Record<string, unknown>;
  error?: string;
}