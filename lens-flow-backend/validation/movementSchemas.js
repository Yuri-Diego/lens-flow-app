import { MOVEMENT_STATUSES } from "../domain/enums.js";
import {
    BATCH_ACTIONS,
    BATCH_MAX_ITEMS,
    MOVEMENT_SORTS,
    UNDO_ACTIONS,
} from "../domain/movements.js";
import { boxCategory, boxColor } from "./boxSchemas.js";
import {
    atLeastOneField,
    booleanFromQuery,
    cursor,
    jsonBody,
    objectId,
    objectIdField,
    orderedRange,
    pageLimit,
    requiredText,
    sheetDate,
} from "./common.js";
import { z } from "./zod.js";

const CLIENT_NAME_MAX = 120;
const ORDER_SERVICE_MAX = 40;
const NOTE_MAX = 500;
const SEARCH_MAX = 80;

const clientName = requiredText("Informe o cliente.")
    .trim()
    .min(1, { error: "Informe o cliente." })
    .max(CLIENT_NAME_MAX, { error: `Use no máximo ${CLIENT_NAME_MAX} caracteres no cliente.` });

/** Texto opcional: espaços nas pontas saem, e vazio ou null vira null. */
function optionalText({ max, wrongType, tooLong }) {
    return z
        .string({ error: wrongType })
        .trim()
        .max(max, { error: tooLong })
        .nullable()
        .transform((value) => value || null);
}

const orderService = optionalText({
    max: ORDER_SERVICE_MAX,
    wrongType: "Envie a OS como texto.",
    tooLong: `Use no máximo ${ORDER_SERVICE_MAX} caracteres na OS.`,
});
const note = optionalText({
    max: NOTE_MAX,
    wrongType: "Envie a observação como texto.",
    tooLong: `Use no máximo ${NOTE_MAX} caracteres na observação.`,
});

// R13: UUID (ou outro texto aleatório) gerado pelo web a cada tentativa.
const clientRequestId = z
    .string({ error: "Envie o clientRequestId como texto." })
    .regex(/^[A-Za-z0-9_-]{8,64}$/, {
        error: "clientRequestId inválido: use de 8 a 64 letras, números, hífen ou sublinhado.",
    });

export const createMovementBody = jsonBody({
    boxId: objectIdField("Escolha a caixa."),
    clientName,
    orderService: orderService.optional(),
    note: note.optional(),
    clientRequestId: clientRequestId.optional(),
});

export const updateMovementBody = atLeastOneField(
    jsonBody({
        clientName: clientName.optional(),
        orderService: orderService.optional(),
        note: note.optional(),
    })
);

export const changeBoxBody = jsonBody({ boxId: objectIdField("Escolha a caixa nova.") });

export const batchBody = jsonBody({
    ids: z
        .array(objectId, { error: "Envie os serviços numa lista de ids." })
        .min(1, { error: "Escolha pelo menos um serviço." })
        .max(BATCH_MAX_ITEMS, { error: `Escolha no máximo ${BATCH_MAX_ITEMS} serviços por lote.` }),
    action: z.enum(BATCH_ACTIONS, {
        error: `Ação inválida. Use uma destas: ${BATCH_ACTIONS.join(", ")}.`,
    }),
    clientRequestId: clientRequestId.optional(),
});

export const undoBody = jsonBody({
    action: z.enum(UNDO_ACTIONS, {
        error: `Ação inválida. Use uma destas: ${UNDO_ACTIONS.join(", ")}.`,
    }),
});

export const batchParams = z.strictObject({ batchId: objectId });

const status = z.enum(MOVEMENT_STATUSES, { error: "Situação inválida: use open ou out." });

const sort = z.enum(MOVEMENT_SORTS, {
    error: `Ordenação inválida. Use uma destas: ${MOVEMENT_SORTS.join(", ")}.`,
});

// Busca: espaços nas pontas saem; vazia é como não buscar.
const search = z
    .string({ error: "Envie a busca como texto." })
    .trim()
    .max(SEARCH_MAX, { error: `Use no máximo ${SEARCH_MAX} caracteres na busca.` })
    .transform((value) => value || undefined);

const exactOrderService = z
    .string({ error: "Envie a OS como texto." })
    .trim()
    .min(1, { error: "Informe a OS." })
    .max(ORDER_SERVICE_MAX, { error: `Use no máximo ${ORDER_SERVICE_MAX} caracteres na OS.` });

const OUT_ONLY_FILTERS = ["boxReleased", "outFrom", "outTo", "outBy"];

/** Filtros da lista de serviços (GET /movements). */
const movementListShape = {
    status: status.optional(),
    boxReleased: booleanFromQuery.optional(),
    sort: sort.optional(),
    q: search.optional(),
    orderService: exactOrderService.optional(),
    color: boxColor.optional(),
    category: boxCategory.optional(),
    box: objectId.optional(),
    from: sheetDate.optional(),
    to: sheetDate.optional(),
    outFrom: sheetDate.optional(),
    outTo: sheetDate.optional(),
    createdBy: objectId.optional(),
    outBy: objectId.optional(),
    cursor: cursor.optional(),
    limit: pageLimit.optional(),
};

export const listMovementsQuery = z
    .strictObject(movementListShape)
    .refine(...orderedRange("from", "to"))
    .refine(...orderedRange("outFrom", "outTo"))
    .superRefine((value, ctx) => {
        if (value.status === "out") {
            return;
        }
        for (const key of OUT_ONLY_FILTERS) {
            if (value[key] !== undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "Use este filtro junto com status=out.",
                });
            }
        }
    });

/** Os serviços de um dia: só ordenação e página (o dia vem da URL). */
export const sheetItemsQuery = z.strictObject({
    sort: sort.optional(),
    cursor: cursor.optional(),
    limit: pageLimit.optional(),
});
