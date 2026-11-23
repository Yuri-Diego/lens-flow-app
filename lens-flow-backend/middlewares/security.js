import { forbidden } from "../utils/errors.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defesa contra CSRF além do cookie SameSite=Lax: uma requisição que altera
 * dados e vem de um navegador traz o cabeçalho Origin, que precisa estar em
 * CORS_ORIGINS. Sem Origin (curl, scripts) a requisição segue normalmente,
 * porque o ataque de CSRF depende do navegador.
 */
export function requireAllowedOrigin(allowedOrigins) {
    const allowed = new Set(allowedOrigins);
    return function allowedOriginGuard(req, res, next) {
        if (!UNSAFE_METHODS.has(req.method)) {
            return next();
        }
        const origin = req.get("origin");
        if (origin === undefined || allowed.has(origin)) {
            return next();
        }
        return next(forbidden("Origem da requisição não permitida."));
    };
}

/** Respostas da API não ficam em cache (aparelho compartilhado, D12). */
export function noStore(req, res, next) {
    res.set("Cache-Control", "no-store");
    next();
}
