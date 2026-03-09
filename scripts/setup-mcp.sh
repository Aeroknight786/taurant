#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="${1:-$ROOT_DIR/.codex/mcp.secrets.env}"
CURSOR_MCP_FILE="$ROOT_DIR/.cursor/mcp.json"
CODEX_CONFIG_FILE="${HOME}/.codex/config.toml"
MANAGED_MARKER_START="# >>> flock-mcp-managed >>>"
MANAGED_MARKER_END="# <<< flock-mcp-managed <<<"

ensure_secrets_file() {
  if [[ -f "$SECRETS_FILE" ]]; then
    return
  fi

  cp "$ROOT_DIR/.codex/mcp.secrets.env.example" "$SECRETS_FILE"
  cat <<EOF
Created $SECRETS_FILE from template.
Populate RENDER_API_KEY and SUPABASE_PROJECT_REF, then rerun:
  bash scripts/setup-mcp.sh
EOF
  exit 1
}

load_secrets() {
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a

  : "${RENDER_API_KEY:?RENDER_API_KEY is required in $SECRETS_FILE}"
  : "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required in $SECRETS_FILE}"
}

validate_secrets() {
  if [[ "$SUPABASE_PROJECT_REF" == sb_* ]] || [[ "$SUPABASE_PROJECT_REF" == *secret* ]]; then
    cat <<EOF
SUPABASE_PROJECT_REF looks wrong in $SECRETS_FILE.
Expected the project ref (example: dcoixzkyrvfzytelvael), but got a token-like value.
Put the actual project ref in SUPABASE_PROJECT_REF.
Supabase MCP auth should be completed separately with:
  codex mcp login supabase
EOF
    exit 1
  fi
}

write_supabase_cursor_block() {
  cat <<EOF
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}"
    },
EOF
}

write_supabase_codex_block() {
  cat <<EOF
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}"
EOF
}

write_cursor_mcp() {
  mkdir -p "$(dirname "$CURSOR_MCP_FILE")"
  cat > "$CURSOR_MCP_FILE" <<EOF
{
  "mcpServers": {
$(write_supabase_cursor_block)
    "render": {
      "command": "sh",
      "args": [
        "-c",
        ". \\"$SECRETS_FILE\\" && exec npx -y mcp-remote https://mcp.render.com/mcp --header \\"Authorization: Bearer \$RENDER_API_KEY\\""
      ]
    }
  }
}
EOF
}

strip_existing_codex_mcp_sections() {
  local src_file="$1"
  local out_file="$2"

  awk '
  BEGIN {
    skip = 0;
    in_managed_block = 0;
  }
  /^# >>> flock-mcp-managed >>>/ { in_managed_block = 1; next }
  /^# <<< flock-mcp-managed <<</ { in_managed_block = 0; next }
  in_managed_block { next }
  /^\[mcp_servers\.render\]$/      { skip = 1; next }
  /^\[mcp_servers\.render\.env\]$/ { skip = 1; next }
  /^\[mcp_servers\.supabase\]$/    { skip = 1; next }
  /^\[/ {
    if (skip == 1) {
      skip = 0
    }
  }
  skip == 0 { print }
  ' "$src_file" > "$out_file"
}

write_codex_config() {
  mkdir -p "$(dirname "$CODEX_CONFIG_FILE")"
  if [[ ! -f "$CODEX_CONFIG_FILE" ]]; then
    touch "$CODEX_CONFIG_FILE"
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  strip_existing_codex_mcp_sections "$CODEX_CONFIG_FILE" "$tmp_file"

  {
    cat "$tmp_file"
    printf "\n%s\n" "$MANAGED_MARKER_START"
    cat <<EOF
[mcp_servers.render]
command = "sh"
args = ["-c", ". \\"$SECRETS_FILE\\" && exec npx -y mcp-remote https://mcp.render.com/mcp --header \\"Authorization: Bearer \$RENDER_API_KEY\\""]

$(write_supabase_codex_block)
EOF
    printf "%s\n" "$MANAGED_MARKER_END"
  } > "$CODEX_CONFIG_FILE"

  rm -f "$tmp_file"
}

ensure_secrets_file
load_secrets
validate_secrets
write_cursor_mcp
write_codex_config

cat <<EOF
MCP setup complete.
- Cursor config: $CURSOR_MCP_FILE
- Codex config:  $CODEX_CONFIG_FILE

Restart Codex/Cursor sessions to load updated MCP servers.
EOF
