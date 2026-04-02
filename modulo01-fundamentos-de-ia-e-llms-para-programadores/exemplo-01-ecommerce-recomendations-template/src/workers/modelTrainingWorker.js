import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';

console.log('Model training worker initialized');
let _globalCtx = {};
let _model = null;

const WEIGHTS = {
    category: 0.4,
    color: 0.3,
    price: 0.2,
    age: 0.1
};

const normalize = (value, min, max) => (value - min) / ((max - min) || 1);

function makeContext(products, users) {
    const ages = users.map(u => u.age);
    const prices = products.map(p => p.price);

    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const colors = [...new Set(products.map(p => p.color))];
    const categories = [...new Set(products.map(p => p.category))];

    const colorsIndex = Object.fromEntries(
        colors.map((color, index) => {
            return [color, index]
        })
    );

    const categoriesIndex = Object.fromEntries(
        categories.map((category, index) => {
            return [category, index]
        })
    );

    // computar a média de idade dos compradores por produto (ajuda a personalizar)
    const midAge = (minAge + maxAge) / 2;
    const ageSums = {};
    const ageCounts = {};

    users.forEach(user => {
        user.purchases.forEach(p => {
            ageSums[p.name] = (ageSums[p.name] || 0) + user.age;
            ageCounts[p.name] = (ageCounts[p.name] || 0) + 1;
        });
    });

    const productAvgAgeNorm = Object.fromEntries(
        products.map(product => {
            const avg = ageCounts[product.name] ?
                ageSums[product.name] / ageCounts[product.name] :
                midAge;

            return [product.name, normalize(avg, minAge, maxAge)]
        })
    )
    return {
        products,
        users,
        colorsIndex,
        categoriesIndex,
        productAvgAgeNorm,
        minAge,
        maxAge,
        minPrice,
        maxPrice,
        numCategories: categories.length,
        numColors: colors.length,
        dimentions: 2 + categories.length + colors.length
    }
}

const oneHotWeighted = (index, length, weight) =>
    tf.oneHot(index, length).cast('float32').mul(weight);


// Normalizar em cima dos tensores
function encodeProduct(product, context) {
    // Normalizando o dado para ficar - entre 0 e 1 e aplica o peso na recomendacao
    const price = tf.tensor1d([
        normalize(product.price, context.minPrice, context.maxPrice) * WEIGHTS.price
    ]);

    const age = tf.tensor1d([
        (context.productAvgAgeNorm[product.name] ?? 0.5) * WEIGHTS.age
    ]);

    const category = oneHotWeighted(
        context.categoriesIndex[product.category],
        context.numCategories,
        WEIGHTS.category
    );

    const color = oneHotWeighted(
        context.colorsIndex[product.color],
        context.numColors,
        WEIGHTS.color
    );

    return tf.concat1d(
        [price, age, category, color]
    )
}

function encodeUser(user, context) {
    // Retornar o perfil de compra do usuario especifico
    if (user.purchases.length) {
        return tf.stack(user.purchases.map(
            product => encodeProduct(product, context)
        )).mean(0)
            .reshape([1, context.dimentions]);
    }

    return tf.concat1d([
        tf.zeros([1]), // preço ignorados
        tf.tensor1d([normalize(user.age, context.minAge, context.maxAge) * WEIGHTS.age]), // idade normalizada
        tf.zeros([context.numCategories]), // categoria ignorada,
        tf.zeros([context.numColors]), // cor ignorada,
    ]).reshape([1, context.dimentions]);
}

// Gerar dados de treinamento dos usuarios ativos
function createTrainingData(context) {
    const inputs = [];
    const labels = [];

    context.users
        .filter(user => user.purchases.length)
        .forEach(user => {
            const userVector = encodeUser(user, context).dataSync();
            context.products.forEach(product => {
                const productVector = encodeProduct(product, context).dataSync();
                const label = user.purchases.some(purchase => purchase.name === product.name) ? 1 : 0;
                inputs.push([...userVector, ...productVector])
                labels.push(label);
            });
        });

    return {
        xs: tf.tensor2d(inputs),
        ys: tf.tensor1d(labels),
        inputDimention: context.dimentions * 2 // user vector + product vector
    };
}

// Configurar a rede neural e treinar o modelo
async function configureNeuralNetAndTrain(trainData) {
    const model = tf.sequential();

    // - inputShape: Número de features por exemplo de treino (trainData.inputDim) - 
    // Exemplo: Se o vetor produto + usuário = 20 números, então inputDim = 20
    // - units: 128 neurônios
    // - activation: 'relu' (mantém apenas sinais positivos, ajuda a aprender padrões não-lineares)

    model.add(tf.layers.dense({
        inputShape: [trainData.inputDimention], units: 128, activation: 'relu'
    }));

    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));

    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));


    // Camada de saída
    // - 1 neurônio porque vamos retornar apenas uma pontuação de recomendação
    // - activation: 'sigmoid' comprime o resultado para o intervalo 0–1
    //   Exemplo: 0.9 (90%) = recomendação forte, 0.1 (10%) = recomendação fraca

    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({
        optimizer: tf.train.adam(0.001), // Algoritmo de otimização para ajustar os pesos da rede
        loss: 'binaryCrossentropy', // Função de perda para problemas de classificação binária
        metrics: ['accuracy'] // Métrica para avaliar o desempenho do modelo durante o treinamento
    });

    await model.fit(trainData.xs, trainData.ys, {
        epochs: 100, // Número de vezes que o modelo verá todo o conjunto de dados de treinamento
        batchSize: 32, // Número de exemplos processados antes de atualizar os pesos do modelo
        shuffle: true, // Embaralha os dados a cada época para melhorar a generalização
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                postMessage({
                    type: workerEvents.trainingLog,
                    epoch: epoch,
                    loss: logs.loss,
                    accuracy: logs.acc
                });
            }
        }
    });

    return model;
}

async function trainModel({ users }) {
    console.log('Training model with users:', users)

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 50 } });
    const products = await (await fetch('/data/products.json')).json();
    const context = makeContext(products, users);
    context.productVectors = products.map(product => {
        return {
            name: product.name,
            meta: { ...product },
            vector: encodeProduct(product, context).dataSync()
        }
    });

    _globalCtx = context;

    const trainData = createTrainingData(context)
    _model = await configureNeuralNetAndTrain(trainData);

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({ type: workerEvents.trainingComplete });
}

function recommend(user) {
    if (!_model) return;

    const context = _globalCtx;

    // 1️⃣ Converta o usuário fornecido no vetor features codificadas;
    //  (preço, ignorado), idade normalizada, categorias ignoradas, cores ignoradas)
    //  Isso transforma as informações do usuário no mesmo formato número que foi usado para treinar o modelo, 
    //  permitindo que ele faça previsões precisas com base no histórico de compras do usuário e nas características dos produtos.
    const userVector = encodeUser(user, context).dataSync()

    // 2️⃣ Crie pares de entrada: Para cada produto, concatene o vetor do usuário
    //  com o vetor codificado do produto. Por que? o modelo prevê o "score de compatibilidade" para cada par (usuario, produto);
    const inputs = context.productVectors.map(({ vector }) => {
        return [...userVector, ...vector]
    });

    // 3️⃣ Converta todos esses pares (usuário, produto) em um único Tensor.
    //  Formato: [numProdutos, inputDim]
    const inputTensor = tf.tensor2d(inputs)

    // 4️⃣ Rode a rede neural treinada em todos os pares (usuário, produto) de uma vez.
    //  O resultado é uma pontuação para cada produto entre 0 e 1.
    //  Quanto maior, maior a probabilidade do usuário querer aquele produto.
    const predictions = _model.predict(inputTensor)

    // 5️⃣ Extraia as pontuações para um array JS normal.
    const scores = predictions.dataSync()

    // 8️⃣ Envie a lista ordenada de produtos recomendados
    //    para a thread principal (a UI pode exibi-los agora).
    const recommendations = context.productVectors.map((item, index) => {
        return {
            ...item.meta,
            name: item.name,
            score: scores[index] // previsão do modelo para este produto
        }
    })

    const sortedItems = recommendations
        .sort((a, b) => b.score - a.score)

    debugger

    console.log('will recommend for user:', user)
    postMessage({
        type: workerEvents.recommend,
        user,
        recommendations: sortedItems
    });

}


const handlers = {
    [workerEvents.trainModel]: trainModel,
    [workerEvents.recommend]: d => recommend(d.user, _globalCtx),
};

self.onmessage = e => {
    const { action, ...data } = e.data;
    if (handlers[action]) handlers[action](data);
};
