#!/bin/sh
set -eu

: "${TRADEFLOW_API_URL:=}"
: "${TRADEFLOW_WS_URL:=}"

# For local Docker Compose, `/api` and `/ws` can be proxied by nginx.conf.
# For Railway (separate services), set absolute URLs:
# - TRADEFLOW_API_URL=https://<backend-domain>/api
# - TRADEFLOW_WS_URL=wss://<backend-domain>/ws

if [ -z "$TRADEFLOW_API_URL" ]; then
  TRADEFLOW_API_URL="/api"
fi

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__TRADEFLOW_CONFIG__ = {
  API_URL: "${TRADEFLOW_API_URL}",
  WS_URL: "${TRADEFLOW_WS_URL}"
};
EOF

