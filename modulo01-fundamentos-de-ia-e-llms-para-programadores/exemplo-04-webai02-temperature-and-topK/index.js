
const aiContext = {
    session: null,
    abortController: null,
    isGenerating: false,
};

const elements = {
    temperature: document.getElementById('temperature'),
    temperatureValue: document.getElementById('temp-value'),
    topKValue: document.getElementById('topk-value'),
    topK: document.getElementById('topK'),
    form: document.getElementById('question-form'),
    questionInput: document.getElementById('question'),
    output: document.getElementById('output'),
    button: document.getElementById('ask-button'),
    year: document.getElementById('year'),
}

function getLanguageModelApi() {
    if (typeof LanguageModel !== 'undefined') {
        return LanguageModel;
    }

    if (globalThis.ai && globalThis.ai.languageModel) {
        return globalThis.ai.languageModel;
    }

    return null;
}

async function getAvailability(languageModelApi, options) {
    const attempts = [
        async () => languageModelApi.availability(options),
        async () => languageModelApi.availability(),
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Falha ao consultar disponibilidade do modelo.');
}

async function getGenerationParams(languageModelApi) {
    const defaults = {
        defaultTemperature: 1,
        maxTemperature: 2,
        defaultTopK: 3,
        maxTopK: 128,
    };

    // Newer API variants may not expose params(). Keep fixed safe limits.
    return defaults;
}

async function setupEventListeners() {

    // Update display values for range inputs
    elements.temperature.addEventListener('input', (e) => {
        elements.temperatureValue.textContent = e.target.value;
    });

    elements.topK.addEventListener('input', (e) => {
        elements.topKValue.textContent = e.target.value;
    });

    elements.form.addEventListener('submit', async function (event) {
        event.preventDefault();

        if (aiContext.isGenerating) {
            toggleSendOrStopButton(false)
            return;
        }

        onSubmitQuestion();
    });
}

async function onSubmitQuestion() {
    const questionInput = elements.questionInput;
    const output = elements.output;
    const question = questionInput.value;

    if (!question.trim()) {
        return;
    }

    // Get parameters from form
    const temperature = parseFloat(elements.temperature.value);
    const topK = parseInt(elements.topK.value);
    console.log('Using parameters:', { temperature, topK });

    // Change button to stop mode
    toggleSendOrStopButton(true)

    output.textContent = 'Processing your question...';
    const aiResponseChunks = await askAI(question, temperature, topK);
    output.textContent = '';

    for await (const chunk of aiResponseChunks) {
        if (aiContext.abortController.signal.aborted) {
            break;
        }
        console.log('Received chunk:', chunk);
        output.textContent += chunk;
    }

   toggleSendOrStopButton(false);
}

function toggleSendOrStopButton(isGenerating) {
    if (isGenerating) {
        // Switch to stop mode
        aiContext.isGenerating = isGenerating;
        elements.button.textContent = 'Parar';
        elements.button.classList.add('stop-button');
    } else {
        // Switch to send mode
        aiContext.abortController?.abort();
        aiContext.isGenerating = isGenerating;
        elements.button.textContent = 'Enviar';
        elements.button.classList.remove('stop-button');
    }
}
async function* askAI(question, temperature, topK) {
    aiContext.abortController?.abort();
    aiContext.abortController = new AbortController();

    // Destroy previous session and create new one with updated parameters
    if (aiContext.session) {
        aiContext.session.destroy();
    }

    const languageModelApi = getLanguageModelApi();
    if (!languageModelApi) {
        throw new Error('API de Language Model não encontrada neste navegador.');
    }

    const preferredModel = 'nano_v3_gpu_component';
    let session;
    try {
        session = await languageModelApi.create({
            model: preferredModel,
            expectedInputLanguages: ["pt"],
            temperature: temperature,
            topK: topK,
            initialPrompts: [
                {
                    role: 'system', content: `
                Você é um assistente de IA que responde de forma clara e objetiva.
                Responda sempre em formato de texto ao invés de markdown`

                },
            ],
        });
    } catch (err) {
        console.warn('Falha ao criar sessão com modelo preferido, tentando sem especificar modelo:', err);
        session = await languageModelApi.create({
            expectedInputLanguages: ["pt"],
            temperature: temperature,
            topK: topK,
            initialPrompts: [
                {
                    role: 'system', content: `
                Você é um assistente de IA que responde de forma clara e objetiva.
                Responda sempre em formato de texto ao invés de markdown`

                },
            ],
        });
    }

    const responseStream = await session.promptStreaming(
        [
            {
                role: 'user',
                content: question,
            },
        ],
        {
            signal: aiContext.abortController.signal,
        }
    );

    for await (const chunk of responseStream) {
        if (aiContext.abortController.signal.aborted) {
            break;
        }
        yield chunk;
    }
}

async function checkRequirements() {
    const errors = [];
    const returnResults = () => errors.length ? errors : null;
    const languageModelApi = getLanguageModelApi();

    // @ts-ignore
    const isChrome = !!window.chrome;
    if (!isChrome)
        errors.push("⚠️ Este recurso só funciona no Google Chrome ou Chrome Canary (versão recente).");
    if (!languageModelApi) {
        errors.push("⚠️ As APIs nativas de IA não estão ativas.");
        errors.push("Ative a seguinte flag em chrome://flags/:");
        errors.push("- Prompt API for Gemini Nano (chrome://flags/#prompt-api-for-gemini-nano)");
        errors.push("Depois reinicie o Chrome e tente novamente.");
        return returnResults();
    }

    const availability = await getAvailability(languageModelApi, { languages: ["pt"] });
    console.log('Language Model Availability:', availability);
    if (availability === 'available') {
        return returnResults();
    }

    if (availability === 'unavailable') {
        errors.push(`⚠️ O seu dispositivo não suporta modelos de linguagem nativos de IA.`);
    }

    if (availability === 'downloading') {
        errors.push(`⚠️ O modelo de linguagem de IA está sendo baixado. Por favor, aguarde alguns minutos e tente novamente.`);
    }

    if (availability === 'downloadable') {
        errors.push(`⚠️ O modelo de linguagem de IA precisa ser baixado, baixando agora... (acompanhe o progresso no terminal do chrome)`);
        try {
            const session = await languageModelApi.create({
                expectedInputLanguages: ["pt"],
                monitor(m) {
                    m.addEventListener('downloadprogress', (e) => {
                        const percent = ((e.loaded / e.total) * 100).toFixed(0);
                        console.log(`Downloaded ${percent}%`);
                    });
                }
            });
            await session.prompt('Olá');
            session.destroy();

            // Re-check availability after download
            const newAvailability = await getAvailability(languageModelApi, { languages: ["pt"] });
            if (newAvailability === 'available') {
                return null; // Download successful
            }
        } catch (error) {
            console.error('Error downloading model:', error);
            errors.push(`⚠️ Erro ao baixar o modelo: ${error.message}`);
        }
    }

    return returnResults();

}

(async function main() {
    elements.year.textContent = new Date().getFullYear();

    const reqErrors = await checkRequirements();
    if (reqErrors) {
        elements.output.innerHTML = reqErrors.join('<br/>');
        elements.button.disabled = true;
        return;
    }

    const languageModelApi = getLanguageModelApi();
    const params = await getGenerationParams(languageModelApi);
    console.log('Language Model Params:', params);
    /*
    defaultTemperature: 1
    defaultTopK:3
    maxTemperature:2
    maxTopK:128
    */

    elements.topK.max = params.maxTopK;
    elements.topK.min = 1;
    elements.topK.value = params.defaultTopK;
    elements.topKValue.textContent = params.defaultTopK;

    elements.temperatureValue.textContent = params.defaultTemperature;
    elements.temperature.max = params.maxTemperature;
    elements.temperature.min = 0;
    elements.temperature.value = params.defaultTemperature;
    return setupEventListeners()
})();

