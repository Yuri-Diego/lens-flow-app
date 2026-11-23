import { AppError, conflict, isDuplicateKeyError, notFound } from "../utils/errors.js";

export function notFoundHandler(req, res, next) {
    next(notFound("Rota não encontrada."));
}

/**
 * Responde todo erro no formato da seção 9 da especificação. Erro inesperado
 * vira 500 com mensagem genérica: o detalhe vai só para o log do servidor,
 * nunca para a resposta.
 */
export function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        // Resposta já começou: o handler padrão do Express fecha a conexão.
        return next(error);
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
        console.error(`[api] ${req.method} ${req.originalUrl} falhou:`, error);
    }
    if (appError.headers) {
        res.set(appError.headers);
    }

    const body = { code: appError.code, message: appError.message };
    if (appError.fields) {
        body.fields = appError.fields;
    }
    if (appError.details) {
        body.details = appError.details;
    }
    res.status(appError.status).json({ error: body });
}

function toAppError(error) {
    if (error instanceof AppError) {
        return error;
    }
    // Erros do express.json (body-parser).
    if (error?.type === "entity.too.large") {
        return new AppError(413, "PAYLOAD_TOO_LARGE", "Os dados enviados passam do limite de 100 kB.");
    }
    if (error?.type === "entity.parse.failed") {
        return new AppError(400, "VALIDATION_ERROR", "Os dados enviados não são um JSON válido.");
    }
    if (error?.expose && error.status >= 400 && error.status < 500) {
        return new AppError(400, "VALIDATION_ERROR", "Não foi possível ler os dados enviados.");
    }
    if (isDuplicateKeyError(error)) {
        return conflict("Esse registro já existe.");
    }
    return new AppError(500, "INTERNAL", "Erro interno. Tente de novo em instantes.");
}
