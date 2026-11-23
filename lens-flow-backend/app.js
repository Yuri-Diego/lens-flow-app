import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { createLoginLimiter, createPasswordChangeLimiter } from "./middlewares/rateLimit.js";
import { noStore, requireAllowedOrigin } from "./middlewares/security.js";
// Todos os models registrados (o populate do serviço atual da caixa usa Movement).
import "./models/index.js";
import { createApiRouter, healthCheck } from "./routes/index.js";

export const BODY_LIMIT = "100kb";

/**
 * Monta o Express sem banco e sem listen: é o que os testes importam. O
 * server.js valida o ambiente, conecta no banco e escuta na porta.
 *
 * Cada chamada cria limites de tentativas próprios (estado em memória).
 */
export function createApp(config) {
    const app = express();
    app.locals.config = config;

    app.disable("x-powered-by");
    // Query string simples: ?a[b]=1 não vira objeto (sem injeção de operador).
    app.set("query parser", "simple");
    app.set("trust proxy", config.trustProxy);

    app.use(helmet());
    app.use(cors({ origin: [...config.corsOrigins], credentials: true }));
    app.use(express.json({ limit: BODY_LIMIT }));
    app.use(cookieParser());

    // Verificação de saúde para infraestrutura; a do contrato é /api/health.
    app.get("/health", healthCheck);
    app.use(
        "/api",
        noStore,
        requireAllowedOrigin(config.corsOrigins),
        createApiRouter({
            loginLimiter: createLoginLimiter(),
            passwordLimiter: createPasswordChangeLimiter(),
        })
    );

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
