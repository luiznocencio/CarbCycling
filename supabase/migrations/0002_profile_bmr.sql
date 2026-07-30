alter table profiles
  add column sex text check (sex in ('male','female')),
  add column age int check (age > 0 and age < 120),
  add column height_cm numeric check (height_cm > 0),
  add column body_fat_pct numeric check (body_fat_pct >= 0 and body_fat_pct < 75),
  add column bmr_formula text not null default 'auto' check (bmr_formula in ('auto','mifflin','harris','katch')),
  add column intensity text not null default 'moderate' check (intensity in ('light','moderate','aggressive')),
  add column safety_guardrails boolean not null default true;
