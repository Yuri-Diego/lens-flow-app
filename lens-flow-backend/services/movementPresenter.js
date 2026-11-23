import { categoryLabel, colorLabel } from "../domain/boxColors.js";
import {
    canEditMovement,
    delayLevelFor,
    lastUndoableAction,
    undoDeadline,
    undoRefusal,
} from "../domain/movements.js";
import User from "../models/User.js";
import { clock } from "../utils/clock.js";
import { daysBetween, sheetDateOf } from "../utils/dateUtils.js";

/** Campos lidos do banco para montar o serviço público (e os cursores). */
export const MOVEMENT_FIELDS = [
    "sheetDate",
    "box",
    "boxSnapshot",
    "urgent",
    "boxSortKey",
    "clientName",
    "orderService",
    "note",
    "status",
    "createdBy",
    "createdAt",
    "outBy",
    "outAt",
    "boxReleasedBy",
    "boxReleasedAt",
    "updatedAt",
].join(" ");

const USER_FIELDS = ["createdBy", "outBy", "boxReleasedBy"];

/**
 * Nomes dos usuários citados nos serviços (e nos ids extras), numa consulta
 * só com $in: as listas não fazem uma consulta por item (N+1).
 */
export async function loadUserNames(businessId, movements, extraIds = []) {
    const ids = new Set();
    for (const movement of movements) {
        for (const field of USER_FIELDS) {
            if (movement[field]) {
                ids.add(String(movement[field]));
            }
        }
    }
    for (const id of extraIds) {
        if (id) {
            ids.add(String(id));
        }
    }
    if (ids.size === 0) {
        return new Map();
    }
    const users = await User.find({ _id: { $in: [...ids] }, business: businessId })
        .select("name")
        .lean();
    return new Map(users.map((user) => [String(user._id), user.name]));
}

export function userRef(id, names) {
    if (!id) {
        return null;
    }
    const key = String(id);
    return { id: key, name: names.get(key) ?? null };
}

/** A caixa do serviço, com os rótulos para a tela. */
export function movementBox(movement) {
    const { number, color, category } = movement.boxSnapshot;
    return {
        id: String(movement.box),
        number,
        color,
        colorLabel: colorLabel(color),
        category,
        categoryLabel: categoryLabel(category),
    };
}

function undoInfo(movement, viewer, now) {
    const last = lastUndoableAction(movement);
    if (!last || undoRefusal(viewer, last.actor, last.at, now)) {
        return null;
    }
    return { action: last.action, until: viewer.role === "admin" ? null : undoDeadline(last.at) };
}

/**
 * O serviço como a API devolve. `daysOpen` e `delayLevel` (D15) só existem no
 * serviço aberto e usam a data de hoje do servidor. `undo` diz se quem está
 * logado ainda pode desfazer a última ação; `canEdit`, se pode editar,
 * excluir ou trocar a caixa (RN-11).
 */
export function toPublicMovement(movement, { names, viewer, now, today }) {
    const open = movement.status === "open";
    const daysOpen = open ? Math.max(0, daysBetween(movement.sheetDate, today)) : null;
    return {
        id: String(movement._id),
        sheetDate: movement.sheetDate,
        box: movementBox(movement),
        clientName: movement.clientName,
        orderService: movement.orderService ?? null,
        note: movement.note ?? null,
        status: movement.status,
        daysOpen,
        delayLevel: open ? delayLevelFor(daysOpen, movement.urgent) : null,
        createdBy: userRef(movement.createdBy, names),
        createdAt: movement.createdAt,
        outBy: userRef(movement.outBy, names),
        outAt: movement.outAt ?? null,
        outDate: movement.outAt ? sheetDateOf(movement.outAt) : null,
        boxReleasedBy: userRef(movement.boxReleasedBy, names),
        boxReleasedAt: movement.boxReleasedAt ?? null,
        updatedAt: movement.updatedAt,
        canEdit: canEditMovement(viewer, movement, today),
        undo: undoInfo(movement, viewer, now),
    };
}

/** Vários serviços: uma consulta de nomes para todos. */
export async function presentMovements(auth, movements, now = clock.now()) {
    const names = await loadUserNames(auth.businessId, movements);
    const today = sheetDateOf(now);
    return movements.map((movement) =>
        toPublicMovement(movement, { names, viewer: auth, now, today })
    );
}

export async function presentMovement(auth, movement, now = clock.now()) {
    const [presented] = await presentMovements(auth, [movement], now);
    return presented;
}
