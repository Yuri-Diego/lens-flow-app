import { withTransaction } from "../db/transaction.js";
import Movement from "../models/Movement.js";
import MovementBatch from "../models/MovementBatch.js";
import { clock } from "../utils/clock.js";
import { AppError, conflict, forbidden, isDuplicateKeyError, notFound } from "../utils/errors.js";
import { MOVEMENT_FIELDS, presentMovements } from "./movementPresenter.js";
import {
    applyCheckout,
    applyRelease,
    findActiveMovement,
    revertCheckout,
    revertRelease,
} from "./movementService.js";

const DUPLICATE_IN_BATCH = Object.freeze({
    code: "DUPLICATE_IN_BATCH",
    message: "Serviço repetido neste lote.",
});

/**
 * Aplica a ação do lote num serviço e devolve os passos feitos. Em
 * "checkout-and-release", um serviço que já saiu (por outra pessoa, por
 * exemplo) só tem a caixa liberada: o resultado é o mesmo, saiu e liberada.
 */
async function applyBatchAction(auth, movement, action, context) {
    const { now } = context;
    if (action === "checkout") {
        return { movement: await applyCheckout(auth, movement, context), steps: [{ action, at: now }] };
    }
    if (action === "release-box") {
        return { movement: await applyRelease(auth, movement, context), steps: [{ action, at: now }] };
    }
    if (movement.status === "out" && movement.boxReleasedAt) {
        throw conflict("Esse serviço já saiu e a caixa já foi liberada.");
    }
    const steps = [];
    let current = movement;
    if (current.status === "open") {
        current = await applyCheckout(auth, current, context);
        steps.push({ action: "checkout", at: now });
    }
    current = await applyRelease(auth, current, context);
    steps.push({ action: "release-box", at: now });
    return { movement: current, steps };
}

function failure(error) {
    return { code: error.code, message: error.message };
}

function summarize(results) {
    const succeeded = results.filter((result) => result.ok).length;
    return { requested: results.length, succeeded, failed: results.length - succeeded };
}

/** Troca os serviços dos itens certos pelo formato público (uma consulta de nomes). */
async function presentResults(auth, results, movementsById) {
    const movements = [...movementsById.values()];
    const presented = await presentMovements(auth, movements);
    const byId = new Map(presented.map((movement) => [movement.id, movement]));
    return results.map((result) => {
        if (!result.ok) {
            return { id: result.id, ok: false, error: result.error };
        }
        const movement = byId.get(result.id);
        return movement
            ? { id: result.id, ok: true, movement }
            : { id: result.id, ok: false, error: failure(notFound("Serviço não encontrado.")) };
    });
}

/** Repetição de um lote com a mesma chave (R13): o resultado do primeiro. */
async function replayBatch(auth, clientRequestId) {
    const batch = await MovementBatch.findOne({
        business: auth.businessId,
        user: auth.userId,
        clientRequestId,
    }).lean();
    if (!batch) {
        return null;
    }
    if (!batch.completedAt) {
        throw conflict("Esse lote ainda está sendo processado. Tente de novo em instantes.");
    }
    const okIds = batch.results.filter((result) => result.ok).map((result) => result.id);
    const movements = await Movement.find({
        _id: { $in: okIds },
        business: auth.businessId,
        deletedAt: null,
    })
        .select(MOVEMENT_FIELDS)
        .lean();
    const movementsById = new Map(movements.map((movement) => [String(movement._id), movement]));
    const results = await presentResults(auth, batch.results, movementsById);
    return { batchId: String(batch._id), action: batch.action, results, summary: summarize(results) };
}

async function createBatchRecord(auth, action, clientRequestId) {
    try {
        return await MovementBatch.create({
            business: auth.businessId,
            user: auth.userId,
            action,
            clientRequestId: clientRequestId ?? null,
        });
    } catch (error) {
        if (clientRequestId && isDuplicateKeyError(error)) {
            return null;
        }
        throw error;
    }
}

/**
 * POST /movements/batch (D6, RN-09): baixa, liberação ou as duas, item a item.
 *
 * Cada serviço roda na própria transação, junto com o histórico e o registro
 * do passo no lote: uma falha não desfaz os outros (falha parcial permitida).
 * Os itens são feitos em sequência, no máximo 100; um erro inesperado (500)
 * para o lote, e o que já foi feito continua registrado para o desfazer.
 */
export async function runBatch(auth, { ids, action, clientRequestId }) {
    if (clientRequestId) {
        const replay = await replayBatch(auth, clientRequestId);
        if (replay) {
            return replay;
        }
    }
    const batch = await createBatchRecord(auth, action, clientRequestId);
    if (!batch) {
        return replayBatch(auth, clientRequestId);
    }

    const results = [];
    const movementsById = new Map();
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id)) {
            results.push({ id, ok: false, error: DUPLICATE_IN_BATCH });
            continue;
        }
        seen.add(id);
        try {
            const movement = await withTransaction(async (session) => {
                const now = clock.now();
                const current = await findActiveMovement(auth, id, session);
                const applied = await applyBatchAction(auth, current, action, {
                    session,
                    now,
                    batchId: batch._id,
                });
                await MovementBatch.updateOne(
                    { _id: batch._id },
                    { $push: { items: { movement: current._id, steps: applied.steps } } },
                    { session }
                );
                return applied.movement;
            });
            movementsById.set(id, movement);
            results.push({ id, ok: true });
        } catch (error) {
            if (!(error instanceof AppError)) {
                throw error;
            }
            results.push({ id, ok: false, error: failure(error) });
        }
    }

    await MovementBatch.updateOne(
        { _id: batch._id },
        { $set: { results, completedAt: clock.now() } }
    );
    const presented = await presentResults(auth, results, movementsById);
    return { batchId: String(batch._id), action, results: presented, summary: summarize(presented) };
}

/** O serviço ainda está como o lote deixou? Senão, não se desfaz por cima. */
function assertStepIsCurrent(movement, step, batch) {
    const batchUser = String(batch.user);
    const at = new Date(step.at).getTime();
    const current =
        step.action === "release-box"
            ? movement.boxReleasedAt?.getTime() === at && String(movement.boxReleasedBy) === batchUser
            : movement.status === "out" &&
              movement.outAt?.getTime() === at &&
              String(movement.outBy) === batchUser;
    if (!current) {
        throw conflict("Esse serviço mudou depois do lote.");
    }
}

/**
 * POST /movements/batch/:batchId/undo (D9, R7): desfaz o lote inteiro, item a
 * item, com as regras do desfazer de um serviço só (RN-11). Só o autor do lote
 * (em até 10 minutos de cada ação) ou um admin. Cada item roda na própria
 * transação e desfaz os passos na ordem inversa: primeiro a liberação, depois
 * a baixa.
 */
export async function undoBatch(auth, batchId) {
    const batch = await MovementBatch.findOne({ _id: batchId, business: auth.businessId }).lean();
    if (!batch) {
        throw notFound("Lote não encontrado.");
    }
    if (auth.role !== "admin" && String(batch.user) !== auth.userId) {
        throw forbidden("Só quem fez o lote pode desfazê-lo.");
    }

    const results = [];
    const movementsById = new Map();
    for (const item of batch.items) {
        const id = String(item.movement);
        if (item.undoneAt) {
            results.push({ id, ok: false, error: failure(conflict("Esse item do lote já foi desfeito.")) });
            continue;
        }
        try {
            const movement = await withTransaction(async (session) => {
                const now = clock.now();
                let current = await findActiveMovement(auth, item.movement, session);
                for (const step of [...item.steps].reverse()) {
                    assertStepIsCurrent(current, step, batch);
                    const revert = step.action === "release-box" ? revertRelease : revertCheckout;
                    current = await revert(auth, current, { session, now, batchId: batch._id });
                }
                await MovementBatch.updateOne(
                    { _id: batch._id, "items.movement": item.movement },
                    { $set: { "items.$.undoneAt": now } },
                    { session }
                );
                return current;
            });
            movementsById.set(id, movement);
            results.push({ id, ok: true });
        } catch (error) {
            if (!(error instanceof AppError)) {
                throw error;
            }
            results.push({ id, ok: false, error: failure(error) });
        }
    }
    const presented = await presentResults(auth, results, movementsById);
    return { batchId: String(batch._id), results: presented, summary: summarize(presented) };
}
