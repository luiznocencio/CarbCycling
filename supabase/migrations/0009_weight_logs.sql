create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default (now() at time zone 'utc')::date,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
alter table public.weight_logs enable row level security;
create policy "wl_select_own" on public.weight_logs for select using (user_id = auth.uid());
create policy "wl_insert_own" on public.weight_logs for insert with check (user_id = auth.uid());
create policy "wl_update_own" on public.weight_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wl_delete_own" on public.weight_logs for delete using (user_id = auth.uid());

alter table public.profiles add column if not exists kcal_adjustment integer not null default 0;
