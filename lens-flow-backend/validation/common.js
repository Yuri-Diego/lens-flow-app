import { z } from "./zod.js";

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const objectId = z
    .string({ error: "Identificador inválido." })
    .regex(OBJECT_ID, { error: "Identificador inválido." });

export const idParams = z.strictObject({ id: objectId });

/** Rotas sem parâmetros de consulta: qualquer um é recusado. */
export const emptyQuery = z.strictObject({});

export const booleanField = z.boolean({ error: "Use true ou false." });

export const booleanFromQuery = z
    .enum(["true", "false"], { error: "Use true ou false." })
    .transform((value) => value === "true");

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
