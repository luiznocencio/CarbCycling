create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  avoid text[] not null default '{}',
  always_include text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "prefs_select_own" on public.user_preferences
  for select using (user_id = auth.uid());
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (user_id = auth.uid());
create policy "prefs_update_own" on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prefs_delete_own" on public.user_preferences
  for delete using (user_id = auth.uid());
