-- PROFILES
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_kg numeric not null default 70,
  goal text not null default 'maintenance' check (goal in ('fat_loss','maintenance','muscle_gain')),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary','light','moderate','active'))
);

-- FOODS (user_id null = base TACO, legível por todos)
create table foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kcal_per_100g numeric not null,
  protein_per_100g numeric not null,
  carbs_per_100g numeric not null,
  fat_per_100g numeric not null,
  is_custom boolean not null default false
);
create index foods_name_idx on foods using gin (to_tsvector('portuguese', name));

-- DAY_TYPES
create table day_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  carb_level text not null default 'medium' check (carb_level in ('low','medium','high')),
  target_kcal numeric not null default 0,
  target_protein_g numeric not null default 0,
  target_carbs_g numeric not null default 0,
  target_fat_g numeric not null default 0,
  auto_suggested boolean not null default true
);

-- WEEKLY_PATTERN
create table weekly_pattern (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  day_type_id uuid not null references day_types(id) on delete cascade,
  unique (user_id, weekday)
);

-- MEALS
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_id uuid not null references day_types(id) on delete cascade,
  name text not null,
  "order" int not null default 0
);

-- MEAL_ITEMS
create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid not null references foods(id) on delete restrict,
  quantity_g numeric not null check (quantity_g >= 0)
);

-- RLS
alter table profiles enable row level security;
alter table foods enable row level security;
alter table day_types enable row level security;
alter table weekly_pattern enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read taco or own foods" on foods for select using (user_id is null or auth.uid() = user_id);
create policy "insert own foods" on foods for insert with check (auth.uid() = user_id and is_custom = true);
create policy "update own foods" on foods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own foods" on foods for delete using (auth.uid() = user_id);

create policy "own day_types" on day_types for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own weekly_pattern" on weekly_pattern for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meals" on meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own meal_items" on meal_items for all
  using (exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()));
