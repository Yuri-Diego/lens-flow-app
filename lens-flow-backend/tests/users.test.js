import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditEvent, User } from "../models/index.js";
import { updateUser } from "../services/userService.js";
import {
    DEFAULT_PASSWORD,
    createBusiness,
    createTestApp,
    createUser,
    findSecrets,
    login,
    sessionCookieFrom,
    setupBusiness,
} from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const NEW_PASSWORD = "senha-nova-789";

let app;
let ctx;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
});

function api(method, path, cookie) {
    return request(app)[method](path).set("Cookie", cookie ?? ctx.adminCookie);
}

function postLogin(username, password = DEFAULT_PASSWORD) {
    return request(app).post("/api/auth/login").send({ username, password });
}

function me(cookie) {
    return request(app).get("/api/auth/me").set("Cookie", cookie);
}

describe("GET /api/users", () => {
    it("lista os usuários da empresa por nome, sem senha nem hash", async () => {
        await createUser({ business: ctx.business, name: "Ana Souza", username: "ana", active: false });

        const response = await api("get", "/api/users");

        expect(response.status).toBe(200);
        expect(response.body.users.map((user) => user.username)).toEqual([
            "admin-a",
            "ana",
            "operador-a",
        ]);
        expect(response.body.users[1]).toEqual({
            id: expect.any(String),
            name: "Ana Souza",
            username: "ana",
            role: "operator",
            active: false,
            locked: false,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
        });
        expect(findSecrets(response.body)).toEqual([]);
    });
});

describe("o operador não acessa a gestão de usuários", () => {
    it.each([
        ["get", "/api/users"],
        ["post", "/api/users"],
        ["patch", "/api/users/{id}"],
        ["post", "/api/users/{id}/reset-password"],
    ])("%s %s responde 403", async (method, path) => {
        const response = await api(
            method,
            path.replace("{id}", String(ctx.admin._id)),
            ctx.operatorCookie
        ).send({ name: "Tentativa", password: NEW_PASSWORD });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
    });
});

describe("POST /api/users", () => {
    const newUser = { name: " Ana Souza ", username: " Ana.Souza ", password: NEW_PASSWORD, role: "operator" };

    it("cria o usuário, que já consegue entrar, e registra no histórico", async () => {
        const response = await api("post", "/api/users").send(newUser);

        expect(response.status).toBe(201);
        expect(response.body.user).toMatchObject({
            name: "Ana Souza",
            username: "ana.souza",
            role: "operator",
            active: true,
        });
        expect(findSecrets(response.body, [NEW_PASSWORD])).toEqual([]);
        expect((await postLogin("ana.souza", NEW_PASSWORD)).status).toBe(200);

        const event = await AuditEvent.findOne({ action: "user.create" }).lean();
        expect(String(event.user)).toBe(String(ctx.admin._id));
        expect(String(event.business)).toBe(String(ctx.business._id));
        expect(String(event.entityId)).toBe(response.body.user.id);
        expect(event.after).toEqual({ name: "Ana Souza", username: "ana.souza", role: "operator", active: true });
        expect(findSecrets(event, [NEW_PASSWORD])).toEqual([]);
    });

    it("recusa usuário repetido sem distinguir maiúsculas, também de outra empresa", async () => {
        const other = await createBusiness("Laboratório B");
        await createUser({ business: other, username: "maria" });

        for (const username of ["OPERADOR-A", "Maria"]) {
            const response = await api("post", "/api/users").send({ ...newUser, username });
            expect(response.status).toBe(409);
            expect(response.body.error).toEqual({
                code: "CONFLICT",
                message: "Esse nome de usuário já está em uso.",
                fields: { username: "Esse nome de usuário já está em uso." },
            });
        }
        expect(await AuditEvent.countDocuments({ action: "user.create" })).toBe(0);
    });

    it.each([
        [{ ...newUser, username: "ab" }, "username"],
        [{ ...newUser, username: "joão" }, "username"],
        [{ ...newUser, username: "ana souza" }, "username"],
        [{ ...newUser, password: "curta" }, "password"],
        [{ ...newUser, password: "x".repeat(65) }, "password"],
        [{ ...newUser, role: "gerente" }, "role"],
        [{ ...newUser, name: "   " }, "name"],
        [{ ...newUser, business: "0123456789abcdef01234567" }, "business"],
    ])("valida o corpo (%o)", async (body, field) => {
        const response = await api("post", "/api/users").send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
        expect(Object.keys(response.body.error.fields)).toContain(field);
    });
});

describe("PATCH /api/users/:id", () => {
    it("edita nome e perfil e grava só o que mudou no histórico", async () => {
        const response = await api("patch", `/api/users/${ctx.operator._id}`).send({
            name: "Operador Chefe",
            role: "admin",
        });

        expect(response.status).toBe(200);
        expect(response.body.user).toMatchObject({ name: "Operador Chefe", role: "admin" });

        const event = await AuditEvent.findOne({ action: "user.update" }).lean();
        expect(event.before).toEqual({ name: "Operador A", role: "operator" });
        expect(event.after).toEqual({ name: "Operador Chefe", role: "admin" });
    });

    it("não grava histórico quando nada muda", async () => {
        const response = await api("patch", `/api/users/${ctx.operator._id}`).send({
            name: "Operador A",
            role: "operator",
        });

        expect(response.status).toBe(200);
        expect(await AuditEvent.countDocuments({ action: "user.update" })).toBe(0);
    });

    it("exige pelo menos um campo e recusa campos que não são editáveis", async () => {
        const empty = await api("patch", `/api/users/${ctx.operator._id}`).send({});
        expect(empty.status).toBe(400);
        expect(empty.body.error.message).toBe("Informe pelo menos um campo para alterar.");

        const username = await api("patch", `/api/users/${ctx.operator._id}`).send({ username: "novo" });
        expect(username.status).toBe(400);
        expect(username.body.error.fields).toEqual({ username: "Campo não permitido." });

        const badId = await api("patch", "/api/users/123").send({ name: "X" });
        expect(badId.status).toBe(400);
        expect(badId.body.error.fields).toEqual({ id: "Identificador inválido." });
    });

    it("desativa o usuário e derruba as sessões dele, inclusive se ele for reativado", async () => {
        const response = await api("patch", `/api/users/${ctx.operator._id}`).send({ active: false });

        expect(response.status).toBe(200);
        expect(response.body.user.active).toBe(false);
        expect((await me(ctx.operatorCookie)).status).toBe(401);
        expect((await postLogin("operador-a")).status).toBe(401);

        await api("patch", `/api/users/${ctx.operator._id}`).send({ active: true });
        expect((await me(ctx.operatorCookie)).status).toBe(401);
        expect((await postLogin("operador-a")).status).toBe(200);

        const events = await AuditEvent.find({ action: "user.update" }).sort({ at: 1 }).lean();
        expect(events.map((event) => event.after)).toEqual([{ active: false }, { active: true }]);
    });

    it("ninguém desativa a si mesmo", async () => {
        const second = await createUser({ business: ctx.business, role: "admin", username: "admin2-a" });

        const response = await api("patch", `/api/users/${ctx.admin._id}`).send({ active: false });

        expect(response.status).toBe(409);
        expect(response.body.error).toEqual({
            code: "CONFLICT",
            message: "Você não pode desativar o seu próprio usuário.",
        });
        expect((await User.findById(second._id).lean()).active).toBe(true);
        expect((await User.findById(ctx.admin._id).lean()).active).toBe(true);
    });

    it("o último admin ativo não pode ser desativado nem rebaixado", async () => {
        const second = await createUser({ business: ctx.business, role: "admin", username: "admin2-a" });
        const secondCookie = await login(app, "admin2-a");

        // Com dois admins, um rebaixa o outro.
        const demote = await api("patch", `/api/users/${ctx.admin._id}`, secondCookie).send({ role: "operator" });
        expect(demote.status).toBe(200);

        // Agora o admin2 é o último: nem ele se rebaixa.
        const last = await api("patch", `/api/users/${second._id}`, secondCookie).send({ role: "operator" });
        expect(last.status).toBe(409);
        expect(last.body.error.message).toMatch(/pelo menos um administrador ativo/);

        // Um admin inativo não conta como admin ativo.
        await User.updateOne({ _id: ctx.admin._id }, { role: "admin", active: false });
        const stillLast = await api("patch", `/api/users/${second._id}`, secondCookie).send({ role: "operator" });
        expect(stillLast.status).toBe(409);
        expect(await User.countDocuments({ role: "admin", active: true })).toBe(1);
    });

    it("dois admins rebaixando um ao outro ao mesmo tempo: só um consegue", async () => {
        const second = await createUser({ business: ctx.business, role: "admin", username: "admin2-a" });
        const authOf = (user) => ({
            userId: String(user._id),
            businessId: String(ctx.business._id),
            role: "admin",
        });

        const results = await Promise.allSettled([
            updateUser(authOf(ctx.admin), String(second._id), { role: "operator" }),
            updateUser(authOf(second), String(ctx.admin._id), { role: "operator" }),
        ]);

        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toMatchObject({ status: 409, code: "CONFLICT" });
        expect(
            await User.countDocuments({ business: ctx.business._id, role: "admin", active: true })
        ).toBe(1);
    });

    it("responde 404 para usuário que não existe", async () => {
        const response = await api("patch", "/api/users/0123456789abcdef01234567").send({ name: "X" });

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe("NOT_FOUND");
    });
});

describe("POST /api/users/:id/reset-password", () => {
    it("redefine a senha, derruba as sessões, desbloqueia e registra sem a senha", async () => {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            await postLogin("operador-a", "senha-errada");
        }
        expect((await postLogin("operador-a")).status).toBe(429);

        const response = await api("post", `/api/users/${ctx.operator._id}/reset-password`).send({
            password: NEW_PASSWORD,
        });

        expect(response.status).toBe(204);
        expect(response.headers["set-cookie"]).toBeUndefined();
        expect((await me(ctx.operatorCookie)).status).toBe(401);
        expect((await postLogin("operador-a")).status).toBe(401);
        expect((await postLogin("operador-a", NEW_PASSWORD)).status).toBe(200);

        const event = await AuditEvent.findOne({ action: "user.reset_password" }).lean();
        expect(String(event.user)).toBe(String(ctx.admin._id));
        expect(String(event.entityId)).toBe(String(ctx.operator._id));
        expect(findSecrets(event, [DEFAULT_PASSWORD, NEW_PASSWORD])).toEqual([]);
    });

    it("o admin que redefine a própria senha continua logado com um cookie novo", async () => {
        const response = await api("post", `/api/users/${ctx.admin._id}/reset-password`).send({
            password: NEW_PASSWORD,
        });

        expect(response.status).toBe(204);
        expect((await me(sessionCookieFrom(response))).status).toBe(200);
        expect((await me(ctx.adminCookie)).status).toBe(401);
    });

    it("valida a senha nova", async () => {
        const response = await api("post", `/api/users/${ctx.operator._id}/reset-password`).send({
            password: "curta",
        });

        expect(response.status).toBe(400);
        expect(response.body.error.fields.password).toMatch(/pelo menos 8/);
    });
});
