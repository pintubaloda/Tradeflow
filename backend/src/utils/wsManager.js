const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

class WSManager {
  constructor() {
    this.clients = new Map(); // Map<tenantId_firmId, Set<ws>>
  }

  init(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      // Unauthenticated timeout: close if no auth within 10s
      const authTimeout = setTimeout(() => {
        if (!ws._roomKey) ws.close(1008, 'Auth timeout');
      }, 10000);

      ws.on('message', async (raw) => {
        // FIX: rate-limit messages per connection (max 10 per second)
        ws._msgCount = (ws._msgCount || 0) + 1;
        if (ws._msgCount > 10) {
          ws.close(1008, 'Rate limit exceeded');
          return;
        }
        // Reset counter every second
        if (!ws._msgTimer) {
          ws._msgTimer = setTimeout(() => { ws._msgCount = 0; ws._msgTimer = null; }, 1000);
        }

        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'auth') {
            // FIX BUG 9: decode JWT server-side — never trust client-supplied tenantId
            let decoded;
            try {
              decoded = jwt.verify(msg.token, process.env.JWT_SECRET);
            } catch (_) {
              ws.close(1008, 'Invalid token');
              return;
            }

            // Verify firmId belongs to the JWT user's tenant
            const result = await query(
              `SELECT f.tenant_id FROM firms f
               JOIN users u ON u.tenant_id = f.tenant_id
               WHERE f.id = $1 AND u.id = $2 AND f.is_active = true AND u.is_active = true`,
              [msg.firmId, decoded.userId]
            );
            if (!result.rows.length) {
              ws.close(1008, 'Unauthorized firm');
              return;
            }

            const tenantId = result.rows[0].tenant_id; // from DB, not client
            clearTimeout(authTimeout);

            const roomKey = `${tenantId}_${msg.firmId}`;
            if (!this.clients.has(roomKey)) this.clients.set(roomKey, new Set());
            this.clients.get(roomKey).add(ws);
            ws._roomKey = roomKey;
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          }
        } catch (_) {
          ws.close(1008, 'Invalid message');
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (ws._roomKey && this.clients.has(ws._roomKey)) {
          this.clients.get(ws._roomKey).delete(ws);
          if (this.clients.get(ws._roomKey).size === 0) {
            this.clients.delete(ws._roomKey);
          }
        }
      });

      ws.on('error', () => ws.close());

      // Ping-pong keep-alive
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
    });

    // Heartbeat every 30s
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  broadcast(tenantId, firmId, payload) {
    const roomKey = `${tenantId}_${firmId}`;
    const room = this.clients.get(roomKey);
    if (!room) return;
    const message = JSON.stringify(payload);
    room.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    });
  }
}

module.exports = new WSManager();
