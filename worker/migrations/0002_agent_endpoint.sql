-- Agents: per-agent custom endpoint (OpenAI-compatible base URL) and credential link.
ALTER TABLE agents ADD COLUMN base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN credential_id TEXT;
