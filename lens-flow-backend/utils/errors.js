/**
 * Erros da API no formato da seção 9 da especificação:
 * { "error": { "code", "message", "fields"?, "details"? } }.
 * As mensagens são em pt-BR e podem ir direto para a tela.
 */

export class AppError extends Error {
    constructor(status, code, message, { fields, details, headers } = {}) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.fields = fields;
        this.details = details;
        this.headers = headers;
    }
}

export function validationError(fields, message = "Confira os campos destacados.") {
    return new AppError(400, "VALIDATION_ERROR", message, { fields });
}

export function unauthenticated(message = "Entre com seu usuário e senha para continuar.") {
    return new AppError(401, "UNAUTHENTICATED", message);
}

export function invalidCredentials() {
    return new AppError(401, "INVALID_CREDENTIALS", "Usuário ou senha inválidos.");
}

export function forbidden(message = "Você não tem permissão para fazer isso.") {
    return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Não encontrado.") {
    return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message, fields) {
    return new AppError(409, "CONFLICT", message, { fields });
}

export function boxOccupied(message, details) {
    return new AppError(409, "BOX_OCCUPIED", message, { details });
}

export function tooManyAttempts(retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return new AppError(
        429,
        "RATE_LIMITED",
        `Muitas tentativas. Aguarde ${minutes} min e tente de novo.`,
        { headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) } }
    );
}

export function isDuplicateKeyError(error) {
    return error?.code === 11000;
}

/**
 * Converte as issues do zod em erro 400. Campos extras (.strict()) viram
 * "Campo não permitido."; um problema no objeto inteiro (sem caminho) vira a
 * mensagem principal.
 */
export function fromZodIssues(issues) {
    const fields = {};
    let rootMessage;

    for (const issue of issues) {
        if (issue.code === "unrecognized_keys") {
            for (const key of issue.keys) {
                addField(fields, [...issue.path, key], "Campo não permitido.");
            }
            continue;
        }
        if (issue.path.length === 0) {
            rootMessage ??= issue.message;
            continue;
        }
        addField(fields, issue.path, issue.message);
    }

    const hasFields = Object.keys(fields).length > 0;
    return validationError(
        hasFields ? fields : undefined,
        rootMessage ?? "Confira os campos destacados."
    );
}

function addField(fields, path, message) {
    const key = path.map(String).join(".");
    if (!(key in fields)) {
        fields[key] = message;
    }
}
