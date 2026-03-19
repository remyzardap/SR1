import WebSocket from 'ws';
import crypto from 'crypto';

class OpenclawClient {
  private ws: WebSocket | null = null;
  private callbacks: Map<string, (response: any) => void> = new Map();
  private connecting = false;

  private connect() {
    if (this.connecting || this.ws) return;
    this.connecting = true;

    try {
      this.ws = new WebSocket('ws://127.0.0.1:18789');
      
      this.ws.on('open', () => {
        console.log('[OpenClaw] Connected');
        this.connecting = false;
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const cb = this.callbacks.get(msg.id);
          if (cb) { cb(msg); this.callbacks.delete(msg.id); }
        } catch { /* skip malformed */ }
      });

      this.ws.on('error', (err) => {
        console.debug('[OpenClaw] Error:', err.message);
      });

      this.ws.on('close', () => {
        this.connecting = false;
        this.ws = null;
        setTimeout(() => this.connect(), 5000); // auto-reconnect
      });
    } catch (err) {
      this.connecting = false;
      console.debug('[OpenClaw] Connection attempt failed:', String(err));
    }
  }

  async send(action: string, payload: any): Promise<any> {
    if (!this.ws) {
      this.connect();
    }

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error('OpenClaw response timeout'));
      }, 5000);

      this.callbacks.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      try {
        this.ws?.send(JSON.stringify({ id, action, ...payload }));
      } catch (err) {
        clearTimeout(timeout);
        this.callbacks.delete(id);
        reject(err);
      }
    });
  }
}

export const openclaw = new OpenclawClient();
