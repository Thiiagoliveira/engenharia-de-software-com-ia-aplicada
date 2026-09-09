const input = document.getElementById("questionInput");
const sendBtn = document.getElementById("sendBtn");
const statusEl = document.getElementById("status");
const conversationEl = document.getElementById("conversation");
const preferredModels = [
    "prompt_api_gemma4_12b",
    "gemma4_12b_gpu_high_tier_model",
    "gemma4_gpu_high_tier_model"
];

let session = null;
let busy = false;

async function getAvailabilityForModel(modelName) {
    const attempts = [];

    if (modelName) {
        attempts.push(async function () {
            return await LanguageModel.availability({ model: modelName });
        });
        attempts.push(async function () {
            return await LanguageModel.availability(modelName);
        });
    }

    let lastError = null;
    for (const run of attempts) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Nao foi possivel consultar disponibilidade do modelo.");
}

async function createSessionWithModel(modelName, baseOptions) {
    if (modelName) {
        const optionsWithModel = {
            model: modelName,
            ...baseOptions,
            monitor: function (m) {
                m.addEventListener("downloadprogress", function (event) {
                    const progress = Number.isFinite(event.loaded) ? Math.round(event.loaded * 100) : null;
                    statusEl.textContent = progress === null
                        ? "Baixando modelo Gemma 4..."
                        : "Baixando modelo Gemma 4... " + progress + "%";
                });
            }
        };

        try {
            return await LanguageModel.create(optionsWithModel);
        } catch (error) {
            console.warn("Falha ao criar sessao com monitor; tentando sem monitor.", error);
            return await LanguageModel.create({ model: modelName, ...baseOptions });
        }
    }

    throw new Error("Nenhum modelo Gemma 4 selecionado.");
}

async function selectWorkingModel() {
    const statuses = [];
    let downloadableCandidate = null;

    for (const modelName of preferredModels) {
        try {
            const availability = await getAvailabilityForModel(modelName);
            statuses.push({ modelName, availability });
            console.log("Availability:", availability, "Model:", modelName);

            if (availability === "available") {
                return { modelName, statuses };
            }

            if (!downloadableCandidate && (availability === "downloadable" || availability === "downloading")) {
                downloadableCandidate = modelName;
            }
        } catch (error) {
            statuses.push({ modelName, availability: "error", error });
            console.warn("Erro verificando modelo:", modelName, error);
        }
    }

    if (downloadableCandidate) {
        return { modelName: downloadableCandidate, statuses, needsDownload: true };
    }

    return { modelName: null, statuses, unavailable: true };
}

async function initSession() {
    if (typeof LanguageModel === "undefined") {
        throw new Error("LanguageModel indisponivel neste navegador/aba.");
    }

    const initialPrompts = [
        {
            role: "system",
            content: "Voce e um assistente de IA que responde de forma clara e objetiva."
        }
    ];

    const baseOptions = {
        expectedInputLanguages: ["pt"],
        temperature: 0.3,
        topK: 128,
        initialPrompts
    };

    const selected = await selectWorkingModel();
    if (selected.unavailable) {
        const summary = selected.statuses
            .map(function (s) { return s.modelName + ": " + s.availability; })
            .join(" | ");
        throw new Error("Nenhum modelo disponivel agora. Status: " + summary);
    }

    if (selected.needsDownload) {
        statusEl.textContent = "Modelo Gemma 4 encontrado. Iniciando download...";
    }

    session = await createSessionWithModel(selected.modelName, baseOptions);
    const activeModel = selected.modelName;
    statusEl.textContent = "Modelo ativo: " + activeModel;
}

function createTurn(question) {
    const turnEl = document.createElement("article");
    turnEl.className = "turn";

    const userLabel = document.createElement("div");
    userLabel.className = "label";
    userLabel.textContent = "Pergunta";

    const userText = document.createElement("div");
    userText.className = "user";
    userText.textContent = question;

    const assistantLabel = document.createElement("div");
    assistantLabel.className = "label";
    assistantLabel.textContent = "Resposta";

    const assistantText = document.createElement("div");
    assistantText.className = "assistant";
    assistantText.textContent = "Gerando resposta...";

    turnEl.appendChild(userLabel);
    turnEl.appendChild(userText);
    turnEl.appendChild(assistantLabel);
    turnEl.appendChild(assistantText);

    // Newest conversation is inserted at the top.
    conversationEl.prepend(turnEl);

    return assistantText;
}

async function ask() {
    if (busy) return;

    const question = input.value.trim();
    if (!question) return;

    busy = true;
    input.value = "";
    sendBtn.disabled = true;
    statusEl.textContent = "Gerando resposta...";

    try {
        if (!session) {
            await initSession();
        }

        const answerEl = createTurn(question);
        const responseStream = await session.promptStreaming([
            {
                role: "user",
                content: question
            }
        ]);

        let fullText = "";
        for await (const token of responseStream) {
            fullText += token;
            answerEl.innerHTML = markdown.toHTML(fullText);
        }

        statusEl.textContent = "Pronto.";
    } catch (error) {
        console.error(error);
        statusEl.textContent = "Erro: " + error.message;
    } finally {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

sendBtn.addEventListener("click", ask);
input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        ask();
    }
});

statusEl.textContent = "Pronto para perguntar.";
input.focus();
