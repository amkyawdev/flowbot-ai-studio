#!/usr/bin/env bash
# =============================================================================
# FlowBot AI Studio — Cloudflare provisioning helper
#
# Creates/verifies the Cloudflare resources referenced in worker/wrangler.toml,
# applies D1 migrations, and sets Worker secrets. It NEVER prints secret values.
#
# Prerequisites:
#   - `npx wrangler login` (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env)
#   - Your account already has the flowbot-ai-studio Worker (or it is created
#     on first deploy).
#
# Usage:  ./scripts/provision-cloudflare.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/../worker"

echo "==> 1/6 D1 database"
# Idempotent: `wrangler d1 create` fails if it already exists; fetch the id instead.
D1_ID=$(npx wrangler d1 info flowbot-db 2>/dev/null | awk -F'│' '/Database ID/{gsub(/ /,"",$2);print $2}' || true)
if [ -z "$D1_ID" ]; then
  D1_ID=$(npx wrangler d1 create flowbot-db | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)
fi
echo "  D1 database id: $D1_ID"

echo "==> 2/6 KV namespace"
KV_ID=$(npx wrangler kv namespace list 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((x['id'] for x in d if x['title']=='flowbot-kv'),''))" 2>/dev/null || true)
if [ -z "$KV_ID" ]; then
  KV_ID=$(npx wrangler kv namespace create flowbot-kv | grep -oE '"[0-9a-f]{32}"' | tr -d '"')
fi
echo "  KV namespace id: $KV_ID"

echo "==> 3/6 R2 bucket (idempotent; R2 buckets are created once)"
npx wrangler r2 bucket create flowbot-files 2>/dev/null || echo "  R2 bucket flowbot-files already exists."

echo "==> 4/6 Queues (producers+consumer; DLQ created too)"
npx wrangler queues create flowbot-executions 2>/dev/null || echo "  queue flowbot-executions already exists."
npx wrangler queues create flowbot-executions-dlq 2>/dev/null || echo "  queue flowbot-executions-dlq already exists."

echo "==> 5/6 Write wrangler.toml with real IDs"
cat > wrangler.toml <<EOF
name = "flowbot-ai-studio"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

# Zilliz config is stored as Worker SECRETS (ZILLIZ_ENDPOINT, ZILLIZ_API_KEY),
# so it is NOT declared in [vars] to avoid a vars/secret name conflict.

[[d1_databases]]
binding = "DB"
database_name = "flowbot-db"
database_id = "$D1_ID"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "$KV_ID"
preview_id = "$KV_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "flowbot-files"

[[queues.producers]]
binding = "EXECUTION_QUEUE"
queue = "flowbot-executions"

[[queues.consumers]]
queue = "flowbot-executions"
max_batch_size = 1
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "flowbot-executions-dlq"
EOF
echo "  wrangler.toml written."

echo "==> 6/6 Apply migrations + (optionally) set secrets"
npx wrangler d1 migrations apply flowbot-db --remote

echo
echo "Done. Set Worker secrets with (values are read from stdin, never echoed):"
echo "  printf %s \"\$KEY\"        | npx wrangler secret put CREDENTIAL_MASTER_KEY"
echo "  printf %s \"\$SESSION\"    | npx wrangler secret put AUTH_SESSION_SECRET"
echo "  printf %s \"\$ZILLIZ_KEY\" | npx wrangler secret put ZILLIZ_API_KEY"
echo "  printf %s \"\$ZILLIZ_URL\" | npx wrangler secret put ZILLIZ_ENDPOINT"
echo "Then deploy:  cd worker && npx wrangler deploy"