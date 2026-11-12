/**
 * Minimal Supabase Realtime client (Phoenix channels over a WebSocket, "postgres_changes" only) — no npm package.
 * Row-level security still applies: each person only ever receives rows of their own account.
 * If the socket is down the app still works: a reconcile runs on focus / when back online / every few minutes.
 */
import { SUPABASE_ANON_KEY, supabase, supabaseUrl } from '../supabase';

export interface ChangeEvent { table: string; type: 'INSERT' | 'UPDATE' | 'DELETE'; record: any }
const TABLES = ['user_data', 'lib_docs', 'vault_items'];

export class RealtimeLink {
  private ws: WebSocket | null = null;
  private running = false;
  private ref = 0;
  private hb: any = null;
  private retry: any = null;
  private backoff = 1000;
  private topic = 'realtime:planex-sync';
  private offToken: (() => void) | null = null;

  constructor(private onEvent: (e: ChangeEvent) => void, private onLive: (live: boolean) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.offToken = supabase.onTokenRefreshed((t) => this.send('access_token', { access_token: t }));
    void this.connect();
  }

  stop() {
    this.running = false;
    clearInterval(this.hb); clearTimeout(this.retry);
    this.offToken?.(); this.offToken = null;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null; this.onLive(false);
  }

  private send(event: string, payload: unknown, topic = this.topic) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const ref = String(++this.ref);
    this.ws.send(JSON.stringify({ topic, event, payload, ref, join_ref: event === 'phx_join' ? ref : undefined }));
  }

  private async connect() {
    if (!this.running) return;
    const token = await supabase.getToken();
    if (!token) { this.schedule(); return; }
    let ws: WebSocket;
    try { ws = new WebSocket(`${supabaseUrl().replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&vsn=1.0.0`); }
    catch { this.schedule(); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.send('phx_join', {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: '' },
          postgres_changes: TABLES.map((table) => ({ event: '*', schema: 'public', table })),
          private_channel: false
        },
        access_token: token
      });
      clearInterval(this.hb);
      this.hb = setInterval(() => this.send('heartbeat', {}, 'phoenix'), 25000);
    };
    ws.onmessage = (m) => {
      let msg: any; try { msg = JSON.parse(String(m.data)); } catch { return; }
      if (msg.topic === this.topic && msg.event === 'phx_reply') {
        if (msg.payload?.status === 'ok') { this.backoff = 1000; this.onLive(true); }
        else { this.onLive(false); }
      } else if (msg.event === 'postgres_changes' && msg.payload?.data) {
        const d = msg.payload.data;
        this.onEvent({ table: d.table, type: d.type, record: d.record });
      } else if (msg.event === 'phx_error' || msg.event === 'phx_close') {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    ws.onclose = () => { clearInterval(this.hb); this.onLive(false); if (this.ws === ws) { this.ws = null; this.schedule(); } };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  private schedule() {
    if (!this.running) return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => { void this.connect(); }, this.backoff);
    this.backoff = Math.min(30000, this.backoff * 2);
  }

  /** (re)connect right now, e.g. when the phone comes back online */
  poke() { if (this.running && !this.ws) { clearTimeout(this.retry); this.backoff = 1000; void this.connect(); } }
}
