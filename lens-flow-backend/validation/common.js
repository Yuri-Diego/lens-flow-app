import { isValidSheetDate } from "../utils/dateUtils.js";
import { MAX_PAGE_SIZE } from "../services/pagination.js";
import { z } from "./zod.js";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const CURSOR_MAX_LENGTH = 500;

/** Id de 24 hexadecimais, em minúsculas (o mesmo id escrito de outro jeito é o mesmo). */
export function objectIdField(missingMessage = "Identificador inválido.") {
    return z
        .string({
            error: (issue) =>
                issue.input === undefined ? missingMessage : "Identificador inválido.",
        })
        .regex(OBJECT_ID, { error: "Identificador inválido." })
        .transform((value) => value.toLowerCase());
}

export const objectId = objectIdField();

export const idParams = z.strictObject({ id: objectId });

/** Rotas sem parâmetros de consulta: qualquer um é recusado. */
export const emptyQuery = z.strictObject({});

/** Rotas sem corpo: um corpo vazio passa, qualquer campo é recusado. */
export const emptyBody = z.strictObject({}, { error: "Envie os dados como um objeto JSON." });

export const booleanField = z.boolean({ error: "Use true ou false." });

export const booleanFromQuery = z
    .enum(["true", "false"], { error: "Use true ou false." })
    .transform((value) => value === "true");

/** Data de folha AAAA-MM-DD que existe no calendário. */
export const sheetDate = z
    .string({ error: "Use a data no formato AAAA-MM-DD." })
    .refine(isValidSheetDate, { error: "Use uma data válida no formato AAAA-MM-DD." });

/** Tamanho da página: de 1 a 100 (padrão 50, no service). */
export const pageLimit = z
    .string({ error: `Use um número de 1 a ${MAX_PAGE_SIZE}.` })
    .regex(/^\d{1,3}$/, { error: `Use um número de 1 a ${MAX_PAGE_SIZE}.` })
    .transform(Number)
    .refine((value) => value >= 1 && value <= MAX_PAGE_SIZE, {
        error: `Use um número de 1 a ${MAX_PAGE_SIZE}.`,
    });

export const cursor = z
    .string({ error: "Cursor inválido. Recarregue a lista." })
    .min(1, { error: "Cursor inválido. Recarregue a lista." })
    .max(CURSOR_MAX_LENGTH, { error: "Cursor inválido. Recarregue a lista." });

/** Período com início e fim opcionais: o fim não pode vir antes do início. */
export function orderedRange(fromKey, toKey) {
    return [
        (value) => !(value[fromKey] && value[toKey] && value[fromKey] > value[toKey]),
        { error: "A data final precisa ser igual ou posterior à inicial.", path: [toKey] },
    ];
}

/** Texto obrigatório, com mensagem diferente para ausente e para tipo errado. */
export function requiredText(missingMessage, wrongTypeMessage = "Envie este campo como texto.") {
    return z.string({
        error: (issue) => (issue.input === undefined ? missingMessage : wrongTypeMessage),
    });
}

/** Corpo JSON com estes campos e nenhum outro (.strict()). */
export function jsonBody(shape) {
    return z.strictObject(shape, { error: "Envie os dados como um objeto JSON." });
}

/** Num PATCH, exige pelo menos um campo. */
export function atLeastOneField(schema) {
    return schema.refine((value) => Object.keys(value).length > 0, {
        error: "Informe pelo menos um campo para alterar.",
    });
}
