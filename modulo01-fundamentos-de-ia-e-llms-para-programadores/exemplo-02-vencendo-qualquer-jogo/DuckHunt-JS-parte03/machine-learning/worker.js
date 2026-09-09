importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest');

const MODEL_PATH = `yolov5n_web_model/model.json`;
const LABELS_PATH = `yolov5n_web_model/labels.json`;
const DEFAULT_INPUT_MODEL_DIMENTIONS = 640
const CLASS_THRESHOLD = 0.22;
const TARGET_LABELS = new Set(['kite', 'bird']);

let _labels = [];
let _model = null;
let _inputModelDimentions = DEFAULT_INPUT_MODEL_DIMENTIONS;

async function loadModelAndLabels() {
    await tf.ready();

    _labels = await (await fetch(LABELS_PATH)).json();
    _model = await tf.loadGraphModel(MODEL_PATH);

    const inputShape = _model.inputs && _model.inputs[0] ? _model.inputs[0].shape : null;
    if (Array.isArray(inputShape)) {
        const inferredHeight = Number(inputShape[1]);
        const inferredWidth = Number(inputShape[2]);
        if (Number.isFinite(inferredHeight) && Number.isFinite(inferredWidth) && inferredHeight === inferredWidth) {
            _inputModelDimentions = inferredHeight;
        }
    }

    const dummyInput = tf.ones(_model.inputs[0].shape);
    await _model.executeAsync(dummyInput);
    tf.dispose(dummyInput);

    postMessage({ type: 'model-loaded' });
}

function preprocessImage(input) {
    return tf.tidy(() => {
        const image = tf.browser.fromPixels(input);

        return tf.image
            .resizeBilinear(image, [_inputModelDimentions, _inputModelDimentions])
            .div(255)
            .expandDims(0);
    });
}

async function runInference(tensor) {
    const output = await _model.executeAsync(tensor);
    tf.dispose(tensor);

    const [boxes, scores, classes] = output.slice(0, 3);
    const [boxesData, scoresData, classesData] = await Promise.all([
        boxes.data(),
        scores.data(),
        classes.data(),
    ]);

    output.forEach((t) => t.dispose());

    return {
        boxes: boxesData,
        scores: scoresData,
        classes: classesData,
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function toPixels(value, outputSize, modelInputSize, isNormalized) {
    if (isNormalized) return value * outputSize;
    return (value / modelInputSize) * outputSize;
}

function processPrediction({ boxes, scores, classes }, width, height) {
    let bestPrediction = null;

    for (let index = 0; index < scores.length; index++) {
        const score = scores[index];
        if (score < CLASS_THRESHOLD) continue;

        const classIndex = Math.max(
            0,
            Math.min(_labels.length - 1, Math.round(classes[index]))
        );
        const label = _labels[classIndex];
        if (!TARGET_LABELS.has(label)) continue;

        const [rawX1, rawY1, rawX2, rawY2] = boxes.slice(index * 4, (index + 1) * 4);

        const maxAbsRaw = Math.max(
            Math.abs(rawX1),
            Math.abs(rawX2),
            Math.abs(rawY1),
            Math.abs(rawY2)
        );
        const isNormalized = maxAbsRaw <= 1.5;

        const x1 = toPixels(rawX1, width, _inputModelDimentions, isNormalized);
        const x2 = toPixels(rawX2, width, _inputModelDimentions, isNormalized);
        const y1 = toPixels(rawY1, height, _inputModelDimentions, isNormalized);
        const y2 = toPixels(rawY2, height, _inputModelDimentions, isNormalized);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        const centerX = clamp((minX + maxX) / 2, 0, width);
        const centerY = clamp((minY + maxY) / 2, 0, height);

        const prediction = {
            x: centerX,
            y: centerY,
            xNorm: width > 0 ? centerX / width : 0,
            yNorm: height > 0 ? centerY / height : 0,
            label,
            score: (score * 100).toFixed(2),
            _rawScore: score,
        };

        if (!bestPrediction || prediction._rawScore > bestPrediction._rawScore) {
            bestPrediction = prediction;
        }
    }

    if (!bestPrediction) return null;

    const { _rawScore, ...result } = bestPrediction;
    return result;
}

loadModelAndLabels();

self.onmessage = async ({ data }) => {
    if (data.type !== 'predict') return;
    if (!_model) return;

    const startedAt = Date.now();

    try {
        const input = preprocessImage(data.image);
        const { width, height } = data.image;

        const inferenceResults = await runInference(input);
        const prediction = processPrediction(inferenceResults, width, height);

        if (prediction) {
            postMessage({
                type: 'prediction',
                ...prediction,
            });
        }
    } catch (error) {
        postMessage({
            type: 'inference-error',
            message: error && error.message ? error.message : 'unknown worker error',
        });
    } finally {
        if (data.image && typeof data.image.close === 'function') {
            data.image.close();
        }

        postMessage({
            type: 'inference-complete',
            durationMs: Date.now() - startedAt,
        });
    }
};

console.log('YOLOv5n Web Worker initialized');
