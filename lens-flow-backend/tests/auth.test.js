import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AuditEvent, Business, User } from "../models/index.js";
import { LOGIN_FAILURES_PER_IP } from "../middlewares/rateLimit.js";
import {
    DEFAULT_PASSWORD,
    TEST_CONFIG,
    createTestApp,
    findSecrets,
    login,
    sessionCookieFrom,
    setupBusiness,
} from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const GENERIC_LOGIN_ERROR = {
    error: { code: "INVALID_CREDENTIALS", message: "Usuário ou senha inválidos." },
};

let app;
let ctx;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
});

afterEach(() => {
    vi.useRealTimers();
});

function postLogin(body, targetApp = app) {
    return request(targetApp).post("/api/auth/login").send(body);
}

function getMe(cookie) {
    const pending = request(app).get("/api/auth/me");
    return cookie ? pending.set("Cookie", cookie) : pending;
}

function cookieAttributes(response) {
    const raw = response.headers["set-cookie"].find((value) => value.startsWith("lf_session="));
    return raw.split(";").map((part) => part.trim().toLowerCase());
}

describe("POST /api/auth/login", () => {
    it("entra com usuário e senha certos e devolve o usuário com a empresa", async () => {
        const response = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            user: {
                id: String(ctx.admin._id),
                name: "Admin A",
                username: "admin-a",
                role: "admin",
                business: { id: String(ctx.business._id), name: "Laboratório A" },
            },
        });
        expect(findSecrets(response.body)).toEqual([]);

        const stored = await User.findById(ctx.admin._id).lean();
        expect(stored.lastLoginAt).toBeInstanceOf(Date);
    });

    it("grava a sessão num cookie httpOnly, SameSite=Lax, em /api e com 12 h", async () => {
        const response = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD });
        const attributes = cookieAttributes(response);

        expect(attributes).toEqual(
            expect.arrayContaining(["httponly", "samesite=lax", "path=/api", "max-age=43200"])
        );
        expect(attributes).not.toContain("secure");

        const token = sessionCookieFrom(response).slice("lf_session=".length);
        const payload = jwt.verify(token, TEST_CONFIG.jwtSecret);
        expect(payload.exp - payload.iat).toBe(12 * 60 * 60);
        expect(payload).toMatchObject({
            sub: String(ctx.admin._id),
            bid: String(ctx.business._id),
            ver: 0,
        });
    });

    it("marca o cookie como Secure em produção", async () => {
        const productionApp = createTestApp({ isProduction: true, nodeEnv: "production" });
        const response = await postLogin(
            { username: "admin-a", password: DEFAULT_PASSWORD },
            productionApp
        );

        expect(response.status).toBe(200);
        expect(cookieAttributes(response)).toContain("secure");
    });

    it("não distingue maiúsculas nem espaços no usuário", async () => {
        const response = await postLogin({ username: "  ADMIN-A ", password: DEFAULT_PASSWORD });

        expect(response.status).toBe(200);
        expect(response.body.user.username).toBe("admin-a");
    });

    it("responde o mesmo erro genérico para senha errada, usuário inexistente e usuário inativo", async () => {
        await User.updateOne({ _id: ctx.operator._id }, { active: false });

        const attempts = [
            { username: "admin-a", password: "senha-errada" },
            { username: "ninguem", password: DEFAULT_PASSWORD },
            { username: "operador-a", password: DEFAULT_PASSWORD },
        ];
        for (const body of attempts) {
            const response = await postLogin(body);
            expect(response.status).toBe(401);
            expect(response.body).toEqual(GENERIC_LOGIN_ERROR);
            expect(response.headers["set-cookie"]).toBeUndefined();
        }
    });

    it("recusa com o erro genérico quem está numa empresa que não existe mais", async () => {
        await Business.deleteOne({ _id: ctx.business._id });

        const response = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD });

        expect(response.status).toBe(401);
        expect(response.body).toEqual(GENERIC_LOGIN_ERROR);
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("bloqueia o usuário na 6ª tentativa depois de 5 senhas erradas, mesmo com a senha certa", async () => {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const response = await postLogin({ username: "operador-a", password: "senha-errada" });
            expect(response.status).toBe(401);
            expect(response.body).toEqual(GENERIC_LOGIN_ERROR);
        }

        const sixth = await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD });

        expect(sixth.status).toBe(429);
        expect(sixth.body.error.code).toBe("RATE_LIMITED");
        expect(sixth.body.error.message).toMatch(/Muitas tentativas/);
        expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(14 * 60);
        expect(sixth.headers["set-cookie"]).toBeUndefined();

        const stored = await User.findById(ctx.operator._id).select("+failedLogins").lean();
        expect(stored.lockedUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
        expect(stored.failedLogins).toBe(0);

        const lockEvent = await AuditEvent.findOne({ action: "user.lock" }).lean();
        expect(lockEvent).toMatchObject({ user: null, entity: "User" });
        expect(String(lockEvent.entityId)).toBe(String(ctx.operator._id));
    });

    it("libera o login quando os 15 min de bloqueio passam", async () => {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            await postLogin({ username: "operador-a", password: "senha-errada" });
        }
        const { lockedUntil } = await User.findById(ctx.operator._id).lean();

        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(lockedUntil.getTime() - 1000));
        expect((await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD })).status).toBe(429);

        vi.setSystemTime(new Date(lockedUntil.getTime() + 1000));
        const response = await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD });
        expect(response.status).toBe(200);
        expect((await User.findById(ctx.operator._id).lean()).lockedUntil).toBeNull();
    });

    it("zera o contador de erros quando o login dá certo", async () => {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            await postLogin({ username: "operador-a", password: "senha-errada" });
        }
        expect((await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD })).status).toBe(200);
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            await postLogin({ username: "operador-a", password: "senha-errada" });
        }

        const response = await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD });
        expect(response.status).toBe(200);
    });

    it(`limita por IP: a tentativa errada depois de ${LOGIN_FAILURES_PER_IP} recebe 429`, async () => {
        for (let attempt = 1; attempt <= LOGIN_FAILURES_PER_IP; attempt += 1) {
            const response = await postLogin({ username: `ninguem${attempt}`, password: "x" });
            expect(response.status).toBe(401);
        }

        const blocked = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD });
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.code).toBe("RATE_LIMITED");
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("não conta os logins que dão certo no limite por IP", async () => {
        for (let attempt = 1; attempt <= LOGIN_FAILURES_PER_IP + 5; attempt += 1) {
            const response = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD });
            expect(response.status).toBe(200);
        }
    });

    it("valida o corpo com campos obrigatórios e sem campos extras", async () => {
        const missing = await postLogin({});
        expect(missing.status).toBe(400);
        expect(missing.body.error).toMatchObject({
            code: "VALIDATION_ERROR",
            fields: { username: "Informe o usuário.", password: "Informe a senha." },
        });

        const extra = await postLogin({ username: "admin-a", password: DEFAULT_PASSWORD, role: "admin" });
        expect(extra.status).toBe(400);
        expect(extra.body.error.fields).toEqual({ role: "Campo não permitido." });

        const notJson = await request(app)
            .post("/api/auth/login")
            .set("Content-Type", "text/plain")
            .send("admin-a:senha");
        expect(notJson.status).toBe(400);
        expect(notJson.body.error.code).toBe("VALIDATION_ERROR");
    });
});

describe("GET /api/auth/me", () => {
    it("devolve o usuário da sessão com o cookie", async () => {
        const response = await getMe(ctx.operatorCookie);

        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({
            id: String(ctx.operator._id),
            name: "Operador A",
            username: "operador-a",
            role: "operator",
            business: { id: String(ctx.business._id), name: "Laboratório A" },
        });
        expect(findSecrets(response.body)).toEqual([]);
    });

    it("responde 401 sem cookie", async () => {
        const response = await getMe();

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("responde 401 e apaga o cookie quando o token é inválido", async () => {
        const otherSecret = jwt.sign(
            { bid: String(ctx.business._id), ver: 0 },
            "outro-segredo-qualquer-com-32-caracteres!",
            { subject: String(ctx.admin._id), expiresIn: "12h" }
        );
        const unsigned = [
            Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
            Buffer.from(
                JSON.stringify({ sub: String(ctx.admin._id), bid: String(ctx.business._id), ver: 0 })
            ).toString("base64url"),
            "",
        ].join(".");

        for (const token of ["lixo", otherSecret, unsigned]) {
            const response = await getMe(`lf_session=${token}`);
            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe("UNAUTHENTICATED");
            expect(response.headers["set-cookie"].join(";")).toMatch(/lf_session=;/);
        }
    });

    it("expira a sessão depois de 12 h", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const start = new Date("2026-11-23T08:00:00.000Z");
        vi.setSystemTime(start);
        const cookie = await login(app, "operador-a");

        vi.setSystemTime(new Date(start.getTime() + TWELVE_HOURS_MS - 60_000));
        expect((await getMe(cookie)).status).toBe(200);

        vi.setSystemTime(new Date(start.getTime() + TWELVE_HOURS_MS + 1000));
        const expired = await getMe(cookie);
        expect(expired.status).toBe(401);
        expect(expired.body.error).toEqual({
            code: "UNAUTHENTICATED",
            message: "Sua sessão expirou. Entre de novo.",
        });
    });

    it("derruba a sessão de quem foi desativado, sem esperar o token vencer", async () => {
        await User.updateOne({ _id: ctx.operator._id }, { active: false });

        expect((await getMe(ctx.operatorCookie)).status).toBe(401);
    });
});

describe("POST /api/auth/logout", () => {
    it("apaga o cookie, com ou sem sessão", async () => {
        for (const cookie of [ctx.adminCookie, undefined]) {
            const pending = request(app).post("/api/auth/logout");
            const response = await (cookie ? pending.set("Cookie", cookie) : pending);

            expect(response.status).toBe(204);
            const cleared = response.headers["set-cookie"].find((value) => value.startsWith("lf_session="));
            expect(cleared).toMatch(/^lf_session=;/);
            expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
            expect(cleared).toMatch(/Path=\/api/);
        }
    });
});

describe("PATCH /api/auth/password", () => {
    const NEW_PASSWORD = "outra-senha-forte-456";

    function changePassword(cookie, body) {
        return request(app).patch("/api/auth/password").set("Cookie", cookie).send(body);
    }

    it("troca a senha, mantém esta sessão e derruba as outras", async () => {
        const otherDevice = await login(app, "operador-a");

        const response = await changePassword(ctx.operatorCookie, {
            currentPassword: DEFAULT_PASSWORD,
            newPassword: NEW_PASSWORD,
        });

        expect(response.status).toBe(204);
        const renewed = sessionCookieFrom(response);
        expect((await getMe(renewed)).status).toBe(200);
        expect((await getMe(otherDevice)).status).toBe(401);
        expect((await getMe(ctx.operatorCookie)).status).toBe(401);

        expect((await postLogin({ username: "operador-a", password: DEFAULT_PASSWORD })).status).toBe(401);
        expect((await postLogin({ username: "operador-a", password: NEW_PASSWORD })).status).toBe(200);

        const event = await AuditEvent.findOne({ action: "user.change_password" }).lean();
        expect(String(event.user)).toBe(String(ctx.operator._id));
        expect(findSecrets(event, [DEFAULT_PASSWORD, NEW_PASSWORD])).toEqual([]);
    });

    it("recusa a senha atual errada sem mudar nada", async () => {
        const response = await changePassword(ctx.operatorCookie, {
            currentPassword: "nao-e-essa",
            newPassword: NEW_PASSWORD,
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Senha atual incorreta.",
            fields: { currentPassword: "Senha atual incorreta." },
        });
        expect((await getMe(ctx.operatorCookie)).status).toBe(200);
    });

    it("valida a nova senha", async () => {
        const short = await changePassword(ctx.operatorCookie, {
            currentPassword: DEFAULT_PASSWORD,
            newPassword: "curta",
        });
        expect(short.status).toBe(400);
        expect(short.body.error.fields.newPassword).toMatch(/pelo menos 8/);

        const same = await changePassword(ctx.operatorCookie, {
            currentPassword: DEFAULT_PASSWORD,
            newPassword: DEFAULT_PASSWORD,
        });
        expect(same.status).toBe(400);
        expect(same.body.error.fields.newPassword).toMatch(/diferente da atual/);
    });

    it("exige sessão", async () => {
        const response = await request(app)
            .patch("/api/auth/password")
            .send({ currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD });

        expect(response.status).toBe(401);
    });
});
