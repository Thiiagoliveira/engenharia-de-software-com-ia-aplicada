import { workerEvents } from "../events/constants.js";
import { VectorService } from "../service/VectorService.js";

export class WorkerController {
    #worker;
    #events;
    #alreadyTrained = false;
    #products = [];
    #productVectors = null; // cache local para fallback quando pgvector indisponível
    #vectorService;

    constructor({ worker, events, vectorService }) {
        this.#worker = worker;
        this.#events = events;
        this.#vectorService = vectorService;
        this.#alreadyTrained = false;
        this.init();
    }

    setProducts(products) {
        this.#products = products;
        console.log('products: ', this.#products);
    }

    get isAlreadyTrained() {
        return this.#alreadyTrained;
    }

    // Tenta carregar vetores do banco; se bem-sucedido, pula o treino
    async tryLoadFromDB() {
        const [productVectors, contextMeta] = await Promise.all([
            this.#vectorService.getProductVectors(),
            this.#vectorService.getContextMeta()
        ]);

        if (!productVectors || !contextMeta) return false;

        console.log('Vetores carregados do banco — pulando treino.');
        this.#alreadyTrained = true;
        this.#productVectors = productVectors;

        this.#worker.postMessage({
            action: workerEvents.vectorsLoad,
            productVectors: productVectors.map(pv => ({ ...pv, vector: Array.from(pv.vector) })),
            contextMeta
        });
        this.#events.dispatchTrainingComplete({});
        return true;
    }

    async init() {
        this.setupCallbacks();
    }

    static init(deps) {
        return new WorkerController(deps);
    }

    setupCallbacks() {
        this.#events.onTrainModel((data) => {
            this.#alreadyTrained = false;
            this.triggerTrain(data);
        });
        this.#events.onTrainingComplete(() => {
            this.#alreadyTrained = true;
        });

        this.#events.onRecommend(async (data) => {
            if (!this.#alreadyTrained) return;
            await this.triggerRecommend(data);
        });

        const eventsToIgnoreLogs = [
            workerEvents.progressUpdate,
            workerEvents.trainingLog,
            workerEvents.tfVisData,
            workerEvents.tfVisLogs,
            workerEvents.trainingComplete,
        ]
        this.#worker.onmessage = (event) => {
            if (!eventsToIgnoreLogs.includes(event.data.type))
                console.log(event.data);

            if (event.data.type === workerEvents.progressUpdate) {
                this.#events.dispatchProgressUpdate(event.data.progress);
            }

            if (event.data.type === workerEvents.trainingComplete) {
                this.#events.dispatchTrainingComplete(event.data);
            }

            if (event.data.type === workerEvents.tfVisData) {
                this.#events.dispatchTFVisorData(event.data.data);
            }

            if (event.data.type === workerEvents.trainingLog) {
                this.#events.dispatchTFVisLogs(event.data);
            }

            if (event.data.type === workerEvents.vectorsSave) {
                this.#productVectors = event.data.productVectors.map(pv => ({
                    ...pv,
                    vector: new Float32Array(pv.vector)
                }));
                this.#vectorService.saveProductVectors(event.data.productVectors);
                this.#vectorService.saveContextMeta(event.data.contextMeta);
            }

            if (event.data.type === workerEvents.userVectorReady) {
                this.#handleUserVectorReady(event.data);
            }

            if (event.data.type === workerEvents.recommend) {
                const { user, recommendations } = event.data;
                const hash = VectorService.purchasesHash(user?.purchases ?? []);
                this.#vectorService.saveUserRecommendations(user?.id, recommendations, hash);
                this.#events.dispatchRecommendationsReady(event.data);
            }
        };
    }

    triggerTrain(users) {
        this.#worker.postMessage({ action: workerEvents.trainModel, users, products: this.#products });
    }

    async triggerRecommend(user) {
        const hash = VectorService.purchasesHash(user?.purchases ?? []);
        const cached = await this.#vectorService.getUserRecommendations(user?.id, hash);

        if (cached) {
            console.log('Cache hit — recomendações do banco para:', user?.name);
            this.#events.dispatchRecommendationsReady({ user, recommendations: cached });
            return;
        }

        this.#worker.postMessage({ action: workerEvents.recommend, user });
    }

    async #handleUserVectorReady({ user, userVector }) {
        // Etapa 1: busca candidatos por similaridade no banco (pgvector)
        let candidates = await this.#vectorService.findSimilarProducts(userVector, 200);

        // Fallback: usa todos os vetores em memória se pgvector não estiver configurado
        if (!candidates) {
            candidates = (this.#productVectors ?? []).map(pv => ({
                ...pv,
                vector: pv.vector
            }));
        }

        // Etapa 2: worker reranqueia os candidatos com o modelo neural
        this.#worker.postMessage({
            action: workerEvents.rankCandidates,
            user,
            candidates: candidates.map(c => ({ ...c, vector: Array.from(c.vector) }))
        });
    }
}