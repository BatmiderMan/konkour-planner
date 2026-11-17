// Lightweight, zero-dependency Supabase client: login (no sign-up!), token refresh, REST tables and Storage.
// No npm package is needed, so `npm ci` keeps working with the existing package-lock.json.

export const SUPABASE_URL = 'https://qjeimnjulbbxnkjjlpri.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_7r0LW4rHe7rBIiHroFr3jg_HDY0hIGG';

/** Accounts are created by you in the Supabase dashboard. A person may type just «ali» — it becomes ali@planex.app. */
export const USER_DOMAIN = 'planex.app';

const KEY_SUPABASE_SESSION = 'konkour_supabase_session';
const KEY_URL_OVERRIDE = 'planex_sync_url'; // optional: a proxy address when supabase.co is unreachable on this network

/** the server address in use (the default one, unless the person set another in the login window) */
export const supabaseUrl = (): string => {
  try { const u = (localStorage.getItem(KEY_URL_OVERRIDE) || '').trim().replace(/\/+$/, ''); if (/^https?:\/\//i.test(u)) return u; } catch { /* ignore */ }
  return SUPABASE_URL;
};
export const setSupabaseUrlOverride = (u: string): void => {
  try { const v = u.trim().replace(/\/+$/, ''); if (v && v !== SUPABASE_URL) localStorage.setItem(KEY_URL_OVERRIDE, v); else localStorage.removeItem(KEY_URL_OVERRIDE); } catch { /* ignore */ }
};

/** the network itself failed (no route, blocked, timeout) — as opposed to the server answering with an error */
export class NetError extends Error { constructor(public detail: string) { super(detail); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a time limit and a couple of quick retries: a flaky connection should not look like a wrong password */
async function netFetch(url: string, init: RequestInit = {}, retries = 2, timeoutMs = 15000): Promise<Response> {
  let last: any;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      clearTimeout(t);
      if (res.status >= 502 && res.status <= 504 && i < retries) { await sleep(600 * (i + 1)); continue; }
      return res;
    } catch (e) {
      clearTimeout(t); last = e;
      if (i < retries) await sleep(500 * (i + 1) * (i + 1));
    }
  }
  throw new NetError(last?.name === 'AbortError' ? 'timeout' : String(last?.message || last || 'network'));
}

export interface UserSession {
  access_token: string;
  refresh_token: string;
  /** ms timestamp when access_token stops working */
  expires_at: number;
  user: { id: string; email: string };
}

export interface ApiResult<T> { data?: T; error?: string; status?: number }

const toEmail = (name: string) => {
  const n = name.trim();
  return n.includes('@') ? n : `${n.toLowerCase()}@${USER_DOMAIN}`;
};

class SupabaseService {
  private session: UserSession | null = null;
  private authListeners: Array<(session: UserSession | null) => void> = [];
  private refreshing: Promise<boolean> | null = null;
  /** why the person is logged out right now: they pressed «خروج», or the server closed the session */
  public lastLogout: { reason: 'manual' | 'revoked'; at: number } | null = null;
  public lastRefreshError = '';
  private tokenListeners: Array<(token: string) => void> = [];

  constructor() {
    try {
      const stored = localStorage.getItem(KEY_SUPABASE_SESSION);
      if (stored) {
        const s = JSON.parse(stored);
        if (s && s.access_token && s.refresh_token && s.user?.id) {
          this.session = { ...s, expires_at: Number(s.expires_at) || 0 };
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
    // another tab of the same browser logged in / refreshed / logged out: follow it, so two tabs never fight over one refresh token
    try {
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY_SUPABASE_SESSION) return;
        if (!e.newValue) { if (this.session) { this.session = null; this.authListeners.forEach((cb) => cb(null)); } return; }
        try {
          const n = JSON.parse(e.newValue);
          if (n?.access_token && n?.user?.id) {
            const changedUser = n.user.id !== this.session?.user.id;
            this.session = { ...n, expires_at: Number(n.expires_at) || 0 };
            if (changedUser) this.authListeners.forEach((cb) => cb(this.session));
          }
        } catch { /* ignore */ }
      });
    } catch { /* no window */ }
  }

  /** a refresh token can only be used once; if another tab already used it, its newer session is in localStorage */
  private adoptStored(): boolean {
    try {
      const n = JSON.parse(localStorage.getItem(KEY_SUPABASE_SESSION) || 'null');
      if (n?.access_token && n?.refresh_token && n.refresh_token !== this.session?.refresh_token) {
        this.session = { ...n, expires_at: Number(n.expires_at) || 0 };
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  public getSession(): UserSession | null { return this.session; }
  public getUser() { return this.session ? this.session.user : null; }
  /** for the diagnostics panel */
  public sessionInfo() { return this.session ? { email: this.session.user.email, expiresInSec: Math.round((this.session.expires_at - Date.now()) / 1000), lastRefreshError: this.lastRefreshError } : null; }

  public onAuthStateChange(callback: (session: UserSession | null) => void) {
    this.authListeners.push(callback);
    callback(this.session);
    return () => { this.authListeners = this.authListeners.filter((cb) => cb !== callback); };
  }
  /** called whenever a fresh access token is obtained (the realtime socket needs it) */
  public onTokenRefreshed(cb: (token: string) => void) {
    this.tokenListeners.push(cb);
    return () => { this.tokenListeners = this.tokenListeners.filter((x) => x !== cb); };
  }

  private setSession(session: UserSession | null, notify = true) {
    this.session = session;
    try {
      if (session) localStorage.setItem(KEY_SUPABASE_SESSION, JSON.stringify(session));
      else localStorage.removeItem(KEY_SUPABASE_SESSION);
    } catch { /* storage full */ }
    if (notify) this.authListeners.forEach((cb) => cb(session));
  }

  private headers(token?: string | null, json = true): Record<string, string> {
    const h: Record<string, string> = { apikey: SUPABASE_ANON_KEY };
    if (token) h.Authorization = `Bearer ${token}`; // the publishable key goes in `apikey` only
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  // ------------------------------------------------------------------ auth
  private fromAuthResponse(data: any): UserSession {
    const expiresIn = Number(data.expires_in) || 3600;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + expiresIn * 1000,
      user: { id: data.user.id, email: data.user.email }
    };
  }

  /** Log in with an account made by the owner. There is intentionally NO sign-up in this app. */
  async signIn(name: string, password: string): Promise<{ user?: any; error?: string; detail?: string }> {
    let res: Response;
    try {
      res = await netFetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: this.headers(null),
        body: JSON.stringify({ email: toEmail(name), password })
      }, 2, 20000);
    } catch (err: any) {
      const detail = err instanceof NetError ? err.detail : String(err?.message || err);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'اینترنت دستگاه قطع است.', detail };
      return { error: 'به سرور وصل نشد (شبکه یا فیلترینگ). دوباره تلاش کنید یا «تست اتصال» را بزنید.', detail };
    }
    try {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.error_code || data.code;
        const detail = `HTTP ${res.status}${code ? ' · ' + code : ''}`;
        if (code === 'invalid_credentials' || (res.status === 400 && !code)) return { error: 'نام کاربری یا رمز عبور اشتباه است', detail };
        if (res.status === 429) return { error: 'تلاش‌های زیاد؛ چند دقیقه صبر کنید و دوباره امتحان کنید.', detail };
        return { error: data.error_description || data.msg || data.message || 'ورود انجام نشد', detail };
      }
      if (!data.access_token || !data.user) return { error: 'پاسخ ناقص از سرور', detail: 'no session in response' };
      this.setSession(this.fromAuthResponse(data));
      return { user: data.user };
    } catch (err: any) {
      // not a network problem: something in the app failed after the server said yes
      console.error('sign-in follow-up failed', err);
      return { error: 'ورود انجام شد اما برنامه نتوانست آن را ثبت کند.', detail: String(err?.message || err) };
    }
  }

  /** quick health check used by the login window: can this device reach the server at all? */
  async ping(): Promise<{ ok: boolean; ms: number; status?: number; detail: string }> {
    const t0 = Date.now();
    try {
      const res = await netFetch(`${supabaseUrl()}/auth/v1/health`, { headers: this.headers(null) }, 0, 10000);
      return { ok: res.ok, ms: Date.now() - t0, status: res.status, detail: res.ok ? 'سرور پاسخ می‌دهد' : `سرور پاسخ داد اما HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - t0, detail: e instanceof NetError ? e.detail : String(e?.message || e) };
    }
  }

  async signOut(): Promise<void> {
    const token = this.session?.access_token;
    this.lastLogout = { reason: 'manual', at: Date.now() };
    this.setSession(null);
    if (token) {
      // scope=local: only THIS device is logged out (the default would log the account out on every device)
      try { await netFetch(`${supabaseUrl()}/auth/v1/logout?scope=local`, { method: 'POST', headers: this.headers(token) }, 0, 8000); } catch { /* offline */ }
    }
  }

  /** exchange the refresh token for a new access token. Returns false only when the login is really gone. */
  private refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    if (!this.session?.refresh_token) return Promise.resolve(false);
    const run = (async () => {
      try {
        if (this.adoptStored() && this.session && this.session.expires_at - Date.now() > 60_000) return true; // another tab just did it
        const rt = this.session?.refresh_token;
        if (!rt) return false;
        const res = await netFetch(`${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: this.headers(null), body: JSON.stringify({ refresh_token: rt })
        }, 2, 15000);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.access_token) {
          this.setSession(this.fromAuthResponse(data), false);
          this.tokenListeners.forEach((cb) => cb(data.access_token));
          this.lastRefreshError = '';
          return true;
        }
        this.lastRefreshError = `HTTP ${res.status}${data.error_code ? ' · ' + data.error_code : ''}`;
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          if (this.adoptStored()) return true;           // the token was used by another tab a moment ago: its newer session is already stored
          this.lastLogout = { reason: 'revoked', at: Date.now() };
          this.setSession(null);                          // really revoked: the account was removed or logged out elsewhere
        }
        return false;
      } catch (e: any) { this.lastRefreshError = String(e?.detail || e?.message || e); return false; } // offline / blocked: keep the session and try again later
    })();
    this.refreshing = run;
    // cleared AFTER the promise is stored (an early `return` inside would otherwise clear it too soon and leave a stale one cached)
    void run.finally(() => { if (this.refreshing === run) this.refreshing = null; });
    return run;
  }

  /** a valid access token (refreshed when it is about to expire), or null when logged out / offline for long */
  async getToken(): Promise<string | null> {
    if (!this.session) return null;
    if (this.session.expires_at - Date.now() < 60_000) await this.refresh();
    return this.session ? this.session.access_token : null;
  }

  // ------------------------------------------------------------------ low level request
  private async request(url: string, init: RequestInit & { json?: boolean }, retry = true): Promise<Response> {
    const token = await this.getToken();
    if (!token) throw new Error('not-signed-in');
    const { json = true, ...rest } = init;
    const res = await netFetch(url, { ...rest, headers: { ...this.headers(token, json), ...(rest.headers as Record<string, string> | undefined) } }, 1, 30000);
    if (res.status === 401 && retry && this.session) {
      if (await this.refresh()) return this.request(url, init, false);
    }
    return res;
  }

  private async errText(res: Response): Promise<string> {
    try { const j = await res.json(); return j.message || j.error || j.msg || `HTTP ${res.status}`; } catch { return `HTTP ${res.status}`; }
  }

  // ------------------------------------------------------------------ REST tables (PostgREST)
  /** one page of rows; `query` is a PostgREST query string such as "select=id&order=id" */
  async select<T = any>(table: string, query = 'select=*'): Promise<ApiResult<T[]>> {
    try {
      const res = await this.request(`${supabaseUrl()}/rest/v1/${table}?${query}`, { method: 'GET' });
      if (!res.ok) return { error: await this.errText(res), status: res.status };
      return { data: (await res.json()) as T[] };
    } catch (e: any) { return { error: e instanceof NetError ? 'network: ' + e.detail : e?.message || 'network' }; }
  }

  /** every row (pages of 1000, the PostgREST default maximum) */
  async selectAll<T = any>(table: string, query: string): Promise<ApiResult<T[]>> {
    const out: T[] = [];
    for (let off = 0; off < 200000; off += 1000) {
      const r = await this.select<T>(table, `${query}&limit=1000&offset=${off}`);
      if (r.error) return r;
      out.push(...(r.data || []));
      if ((r.data || []).length < 1000) break;
    }
    return { data: out };
  }

  async upsert(table: string, rows: any[] | any, onConflict: string): Promise<{ error?: string }> {
    try {
      const res = await this.request(`${supabaseUrl()}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      });
      if (!res.ok) return { error: await this.errText(res) };
      return {};
    } catch (e: any) { return { error: e?.message || 'network' }; }
  }

  // ------------------------------------------------------------------ Storage (private bucket)
  private objectUrl(kind: 'object' | 'authenticated', bucket: string, path: string) {
    return `${supabaseUrl()}/storage/v1/object/${kind === 'authenticated' ? 'authenticated/' : ''}${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  async uploadFile(bucket: string, path: string, blob: Blob): Promise<{ error?: string }> {
    try {
      const res = await this.request(this.objectUrl('object', bucket, path), {
        method: 'POST', json: false, body: blob,
        headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }
      });
      if (!res.ok) return { error: await this.errText(res) };
      return {};
    } catch (e: any) { return { error: e?.message || 'network' }; }
  }
  async downloadFile(bucket: string, path: string): Promise<Blob | null> {
    try {
      const res = await this.request(this.objectUrl('authenticated', bucket, path), { method: 'GET', json: false });
      if (!res.ok) return null;
      return await res.blob();
    } catch { return null; }
  }
  async removeFiles(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    try {
      await this.request(`${supabaseUrl()}/storage/v1/object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
    } catch { /* best effort */ }
  }
}

export const supabase = new SupabaseService();
