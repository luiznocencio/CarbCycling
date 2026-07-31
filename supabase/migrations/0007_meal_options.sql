-- Opções por refeição: cada linha meals = uma opção; slot agrupa as opções da mesma refeição.
-- Aditivo e retrocompatível: refeições existentes viram slot de 1 opção (selected=true).
alter table meals add column slot int not null default 0;
alter table meals add column option_label text not null default 'Opção 1';
alter table meals add column selected boolean not null default true;
update meals set slot = "order";
