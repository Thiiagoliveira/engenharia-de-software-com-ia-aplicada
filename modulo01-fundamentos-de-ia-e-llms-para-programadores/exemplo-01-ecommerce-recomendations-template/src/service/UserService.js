import { supabase } from '../supabaseClient.js';

export class UserService {
    #storageKey = 'ew-academy-users';

    async getDefaultUsers() {
        // Tenta primeiro a consulta aninhada (caso relacional esteja funcionando)
         let { data, error } = await supabase
            .from('user')
            .select('id, name, age, user_product(product(id, name, category, price, color))');

        if (!error && data && data.length) {
            const users = data.map(user => ({
                id: user.id,
                name: user.name,
                age: user.age,
                purchases: (user.user_product || []).map(up => up.product)
            }));

            this.#setStorage(users);
            return users;
        }

        if (error) {
            console.warn('Consulta aninhada falhou, tentando estratégia alternativa:', error);
        } else {
            console.warn('Consulta aninhada retornou vazio, tentando estratégia alternativa.');
        }

        // Estratégia alternativa: buscar users, products e user_product separadamente e montar purchases
        const { data: usersData, error: usersErr } = await supabase.from('user').select('id, name, age');
        if (usersErr || !usersData) {
            console.error('Erro ao buscar usuários do Supabase (alternativa):', usersErr);
            return [];
        }

        const { data: productsData, error: productsErr } = await supabase.from('product').select('id, name, category, price, color');
        if (productsErr || !productsData) {
            console.error('Erro ao buscar produtos do Supabase (alternativa):', productsErr);
            return [];
        }

        const productsById = Object.fromEntries(productsData.map(p => [p.id, p]));

        const { data: upData, error: upErr } = await supabase.from('user_product').select('user_id, product_id');
        if (upErr) {
            console.warn('Não foi possível buscar `user_product` (alternativa):', upErr);
        }

        const userPurchasesMap = {};
        (upData || []).forEach(row => {
            if (!userPurchasesMap[row.user_id]) userPurchasesMap[row.user_id] = [];
            const product = productsById[row.product_id];
            if (product) userPurchasesMap[row.user_id].push(product);
        });

        const users = usersData.map(u => ({
            id: u.id,
            name: u.name,
            age: u.age,
            purchases: userPurchasesMap[u.id] || []
        }));

        this.#setStorage(users);
        return users;
    }

    async addPurchaseToSupabase(userId, productId) {
        const payload = [{ user_id: userId, product_id: productId }];
        try {
            const { data, error } = await supabase
                .from('user_product')
                .upsert(payload, { onConflict: ['user_id', 'product_id'] })
                .select();

            if (error) {
                console.error('Erro ao salvar compra no Supabase:', error);
                return { success: false, error };
            }

            return { success: true, data };
        } catch (err) {
            console.error('Erro inesperado ao salvar compra no Supabase:', err);
            return { success: false, error: err };
        }
    }

    async getUsers() {
        const users = this.#getStorage();
        return users;
    }

    async getUserById(userId) {
        const users = this.#getStorage();
        return users.find(user => user.id === userId);
    }

    async updateUser(user) {
        const users = this.#getStorage();
        const userIndex = users.findIndex(u => u.id === user.id);

        users[userIndex] = { ...users[userIndex], ...user };
        this.#setStorage(users);

        return users[userIndex];
    }

    async addUser(user) {
        const users = this.#getStorage();
        this.#setStorage([user, ...users]);
    }

    #getStorage() {
        const data = sessionStorage.getItem(this.#storageKey);
        return data ? JSON.parse(data) : [];
    }

    #setStorage(data) {
        sessionStorage.setItem(this.#storageKey, JSON.stringify(data));
    }


}
