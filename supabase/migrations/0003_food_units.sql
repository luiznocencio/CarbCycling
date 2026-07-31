alter table foods
  add column unit_name text,
  add column unit_grams numeric check (unit_grams > 0);

-- Edição de unidade RLS-safe: só campos de unidade, só em alimentos TACO ou do próprio usuário.
create or replace function set_food_unit(p_food_id uuid, p_unit_name text, p_unit_grams numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update foods
    set unit_name = p_unit_name, unit_grams = p_unit_grams
    where id = p_food_id and (user_id is null or user_id = auth.uid());
end;
$$;
revoke all on function set_food_unit(uuid, text, numeric) from public;
revoke execute on function set_food_unit(uuid, text, numeric) from anon;
grant execute on function set_food_unit(uuid, text, numeric) to authenticated;
