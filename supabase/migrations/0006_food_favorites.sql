create table food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references foods(id) on delete cascade,
  primary key (user_id, food_id)
);
alter table food_favorites enable row level security;
create policy "own favorites" on food_favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
