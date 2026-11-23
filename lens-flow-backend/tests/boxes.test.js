import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { compareBoxNumbers } from "../domain/boxNumbers.js";
import { AuditEvent, Box, Movement, MovementSheet } from "../models/index.js";
import { createBusiness, createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

let app;
let ctx;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
});

function api(method, path, cookie) {
    return request(app)[method](path).set("Cookie", cookie ?? ctx.adminCookie);
}

function createBoxDirect(number, color = "branca", extra = {}) {
    return Box.create({ business: ctx.business._id, number, color, ...extra });
}

/** Ocupa a caixa com um serviço aberto, como a F3 vai fazer. */
async function occupy(box, clientName = "Ótica Central") {
    const sheet = await MovementSheet.create({ business: ctx.business._id, date: "2026-11-22" });
    const movement = await Movement.create({
        business: ctx.business._id,
        sheet: sheet._id,
        sheetDate: sheet.date,
        box: box._id,
        boxSnapshot: { number: box.number, color: box.color, category: box.category },
        clientName,
        orderService: "4521",
        createdBy: ctx.operator._id,
    });
    await Box.updateOne({ _id: box._id }, { state: "occupied", currentMovement: movement._id });
    return movement;
}

describe("POST /api/boxes", () => {
    it("cadastra a caixa com a categoria derivada da cor e registra no histórico", async () => {
        const response = await api("post", "/api/boxes").send({ number: "12", color: "vermelha" });

        expect(response.status).toBe(201);
        expect(response.body.box).toEqual({
            id: expect.any(String),
            number: "12",
            color: "vermelha",
            colorLabel: "Vermelha",
            category: "urgent",
            categoryLabel: "Urgente",
            state: "free",
            active: true,
            currentMovement: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
        });

        const event = await AuditEvent.findOne({ action: "box.create" }).lean();
        expect(String(event.user)).toBe(String(ctx.admin._id));
        expect(String(event.entityId)).toBe(response.body.box.id);
        expect(event.before).toBeNull();
        expect(event.after).toEqual({
            number: "12",
            color: "vermelha",
            category: "urgent",
            state: "free",
            active: true,
        });
    });

    it("guarda o número como na etiqueta, com o zero à esquerda (D18)", async () => {
        const response = await api("post", "/api/boxes").send({ number: "007", color: "azul" });

        expect(response.status).toBe(201);
        expect(response.body.box.number).toBe("007");
    });

    it('"007" e "7" são caixas diferentes, e cada uma só existe uma vez (D18)', async () => {
        await createBoxDirect("7", "branca");

        const zeroPadded = await api("post", "/api/boxes").send({ number: "007", color: "verde" });
        expect(zeroPadded.status).toBe(201);

        const again = await api("post", "/api/boxes").send({ number: "007", color: "azul" });
        expect(again.status).toBe(409);
        expect(again.body.error.fields).toEqual({ number: "Já existe a caixa 007 (Verde)." });
        expect((await Box.find().lean()).map((box) => box.number).sort()).toEqual(["007", "7"]);
    });

    it.each([
        [{ number: "12a", color: "branca" }, { number: "Use só dígitos no número da caixa." }],
        [{ number: "0", color: "branca" }, { number: "O número da caixa precisa ser maior que zero." }],
        [{ number: "1234567", color: "branca" }, { number: "O número da caixa pode ter no máximo 6 dígitos." }],
        [{ number: "", color: "branca" }, { number: "Use só dígitos no número da caixa." }],
        [{ number: 12, color: "branca" }, { number: 'Envie o número da caixa como texto, por exemplo "12".' }],
        [{ color: "branca" }, { number: "Informe o número da caixa." }],
        [
            { number: "12", color: "roxa" },
            { color: "Cor inválida. Use uma destas: branca, preta, verde, amarela, vermelha, azul." },
        ],
        [{ number: "12", color: "#FF0000" }, { color: expect.stringMatching(/^Cor inválida/) }],
        [{ number: "12", color: "branca", category: "urgent" }, { category: "Campo não permitido." }],
        [{ number: "12", color: "branca", business: "0123456789abcdef01234567" }, { business: "Campo não permitido." }],
    ])("valida o corpo %o", async (body, fields) => {
        const response = await api("post", "/api/boxes").send(body);

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Confira os campos destacados.",
            fields,
        });
        expect(await Box.countDocuments()).toBe(0);
    });

    it("recusa número repetido com 409, inclusive em outra cor (D4)", async () => {
        await createBoxDirect("12", "azul");

        for (const body of [
            { number: "12", color: "azul" },
            { number: "12", color: "vermelha" },
            { number: " 12 ", color: "verde" },
        ]) {
            const response = await api("post", "/api/boxes").send(body);
            expect(response.status).toBe(409);
            expect(response.body.error).toEqual({
                code: "CONFLICT",
                message: "Já existe a caixa 12 (Azul). O número não se repete, nem em outra cor.",
                fields: { number: "Já existe a caixa 12 (Azul)." },
            });
        }
        expect(await Box.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments({ action: "box.create" })).toBe(0);
    });

    it("o mesmo número pode existir em outra empresa", async () => {
        const other = await createBusiness("Laboratório B");
        await Box.create({ business: other._id, number: "12", color: "azul" });

        const response = await api("post", "/api/boxes").send({ number: "12", color: "azul" });

        expect(response.status).toBe(201);
    });
});

describe("GET /api/boxes", () => {
    it("lista em ordem natural de número, todas as cores juntas, com 7 antes de 007", async () => {
        for (const [number, color] of [
            ["10", "branca"],
            ["007", "amarela"],
            ["2", "vermelha"],
            ["100", "azul"],
            ["1", "verde"],
            ["7", "branca"],
            ["21", "preta"],
        ]) {
            await createBoxDirect(number, color);
        }

        const response = await api("get", "/api/boxes", ctx.operatorCookie);

        expect(response.status).toBe(200);
        expect(response.body.boxes.map((box) => box.number)).toEqual(["1", "2", "7", "007", "10", "21", "100"]);
    });

    it("filtra por estado, cor, categoria, número e ativo", async () => {
        const occupiedBox = await createBoxDirect("3", "verde");
        await occupy(occupiedBox);
        await createBoxDirect("4", "amarela");
        await createBoxDirect("10", "azul");
        await createBoxDirect("11", "branca", { active: false });

        const numbers = async (query) =>
            (await api("get", `/api/boxes?${query}`)).body.boxes.map((box) => box.number);

        expect(await numbers("state=occupied")).toEqual(["3"]);
        expect(await numbers("state=free")).toEqual(["4", "10", "11"]);
        expect(await numbers("color=azul")).toEqual(["10"]);
        expect(await numbers("category=with_assembly")).toEqual(["3", "4"]);
        expect(await numbers("number=10")).toEqual(["10"]);
        // D18: o número é exato; "0010" é outra caixa.
        expect(await numbers("number=0010")).toEqual([]);
        expect(await numbers("number=99")).toEqual([]);
        expect(await numbers("active=false")).toEqual(["11"]);
        expect(await numbers("active=true&color=verde")).toEqual(["3"]);
    });

    it("pelo número, devolve a caixa ocupada com cliente, OS, autor e data do serviço (R1)", async () => {
        const box = await createBoxDirect("12", "vermelha");
        const movement = await occupy(box, "Ótica Central");

        const response = await api("get", "/api/boxes?number=12", ctx.operatorCookie);

        expect(response.status).toBe(200);
        expect(response.body.boxes).toHaveLength(1);
        expect(response.body.boxes[0]).toMatchObject({
            number: "12",
            state: "occupied",
            currentMovement: {
                id: String(movement._id),
                clientName: "Ótica Central",
                orderService: "4521",
                status: "open",
                sheetDate: "2026-11-22",
                createdAt: movement.createdAt.toISOString(),
                createdBy: { id: String(ctx.operator._id), name: "Operador A" },
            },
        });
    });

    it.each([
        ["state=cheia", "state"],
        ["color=roxa", "color"],
        ["category=rapida", "category"],
        ["number=abc", "number"],
        ["active=sim", "active"],
        ["business=0123456789abcdef01234567", "business"],
        ["state=free&state=occupied", "state"],
        ["number[$ne]=1", "number[$ne]"],
    ])("recusa a consulta %s", async (query, field) => {
        const response = await api("get", `/api/boxes?${query}`);

        expect(response.status).toBe(400);
        expect(Object.keys(response.body.error.fields)).toEqual([field]);
    });
});

describe("GET /api/boxes/:id", () => {
    it("devolve a caixa para qualquer logado", async () => {
        const box = await createBoxDirect("5", "preta");

        const response = await api("get", `/api/boxes/${box._id}`, ctx.operatorCookie);

        expect(response.status).toBe(200);
        expect(response.body.box).toMatchObject({ id: String(box._id), number: "5", category: "without_assembly" });
    });

    it("responde 400 para id malformado e 404 para caixa que não existe", async () => {
        const malformed = await api("get", "/api/boxes/abc");
        expect(malformed.status).toBe(400);
        expect(malformed.body.error.fields).toEqual({ id: "Identificador inválido." });

        const missing = await api("get", `/api/boxes/${new mongoose.Types.ObjectId()}`);
        expect(missing.status).toBe(404);
        expect(missing.body.error).toEqual({ code: "NOT_FOUND", message: "Caixa não encontrada." });
    });
});

describe("PATCH /api/boxes/:id", () => {
    it("edita número, cor e ativo, rederiva a categoria e registra antes e depois (B1)", async () => {
        const box = await createBoxDirect("8", "branca");

        const response = await api("patch", `/api/boxes/${box._id}`).send({
            number: "80",
            color: "azul",
            active: false,
        });

        expect(response.status).toBe(200);
        expect(response.body.box).toMatchObject({
            number: "80",
            color: "azul",
            category: "with_treatment",
            categoryLabel: "Com tratamento",
            active: false,
        });

        const event = await AuditEvent.findOne({ action: "box.update" }).lean();
        expect(String(event.user)).toBe(String(ctx.admin._id));
        expect(event.before).toEqual({
            number: "8",
            color: "branca",
            category: "without_assembly",
            active: true,
        });
        expect(event.after).toEqual({
            number: "80",
            color: "azul",
            category: "with_treatment",
            active: false,
        });
    });

    it("não grava nada quando os valores são os mesmos", async () => {
        const box = await createBoxDirect("8", "branca");

        const response = await api("patch", `/api/boxes/${box._id}`).send({ number: " 8 ", color: "branca" });

        expect(response.status).toBe(200);
        expect(response.body.box.number).toBe("8");
        expect(await AuditEvent.countDocuments({ action: "box.update" })).toBe(0);
    });

    it('renumerar "8" para "008" é uma mudança (D18)', async () => {
        const box = await createBoxDirect("8", "branca");

        const response = await api("patch", `/api/boxes/${box._id}`).send({ number: "008" });

        expect(response.status).toBe(200);
        expect(response.body.box.number).toBe("008");
        const event = await AuditEvent.findOne({ action: "box.update" }).lean();
        expect([event.before.number, event.after.number]).toEqual(["8", "008"]);
    });

    it("recusa número que já existe em qualquer cor", async () => {
        await createBoxDirect("9", "verde");
        const box = await createBoxDirect("8", "branca");

        const response = await api("patch", `/api/boxes/${box._id}`).send({ number: "9" });

        expect(response.status).toBe(409);
        expect(response.body.error.fields).toEqual({ number: "Já existe a caixa 9 (Verde)." });
        expect((await Box.findById(box._id).lean()).number).toBe("8");
    });

    it.each([{ number: "81" }, { color: "preta" }, { active: false }])(
        "com a caixa ocupada não aceita nenhuma edição, nem desativar (%o)",
        async (changes) => {
            const box = await createBoxDirect("8", "branca");
            await occupy(box, "Ótica Central");

            const response = await api("patch", `/api/boxes/${box._id}`).send(changes);

            expect(response.status).toBe(409);
            expect(response.body.error.code).toBe("BOX_OCCUPIED");
            expect(response.body.error.message).toMatch(/A caixa 8 está ocupada/);
            expect(response.body.error.details.box).toMatchObject({
                id: String(box._id),
                state: "occupied",
                currentMovement: { clientName: "Ótica Central" },
            });
            const stored = await Box.findById(box._id).lean();
            expect(stored).toMatchObject({ number: "8", color: "branca", active: true });
            expect(await AuditEvent.countDocuments({ action: "box.update" })).toBe(0);
        }
    );

    it("exige pelo menos um campo e recusa campos que não são editáveis", async () => {
        const box = await createBoxDirect("8", "branca");

        const empty = await api("patch", `/api/boxes/${box._id}`).send({});
        expect(empty.status).toBe(400);
        expect(empty.body.error.message).toBe("Informe pelo menos um campo para alterar.");

        const state = await api("patch", `/api/boxes/${box._id}`).send({ state: "occupied" });
        expect(state.status).toBe(400);
        expect(state.body.error.fields).toEqual({ state: "Campo não permitido." });
    });
});

describe("POST /api/boxes/batch", () => {
    it('cria "3, 12, 27-30" e aponta, item a item, o número que já existe', async () => {
        await createBoxDirect("12", "azul");

        const response = await api("post", "/api/boxes/batch").send({
            color: "vermelha",
            numbers: "3, 12, 27-30",
        });

        expect(response.status).toBe(200);
        expect(response.body.summary).toEqual({ requested: 6, created: 5, failed: 1 });
        expect(response.body.results.map((item) => [item.number, item.ok])).toEqual([
            ["3", true],
            ["12", false],
            ["27", true],
            ["28", true],
            ["29", true],
            ["30", true],
        ]);
        expect(response.body.results[1].error).toEqual({
            code: "CONFLICT",
            message: "Já existe a caixa 12 (Azul).",
        });
        expect(response.body.results[0].box).toMatchObject({ number: "3", color: "vermelha", category: "urgent" });

        const created = await Box.find({ color: "vermelha" }).lean();
        expect(created.map((box) => box.number).sort(compareBoxNumbers)).toEqual(["3", "27", "28", "29", "30"]);
        expect(created.every((box) => box.category === "urgent")).toBe(true);

        const events = await AuditEvent.find({ action: "box.create" }).lean();
        expect(events).toHaveLength(5);
        expect(events.every((event) => String(event.user) === String(ctx.admin._id))).toBe(true);
    });

    it("aponta os itens repetidos no próprio lote", async () => {
        const response = await api("post", "/api/boxes/batch").send({ color: "verde", numbers: "5, 5, 4-6" });

        expect(response.status).toBe(200);
        expect(response.body.summary).toEqual({ requested: 5, created: 3, failed: 2 });
        expect(response.body.results.map((item) => [item.number, item.ok, item.error?.code ?? null])).toEqual([
            ["5", true, null],
            ["5", false, "DUPLICATE_IN_BATCH"],
            ["4", true, null],
            ["5", false, "DUPLICATE_IN_BATCH"],
            ["6", true, null],
        ]);
        expect(await Box.countDocuments()).toBe(3);
    });

    it('intervalo com zero à esquerda cria as caixas como na etiqueta: "007-010" (D18)', async () => {
        await createBoxDirect("8", "branca");

        const response = await api("post", "/api/boxes/batch").send({ color: "azul", numbers: "007-010" });

        expect(response.status).toBe(200);
        expect(response.body.results.map((item) => [item.number, item.ok])).toEqual([
            ["007", true],
            ["008", true],
            ["009", true],
            ["010", true],
        ]);
        expect(await Box.countDocuments()).toBe(5);
    });

    it("aceita a lista como vetor de textos", async () => {
        const response = await api("post", "/api/boxes/batch").send({ color: "preta", numbers: ["1", "2-3"] });

        expect(response.status).toBe(200);
        expect(response.body.summary.created).toBe(3);
    });

    it("quando todos já existem, não cria nada", async () => {
        await createBoxDirect("1", "preta");

        const response = await api("post", "/api/boxes/batch").send({ color: "preta", numbers: "1, 1" });

        expect(response.body.summary).toEqual({ requested: 2, created: 0, failed: 2 });
        expect(await AuditEvent.countDocuments()).toBe(0);
    });

    it.each([
        [{ color: "vermelha", numbers: "3, abc" }, "numbers", /"abc" não é um número nem um intervalo/],
        [{ color: "vermelha", numbers: "30-27" }, "numbers", /invertido/],
        [{ color: "vermelha", numbers: "1-501" }, "numbers", /no máximo 500/],
        [{ color: "vermelha", numbers: "" }, "numbers", /pelo menos um número/],
        [{ color: "vermelha", numbers: 12 }, "numbers", /como texto/],
        [{ numbers: "1-3" }, "color", /Cor inválida/],
    ])("recusa o lote inteiro com entrada inválida (%o)", async (body, field, message) => {
        const response = await api("post", "/api/boxes/batch").send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.fields[field]).toMatch(message);
        expect(await Box.countDocuments()).toBe(0);
    });
});

describe("o operador consulta caixas, mas não cadastra nem edita", () => {
    it.each([
        ["post", "/api/boxes", { number: "1", color: "branca" }],
        ["post", "/api/boxes/batch", { color: "branca", numbers: "1-3" }],
        ["patch", "/api/boxes/{id}", { active: false }],
    ])("%s %s responde 403", async (method, path, body) => {
        const box = await createBoxDirect("50", "branca");

        const response = await api(method, path.replace("{id}", String(box._id)), ctx.operatorCookie).send(body);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
        expect(await Box.countDocuments()).toBe(1);
        expect((await Box.findById(box._id).lean()).active).toBe(true);
    });
});
