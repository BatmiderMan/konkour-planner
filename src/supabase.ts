// Lightweight, zero-dependency Supabase client: login (no sign-up!), token refresh, REST tables and Storage.
// No npm package is needed, so `npm ci` keeps working with the existing package-lock.json.

export const SUPABASE_URL = 'https://eyspwfsqypcfpjghlluv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_p8JkFSGY84OuydpebtGAlw_NedAISOQ';

/** Accounts are created by you in the Supabase dashboard. A person may type just «ali» — it becomes ali@planex.app. */
export const USER_DOMAIN = 'planex.app';

const KEY_SUPABASE_SESSION = 'konkour_supabase_session';

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
  }

  public getSession(): UserSession | null { return this.session; }
  public getUser() { return this.session ? this.session.user : null; }

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
    const h: Record<string, string> = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
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
  async signIn(name: string, password: string): Promise<{ user?: any; error?: string }> {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: this.headers(null),
        body: JSON.stringify({ email: toEmail(name), password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.error_code || data.code;
        if (code === 'invalid_credentials' || res.status === 400) return { error: 'نام کاربری یا رمز عبور اشتباه است' };
        return { error: data.error_description || data.msg || data.message || 'ورود انجام نشد' };
      }
      this.setSession(this.fromAuthResponse(data));
      return { user: data.user };
    } catch (err: any) {
      return { error: 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.' };
    }
  }

  async signOut(): Promise<void> {
    const token = this.session?.access_token;
    this.setSession(null);
    if (token) {
      try { await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: this.headers(token) }); } catch { /* offline */ }
    }
  }

  /** exchange the refresh token for a new access token. Returns false only when the login is really gone. */
  private refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    const rt = this.session?.refresh_token;
    if (!rt) return Promise.resolve(false);
    this.refreshing = (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: this.headers(null), body: JSON.stringify({ refresh_token: rt })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.access_token) {
          this.setSession(this.fromAuthResponse(data), false);
          this.tokenListeners.forEach((cb) => cb(data.access_token));
          return true;
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) { this.setSession(null); } // refresh token revoked: the account was removed or logged out elsewhere
        return false;
      } catch { return false; } // offline: keep the session, try again later
      finally { this.refreshing = null; }
    })();
    return this.refreshing;
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
    const res = await fetch(url, { ...rest, headers: { ...this.headers(token, json), ...(rest.headers as Record<string, string> | undefined) } });
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
      const res = await this.request(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: 'GET' });
      if (!res.ok) return { error: await this.errText(res), status: res.status };
      return { data: (await res.json()) as T[] };
    } catch (e: any) { return { error: e?.message || 'network' }; }
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
      const res = await this.request(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
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
    return `${SUPABASE_URL}/storage/v1/object/${kind === 'authenticated' ? 'authenticated/' : ''}${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
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
      await this.request(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
    } catch { /* best effort */ }
  }
}

export const supabase = new SupabaseService();
