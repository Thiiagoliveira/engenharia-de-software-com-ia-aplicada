# Utilizando banco supabase

# instrucoes agora:
1. Preciso de integrar o superbase (o site de banco) com esta aplicação e colocar os jsons lá.

## SQL do Supabase (script)

```sql
-- Usuários
create table "e-commerce-ia".user (
	id int8 primary key,
	name varchar,
	age int2
);

INSERT INTO "e-commerce-ia".user (id, name, age) VALUES
  (1, 'Ana Lima', 25),
  (2, 'Bruno Ferreira', 27),
  (3, 'Camila Souza', 30),
  (4, 'Diego Almeida', 22),
  (5, 'Eduarda Nunes', 28)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      age  = EXCLUDED.age;

-- Produtos
CREATE TABLE IF NOT EXISTS "e-commerce-ia".product (
	id int8 PRIMARY KEY,
	name varchar,
	category varchar,
	price numeric,
	color varchar
);

INSERT INTO "e-commerce-ia".product (id, name, category, price, color) VALUES
  (1, 'Fones de Ouvido Sem Fio', 'eletrônicos', 129.99, 'preto'),
  (2, 'Relógio Inteligente', 'eletrônicos', 199.99, 'prata'),
  (3, 'Caixa de Som Bluetooth', 'eletrônicos', 89.99, 'azul'),
  (4, 'Camiseta Estampada', 'vestuário', 49.99, 'branco'),
  (5, 'Calça Jeans Slim', 'vestuário', 99.99, 'azul'),
  (6, 'Tênis Esportivo', 'calçados', 149.99, 'vermelho'),
  (7, 'Sandália Casual', 'calçados', 69.99, 'bege'),
  (8, 'Boné Estiloso', 'acessórios', 39.99, 'preto'),
  (9, 'Mochila Executiva', 'acessórios', 159.99, 'cinza'),
  (10, 'Óculos de Sol', 'acessórios', 89.99, 'marrom')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    color = EXCLUDED.color;

-- Compras realizadas
CREATE TABLE IF NOT EXISTS "e-commerce-ia".user_product (
  user_id int8 not null,
  product_id int8 not null,
  constraint user_product_pkey primary key (user_id, product_id),
  constraint user_product_product_id_fkey foreign KEY (product_id) references "e-commerce-ia".product (id),
  constraint user_product_user_id_fkey foreign KEY (user_id) references "e-commerce-ia"."user" (id)
);

INSERT INTO "e-commerce-ia".user_product (user_id, product_id) VALUES
  (1,1),
  (1,2),
  (2,1),
  (2,3),
  (3,4),
  (3,5),
  (4,2),
  (4,3),
  (4,6),
  (5,1),
  (5,6),
  (5,5)
ON CONFLICT (user_id, product_id) DO NOTHING;

-- GRANTS
GRANT USAGE ON SCHEMA "e-commerce-ia" TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA "e-commerce-ia" TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA "e-commerce-ia" TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "e-commerce-ia" TO anon, authenticated, service_role;

-- Enabled securitys
alter table "e-commerce-ia".user
enable row level security;

create policy "allow select for anon"
on "e-commerce-ia".user
for select
to anon
using (true);

alter table "e-commerce-ia".product
enable row level security;

create policy "allow select for anon"
on "e-commerce-ia".product
for select
to anon
using (true);

alter table "e-commerce-ia".user_product
enable row level security;

create policy "allow_all"
on "e-commerce-ia".user_product
for all
to public
using (true)
with check (true);


```

# instrucoes futuras:
1. Funciona direto do browser — não precisa criar backend (mantém a arquitetura atual)
2. Banco online gratuito — 500MB no free tier, hospedado na nuvem
3. Guarda tudo num lugar só — dados estruturados (users, products, purchases) + vetores (embeddings)
4.Busca vetorial nativa — pgvector faz similarity search por cosine/L2
SDK JavaScript oficial — @supabase/supabase-js funciona no browser e no worker
API REST automática — cada tabela vira endpoint automaticamente
Auth integrado — se quiser adicionar login depois, já está lá
Dashboard visual — interface web para ver/editar dados sem SQL