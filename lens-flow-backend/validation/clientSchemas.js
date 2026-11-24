import { CLIENT_SUGGESTIONS } from "../domain/clients.js";
import { normalizeSearchText } from "../domain/text.js";
import { limitParam, requiredText } from "./common.js";
import { z } from "./zod.js";

const MISSING_QUERY = "Digite o começo do nome do cliente.";
const { maxLimit, maxQueryLength } = CLIENT_SUGGESTIONS;

// O começo do nome: espaços nas pontas saem. Vazio, só espaços ou só sinais
// que a busca ignora (acentos soltos) é recusado.
const prefix = requiredText(MISSING_QUERY, "Envie a busca como texto.")
    .trim()
    .min(1, { error: MISSING_QUERY })
    .max(maxQueryLength, { error: `Use no máximo ${maxQueryLength} caracteres na busca.` })
    .refine((value) => normalizeSearchText(value) !== "", { error: MISSING_QUERY });

/** GET /clients/suggestions (D24). */
export const clientSuggestionsQuery = z.strictObject({
    q: prefix,
    limit: limitParam(maxLimit).optional(),
});
