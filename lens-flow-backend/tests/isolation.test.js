import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditEvent, Box, User } from "../models/index.js";
import { DEFAULT_PASSWORD, createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

let app;
let a;
let b;
let boxOfB;

beforeEach(async () => {
    app = createTestApp();
    a = await setupBusiness(app, "a");
    b = await setupBusiness(app, "b");
    boxOfB = await Box.create({ business: b.business._id, number: "12", color: "vermelha" });
});

function asA(method, path, cookie = a.adminCookie) {
    return request(app)[method](path).set("Cookie", cookie);
}

describe("isolamento entre empresas: recurso de outra empresa responde 404", () => {
    it.each([
        ["admin", "get", "/api/boxes/{box}", undefined],
        ["operador", "get", "/api/boxes/{box}", undefined],
        ["admin", "patch", "/api/boxes/{box}", { active: false }],
        ["admin", "patch", "/api/boxes/{box}", { number: "99", color: "azul" }],
    ])("%s de A: %s %s", async (who, method, path, body) => {
        const cookie = who === "admin" ? a.adminCookie : a.operatorCookie;

        const response = await asA(method, path.replace("{box}", String(boxOfB._id)), cookie).send(body);

        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Caixa não encontrada." });
        expect(await Box.findById(boxOfB._id).lean()).toMatchObject({
            number: "12",
            color: "vermelha",
            active: true,
        });
    });

    it.each([
        ["patch", "/api/users/{user}", { name: "Invasor", active: false }],
        ["post", "/api/users/{user}/reset-password", { password: "senha-do-invasor" }],
    ])("admin de A: %s %s", async (method, path, body) => {
        const response = await asA(method, path.replace("{user}", String(b.operator._id))).send(body);

        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Usuário não encontrado." });
        expect(await User.findById(b.operator._id).lean()).toMatchObject({
            name: "Operador B",
            active: true,
        });
        expect((await request(app).post("/api/auth/login").send({
            username: "operador-b",
            password: DEFAULT_PASSWORD,
        })).status).toBe(200);
    });

    it("as listas só mostram a própria empresa", async () => {
        const boxes = await asA("get", "/api/boxes");
        expect(boxes.body.boxes).toEqual([]);

        const byNumber = await asA("get", "/api/boxes?number=12");
        expect(byNumber.body.boxes).toEqual([]);

        const users = await asA("get", "/api/users");
        expect(users.body.users.map((user) => user.username).sort()).toEqual(["admin-a", "operador-a"]);
    });

    it("o número de uma caixa de B fica livre em A, e a caixa nova vai para A", async () => {
        const response = await asA("post", "/api/boxes").send({ number: "12", color: "azul" });

        expect(response.status).toBe(201);
        const created = await Box.findById(response.body.box.id).lean();
        expect(String(created.business)).toBe(String(a.business._id));
    });

    it("a empresa não pode ser escolhida pelo corpo nem pela consulta", async () => {
        const body = await asA("post", "/api/boxes").send({
            number: "40",
            color: "azul",
            business: String(b.business._id),
        });
        expect(body.status).toBe(400);
        expect(body.body.error.fields).toEqual({ business: "Campo não permitido." });

        const query = await asA("get", `/api/boxes?business=${b.business._id}`);
        expect(query.status).toBe(400);

        const user = await asA("post", "/api/users").send({
            name: "X",
            username: "xis",
            password: DEFAULT_PASSWORD,
            role: "operator",
            business: String(b.business._id),
        });
        expect(user.status).toBe(400);
        expect(await Box.countDocuments({ business: b.business._id })).toBe(1);
        expect(await AuditEvent.countDocuments()).toBe(0);
    });
});
