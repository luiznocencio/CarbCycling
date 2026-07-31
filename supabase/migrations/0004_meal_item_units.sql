-- Expand-contract (fase EXPAND): banco compartilhado com produção.
-- Adiciona quantity+unit e mantém quantity_g (agora nullable) para o app já deployado.
-- A remoção de quantity_g fica na migration de CONTRACT (0005), aplicada só APÓS o deploy do código novo.
alter table meal_items add column quantity numeric check (quantity >= 0);
update meal_items set quantity = quantity_g;
alter table meal_items alter column quantity_g drop not null;
alter table meal_items add column unit text not null default 'g' check (unit in ('g','unit'));
