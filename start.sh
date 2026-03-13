#!/bin/bash

set -euo pipefail

DEV_VARS_FILE=".dev.vars"

# Respect manually created credentials/config files.
if [[ -f "$DEV_VARS_FILE" ]]; then
  echo "$DEV_VARS_FILE already exists; skipping auto-generation."
else
  {
    echo "# Auto-generated .dev.vars file"

    # Explicit allowlist of variables used by this worker.
    ALLOWED_KEYS=(
      "OPENAI_API_KEY"
      "OPENAI_CODEX_AUTH"
      "CHATGPT_LOCAL_CLIENT_ID"
      "CHATGPT_RESPONSES_URL"
      "OLLAMA_API_URL"
      "DEBUG_MODEL"
      "VERBOSE"
    )

    for key in "${ALLOWED_KEYS[@]}"; do
      if [[ -n "${!key:-}" ]]; then
        printf '%s=%s\n' "$key" "${!key}"
      fi
    done

    # Include optional reasoning controls via prefix allowlist.
    while IFS= read -r key; do
      if [[ -n "${!key:-}" ]]; then
        printf '%s=%s\n' "$key" "${!key}"
      fi
    done < <(compgen -e | sort | while IFS= read -r env_key; do [[ "$env_key" == REASONING_* ]] && echo "$env_key"; done)
  } > "$DEV_VARS_FILE"

  echo "Wrote allowlisted environment variables to $DEV_VARS_FILE"
fi

# Start wrangler with the local environment variables
exec wrangler dev --host 0.0.0.0 --port 8787 --local --persist-to .mf
