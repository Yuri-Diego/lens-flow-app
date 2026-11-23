import { fromZodIssues } from "../utils/errors.js";

const PARTS = ["params", "query", "body"];

/**
 * Valida params, query e body com zod. Os valores já validados (e
 * normalizados) ficam em req.validated; o controller nunca lê req.body cru.
 */
export function validate(schemas) {
    return function validateRequest(req, res, next) {
        const validated = {};
        const issues = [];

        for (const part of PARTS) {
            const schema = schemas[part];
            if (!schema) {
                continue;
            }
            const input = part === "body" ? (req.body ?? {}) : req[part];
            const result = schema.safeParse(input);
            if (result.success) {
                validated[part] = result.data;
            } else {
                issues.push(...result.error.issues);
            }
        }

        if (issues.length > 0) {
            return next(fromZodIssues(issues));
        }
        req.validated = validated;
        return next();
    };
}
