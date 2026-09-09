import { buildLayout } from "./layout";

const ASSIST_RADIUS = 140;
const AIM_SMOOTHING = 0.88;
const MIN_SHOT_INTERVAL_MS = 420;
const MIN_SHOT_MOVE_DISTANCE = 20;
const PREDICT_INTERVAL_MS = 90;

function getAliveDucks(stage) {
    return (stage.ducks || []).filter((duck) => duck.alive && duck.visible);
}

function getNearestDuck(stage, x, y) {
    const ducks = getAliveDucks(stage);
    let best = null;

    for (const duck of ducks) {
        const dx = duck.position.x - x;
        const dy = duck.position.y - y;
        const distance = Math.hypot(dx, dy);

        if (!best || distance < best.distance) {
            best = { duck, distance };
        }
    }

    return best;
}

function lerp(from, to, t) {
    return from + (to - from) * t;
}

export default async function main(game) {
    const container = buildLayout(game.app);
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const stageWidth = game.stage.aim.maxX || 800;
    const stageHeight = game.stage.aim.maxY || 600;
    let lastAimPoint = null;
    let lastShotAt = 0;
    let lastShotPoint = null;
    let lastShotDuck = null;
    let modelReady = false;
    let inferenceInFlight = false;

    game.stage.aim.visible = false;

    worker.onerror = (error) => {
        inferenceInFlight = false;
        console.error('Worker inference error:', error.message || error);
    };

    worker.onmessage = ({ data }) => {
        const { type } = data;

        if (type === 'model-loaded') {
            modelReady = true;
            return;
        }

        if (type === 'inference-complete') {
            inferenceInFlight = false;
            return;
        }

        if (type === 'inference-error') {
            console.error('Worker inference error:', data.message || 'unknown');
            return;
        }

        if (type !== 'prediction') return;

        const { x, y, xNorm, yNorm } = data;
        const predictedX = typeof xNorm === 'number' ? xNorm * stageWidth : x;
        const predictedY = typeof yNorm === 'number' ? yNorm * stageHeight : y;

        let targetX = predictedX;
        let targetY = predictedY;

        const nearest = getNearestDuck(game.stage, predictedX, predictedY);
        if (nearest && nearest.distance <= ASSIST_RADIUS) {
            targetX = nearest.duck.position.x;
            targetY = nearest.duck.position.y;
        }

        if (lastAimPoint) {
            targetX = lerp(lastAimPoint.x, targetX, AIM_SMOOTHING);
            targetY = lerp(lastAimPoint.y, targetY, AIM_SMOOTHING);
        }
        lastAimPoint = { x: targetX, y: targetY };

        const now = Date.now();
        const hasAmmo = game.bullets > 0;
        const enoughTimeSinceShot = (now - lastShotAt) >= MIN_SHOT_INTERVAL_MS;
        const movedSinceLastShot = !lastShotPoint || Math.hypot(
            targetX - lastShotPoint.x,
            targetY - lastShotPoint.y
        ) >= MIN_SHOT_MOVE_DISTANCE;
        const changedDuck = !!nearest && nearest.duck !== lastShotDuck;
        const hasLiveTarget = !!nearest && nearest.distance <= ASSIST_RADIUS;
        const cadenceReady = enoughTimeSinceShot && (movedSinceLastShot || changedDuck);
        const canShoot = hasAmmo && hasLiveTarget && cadenceReady;

        container.updateHUD({
            ...data,
            x: targetX,
            y: targetY,
        });

        game.stage.aim.visible = true;
        game.stage.aim.setPosition(targetX, targetY);

        if (canShoot) {
            const position = game.stage.aim.getGlobalPosition();
            game.handleClick({ global: position });

            lastShotAt = now;
            lastShotPoint = { x: targetX, y: targetY };
            lastShotDuck = nearest ? nearest.duck : null;
        }
    };

    setInterval(async () => {
        if (!modelReady || inferenceInFlight) return;

        inferenceInFlight = true;

        try {
            const canvas = game.app.renderer.extract.canvas(game.stage);
            const bitmap = await createImageBitmap(canvas);

            worker.postMessage({
                type: 'predict',
                image: bitmap,
            }, [bitmap]);
        } catch (error) {
            inferenceInFlight = false;
            console.error('Prediction capture failed:', error.message || error);
        }
    }, PREDICT_INTERVAL_MS);

    return container;
}
