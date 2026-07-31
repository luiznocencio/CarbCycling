-- Expand-contract (fase CONTRACT): aplicar SOMENTE após o deploy do código que usa quantity+unit.
-- Backfill de segurança para linhas criadas na janela expand→deploy, depois remove quantity_g.
update meal_items set quantity = quantity_g where quantity is null;
alter table meal_items alter column quantity set not null;
alter table meal_items drop column quantity_g;
