import { supabase } from '../supabaseClient.js';

export class VectorService {

    async saveProductVectors(productVectors) {
        const rows = productVectors.map(pv => ({
            product_id: String(pv.meta?.id ?? pv.name),
            vector_data: Array.from(pv.vector),
            vec: Array.from(pv.vector),   // coluna pgvector usada pelo índice HNSW
            dimensions: pv.vector.length,
            name: pv.name,
            meta: pv.meta ?? {}
        }));

        const { error } = await supabase
            .from('product_vector')
            .upsert(rows, { onConflict: 'product_id' });

        if (error) console.error('VectorService.saveProductVectors:', error);
        return !error;
    }

    async saveContextMeta(contextMeta) {
        const { error } = await supabase
            .from('model_context')
            .upsert([{
                id: 'current',
                min_age: contextMeta.minAge,
                max_age: contextMeta.maxAge,
                min_price: contextMeta.minPrice,
                max_price: contextMeta.maxPrice,
                colors_index: contextMeta.colorsIndex,
                categories_index: contextMeta.categoriesIndex,
                product_avg_age_norm: contextMeta.productAvgAgeNorm,
                num_categories: contextMeta.numCategories,
                num_colors: contextMeta.numColors,
                dimentions: contextMeta.dimentions
            }], { onConflict: 'id' });

        if (error) console.error('VectorService.saveContextMeta:', error);
        return !error;
    }

    async getProductVectors() {
        const { data, error } = await supabase
            .from('product_vector')
            .select('product_id, vector_data, dimensions, name, meta');

        if (error || !data?.length) return null;

        return data.map(row => ({
            name: row.name,
            meta: row.meta,
            vector: new Float32Array(row.vector_data)
        }));
    }

    async getContextMeta() {
        const { data, error } = await supabase
            .from('model_context')
            .select('*')
            .eq('id', 'current')
            .single();

        if (error || !data) return null;

        return {
            minAge: data.min_age,
            maxAge: data.max_age,
            minPrice: data.min_price,
            maxPrice: data.max_price,
            colorsIndex: data.colors_index,
            categoriesIndex: data.categories_index,
            productAvgAgeNorm: data.product_avg_age_norm,
            numCategories: data.num_categories,
            numColors: data.num_colors,
            dimentions: data.dimentions
        };
    }

    // Chama a SQL function match_products (pgvector cosine similarity)
    async findSimilarProducts(userVector, limit = 200) {
        const { data, error } = await supabase.rpc('match_products', {
            query_vector: Array.from(userVector),
            match_count: limit
        });

        if (error) {
            console.warn('VectorService.findSimilarProducts indisponível, usando fallback JS:', error.message);
            return null;
        }

        return data?.map(row => ({
            name: row.name,
            meta: row.meta,
            vector: new Float32Array(row.vector_data)
        })) ?? null;
    }

    async saveUserRecommendations(userId, recommendations, purchasesHash) {
        const { error } = await supabase
            .from('user_recommendation')
            .upsert([{
                user_id: String(userId),
                recommendations,
                purchases_hash: purchasesHash,
                created_at: new Date().toISOString()
            }], { onConflict: 'user_id' });

        if (error) console.error('VectorService.saveUserRecommendations:', error);
    }

    async getUserRecommendations(userId, purchasesHash) {
        const { data, error } = await supabase
            .from('user_recommendation')
            .select('recommendations, purchases_hash')
            .eq('user_id', String(userId))
            .single();

        if (error || !data || data.purchases_hash !== purchasesHash) return null;
        return data.recommendations;
    }

    // Hash das compras do usuário para invalidar cache ao adicionar/remover itens
    static purchasesHash(purchases) {
        return purchases.map(p => String(p.id ?? p.name)).sort().join(',');
    }
}
