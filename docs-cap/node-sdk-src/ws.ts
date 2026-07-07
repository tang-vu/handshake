import WebSocket from 'ws';
import type { Logger, Event, EventTypeName } from './types';

const WS_MAX_RECONNECT_DELAY = 30_000;
const WS_PONG_TIMEOUT = 60_000;
const WS_PING_INTERVAL = 30_000;
const WS_POLICY_VIOLATION = 1008;

export class EventStream {
  private sdkKey: string;
  private wsURL: string;
  private logger: Logger;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Array<(event: Event) => void>>();
  private anyHandlers: Array<(event: Event) => void> = [];
  private closed = false;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private error: Error | null = null;
  private abortController: AbortController;

  constructor(sdkKey: string, wsURL: string, logger: Logger) {
    this.sdkKey = sdkKey;
    this.wsURL = wsURL;
    this.logger = logger;
    this.abortController = new AbortController();
  }

  async connect(): Promise<void> {
    const ws = this.dial();
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(new Error(`croo: websocket connect: ${err.message}`)));
    });
    this.ws = ws;
    this.setupListeners(ws);
    this.startPingLoop();
  }

  on(eventType: EventTypeName | string, handler: (event: Event) => void): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  onAny(handler: (event: Event) => void): void {
    this.anyHandlers.push(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortController.abort();
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close(1000, 'normal closure');
      this.ws = null;
    }
  }

  err(): Error | null {
    return this.error;
  }

  private dial(): WebSocket {
    const url = new URL(this.wsURL);
    url.pathname = '/ws';
    url.searchParams.set('key', this.sdkKey);

    const ws = new WebSocket(url.toString());
    this.logger.info('websocket connecting', { url: url.toString() });
    return ws;
  }

  private setupListeners(ws: WebSocket): void {
    this.resetPongTimeout();

    ws.on('pong', () => {
      this.resetPongTimeout();
    });

    ws.on('ping', () => {
      this.resetPongTimeout();
      ws.pong();
    });

    ws.on('message', (data: WebSocket.Data) => {
      this.attempt = 0;
      this.dispatchMessage(data.toString());
    });

    ws.on('close', (code: number, reason: Buffer) => {
      if (this.closed) return;

      if (code === WS_POLICY_VIOLATION) {
        this.logger.error('websocket policy violation (duplicate key), not reconnecting');
        this.error = new Error('croo: websocket policy violation: duplicate SDK-Key connection');
        return;
      }

      this.logger.warn('websocket closed, reconnecting...', { code, reason: reason.toString() });
      this.reconnect();
    });

    ws.on('error', (err: Error) => {
      if (this.closed) return;
      this.logger.warn('websocket error', { error: err.message });
    });

    this.logger.info('websocket connected');
  }

  private resetPongTimeout(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      if (this.closed) return;
      this.logger.warn('websocket pong timeout, reconnecting...');
      if (this.ws) {
        this.ws.terminate();
      }
      this.reconnect();
    }, WS_PONG_TIMEOUT);
  }

  private startPingLoop(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, WS_PING_INTERVAL);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private async reconnect(): Promise<void> {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }

    while (!this.closed) {
      const delay = Math.min(Math.pow(2, this.attempt) * 1000, WS_MAX_RECONNECT_DELAY);
      this.attempt++;

      this.logger.debug('websocket reconnecting', { delay });

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

      if (this.closed) return;

      try {
        const ws = this.dial();
        await new Promise<void>((resolve, reject) => {
          ws.once('open', () => resolve());
          ws.once('error', (err) => reject(err));
        });
        this.ws = ws;
        this.setupListeners(ws);
        this.startPingLoop();
        this.logger.info('websocket reconnected');
        return;
      } catch (err: any) {
        this.logger.warn('websocket reconnect failed', { error: err.message });
      }
    }
  }

  private dispatchMessage(data: string): void {
    try {
      const envelope = JSON.parse(data);
      const payload = envelope.data ?? envelope;

      const event: Event = {
        type: payload.type,
        raw: payload,
        negotiation_id: payload.negotiation_id,
        order_id: payload.order_id,
        requester_agent_id: payload.requester_agent_id,
        provider_agent_id: payload.provider_agent_id,
        service_id: payload.service_id,
        status: payload.status,
        reason: payload.reason,
      };

      this.logger.info('websocket: received message', {
        type: event.type,
        negotiation_id: event.negotiation_id,
        order_id: event.order_id,
      });

      for (const h of this.anyHandlers) {
        h(event);
      }

      const handlers = this.handlers.get(event.type);
      if (handlers) {
        for (const h of handlers) {
          h(event);
        }
      }
    } catch (err: any) {
      this.logger.warn('websocket: failed to parse message', { error: err.message, data });
    }
  }
}
