import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient.js';

export class ProductService {
    #cachedProducts = null;

    async getProducts() {
        if (this.#cachedProducts) return this.#cachedProducts;

        const { data, error } = await supabase
            .from('product')
            .select('*');

        if (!error && data) {
            this.#cachedProducts = data;
            return data;
        }

        console.warn('Erro ao buscar produtos do Supabase (primeira tentativa):', error);

        // Fallback: tentar buscar no schema `public` caso as tabelas tenham sido movidas para lá
        try {
            const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'public' } });
            const { data: pubData, error: pubErr } = await publicClient.from('product').select('*');

            if (!pubErr && pubData) {
                this.#cachedProducts = pubData;
                return pubData;
            }
            console.warn('Fallback com schema `public` também falhou:', pubErr);
        } catch (e) {
            console.error('Erro no fallback (public client):', e);
        }

        console.error('Não foi possível buscar produtos do Supabase; retornando lista vazia.');
        return [];
    }

    async getProductById(id) {
        const products = await this.getProducts();
        return products.find(product => product.id === id);
    }

    async getProductsByIds(ids) {
        const products = await this.getProducts();
        return products.filter(product => ids.includes(product.id));
    }
}
