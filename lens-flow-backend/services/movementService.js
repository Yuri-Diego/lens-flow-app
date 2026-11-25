import mongoose from "mongoose";
import { withTransaction } from "../db/transaction.js";
import { colorLabel } from "../domain/boxColors.js";
import { canChangeMovementBox, canEditMovement, undoRefusal } from "../domain/movements.js";
import { normalizeOrderService, normalizeSearchText } from "../domain/text.js";
import Box from "../models/Box.js";
import Movement, { boxPlacement } from "../models/Movement.js";
import { clock } from "../utils/clock.js";
import { dayMonth, sheetDateOf } from "../utils/dateUtils.js";
import { boxOccupied, conflict, forbidden, notFound, validationError } from "../utils/errors.js";
import { audit } from "./auditService.js";
import { loadPublicBox } from "./boxService.js";
import { recordClientUse, refreshClientNames } from "./clientService.js";
import {
    MOVEMENT_FIELDS,
    loadUserNames,
    movementBox,
    presentMovement,
    userRef,
} from "./movementPresenter.js";
import { openMovementsWithOrderService } from "./movementQueryService.js";
import { ensureSheet } from "./sheetService.js";

const EDITABLE_FIELDS = ["clientName", "orderService", "note"];

function movementNotFound() {
    return notFound("Serviço não encontrado.");
}

function boxNotFound() {
    return notFound("Caixa não encontrada.");
}

function boxNotWithMovement() {
    return conflict("A caixa não está com este serviço. Atualize a tela e tente de novo.");
}

/** A caixa no histórico: id, número, cor e categoria (de documento ou objeto lean). */
function boxAuditRef(movement) {
    const { number, color, category } = movement.boxSnapshot;
    return { id: movement.box, number, color, category };
}

function withBatch(data, batchId) {
    return batchId ? { ...data, batchId } : data;
}

function movementEvent(auth, movement, action, before, after) {
    return {
        businessId: auth.businessId,
        actorId: auth.userId,
        action,
        entity: "Movement",
        entityId: movement._id,
        before,
        after,
    };
}

/** O serviço não excluído da empresa da sessão, ou 404 (também para outra empresa). */
export async function findActiveMovement(auth, movementId, session) {
    const movement = await Movement.findOne({
        _id: movementId,
        business: auth.businessId,
        deletedAt: null,
    })
        .select(MOVEMENT_FIELDS)
        .session(session ?? null)
        .lean();
    if (!movement) {
        throw movementNotFound();
    }
    return movement;
}

function occupiedMessage(box) {
    const current = box.currentMovement;
    if (!current) {
        return `A caixa ${box.number} já está ocupada.`;
    }
    const author = current.createdBy?.name ? `, lançado por ${current.createdBy.name}` : "";
    const waiting =
        current.status === "out" ? " O serviço já saiu; falta liberar a caixa." : "";
    return `A caixa ${box.number} já está ocupada: ${current.clientName}${author} em ${dayMonth(current.sheetDate)}.${waiting}`;
}

/** Por que a caixa não pôde ser ocupada: 404, inativa ou ocupada (com o serviço atual). */
async function boxUnavailableError(businessId, boxId, session) {
    const box = await loadPublicBox(businessId, boxId, session);
    if (!box) {
        return boxNotFound();
    }
    if (!box.active) {
        return conflict(`A caixa ${box.number} está desativada e não recebe serviço.`);
    }
    if (box.state === "free") {
        return conflict("Não foi possível ocupar a caixa. Tente de novo.");
    }
    return boxOccupied(occupiedMessage(box), { box });
}

/**
 * Ocupa a caixa com o serviço (RN-05): a escrita só acontece se ela estiver
 * livre e ativa. Dois lançamentos simultâneos na mesma caixa entram em
 * conflito de escrita; a transação do segundo é refeita, encontra a caixa
 * ocupada e responde 409 BOX_OCCUPIED.
 */
async function occupyBox(businessId, boxId, movementId, session) {
    const box = await Box.findOneAndUpdate(
        { _id: boxId, business: businessId, state: "free", active: true },
        { $set: { state: "occupied", currentMovement: movementId, lastMovement: movementId } },
        { new: true, session }
    ).lean();
    if (!box) {
        throw await boxUnavailableError(businessId, boxId, session);
    }
    return box;
}

/** Libera a caixa que está com o serviço (liberação, exclusão, troca). */
async function freeBox(businessId, movement, session) {
    const box = await Box.findOneAndUpdate(
        { _id: movement.box, business: businessId, currentMovement: movement._id },
        { $set: { state: "free", currentMovement: null } },
        { new: true, session }
    ).lean();
    if (!box) {
        throw boxNotWithMovement();
    }
    return box;
}

/**
 * Aviso de OS repetida (D16, RN-15): a OS já está em outro serviço aberto, sem
 * distinguir maiúsculas (D26). Não bloqueia; diz onde ela está. A mensagem
 * traz a OS como foi digitada neste serviço.
 */
async function duplicateOrderWarnings(auth, movement) {
    const orderService = normalizeOrderService(movement.orderService);
    if (!orderService || movement.status !== "open") {
        return [];
    }
    const others = await openMovementsWithOrderService(auth, orderService, movement._id);
    if (others.length === 0) {
        return [];
    }
    const names = await loadUserNames(auth.businessId, others);
    const places = others.map(
        (other) =>
            `caixa ${other.boxSnapshot.number} (${colorLabel(other.boxSnapshot.color)}), aberta desde ${dayMonth(other.sheetDate)}`
    );
    const message =
        others.length === 1
            ? `A OS ${movement.orderService} já está na ${places[0]}.`
            : `A OS ${movement.orderService} já está em outros serviços abertos: ${places.join("; ")}.`;
    return [
        {
            code: "DUPLICATE_ORDER_SERVICE",
            message,
            movements: others.map((other) => ({
                id: String(other._id),
                box: movementBox(other),
                sheetDate: other.sheetDate,
                clientName: other.clientName,
                createdBy: userRef(other.createdBy, names),
            })),
        },
    ];
}

async function respondWithMovement(auth, movement, now) {
    return {
        movement: await presentMovement(auth, movement, now),
        warnings: await duplicateOrderWarnings(auth, movement),
    };
}

/** Repetição de um lançamento com a mesma chave (R13): o resultado original. */
async function replayLaunch(auth, clientRequestId) {
    const original = await Movement.findOne({
        business: auth.businessId,
        createdBy: auth.userId,
        clientRequestId,
    })
        .select(`${MOVEMENT_FIELDS} deletedAt`)
        .lean();
    if (!original) {
        return null;
    }
    if (original.deletedAt) {
        throw conflict("Esse lançamento já foi feito e depois excluído.");
    }
    return respondWithMovement(auth, original, clock.now());
}

/**
 * POST /movements (RN-06, RN-07): numa transação, garante a folha de hoje,
 * ocupa a caixa, cria o serviço com o snapshot da caixa e grava o histórico.
 * A OS repetida volta como aviso (D16).
 */
export async function launchMovement(auth, input) {
    if (input.clientRequestId) {
        const replay = await replayLaunch(auth, input.clientRequestId);
        if (replay) {
            return replay;
        }
    }

    const now = clock.now();
    const today = sheetDateOf(now);
    const movementId = new mongoose.Types.ObjectId();
    let movement;
    try {
        movement = await withTransaction(async (session) => {
            const sheet = await ensureSheet(auth.businessId, today, {
                session,
                actorId: auth.userId,
            });
            const box = await occupyBox(auth.businessId, input.boxId, movementId, session);
            const [created] = await Movement.create(
                [
                    {
                        _id: movementId,
                        business: auth.businessId,
                        sheet: sheet._id,
                        sheetDate: today,
                        box: box._id,
                        ...boxPlacement(box),
                        clientName: input.clientName,
                        orderService: input.orderService ?? null,
                        note: input.note ?? null,
                        createdBy: auth.userId,
                        clientRequestId: input.clientRequestId ?? null,
                        createdAt: now,
                    },
                ],
                { session }
            );
            await audit(
                movementEvent(auth, created, "movement.create", null, {
                    sheetDate: today,
                    box: boxAuditRef(created),
                    clientName: created.clientName,
                    orderService: created.orderService,
                    note: created.note,
                }),
                { session }
            );
            // Por último: o resumo do nome (D24) é a escrita que pode disputar
            // com outro lançamento do mesmo cliente.
            await recordClientUse(auth.businessId, created, { session });
            return created.toObject();
        });
    } catch (error) {
        // Duas tentativas simultâneas com a mesma chave: a segunda esbarra na
        // primeira (a caixa já ocupada por ela, ou o índice único da chave) e
        // devolve o resultado da primeira, sem falso BOX_OCCUPIED.
        if (input.clientRequestId) {
            const replay = await replayLaunch(auth, input.clientRequestId);
            if (replay) {
                return replay;
            }
        }
        throw error;
    }
    return respondWithMovement(auth, movement, now);
}

function assertCanEdit(auth, movement, today) {
    if (!canEditMovement(auth, movement, today)) {
        throw forbidden("Você só pode alterar os seus próprios lançamentos, no mesmo dia.");
    }
}

/** PATCH /movements/:id: cliente, OS e observação (RN-11). */
export async function updateMovement(auth, movementId, changes) {
    const now = clock.now();
    const today = sheetDateOf(now);
    const movement = await withTransaction(async (session) => {
        const current = await findActiveMovement(auth, movementId, session);
        assertCanEdit(auth, current, today);

        const before = {};
        const after = {};
        for (const field of EDITABLE_FIELDS) {
            if (changes[field] !== undefined && changes[field] !== (current[field] ?? null)) {
                before[field] = current[field] ?? null;
                after[field] = changes[field];
            }
        }
        if (Object.keys(after).length === 0) {
            return current;
        }

        const $set = { ...after, updatedBy: auth.userId };
        if (after.clientName !== undefined) {
            $set.clientNameNormalized = normalizeSearchText(after.clientName);
        }
        if (after.orderService !== undefined) {
            $set.orderServiceNormalized = normalizeOrderService(after.orderService);
        }
        const updated = await Movement.findOneAndUpdate(
            { _id: current._id, business: auth.businessId, deletedAt: null },
            { $set },
            { new: true, runValidators: true, session }
        )
            .select(MOVEMENT_FIELDS)
            .lean();
        await audit(movementEvent(auth, current, "movement.update", before, after), { session });
        if (after.clientName !== undefined) {
            // O uso passa do nome antigo para o novo (D24).
            await refreshClientNames(auth.businessId, [current.clientName, after.clientName], { session });
        }
        return updated;
    });
    return respondWithMovement(auth, movement, now);
}

/**
 * DELETE /movements/:id: exclusão lógica (RN-11). O serviço some das listas,
 * continua no histórico e, se ainda estava com a caixa, a libera.
 */
export async function deleteMovement(auth, movementId) {
    const now = clock.now();
    const today = sheetDateOf(now);
    await withTransaction(async (session) => {
        const current = await findActiveMovement(auth, movementId, session);
        assertCanEdit(auth, current, today);

        const holdsBox = !current.boxReleasedAt;
        await Movement.updateOne(
            { _id: current._id, business: auth.businessId, deletedAt: null },
            { $set: { deletedAt: now, deletedBy: auth.userId } },
            { session }
        );
        if (holdsBox) {
            await freeBox(auth.businessId, current, session);
        }
        await audit(
            movementEvent(
                auth,
                current,
                "movement.delete",
                { status: current.status, boxReleasedAt: current.boxReleasedAt ?? null },
                { deletedAt: now, boxFreed: holdsBox }
            ),
            { session }
        );
        // O serviço excluído deixa de contar nas sugestões (D24).
        await refreshClientNames(auth.businessId, [current.clientName], { session });
    });
}

/**
 * POST /movements/:id/change-box (RN-12): ocupa a caixa nova e libera a
 * antiga numa transação, junto com o histórico (quem trocou, de qual caixa e
 * para qual). Qualquer pessoa logada da empresa troca a caixa de um serviço
 * aberto, em qualquer dia e de qualquer autor (D19); o que já saiu não troca.
 * O serviço continua na folha do lançamento.
 */
export async function changeMovementBox(auth, movementId, { boxId }) {
    const now = clock.now();
    const movement = await withTransaction(async (session) => {
        const current = await findActiveMovement(auth, movementId, session);
        if (!canChangeMovementBox(current)) {
            throw conflict("Só dá para trocar a caixa de um serviço aberto.");
        }
        if (String(current.box) === String(boxId)) {
            throw validationError(
                { boxId: "Escolha uma caixa diferente da atual." },
                "Escolha uma caixa diferente da atual."
            );
        }

        const newBox = await occupyBox(auth.businessId, boxId, current._id, session);
        await freeBox(auth.businessId, current, session);
        const updated = await Movement.findOneAndUpdate(
            { _id: current._id, business: auth.businessId, deletedAt: null, status: "open" },
            { $set: { box: newBox._id, ...boxPlacement(newBox), updatedBy: auth.userId } },
            { new: true, session }
        )
            .select(MOVEMENT_FIELDS)
            .lean();
        await audit(
            movementEvent(
                auth,
                current,
                "movement.change_box",
                { box: boxAuditRef(current) },
                { box: boxAuditRef(updated) }
            ),
            { session }
        );
        return updated;
    });
    return { movement: await presentMovement(auth, movement, now) };
}

/** Baixa (RN-08): o serviço saiu. Usada sozinha e no lote, dentro da transação. */
export async function applyCheckout(auth, movement, { session, now, batchId }) {
    if (movement.status !== "open") {
        throw conflict("Esse serviço já saiu.");
    }
    const updated = await Movement.findOneAndUpdate(
        { _id: movement._id, business: auth.businessId, deletedAt: null, status: "open" },
        { $set: { status: "out", outBy: auth.userId, outAt: now } },
        { new: true, session }
    )
        .select(MOVEMENT_FIELDS)
        .lean();
    if (!updated) {
        throw conflict("Esse serviço já saiu.");
    }
    await audit(
        movementEvent(
            auth,
            movement,
            "movement.checkout",
            { status: "open" },
            withBatch({ status: "out", outAt: now }, batchId)
        ),
        { session }
    );
    return updated;
}

/** Liberação da caixa (RN-09): só depois da baixa (D6). A caixa volta a ficar livre. */
export async function applyRelease(auth, movement, { session, now, batchId }) {
    if (movement.status !== "out") {
        throw conflict("Dê baixa antes de liberar a caixa.");
    }
    if (movement.boxReleasedAt) {
        throw conflict("A caixa desse serviço já foi liberada.");
    }
    const updated = await Movement.findOneAndUpdate(
        {
            _id: movement._id,
            business: auth.businessId,
            deletedAt: null,
            status: "out",
            boxReleasedAt: null,
        },
        { $set: { boxReleasedBy: auth.userId, boxReleasedAt: now } },
        { new: true, session }
    )
        .select(MOVEMENT_FIELDS)
        .lean();
    if (!updated) {
        throw conflict("A caixa desse serviço já foi liberada.");
    }
    await freeBox(auth.businessId, movement, session);
    await audit(
        movementEvent(
            auth,
            movement,
            "movement.release_box",
            { boxReleasedAt: null },
            withBatch({ boxReleasedAt: now, box: boxAuditRef(movement) }, batchId)
        ),
        { session }
    );
    return updated;
}

function assertUndoAllowed(auth, actor, at, now) {
    const refusal = undoRefusal(auth, actor, at, now);
    if (refusal) {
        throw forbidden(refusal);
    }
}

async function reoccupyRefusal(businessId, movement, session) {
    const box = await Box.findOne({ _id: movement.box, business: businessId })
        .session(session)
        .lean();
    if (!box) {
        return conflict("A caixa desse serviço não existe mais. Não dá para desfazer a liberação.");
    }
    if (!box.active) {
        return conflict(`A caixa ${box.number} foi desativada. Não dá para desfazer a liberação.`);
    }
    return conflict(
        `A caixa ${box.number} já recebeu outro serviço. Não dá para desfazer a liberação.`
    );
}

/**
 * Desfaz a liberação (RN-11): o serviço volta a ocupar a caixa, desde que ela
 * esteja livre, ativa e não tenha recebido outro serviço depois (lastMovement).
 */
export async function revertRelease(auth, movement, { session, now, batchId }) {
    if (!movement.boxReleasedAt) {
        throw conflict("A caixa desse serviço não foi liberada.");
    }
    assertUndoAllowed(auth, movement.boxReleasedBy, movement.boxReleasedAt, now);

    const box = await Box.findOneAndUpdate(
        {
            _id: movement.box,
            business: auth.businessId,
            state: "free",
            active: true,
            lastMovement: movement._id,
        },
        { $set: { state: "occupied", currentMovement: movement._id } },
        { new: true, session }
    ).lean();
    if (!box) {
        throw await reoccupyRefusal(auth.businessId, movement, session);
    }
    const updated = await Movement.findOneAndUpdate(
        {
            _id: movement._id,
            business: auth.businessId,
            deletedAt: null,
            boxReleasedAt: movement.boxReleasedAt,
        },
        // A caixa pode ter sido renumerada enquanto estava livre: o snapshot acompanha.
        { $set: { boxReleasedBy: null, boxReleasedAt: null, ...boxPlacement(box) } },
        { new: true, session }
    )
        .select(MOVEMENT_FIELDS)
        .lean();
    if (!updated) {
        throw conflict("Esse serviço mudou enquanto era desfeito. Atualize a tela.");
    }
    await audit(
        movementEvent(
            auth,
            movement,
            "movement.undo_release_box",
            { boxReleasedBy: movement.boxReleasedBy, boxReleasedAt: movement.boxReleasedAt },
            withBatch({ boxReleasedAt: null, box: boxAuditRef(updated) }, batchId)
        ),
        { session }
    );
    return updated;
}

/** Desfaz a baixa (RN-11): o serviço volta a ficar aberto. A caixa nunca saiu dele. */
export async function revertCheckout(auth, movement, { session, now, batchId }) {
    if (movement.status !== "out") {
        throw conflict("Esse serviço não tem baixa para desfazer.");
    }
    if (movement.boxReleasedAt) {
        throw conflict("Desfaça primeiro a liberação da caixa.");
    }
    assertUndoAllowed(auth, movement.outBy, movement.outAt, now);

    const updated = await Movement.findOneAndUpdate(
        {
            _id: movement._id,
            business: auth.businessId,
            deletedAt: null,
            status: "out",
            boxReleasedAt: null,
            outAt: movement.outAt,
        },
        { $set: { status: "open", outBy: null, outAt: null } },
        { new: true, session }
    )
        .select(MOVEMENT_FIELDS)
        .lean();
    if (!updated) {
        throw conflict("Esse serviço mudou enquanto era desfeito. Atualize a tela.");
    }
    await audit(
        movementEvent(
            auth,
            movement,
            "movement.undo_checkout",
            { status: "out", outBy: movement.outBy, outAt: movement.outAt },
            withBatch({ status: "open" }, batchId)
        ),
        { session }
    );
    return updated;
}

async function runSingle(auth, movementId, step) {
    const now = clock.now();
    const movement = await withTransaction(async (session) => {
        const current = await findActiveMovement(auth, movementId, session);
        return step(auth, current, { session, now });
    });
    return { movement: await presentMovement(auth, movement, now) };
}

/** POST /movements/:id/checkout. */
export function checkoutMovement(auth, movementId) {
    return runSingle(auth, movementId, applyCheckout);
}

/** POST /movements/:id/release-box. */
export function releaseMovementBox(auth, movementId) {
    return runSingle(auth, movementId, applyRelease);
}

/** POST /movements/:id/undo: desfaz a baixa ou a liberação (RN-11). */
export function undoMovementAction(auth, movementId, { action }) {
    return runSingle(auth, movementId, action === "release-box" ? revertRelease : revertCheckout);
}
