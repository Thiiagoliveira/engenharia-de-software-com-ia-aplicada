export const events = {
    userSelected: 'user:selected',
    usersUpdated: 'users:updated',
    purchaseAdded: 'purchase:added',
    purchaseRemoved: 'purchase:remove',
    modelTrain: 'training:train',
    trainingComplete: 'training:complete',

    modelProgressUpdate: 'model:progress-update',
    recommendationsReady: 'recommendations:ready',
    recommend: 'recommend',
}

export const workerEvents = {
    trainingComplete: 'training:complete',
    trainModel: 'train:model',
    recommend: 'recommend',
    trainingLog: 'training:log',
    progressUpdate: 'progress:update',
    tfVisData: 'tfvis:data',
    tfVisLogs: 'tfvis:logs',
    // persistência de vetores no banco
    vectorsSave: 'vectors:save',
    vectorsLoad: 'vectors:load',
    // busca de candidatos em 2 etapas (pgvector → reranking pelo modelo)
    userVectorReady: 'user:vector-ready',
    rankCandidates: 'rank:candidates',
}