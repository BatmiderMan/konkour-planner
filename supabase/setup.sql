-- =====================================================================================
--  Planex — server setup.  Paste this whole file into  Supabase → SQL Editor → Run.
--  Safe to run again (it only creates what is missing).
-- =====================================================================================

-- 1) Tables ------------------------------------------------------------------------------

-- every localStorage key of the app (planner days, tracker, exams, settings …): one row per key
create table if not exists public.user_data (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  key        text    not null,
  value      text,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  primary key (user_id, key)
);

-- answer-key library: kind = 'book' | 'sheet' | 'scan'
create table if not exists public.lib_docs (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  kind       text    not null,
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  primary key (user_id, kind, id)
);

-- question vault (the pictures themselves live in Storage, see 4)
create table if not exists public.vault_items (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  id         text    not null,
  data       jsonb,
  q_path     text,
  e_path     text,
  q_ver      bigint  not null default 0,
  e_ver      bigint  not null default 0,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  primary key (user_id, id)
);

-- 2) Row Level Security: everybody can only see and change their OWN rows ---------------------
alter table public.user_data   enable row level security;
alter table public.lib_docs    enable row level security;
alter table public.vault_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['user_data','lib_docs','vault_items'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_own') then
      execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_own', t);
    end if;
  end loop;
end $$;

-- 3) A stale device can never overwrite newer data ---------------------------------------------
create or replace function public.keep_newer() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;           -- ignore the older write
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['user_data','lib_docs','vault_items'] loop
    if not exists (select 1 from pg_trigger where tgname = t||'_keep_newer') then
      execute format('create trigger %I before update on public.%I for each row execute function public.keep_newer()', t||'_keep_newer', t);
    end if;
  end loop;
end $$;

-- 4) Picture storage: ONE private bucket, 1 MB per file, each person only inside their own folder -
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault', 'vault', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "vault read own"   on storage.objects;
drop policy if exists "vault insert own" on storage.objects;
drop policy if exists "vault update own" on storage.objects;
drop policy if exists "vault delete own" on storage.objects;

create policy "vault read own"   on storage.objects for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault update own" on storage.objects for update to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5) Realtime: tell the apps instantly when a row changes ---------------------------------------
do $$
declare t text;
begin
  foreach t in array array['user_data','lib_docs','vault_items'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 6) (optional) how much space each person uses — run it any time:
--   select (storage.foldername(name))[1] as user_id, count(*) as pictures,
--          round(sum((metadata->>'size')::numeric)/1048576, 1) as mb
--   from storage.objects where bucket_id = 'vault' group by 1;
