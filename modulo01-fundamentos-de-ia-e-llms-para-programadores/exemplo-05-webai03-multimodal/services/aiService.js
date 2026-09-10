export class AIService {
    constructor() {
        this.session = null;
        this.abortController = null;
    }

    getLanguageModelApi() {
        if (typeof LanguageModel !== 'undefined') {
            return LanguageModel;
        }

        if (globalThis.ai && globalThis.ai.languageModel) {
            return globalThis.ai.languageModel;
        }

        return null;
    }

    async getAvailability(languageModelApi, options) {
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

    async checkRequirements() {
        const errors = [];
        const languageModelApi = this.getLanguageModelApi();

        // @ts-ignore
        const isChrome = !!window.chrome;
        if (!isChrome) {
            errors.push("⚠️ Este recurso só funciona no Google Chrome ou Chrome Canary (versão recente).");
        }

        if (!languageModelApi) {
            errors.push("⚠️ As APIs nativas de IA não estão ativas.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Prompt API for Gemini Nano (chrome://flags/#prompt-api-for-gemini-nano)");
            errors.push("Depois reinicie o Chrome e tente novamente.");
            return errors;
        }

        // Check Translator availability
        if ('Translator' in self) {
            const translatorAvailability = await Translator.availability({
                sourceLanguage: 'en',
                targetLanguage: 'pt'
            });
            console.log('Translator Availability:', translatorAvailability);

            if (translatorAvailability === 'no') {
                errors.push("⚠️ Tradução de inglês para português não está disponível.");
            }
        } else {
            errors.push("⚠️ A API de Tradução não está ativa.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Translation API (chrome://flags/#translation-api)");
        }

        // Check Language Detection API
        if (!('LanguageDetector' in self)) {
            errors.push("⚠️ A API de Detecção de Idioma não está ativa.");
            errors.push("Ative a seguinte flag em chrome://flags/:");
            errors.push("- Language Detection API (chrome://flags/#language-detector-api)");
        }

        if (errors.length > 0) {
            return errors;
        }

        const availability = await this.getAvailability(languageModelApi, { languages: ["en"] });
        console.log('Language Model Availability:', availability);

        if (availability === 'available') {
            return null;
        }

        if (availability === 'unavailable') {
            errors.push(`⚠️ O seu dispositivo não suporta modelos de linguagem nativos de IA.`);
        }

        if (availability === 'downloading') {
            return null;
        }

        if (availability === 'downloadable') {
            return null;
        }

        return errors.length > 0 ? errors : null;
    }

    async getParams() {
        const defaults = {
            defaultTemperature: 1,
            maxTemperature: 2,
            defaultTopK: 3,
            maxTopK: 128,
        };

        const languageModelApi = this.getLanguageModelApi();
        if (!languageModelApi || typeof languageModelApi.params !== 'function') {
            console.warn('LanguageModel.params() indisponivel. Usando padrao.');
            return defaults;
        }

        try {
            const params = await languageModelApi.params();
            console.log('Language Model Params:', params);
            return {
                defaultTemperature: params?.defaultTemperature ?? defaults.defaultTemperature,
                maxTemperature: params?.maxTemperature ?? defaults.maxTemperature,
                defaultTopK: params?.defaultTopK ?? defaults.defaultTopK,
                maxTopK: params?.maxTopK ?? defaults.maxTopK,
            };
        } catch (error) {
            console.warn('Falha ao obter params(). Usando padrao.', error);
            return defaults;
        }
    }

    async* createSession(question, temperature, topK, file = null) {
        this.abortController?.abort();
        this.abortController = new AbortController();

        // Destroy previous session and create new one with updated parameters
        if (this.session) {
            this.session.destroy();
        }

        const languageModelApi = this.getLanguageModelApi();
        if (!languageModelApi) {
            throw new Error('API de Language Model nao encontrada neste navegador.');
        }

        this.session = await languageModelApi.create({
            expectedInputs: [
                { type: "text", languages: ["en"] },
                { type: "audio" },
                { type: "image" },
            ],
            expectedOutputs: [{ type: "text", languages: ["en"] }],
            temperature: temperature,
            topK: topK,
            initialPrompts: [
                {
                    role: 'system',
                    content: [{
                        type: "text",
                        value: `You are an AI assistant that responds clearly and objectively.
                        Always respond in plain text format instead of markdown.`
                    }]
                },
            ],
        });

        // Build content array with text and optional file
        const contentArray = [{ type: "text", value: question }];

        if (file) {
            const fileType = file.type.split('/')[0];
            if (fileType === 'image' || fileType === 'audio') {
                // Convert file to blob for proper handling
                const blob = new Blob([await file.arrayBuffer()], { type: file.type });
                contentArray.push({ type: fileType, value: blob });
                console.log(`Adding ${fileType} to prompt:`, file.name);
            }
        }

        const responseStream = await this.session.promptStreaming(
            [
                {
                    role: 'user',
                    content: contentArray,
                },
            ],
            {
                signal: this.abortController.signal,
            }
        );

        for await (const chunk of responseStream) {
            if (this.abortController.signal.aborted) {
                break;
            }
            yield chunk;
        }
    }

    abort() {
        this.abortController?.abort();
    }

    isAborted() {
        return this.abortController?.signal.aborted;
    }
}
