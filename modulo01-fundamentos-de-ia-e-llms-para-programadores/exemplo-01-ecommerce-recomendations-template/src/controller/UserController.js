export class UserController {
    #userService;
    #userView;
    #events;
    constructor({
        userView,
        userService,
        events,
    }) {
        this.#userView = userView;
        this.#userService = userService;
        this.#events = events;
    }

    static init(deps) {
        return new UserController(deps);
    }

    async renderUsers(nonTrainedUser) {
        const users = await this.#userService.getDefaultUsers();

        this.#userService.addUser(nonTrainedUser);
        const defaultAndNonTrained = [nonTrainedUser, ...users];

        this.#userView.renderUserOptions(defaultAndNonTrained);
        this.setupCallbacks();
        this.setupPurchaseObserver();

        this.#events.dispatchUsersUpdated({ users: defaultAndNonTrained });

    }

    setupCallbacks() {
        this.#userView.registerUserSelectCallback(this.handleUserSelect.bind(this));
        this.#userView.registerPurchaseRemoveCallback(this.handlePurchaseRemove.bind(this));
    }

    setupPurchaseObserver() {

        this.#events.onPurchaseAdded(
            async (...data) => {
                return this.handlePurchaseAdded(...data);
            }
        );

    }

    async handleUserSelect(userId) {
        const user = await this.#userService.getUserById(userId);
        this.#events.dispatchUserSelected(user);
        return this.displayUserDetails(user);
    }

    async handlePurchaseAdded({ user, product }) {
        try {
            const persistResult = await this.#userService.addPurchaseToSupabase(user.id, product.id);

            const updatedUser = (await this.#userService.getUserById(user.id)) || { ...user, purchases: [] };
            updatedUser.purchases.push({ ...product });

            await this.#userService.updateUser(updatedUser);

            const lastPurchase = updatedUser.purchases[updatedUser.purchases.length - 1];
            this.#userView.addPastPurchase(lastPurchase);
            this.#events.dispatchUsersUpdated({ users: await this.#userService.getUsers() });

            if (!persistResult || !persistResult.success) {
                console.warn('Compra atualizada localmente, mas falha ao persistir no Supabase.', persistResult?.error);
            }
        } catch (err) {
            console.error('Erro ao processar compra:', err);
            const updatedUser = (await this.#userService.getUserById(user.id)) || { ...user, purchases: [] };
            updatedUser.purchases.push({ ...product });
            await this.#userService.updateUser(updatedUser);
            const lastPurchase = updatedUser.purchases[updatedUser.purchases.length - 1];
            this.#userView.addPastPurchase(lastPurchase);
            this.#events.dispatchUsersUpdated({ users: await this.#userService.getUsers() });
        }
    }

    async handlePurchaseRemove({ userId, product }) {
        try {
            const persistResult = await this.#userService.removePurchaseFromSupabase(userId, product.id);

            const user = await this.#userService.getUserById(userId);
            const index = user.purchases.findIndex(item => item.id === product.id);

            if (index !== -1) {
                user.purchases.splice(index, 1);
                await this.#userService.updateUser(user);

                const updatedUsers = await this.#userService.getUsers();
                this.#events.dispatchUsersUpdated({ users: updatedUsers });
            }

            if (!persistResult || !persistResult.success) {
                console.warn('Compra removida localmente, mas falha ao remover do Supabase', persistResult?.error);
            }
        } catch (err) {
            console.error('Erro ao remover compra:', err);
            const user = await this.#userService.getUserById(userId);
            const index = user.purchases.findIndex(item => item.id === product.id);
            if (index !== -1) {
                user.purchases.splice(index, 1);
                await this.#userService.updateUser(user);
                const updatedUsers = await this.#userService.getUsers();
                this.#events.dispatchUsersUpdated({ users: updatedUsers });
            }
        }
    }


    async displayUserDetails(user) {
        this.#userView.renderUserDetails(user);
        this.#userView.renderPastPurchases(user.purchases);

    }

    getSelectedUserId() {
        return this.#userView.getSelectedUserId();
    }
}
