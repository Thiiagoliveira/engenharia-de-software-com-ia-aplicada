-- ============================================================
-- FASE 1 — Execute antes de rodar a aplicação
-- ============================================================

-- Passo 1: habilitar a extensão pgvector
create extension if not exists vector with schema extensions;


-- Passo 2: descobrir a dimensão dos vetores do seu dataset
-- Execute esta query e anote o resultado antes de continuar:
--
--   select 2 + count(distinct category)::int + count(distinct color)::int as dimensions
--   from "e-commerce-ia".product;
--
-- O número retornado é o N que você vai substituir em extensions.vector(N) abaixo.


-- Passo 3: tabela de vetores dos produtos
-- Substitua N pelo valor retornado na query acima (ex: extensions.vector(14))
create table "e-commerce-ia".product_vector (
    product_id   text primary key,
    vector_data  jsonb                not null,
    vec          extensions.vector(14),
    dimensions   int                  not null,
    name         text,
    meta         jsonb,
    created_at   timestamptz          default now()
);


-- Passo 4: índice HNSW (só funciona com dimensão fixa — por isso o Passo 2)
create index product_vector_hnsw_idx
    on "e-commerce-ia".product_vector
    using hnsw (vec vector_cosine_ops);


-- ============================================================
-- FASE 2 — Execute após criar as tabelas acima
-- ============================================================

-- Passo 5: tabela de metadados do contexto de codificação
create table "e-commerce-ia".model_context (
    id                    text primary key,
    min_age               float,
    max_age               float,
    min_price             float,
    max_price             float,
    colors_index          jsonb,
    categories_index      jsonb,
    product_avg_age_norm  jsonb,
    num_categories        int,
    num_colors            int,
    dimentions            int,
    created_at            timestamptz default now()
);


-- Passo 6: cache de recomendações por usuário
create table "e-commerce-ia".user_recommendation (
    user_id         text primary key,
    recommendations jsonb        not null,
    purchases_hash  text         not null,
    created_at      timestamptz  default now()
);


-- Passo 7: função de busca cosine via HNSW (Etapa 1 do pipeline de recomendação)
create or replace function "e-commerce-ia".match_products(
    query_vector  extensions.vector,
    match_count   int default 200
)
returns table (
    product_id   text,
    name         text,
    meta         jsonb,
    vector_data  jsonb,
    similarity   float
)
language sql stable
as $$
    select
        pv.product_id,
        pv.name,
        pv.meta,
        pv.vector_data,
        1 - (pv.vec <=> query_vector) as similarity
    from "e-commerce-ia".product_vector pv
    where pv.vec is not null
    order by pv.vec <=> query_vector
    limit match_count;
$$;


-- ============================================================
-- Passo 4: tabela de metadados do contexto de codificação
-- Guarda os parâmetros de normalização usados pelo encodeProduct/encodeUser
-- ============================================================
create table "e-commerce-ia".model_context (
    id                    text primary key,
    min_age               float,
    max_age               float,
    min_price             float,
    max_price             float,
    colors_index          jsonb,
    categories_index      jsonb,
    product_avg_age_norm  jsonb,
    num_categories        int,
    num_colors            int,
    dimentions            int,
    created_at            timestamptz default now()
);


-- ============================================================
-- Passo 5: tabela de cache de recomendações por usuário
-- purchases_hash invalida o cache quando o usuário adiciona/remove compras
-- ============================================================
create table "e-commerce-ia".user_recommendation (
    user_id         text primary key,
    recommendations jsonb        not null,
    purchases_hash  text         not null,
    created_at      timestamptz  default now()
);


-- ============================================================
-- Passo 6: função de busca por similaridade cosine (Etapa 1 do pipeline)
-- Retorna os match_count produtos mais próximos ao vetor do usuário
-- ============================================================
create or replace function "e-commerce-ia".match_products(
    query_vector  extensions.vector,
    match_count   int default 200
)
returns table (
    product_id   text,
    name         text,
    meta         jsonb,
    vector_data  jsonb,
    similarity   float
)
language sql stable
as $$
    select
        pv.product_id,
        pv.name,
        pv.meta,
        pv.vector_data,
        1 - (pv.vec <=> query_vector) as similarity
    from "e-commerce-ia".product_vector pv
    where pv.vec is not null
    order by pv.vec <=> query_vector
    limit match_count;
$$;
