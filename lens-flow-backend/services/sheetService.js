import mongoose from "mongoose";
import Movement, { MOVEMENT_HINTS } from "../models/Movement.js";
import MovementSheet from "../models/MovementSheet.js";
import { sheetDateOf } from "../utils/dateUtils.js";
import { audit } from "./auditService.js";
import { findPage, sortField } from "./pagination.js";

const SHEETS_SORT = Object.freeze([sortField("date", -1, "string")]);
const ZERO_COUNTS = Object.freeze({ launched: 0, out: 0, open: 0 });
/** Folhas por página, se o web não pedir outro tamanho: um mês. */
const SHEETS_PAGE_SIZE = 31;

/**
 * A folha do dia (RN-06): upsert por {business, date}, dentro da transação do
 * lançamento. O índice único impede duas folhas no mesmo dia; dois primeiros
 * lançamentos simultâneos entram em conflito de escrita e a transação do
 * segundo é refeita, já encontrando a folha. A criação vai para o histórico.
 */
export async function ensureSheet(businessId, date, { session, actorId }) {
    const result = await MovementSheet.findOneAndUpdate(
        { business: businessId, date },
        { $setOnInsert: { business: businessId, date } },
        { upsert: true, new: true, session, includeResultMetadata: true }
    ).lean();
    const sheet = result.value;
    if (result.lastErrorObject?.upserted) {
        await audit(
            {
                businessId,
                actorId,
                action: "sheet.create",
                entity: "MovementSheet",
                entityId: sheet._id,
                after: { date },
            },
            { session }
        );
    }
    return sheet;
}

/**
 * A agregação dos contadores por folha (sem contador gravado que possa
 * divergir): lançados e saíram; abertos é a diferença. Os excluídos não
 * contam. A agregação não converte tipos, então a empresa vai como ObjectId.
 * O hint fixa o índice da data da folha (veja MOVEMENT_HINTS).
 */
export function sheetCountsAggregation(businessId, dates) {
    return Movement.aggregate([
        {
            $match: {
                business: new mongoose.Types.ObjectId(String(businessId)),
                sheetDate: { $in: dates },
                deletedAt: null,
            },
        },
        {
            $group: {
                _id: "$sheetDate",
                launched: { $sum: 1 },
                out: { $sum: { $cond: [{ $eq: ["$status", "out"] }, 1, 0] } },
            },
        },
    ]).hint(MOVEMENT_HINTS.bySheetDate);
}

/** Contadores por data de folha: lançados, saíram e abertos. */
async function countsByDate(businessId, dates) {
    if (dates.length === 0) {
        return new Map();
    }
    const rows = await sheetCountsAggregation(businessId, dates);
    return new Map(
        rows.map((row) => [row._id, { launched: row.launched, out: row.out, open: row.launched - row.out }])
    );
}

/** Folhas com contadores, da mais recente para a mais antiga, com cursor. */
export async function listSheets(auth, { from, to, cursor, limit = SHEETS_PAGE_SIZE }) {
    const filter = { business: auth.businessId };
    if (from || to) {
        filter.date = {};
        if (from) {
            filter.date.$gte = from;
        }
        if (to) {
            filter.date.$lte = to;
        }
    }
    const { docs, nextCursor } = await findPage({
        filter,
        spec: SHEETS_SORT,
        sortName: "sheets",
        cursor,
        limit,
        buildQuery: (pageFilter) => MovementSheet.find(pageFilter).select("date"),
    });
    const counts = await countsByDate(
        auth.businessId,
        docs.map((sheet) => sheet.date)
    );
    return {
        sheets: docs.map((sheet) => ({ date: sheet.date, counts: counts.get(sheet.date) ?? ZERO_COUNTS })),
        nextCursor,
        serverDate: sheetDateOf(),
    };
}

/** Os contadores de um dia. Um dia sem folha tem contadores zerados. */
export async function sheetCounts(auth, date) {
    const counts = await countsByDate(auth.businessId, [date]);
    return counts.get(date) ?? ZERO_COUNTS;
}
