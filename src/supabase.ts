// Lightweight, zero-dependency Supabase client for Auth & REST Database operations
// Designed to avoid npm package install issues and work across all network conditions.

const SUPABASE_URL = 'https://qjeimnjulbbxnkjjlpri.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7r0LW4rHe7rBIiHroFr3jg_HDY0hIGG';

const KEY_SUPABASE_SESSION = 'konkour_supabase_session';

export interface UserSession {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
  };
}

class SupabaseService {
  private session: UserSession | null = null;
  private authListeners: Array<(session: UserSession | null) => void> = [];

  constructor() {
    try {
      const stored = localStorage.getItem(KEY_SUPABASE_SESSION);
      if (stored) {
        this.session = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  }

  public getSession(): UserSession | null {
    return this.session;
  }

  public getUser() {
    return this.session ? this.session.user : null;
  }

  public onAuthStateChange(callback: (session: UserSession | null) => void) {
    this.authListeners.push(callback);
    callback(this.session);
    return () => {
      this.authListeners = this.authListeners.filter((cb) => cb !== callback);
    };
  }

  private setSession(session: UserSession | null) {
    this.session = session;
    if (session) {
      localStorage.setItem(KEY_SUPABASE_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(KEY_SUPABASE_SESSION);
    }
    this.authListeners.forEach((cb) => cb(session));
  }

  private getHeaders(useAuth = true): HeadersInit {
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
    if (useAuth && this.session?.access_token) {
      headers['Authorization'] = `Bearer ${this.session.access_token}`;
    }
    return headers;
  }

  // --- Auth Endpoints ---

  async signUp(email: string, password: string): Promise<{ user?: any; error?: string }> {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: JSON.stringify({ email, password, data: {} })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.msg || data.error_description || data.message || 'خطا در ثبت نام' };
      }
      if (data.access_token) {
        this.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: { id: data.user.id, email: data.user.email }
        });
      } else if (data.id && !data.access_token) {
        // Supabase sent confirmation email required
        return { error: 'ایمیل تایید ارسال شد. لطفاً در پنل Supabase گزینه Confirm email را خاموش کنید یا ایمیل خود را تایید کنید.' };
      }
      return { user: data.user };
    } catch (err: any) {
      return { error: err.message || 'خطای اتصال به سرور' };
    }
  }

  async signIn(email: string, password: string): Promise<{ user?: any; error?: string }> {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error_description || data.msg || data.message || 'ایمیل یا رمز عبور اشتباه است' };
      }
      this.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: { id: data.user.id, email: data.user.email }
      });
      return { user: data.user };
    } catch (err: any) {
      return { error: err.message || 'خطای اتصال به سرور' };
    }
  }

  async signOut(): Promise<void> {
    if (this.session?.access_token) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: this.getHeaders(true)
        });
      } catch (e) {}
    }
    this.setSession(null);
  }

  // --- Database Sync Endpoints ---

  async fetchAllUserPlans(): Promise<{ data?: any[]; error?: string }> {
    if (!this.session?.user?.id) return { data: [] };
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_plans?select=*&order=updated_at.desc`,
        {
          headers: this.getHeaders(true)
        }
      );
      if (!res.ok) {
        const err = await res.json();
        return { error: err.message || 'خطا در بارگذاری اطلاعات از ابر' };
      }
      const data = await res.json();
      return { data };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  async upsertUserPlan(plan: {
    id: string;
    day: string;
    date: string;
    favorite: boolean;
    blocks: any;
    checklist: any;
    routine: any;
    transfer: any;
    updated_at: number;
  }): Promise<{ error?: string }> {
    if (!this.session?.user?.id) {
      console.warn('Cannot sync: No active Supabase session user');
      return { error: 'کاربر وارد نشده است' };
    }
    try {
      const payload = {
        id: plan.id,
        user_id: this.session.user.id,
        day: plan.day || '',
        date: plan.date || '',
        favorite: !!plan.favorite,
        blocks: plan.blocks || [],
        checklist: plan.checklist || [],
        routine: plan.routine || [],
        transfer: plan.transfer || [],
        updated_at: plan.updated_at || Date.now()
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?on_conflict=id,user_id`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(true),
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Supabase upsert response status:', res.status, text);
        return { error: text };
      }
      console.log('✅ Plan successfully synced to Supabase cloud:', plan.id);
      return {};
    } catch (err: any) {
      console.error('Supabase network error during upsert:', err);
      return { error: err.message };
    }
  }

  async deleteUserPlan(planId: string): Promise<{ error?: string }> {
    if (!this.session?.user?.id) return {};
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?id=eq.${planId}`, {
        method: 'DELETE',
        headers: this.getHeaders(true)
      });
      if (!res.ok) {
        const err = await res.json();
        return { error: err.message };
      }
      return {};
    } catch (err: any) {
      return { error: err.message };
    }
  }
}

export const supabase = new SupabaseService();
