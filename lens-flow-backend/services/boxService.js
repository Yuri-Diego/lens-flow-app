import { withTransaction } from "../db/transaction.js";
import { categoryForColor, categoryLabel, colorLabel } from "../domain/boxColors.js";
import { boxNumberSortKey } from "../domain/boxNumbers.js";
import Box from "../models/Box.js";
import { boxOccupied, conflict, isDuplicateKeyError, notFound } from "../utils/errors.js";
import { audit, auditMany } from "./auditService.js";

const FILTER_FIELDS = ["state", "color", "category", "number", "active"];
const EDITABLE_FIELDS = ["number", "color", "active"];
const BATCH_ATTEMPTS = 3;

// Resumo do serviço atual de uma caixa ocupada (R1): cliente, OS, autor e data.
const CURRENT_MOVEMENT = {
    path: "currentMovement",
    select: "clientName orderService status sheetDate createdAt createdBy",
    populate: { path: "createdBy", select: "name" },
};

export function toPublicBox(box) {
    const movement = box.currentMovement?.clientName === undefined ? null : box.currentMovement;
    return {
        id: String(box._id),
        number: box.number,
        color: box.color,
        colorLabel: colorLabel(box.color),
        category: box.category,
        categoryLabel: categoryLabel(box.category),
        state: box.state,
        active: box.active,
        currentMovement: movement
            ? {
                  id: String(movement._id),
                  clientName: movement.clientName,
                  orderService: movement.orderService ?? null,
                  status: movement.status,
                  sheetDate: movement.sheetDate,
                  createdAt: movement.createdAt,
                  createdBy: movement.createdBy
                      ? { id: String(movement.createdBy._id), name: movement.createdBy.name }
                      : null,
              }
            : null,
        createdAt: box.createdAt,
        updatedAt: box.updatedAt,
    };
}

function boxAuditSnapshot(box) {
    return {
        number: box.number,
        color: box.color,
        category: box.category,
        state: box.state,
        active: box.active,
    };
}

function boxNotFound() {
    return notFound("Caixa não encontrada.");
}

function numberTaken(existing) {
    const label = `a caixa ${existing.number} (${colorLabel(existing.color)})`;
    return conflict(`Já existe ${label}. O número não se repete, nem em outra cor.`, {
        number: `Já existe ${label}.`,
    });
}

/** A caixa no formato público, com o resumo do serviço atual, ou null. */
export async function loadPublicBox(businessId, boxId, session) {
    const box = await Box.findOne({ _id: boxId, business: businessId })
        .populate(CURRENT_MOVEMENT)
        .session(session ?? null)
        .lean();
    return box ? toPublicBox(box) : null;
}

/** Lança 409 se o número já existe na empresa, em qualquer cor (D4). */
async function assertNumberAvailable(businessId, number, { exceptId, session } = {}) {
    const filter = { business: businessId, number };
    if (exceptId) {
        filter._id = { $ne: exceptId };
    }
    const existing = await Box.findOne(filter)
        .select("number color")
        .session(session ?? null)
        .lean();
    if (existing) {
        throw numberTaken(existing);
    }
}

async function numberTakenAfterRace(businessId, number) {
    const existing = await Box.findOne({ business: businessId, number }).select("number color").lean();
    return existing ? numberTaken(existing) : conflict("Esse número de caixa já está em uso.");
}

/**
 * Caixas da empresa em ordem natural de número ("2" antes de "10" e "7" antes
 * de "007", RN-10 e D18), com o resumo do serviço atual nas ocupadas.
 *
 * Sem paginação: um laboratório tem centenas de caixas. A ordem é feita em
 * memória, com a chave de boxNumberSortKey calculada uma vez por caixa:
 * O(n log n) para n caixas da empresa, desprezível nesse volume, e
 * independente da colação da coleção. O populate faz 2 consultas no total
 * ($in), não uma por caixa.
 */
export async function listBoxes(auth, filters) {
    const query = { business: auth.businessId };
    for (const field of FILTER_FIELDS) {
        if (filters[field] !== undefined) {
            query[field] = filters[field];
        }
    }
    const boxes = await Box.find(query).populate(CURRENT_MOVEMENT).lean();
    return boxes
        .map((box) => ({ box, key: boxNumberSortKey(box.number) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map(({ box }) => toPublicBox(box));
}

export async function getBox(auth, boxId) {
    const box = await loadPublicBox(auth.businessId, boxId);
    if (!box) {
        throw boxNotFound();
    }
    return box;
}

export async function createBox(auth, { number, color }) {
    await assertNumberAvailable(auth.businessId, number);
    try {
        return await withTransaction(async (session) => {
            const [box] = await Box.create([{ business: auth.businessId, number, color }], {
                session,
            });
            await audit(
                {
                    businessId: auth.businessId,
                    actorId: auth.userId,
                    action: "box.create",
                    entity: "Box",
                    entityId: box._id,
                    after: boxAuditSnapshot(box),
                },
                { session }
            );
            return toPublicBox(box.toObject());
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw await numberTakenAfterRace(auth.businessId, number);
        }
        throw error;
    }
}

/**
 * Cadastro em lote (RN-13): um resultado por número pedido, na ordem digitada.
 * O número que já existe (em qualquer cor) ou que se repete no lote volta com
 * erro; os outros são criados juntos, numa transação com a auditoria.
 *
 * Duas consultas ao banco (as caixas existentes, com $in, e a inserção), não
 * uma por número. Se outro cadastro criar um dos números ao mesmo tempo, o
 * índice único derruba a transação e o lote é refeito com a lista atualizada.
 */
export async function createBoxesBatch(auth, { color, numbers }) {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await tryCreateBatch(auth, color, numbers);
        } catch (error) {
            if (!isDuplicateKeyError(error) || attempt >= BATCH_ATTEMPTS) {
                throw error;
            }
        }
    }
}

async function tryCreateBatch(auth, color, numbers) {
    const distinct = [...new Set(numbers)];
    const existing = await Box.find({ business: auth.businessId, number: { $in: distinct } })
        .select("number color")
        .lean();
    const existingByNumber = new Map(existing.map((box) => [box.number, box]));

    const seen = new Set();
    const plan = numbers.map((number) => {
        if (seen.has(number)) {
            return { number, outcome: "repeated" };
        }
        seen.add(number);
        const taken = existingByNumber.get(number);
        return taken ? { number, outcome: "taken", taken } : { number, outcome: "create" };
    });

    const toCreate = plan
        .filter((item) => item.outcome === "create")
        .map((item) => ({
            business: auth.businessId,
            number: item.number,
            color,
            category: categoryForColor(color),
        }));

    const created =
        toCreate.length === 0
            ? []
            : await withTransaction(async (session) => {
                  const boxes = await Box.insertMany(toCreate, { session });
                  await auditMany(
                      boxes.map((box) => ({
                          businessId: auth.businessId,
                          actorId: auth.userId,
                          action: "box.create",
                          entity: "Box",
                          entityId: box._id,
                          after: boxAuditSnapshot(box),
                      })),
                      { session }
                  );
                  return boxes;
              });
    const createdByNumber = new Map(created.map((box) => [box.number, box]));

    const results = plan.map((item) => {
        if (item.outcome === "create") {
            const box = createdByNumber.get(item.number).toObject();
            return { number: item.number, ok: true, box: toPublicBox(box) };
        }
        if (item.outcome === "taken") {
            return {
                number: item.number,
                ok: false,
                error: {
                    code: "CONFLICT",
                    message: `Já existe a caixa ${item.number} (${colorLabel(item.taken.color)}).`,
                },
            };
        }
        return {
            number: item.number,
            ok: false,
            error: { code: "DUPLICATE_IN_BATCH", message: "Número repetido neste lote." },
        };
    });

    return {
        results,
        summary: {
            requested: numbers.length,
            created: created.length,
            failed: numbers.length - created.length,
        },
    };
}

/**
 * Edita número, cor e ativo. Com a caixa ocupada nada muda, nem desativar:
 * responde 409 BOX_OCCUPIED. A escrita só acontece com a caixa livre
 * (filtro state: "free"), então um lançamento simultâneo não passa por baixo.
 */
export async function updateBox(auth, boxId, changes) {
    try {
        return await withTransaction(async (session) => {
            const box = await Box.findOne({ _id: boxId, business: auth.businessId })
                .session(session)
                .lean();
            if (!box) {
                throw boxNotFound();
            }
            if (box.state === "occupied") {
                throw await occupiedError(auth.businessId, box, session);
            }

            const before = {};
            const after = {};
            for (const field of EDITABLE_FIELDS) {
                if (changes[field] !== undefined && changes[field] !== box[field]) {
                    before[field] = box[field];
                    after[field] = changes[field];
                }
            }
            if (Object.keys(after).length === 0) {
                return toPublicBox(box);
            }
            if (after.color !== undefined) {
                before.category = box.category;
                after.category = categoryForColor(after.color);
            }
            if (after.number !== undefined) {
                await assertNumberAvailable(auth.businessId, after.number, {
                    exceptId: box._id,
                    session,
                });
            }

            const updated = await Box.findOneAndUpdate(
                { _id: box._id, business: auth.businessId, state: "free" },
                { $set: after },
                { new: true, runValidators: true, session }
            ).lean();
            if (!updated) {
                throw await occupiedError(auth.businessId, box, session);
            }
            await audit(
                {
                    businessId: auth.businessId,
                    actorId: auth.userId,
                    action: "box.update",
                    entity: "Box",
                    entityId: box._id,
                    before,
                    after,
                },
                { session }
            );
            return toPublicBox(updated);
        });
    } catch (error) {
        if (isDuplicateKeyError(error) && changes.number !== undefined) {
            throw await numberTakenAfterRace(auth.businessId, changes.number);
        }
        throw error;
    }
}

async function occupiedError(businessId, box, session) {
    const current = await loadPublicBox(businessId, box._id, session);
    return boxOccupied(
        `A caixa ${box.number} está ocupada. Ela só pode ser editada ou desativada depois de liberada.`,
        { box: current }
    );
}
