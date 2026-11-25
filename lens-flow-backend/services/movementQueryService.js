import { delayLevelFor } from "../domain/movements.js";
import { escapeRegex, normalizeOrderService, normalizeSearchText } from "../domain/text.js";
import AuditEvent from "../models/AuditEvent.js";
import Movement, { MOVEMENT_HINTS } from "../models/Movement.js";
import { clock } from "../utils/clock.js";
import { daysBetween, instantRange, sheetDateOf } from "../utils/dateUtils.js";
import { notFound } from "../utils/errors.js";
import {
    MOVEMENT_FIELDS,
    loadUserNames,
    presentMovements,
    toPublicMovement,
    userRef,
} from "./movementPresenter.js";
import { DEFAULT_PAGE_SIZE, findPage, pageQuery, sortField } from "./pagination.js";

/**
 * Ordenações da lista (RN-10), todas terminando em _id para o cursor:
 * - priority: urgente (vermelha) primeiro, depois o mais antigo, depois o
 *   número da caixa em ordem natural;
 * - box: só o número da caixa, seguindo a prateleira;
 * - recent / oldest: pela hora do lançamento (a data da folha vem antes
 *   porque acompanha a hora, e assim o índice da folha serve ao filtro de
 *   período e à ordem). Com status=out, pela hora da baixa.
 */
export const MOVEMENT_SORT_SPECS = Object.freeze({
    priority: [
        sortField("urgent", -1, "boolean"),
        sortField("sheetDate", 1, "string"),
        sortField("boxSortKey", 1, "string"),
        sortField("_id", 1, "objectId"),
    ],
    box: [sortField("boxSortKey", 1, "string"), sortField("_id", 1, "objectId")],
    recent: [
        sortField("sheetDate", -1, "string"),
        sortField("createdAt", -1, "date"),
        sortField("_id", -1, "objectId"),
    ],
    oldest: [
        sortField("sheetDate", 1, "string"),
        sortField("createdAt", 1, "date"),
        sortField("_id", 1, "objectId"),
    ],
    recentOut: [sortField("outAt", -1, "date"), sortField("_id", -1, "objectId")],
    oldestOut: [sortField("outAt", 1, "date"), sortField("_id", 1, "objectId")],
});

const DIGITS = /^\d+$/;
const DUPLICATE_WARNING_LIMIT = 5;

function movementNotFound() {
    return notFound("Serviço não encontrado.");
}

/**
 * A ordenação efetiva: a pedida, ou a padrão (priority na Conferência,
 * recent no resto). Em status=out, recent e oldest usam a hora da baixa.
 */
function resolveSort(params) {
    const requested =
        params.sort ?? (params.status === "open" && !params.q ? "priority" : "recent");
    if (params.status === "out" && (requested === "recent" || requested === "oldest")) {
        return `${requested}Out`;
    }
    return requested;
}

/**
 * Busca num campo só (R9). Só com dígitos: OS exata ou por prefixo, ou o
 * número exato da caixa (D18). Com outro texto: cliente por prefixo ou trecho,
 * sem acento, e também a OS por prefixo (caso a OS tenha letras). A OS não
 * distingue maiúsculas (D26). O texto vai escapado para a expressão regular
 * (S5).
 */
function searchFilter(rawQuery) {
    const text = rawQuery.trim();
    const byOrderService = {
        orderServiceNormalized: { $regex: `^${escapeRegex(normalizeOrderService(text))}` },
    };
    if (DIGITS.test(text)) {
        return { $or: [byOrderService, { "boxSnapshot.number": text }] };
    }
    return {
        $or: [
            { clientNameNormalized: { $regex: escapeRegex(normalizeSearchText(text)) } },
            byOrderService,
        ],
    };
}

/** O filtro da lista, sempre escopado pela empresa da sessão e sem excluídos. */
function movementListFilter(auth, params) {
    const filter = { business: auth.businessId, deletedAt: null };
    if (params.status) {
        filter.status = params.status;
    }
    if (params.boxReleased !== undefined) {
        filter.boxReleasedAt = params.boxReleased ? { $ne: null } : null;
    }
    if (params.color) {
        filter["boxSnapshot.color"] = params.color;
    }
    if (params.category) {
        filter["boxSnapshot.category"] = params.category;
    }
    if (params.box) {
        filter.box = params.box;
    }
    if (params.createdBy) {
        filter.createdBy = params.createdBy;
    }
    if (params.outBy) {
        filter.outBy = params.outBy;
    }
    if (params.orderService) {
        filter.orderServiceNormalized = normalizeOrderService(params.orderService);
    }
    if (params.from || params.to) {
        filter.sheetDate = {};
        if (params.from) {
            filter.sheetDate.$gte = params.from;
        }
        if (params.to) {
            filter.sheetDate.$lte = params.to;
        }
    }
    if (params.outFrom || params.outTo) {
        filter.outAt = instantRange(params.outFrom, params.outTo);
    }
    if (params.q) {
        Object.assign(filter, searchFilter(params.q));
    }
    return filter;
}

function listOptions(auth, params) {
    const sortName = resolveSort(params);
    return {
        filter: movementListFilter(auth, params),
        spec: MOVEMENT_SORT_SPECS[sortName],
        sortName,
        cursor: params.cursor,
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
        buildQuery: (pageFilter) => Movement.find(pageFilter).select(MOVEMENT_FIELDS),
    };
}

/** A consulta da página, sem executar: é o que tests/indexes.test.js explica. */
export function movementListQuery(auth, params) {
    return pageQuery(listOptions(auth, params));
}

/**
 * GET /movements: Conferência, Baixas, busca e folha do dia. Cada serviço
 * aberto traz daysOpen e delayLevel calculados com a data do servidor (R4).
 */
export async function listMovements(auth, params) {
    const now = clock.now();
    const { docs, nextCursor } = await findPage(listOptions(auth, params));
    return {
        items: await presentMovements(auth, docs, now),
        nextCursor,
        serverDate: sheetDateOf(now),
    };
}

/** GET /movements/:id: o serviço e a linha do tempo do histórico. */
export async function getMovementDetail(auth, movementId) {
    const now = clock.now();
    const movement = await Movement.findOne({
        _id: movementId,
        business: auth.businessId,
        deletedAt: null,
    })
        .select(MOVEMENT_FIELDS)
        .lean();
    if (!movement) {
        throw movementNotFound();
    }
    const events = await AuditEvent.find({ business: auth.businessId, entityId: movement._id })
        .sort({ at: 1, _id: 1 })
        .lean();
    const names = await loadUserNames(
        auth.businessId,
        [movement],
        events.map((event) => event.user)
    );
    const today = sheetDateOf(now);
    return {
        movement: toPublicMovement(movement, { names, viewer: auth, now, today }),
        history: events.map((event) => ({
            id: String(event._id),
            action: event.action,
            at: event.at,
            user: userRef(event.user, names),
            before: event.before ?? null,
            after: event.after ?? null,
        })),
        serverDate: today,
    };
}

/**
 * Os serviços que ainda seguram caixa: abertos e "saiu, caixa não liberada".
 * O aberto nunca tem a caixa liberada, então basta boxReleasedAt nulo; com a
 * situação em $in, o índice dá limites exatos aos dois grupos.
 */
export function holdingMovementsQuery(auth) {
    return Movement.find({
        business: auth.businessId,
        status: { $in: ["open", "out"] },
        boxReleasedAt: null,
        deletedAt: null,
    })
        .select("status sheetDate urgent -_id")
        .hint(MOVEMENT_HINTS.holdingBox);
}

/** Filtro dos serviços lançados num dia (contador "lançados hoje"). */
export function launchedOnFilter(auth, date) {
    return { business: auth.businessId, deletedAt: null, sheetDate: date };
}

/**
 * Contadores da barra de navegação e da tela Hoje (R8): lançados hoje,
 * abertos, pendentes de dias anteriores, em atenção, atrasados e "saiu, caixa
 * não liberada" (R15). Lê só os serviços que ainda seguram caixa, um conjunto
 * limitado pelo número de caixas, e só os campos usados.
 */
export async function getMovementSummary(auth) {
    const today = sheetDateOf();
    const [holding, launchedToday] = await Promise.all([
        holdingMovementsQuery(auth).lean(),
        Movement.countDocuments(launchedOnFilter(auth, today)),
    ]);

    const counts = {
        launchedToday,
        open: 0,
        pendingFromPreviousDays: 0,
        attention: 0,
        late: 0,
        outNotReleased: 0,
    };
    for (const movement of holding) {
        if (movement.status === "out") {
            counts.outNotReleased += 1;
            continue;
        }
        counts.open += 1;
        const daysOpen = Math.max(0, daysBetween(movement.sheetDate, today));
        if (daysOpen > 0) {
            counts.pendingFromPreviousDays += 1;
        }
        const level = delayLevelFor(daysOpen, movement.urgent);
        if (level === "attention" || level === "late") {
            counts[level] += 1;
        }
    }
    return { serverDate: today, counts };
}

/**
 * A consulta dos outros serviços abertos com a mesma OS (D16, RN-15), para o
 * aviso de OS repetida, sem executar: é o que tests/indexes.test.js explica.
 * A OS vem de normalizeOrderService, e nunca vazia: um serviço sem OS não
 * repete nenhum outro.
 */
export function openMovementsWithOrderService(auth, normalizedOrderService, exceptId) {
    return Movement.find({
        _id: { $ne: exceptId },
        business: auth.businessId,
        orderServiceNormalized: normalizedOrderService,
        status: "open",
        deletedAt: null,
    })
        .select(MOVEMENT_FIELDS)
        .sort({ createdAt: 1, _id: 1 })
        .limit(DUPLICATE_WARNING_LIMIT)
        .lean();
}
