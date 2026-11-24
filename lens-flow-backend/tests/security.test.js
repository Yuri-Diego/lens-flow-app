import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireAuth } from "../middlewares/auth.js";
import { errorHandler } from "../middlewares/errorHandler.js";
import { createApiRouter } from "../routes/index.js";
import { DEFAULT_PASSWORD, TEST_ORIGIN, createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const SOME_ID = "0123456789abcdef01234567";

// Toda rota da API que exige sessão. Se uma rota nova for criada, o teste de
// contagem abaixo falha até ela entrar aqui.
const PROTECTED_ROUTES = [
    ["get", "/api/auth/me"],
    ["patch", "/api/auth/password"],
    ["get", "/api/meta/box-colors"],
    ["get", "/api/boxes"],
    ["get", `/api/boxes/${SOME_ID}`],
    ["post", "/api/boxes"],
    ["post", "/api/boxes/batch"],
    ["patch", `/api/boxes/${SOME_ID}`],
    ["get", "/api/users/options"],
    ["get", "/api/users"],
    ["post", "/api/users"],
    ["patch", `/api/users/${SOME_ID}`],
    ["post", `/api/users/${SOME_ID}/reset-password`],
    ["get", "/api/sheets"],
    ["get", "/api/sheets/2026-11-23"],
    ["get", "/api/movements"],
    ["get", "/api/movements/summary"],
    ["post", "/api/movements"],
    ["post", "/api/movements/batch"],
    ["post", `/api/movements/batch/${SOME_ID}/undo`],
    ["get", `/api/movements/${SOME_ID}`],
    ["patch", `/api/movements/${SOME_ID}`],
    ["delete", `/api/movements/${SOME_ID}`],
    ["post", `/api/movements/${SOME_ID}/change-box`],
    ["post", `/api/movements/${SOME_ID}/checkout`],
    ["post", `/api/movements/${SOME_ID}/release-box`],
    ["post", `/api/movements/${SOME_ID}/undo`],
    ["get", "/api/clients/suggestions?q=otica"],
    ["get", "/api/audit"],
];
const PUBLIC_ROUTES = [
    ["get", "/health"],
    ["get", "/api/health"],
    ["post", "/api/auth/login"],
    ["post", "/api/auth/logout"],
];

let app;

beforeEach(() => {
    app = createTestApp();
});

function routesOf(router) {
    const routes = [];
    for (const layer of router.stack) {
        if (layer.route) {
            for (const method of Object.keys(layer.route.methods)) {
                routes.push(`${method} ${layer.route.path}`);
            }
        } else if (layer.handle?.stack) {
            routes.push(...routesOf(layer.handle));
        }
    }
    return routes;
}

describe("não existe rota de dados sem requireAuth (RN-01)", () => {
    it.each(PROTECTED_ROUTES)("%s %s sem cookie responde 401", async (method, path) => {
        const response = await request(app)[method](path).send({});

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("só a saúde, o login e o logout ficam antes do requireAuth", () => {
        const router = createApiRouter({
            loginLimiter: (req, res, next) => next(),
            passwordLimiter: (req, res, next) => next(),
        });
        const authIndex = router.stack.findIndex((layer) => layer.handle === requireAuth);
        expect(authIndex).toBeGreaterThan(0);

        const beforeAuth = routesOf({ stack: router.stack.slice(0, authIndex) });
        expect(beforeAuth.sort()).toEqual(["get /health", "post /login", "post /logout"]);

        // Todas as outras rotas (montadas depois do requireAuth) estão na lista acima.
        const afterAuth = routesOf({ stack: router.stack.slice(authIndex + 1) });
        expect(afterAuth).toHaveLength(PROTECTED_ROUTES.length);
    });

    it.each(PUBLIC_ROUTES)("%s %s é pública", async (method, path) => {
        const response = await request(app)[method](path).send({});

        expect(response.status).not.toBe(401);
    });

    it("rota desconhecida sob /api pede login antes de responder 404", async () => {
        expect((await request(app).get("/api/nada")).status).toBe(401);

        const { adminCookie } = await setupBusiness(app, "a");
        const response = await request(app).get("/api/nada").set("Cookie", adminCookie);
        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Rota não encontrada." });
    });
});

describe("as rotas antigas não existem mais (S1 a S4, B4 a B9)", () => {
    it.each(["/businesses", "/boxes", "/movements", "/movement-sheets/today/123", "/movement-sheets"])(
        "GET %s responde 404",
        async (path) => {
            const response = await request(app).get(path);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe("NOT_FOUND");
        }
    );

    it.each([
        ["get", "/api/businesses"],
        ["post", "/api/businesses"],
        ["put", `/api/movements/status/${SOME_ID}`],
        ["get", `/api/movements/status/${SOME_ID}`],
        ["get", "/api/movement-sheets"],
        ["delete", `/api/boxes/${SOME_ID}`],
        ["put", `/api/boxes/${SOME_ID}`],
    ])("%s %s responde 404 mesmo com sessão de admin", async (method, path) => {
        const { adminCookie } = await setupBusiness(app, "a");

        const response = await request(app)[method](path).set("Cookie", adminCookie).send({});

        expect(response.status).toBe(404);
    });
});

describe("base de segurança (S6)", () => {
    it("manda os cabeçalhos do helmet e esconde o X-Powered-By", async () => {
        const response = await request(app).get("/api/health");

        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["content-security-policy"]).toBeDefined();
        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(response.headers["x-powered-by"]).toBeUndefined();
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("recusa corpo acima de 100 kB com 413", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({ username: "admin", password: "x".repeat(101 * 1024) });

        expect(response.status).toBe(413);
        expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("responde JSON malformado com 400 no formato padrão (B10)", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "application/json")
            .send('{"username": "admin",');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: { code: "VALIDATION_ERROR", message: "Os dados enviados não são um JSON válido." },
        });
    });

    it("libera CORS com credenciais só para as origens de CORS_ORIGINS", async () => {
        const allowed = await request(app).get("/api/health").set("Origin", TEST_ORIGIN);
        expect(allowed.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
        expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

        const preflight = await request(app)
            .options("/api/boxes")
            .set("Origin", TEST_ORIGIN)
            .set("Access-Control-Request-Method", "PATCH");
        expect(preflight.status).toBe(204);
        expect(preflight.headers["access-control-allow-methods"]).toMatch(/PATCH/);

        const denied = await request(app).get("/api/health").set("Origin", "https://site-estranho.com");
        expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("recusa com 403 requisição que altera dados vinda de outra origem (CSRF)", async () => {
        await setupBusiness(app, "a");
        const credentials = { username: "admin-a", password: DEFAULT_PASSWORD };

        const foreign = await request(app)
            .post("/api/auth/login")
            .set("Origin", "https://site-estranho.com")
            .send(credentials);
        expect(foreign.status).toBe(403);
        expect(foreign.body.error).toEqual({
            code: "FORBIDDEN",
            message: "Origem da requisição não permitida.",
        });
        expect(foreign.headers["set-cookie"]).toBeUndefined();

        const ownSite = await request(app).post("/api/auth/login").set("Origin", TEST_ORIGIN).send(credentials);
        expect(ownSite.status).toBe(200);
    });

    it("erro inesperado vira 500 genérico, sem detalhe nem stack na resposta", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const failing = express();
        failing.get("/falha", () => {
            throw new Error("detalhe interno com senha=123");
        });
        failing.use(errorHandler);

        const response = await request(failing).get("/falha");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: { code: "INTERNAL", message: "Erro interno. Tente de novo em instantes." },
        });
        expect(JSON.stringify(response.body)).not.toMatch(/detalhe interno|stack/);
        expect(consoleError).toHaveBeenCalledOnce();
        consoleError.mockRestore();
    });
});
