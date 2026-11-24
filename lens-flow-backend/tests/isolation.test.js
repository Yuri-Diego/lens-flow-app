import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditEvent, Box, Movement, MovementBatch, User } from "../models/index.js";
import { sheetDateOf } from "../utils/dateUtils.js";
import { DEFAULT_PASSWORD, createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { launch } from "./helpers/movements.js";

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

describe("isolamento nas rotas da F3: serviço, lote e caixa de outra empresa", () => {
    let movementOfB;
    let batchOfB;
    let ownBox;
    let ownMovement;

    beforeEach(async () => {
        movementOfB = await launch(app, b.operatorCookie, {
            boxId: String(boxOfB._id),
            clientName: "Cliente de B",
            orderService: "B-1",
        });
        const batch = await request(app)
            .post("/api/movements/batch")
            .set("Cookie", b.operatorCookie)
            .send({ ids: [movementOfB.id], action: "checkout" });
        batchOfB = batch.body.batchId;
        ownBox = await Box.create({ business: a.business._id, number: "1", color: "azul" });
        ownMovement = await launch(app, a.operatorCookie, { boxId: String(ownBox._id), clientName: "Cliente de A" });
    });

    async function expectBUnchanged() {
        const stored = await Movement.findById(movementOfB.id).lean();
        expect(stored).toMatchObject({ status: "out", clientName: "Cliente de B", deletedAt: null, boxReleasedAt: null });
        expect(await Box.findById(boxOfB._id).lean()).toMatchObject({ state: "occupied", number: "12" });
        expect((await MovementBatch.findById(batchOfB).lean()).items[0].undoneAt).toBeNull();
    }

    it.each([
        ["admin", "get", "/api/movements/{m}", undefined],
        ["admin", "patch", "/api/movements/{m}", { clientName: "Invasor" }],
        ["admin", "delete", "/api/movements/{m}", undefined],
        ["admin", "post", "/api/movements/{m}/change-box", { boxId: "{ownBox}" }],
        ["operador", "post", "/api/movements/{m}/checkout", undefined],
        ["operador", "post", "/api/movements/{m}/release-box", undefined],
        ["admin", "post", "/api/movements/{m}/undo", { action: "checkout" }],
    ])("%s de A: %s %s responde 404", async (who, method, path, body) => {
        const cookie = who === "admin" ? a.adminCookie : a.operatorCookie;
        const payload = body && JSON.parse(JSON.stringify(body).replace("{ownBox}", String(ownBox._id)));

        const response = await request(app)[method](path.replace("{m}", movementOfB.id))
            .set("Cookie", cookie)
            .send(payload);

        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Serviço não encontrado." });
        await expectBUnchanged();
    });

    it("lote e caixa de outra empresa também respondem 404", async () => {
        const undo = await asA("post", `/api/movements/batch/${batchOfB}/undo`).send();
        expect(undo.status).toBe(404);
        expect(undo.body.error.message).toBe("Lote não encontrado.");

        const freeBoxOfB = await Box.create({ business: b.business._id, number: "13", color: "verde" });
        const launchInB = await asA("post", "/api/movements").send({ boxId: String(freeBoxOfB._id), clientName: "X" });
        expect(launchInB.status).toBe(404);
        expect(launchInB.body.error.message).toBe("Caixa não encontrada.");

        const moveToB = await asA("post", `/api/movements/${ownMovement.id}/change-box`).send({
            boxId: String(freeBoxOfB._id),
        });
        expect(moveToB.status).toBe(404);
        expect((await Box.findById(freeBoxOfB._id).lean()).state).toBe("free");

        const batch = await asA("post", "/api/movements/batch").send({
            ids: [movementOfB.id],
            action: "checkout-and-release",
        });
        expect(batch.body.results[0].error.code).toBe("NOT_FOUND");
        await expectBUnchanged();
    });

    it("listas, busca, contadores, folhas e histórico só mostram a própria empresa", async () => {
        const today = sheetDateOf();
        const ids = async (path) => (await asA("get", path)).body.items.map((item) => item.id);

        expect(await ids("/api/movements")).toEqual([ownMovement.id]);
        expect(await ids("/api/movements?status=out")).toEqual([]);
        expect(await ids("/api/movements?q=cliente")).toEqual([ownMovement.id]);
        expect(await ids("/api/movements?q=12")).toEqual([]);
        expect(await ids("/api/movements?status=open&orderService=B-1")).toEqual([]);
        expect(await ids(`/api/movements?box=${boxOfB._id}`)).toEqual([]);
        expect(await ids(`/api/movements?createdBy=${b.operator._id}`)).toEqual([]);
        expect(await ids(`/api/sheets/${today}`)).toEqual([ownMovement.id]);

        const summary = await asA("get", "/api/movements/summary");
        expect(summary.body.counts).toMatchObject({ launchedToday: 1, open: 1, outNotReleased: 0 });

        const sheets = await asA("get", "/api/sheets");
        expect(sheets.body.sheets).toEqual([{ date: today, counts: { launched: 1, out: 0, open: 1 } }]);

        const audit = await asA("get", "/api/audit");
        expect(audit.body.items.length).toBeGreaterThan(0);
        expect(audit.body.items.every((item) => item.user?.id !== String(b.operator._id))).toBe(true);
        const ofB = await asA("get", `/api/audit?entityId=${movementOfB.id}`);
        expect(ofB.body.items).toEqual([]);
    });
});
