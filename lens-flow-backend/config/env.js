/**
 * Lê e valida as variáveis de ambiente (veja .env.example).
 *
 * A API não sobe sem banco ou sem JWT_SECRET (seção 7 da especificação):
 * loadConfig lança ConfigError com tudo o que falta, e o server.js encerra.
 */

const DEFAULT_PORT = 5000;
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export class ConfigError extends Error {
    constructor(problems) {
        super(`Configuração inválida:\n- ${problems.join("\n- ")}`);
        this.name = "ConfigError";
        this.problems = problems;
    }
}

export function loadConfig(env = process.env) {
    const problems = [];
    const nodeEnv = (env.NODE_ENV ?? "").trim() || "development";
    const isProduction = nodeEnv === "production";

    const databaseUrl = (env.DATABASE_URL ?? "").trim();
    if (!databaseUrl) {
        problems.push("DATABASE_URL não definida.");
    } else if (!/^mongodb(\+srv)?:\/\//.test(databaseUrl)) {
        problems.push("DATABASE_URL precisa começar com mongodb:// ou mongodb+srv://.");
    }

    const databaseName = (env.DATABASE_NAME ?? "").trim();
    if (!databaseName) {
        problems.push("DATABASE_NAME não definida.");
    }

    const jwtSecret = env.JWT_SECRET ?? "";
    if (!jwtSecret.trim()) {
        problems.push("JWT_SECRET não definida.");
    } else if (isProduction && jwtSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
        problems.push(
            `JWT_SECRET precisa ter pelo menos ${MIN_PRODUCTION_SECRET_LENGTH} caracteres em produção.`
        );
    }

    const corsOrigins = parseOrigins(env.CORS_ORIGINS, problems);
    const port = parsePort(env.PORT, problems);
    const trustProxy = parseTrustProxy(env.TRUST_PROXY);

    if (problems.length > 0) {
        throw new ConfigError(problems);
    }

    return Object.freeze({
        nodeEnv,
        isProduction,
        port,
        databaseUrl,
        databaseName,
        jwtSecret,
        corsOrigins: Object.freeze(corsOrigins),
        trustProxy,
    });
}

function parseOrigins(raw, problems) {
    const values = (raw ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (values.length === 0) {
        problems.push("CORS_ORIGINS não definida (exemplo: http://localhost:5173).");
        return [];
    }

    const origins = [];
    for (const value of values) {
        let url;
        try {
            url = new URL(value);
        } catch {
            problems.push(`CORS_ORIGINS tem uma origem inválida: ${value}`);
            continue;
        }
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        if (!isHttp || url.origin !== value.replace(/\/$/, "")) {
            problems.push(
                `CORS_ORIGINS deve ter só protocolo, host e porta, sem caminho: ${value}`
            );
            continue;
        }
        origins.push(url.origin);
    }
    return origins;
}

function parsePort(raw, problems) {
    const value = (raw ?? "").trim();
    if (!value) {
        return DEFAULT_PORT;
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        problems.push(`PORT inválida: ${value}`);
        return DEFAULT_PORT;
    }
    return port;
}

/**
 * TRUST_PROXY vai direto para o "trust proxy" do Express. Sem proxy, fica
 * desligado; atrás de um proxy reverso, use o número de saltos (ex.: 1), para
 * o limite de tentativas de login enxergar o IP real do cliente.
 */
function parseTrustProxy(raw) {
    const value = (raw ?? "").trim();
    if (!value || value === "false") {
        return false;
    }
    if (value === "true") {
        return true;
    }
    if (/^\d+$/.test(value)) {
        return Number(value);
    }
    return value;
}
