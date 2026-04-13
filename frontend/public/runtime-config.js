// This file is generated/overwritten in Docker (see `frontend/docker-entrypoint.d/99-runtime-config.sh`).
// Defaults are safe for local dev (`npm start` proxy uses /api, and WS is direct to :4000).
window.__TRADEFLOW_CONFIG__ = {
  API_URL: '/api',
  WS_URL: 'ws://localhost:4000/ws',
};

