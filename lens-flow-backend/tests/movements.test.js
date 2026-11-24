import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEvent, Box, Movement, MovementSheet } from "../models/index.js";
import { sheetDateOf } from "../utils/dateUtils.js";
import { createBusiness, createTestApp, createUser, login, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { MISSING_ID, apiAs, createBox, launch, setNow } from "./helpers/movements.js";

useTestDb();

let app;
let ctx;
let asAdmin;
let asOperator;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
    asAdmin = apiAs(app, ctx.adminCookie);
    asOperator = apiAs(app, ctx.operatorCookie);
});

afterEach(() => {
    vi.restoreAllMocks();
});

function launchAs(cookie, body) {
    return launch(app, cookie, body);
}

async function storedBox(box) {
    return Box.findById(box._id).lean();
}

describe("POST /api/movements", () => {
    it("lança na folha de hoje, ocupa a caixa e grava o snapshot e o histórico", async () => {
        const box = await createBox(ctx.business, "12", "vermelha");

        const response = await asOperator("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "  Ótica Central ",
            orderService: "4521",
            note: "aguardando armação",
        });

        expect(response.status).toBe(201);
        const today = sheetDateOf();
        expect(response.body).toEqual({
            movement: {
                id: expect.any(String),
                sheetDate: today,
                box: {
                    id: String(box._id),
                    number: "12",
                    color: "vermelha",
                    colorLabel: "Vermelha",
                    category: "urgent",
                    categoryLabel: "Urgente",
                },
                clientName: "Ótica Central",
                orderService: "4521",
                note: "aguardando armação",
                status: "open",
                daysOpen: 0,
                // D15: a vermelha lançada hoje já é normal.
                delayLevel: "normal",
                createdBy: { id: String(ctx.operator._id), name: "Operador A" },
                createdAt: expect.any(String),
                outBy: null,
                outAt: null,
                outDate: null,
                boxReleasedBy: null,
                boxReleasedAt: null,
                updatedAt: expect.any(String),
                canEdit: true,
                canChangeBox: true,
                undo: null,
            },
            warnings: [],
        });

        const movementId = response.body.movement.id;
        expect(await storedBox(box)).toMatchObject({ state: "occupied" });
        expect(String((await storedBox(box)).currentMovement)).toBe(movementId);
        expect(String((await storedBox(box)).lastMovement)).toBe(movementId);

        const sheet = await MovementSheet.findOne({ business: ctx.business._id }).lean();
        expect(sheet.date).toBe(today);
        const stored = await Movement.findById(movementId).lean();
        expect(stored).toMatchObject({
            sheetDate: today,
            boxSnapshot: { number: "12", color: "vermelha", category: "urgent" },
            urgent: true,
            clientNameNormalized: "otica central",
        });
        expect(String(stored.sheet)).toBe(String(sheet._id));

        const events = await AuditEvent.find().sort({ at: 1, _id: 1 }).lean();
        expect(events.map((event) => [event.action, event.entity, String(event.user)])).toEqual([
            ["sheet.create", "MovementSheet", String(ctx.operator._id)],
            ["movement.create", "Movement", String(ctx.operator._id)],
        ]);
        expect(events[1].after).toEqual({
            sheetDate: today,
            box: { id: box._id, number: "12", color: "vermelha", category: "urgent" },
            clientName: "Ótica Central",
            orderService: "4521",
            note: "aguardando armação",
        });
    });

    it("o segundo lançamento do dia usa a mesma folha", async () => {
        const first = await createBox(ctx.business, "1");
        const second = await createBox(ctx.business, "2");

        await launchAs(ctx.operatorCookie, { boxId: String(first._id), clientName: "A" });
        await launchAs(ctx.adminCookie, { boxId: String(second._id), clientName: "B" });

        expect(await MovementSheet.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments({ action: "sheet.create" })).toBe(1);
        expect(await Movement.countDocuments()).toBe(2);
    });

    it.each([
        [{}, { boxId: "Escolha a caixa.", clientName: "Informe o cliente." }],
        [{ boxId: "abc", clientName: "A" }, { boxId: "Identificador inválido." }],
        [{ boxId: MISSING_ID, clientName: "   " }, { clientName: "Informe o cliente." }],
        [{ boxId: MISSING_ID, clientName: "A".repeat(121) }, { clientName: "Use no máximo 120 caracteres no cliente." }],
        [{ boxId: MISSING_ID, clientName: "A", orderService: "9".repeat(41) }, { orderService: "Use no máximo 40 caracteres na OS." }],
        [{ boxId: MISSING_ID, clientName: "A", orderService: 4521 }, { orderService: "Envie a OS como texto." }],
        [{ boxId: MISSING_ID, clientName: "A", note: "x".repeat(501) }, { note: "Use no máximo 500 caracteres na observação." }],
        [{ boxId: MISSING_ID, clientName: "A", clientRequestId: "curta" }, { clientRequestId: expect.stringMatching(/^clientRequestId inválido/) }],
        [{ boxId: MISSING_ID, clientName: "A", status: "out" }, { status: "Campo não permitido." }],
        [{ boxId: MISSING_ID, clientName: "A", business: MISSING_ID }, { business: "Campo não permitido." }],
        [{ boxId: MISSING_ID, clientName: "A", sheetDate: "2026-01-01" }, { sheetDate: "Campo não permitido." }],
    ])("valida o corpo %o", async (body, fields) => {
        const response = await asOperator("post", "/api/movements").send(body);

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Confira os campos destacados.",
            fields,
        });
        expect(await Movement.countDocuments()).toBe(0);
    });

    it("OS e observação vazias viram null", async () => {
        const box = await createBox(ctx.business, "3");

        const movement = await launchAs(ctx.operatorCookie, {
            boxId: String(box._id),
            clientName: "A",
            orderService: "  ",
            note: "",
        });

        expect(movement).toMatchObject({ orderService: null, note: null });
    });

    it("caixa ocupada: 409 BOX_OCCUPIED com cliente, autor e data do serviço que está nela", async () => {
        const box = await createBox(ctx.business, "12", "azul");
        const first = await launchAs(ctx.operatorCookie, {
            boxId: String(box._id),
            clientName: "Ótica Central",
            orderService: "4521",
        });
        const eventsBefore = await AuditEvent.countDocuments();

        const response = await asAdmin("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "Outro cliente",
        });

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("BOX_OCCUPIED");
        const day = `${first.sheetDate.slice(8, 10)}/${first.sheetDate.slice(5, 7)}`;
        expect(response.body.error.message).toBe(
            `A caixa 12 já está ocupada: Ótica Central, lançado por Operador A em ${day}.`
        );
        expect(response.body.error.details.box).toMatchObject({
            id: String(box._id),
            number: "12",
            state: "occupied",
            currentMovement: {
                id: first.id,
                clientName: "Ótica Central",
                orderService: "4521",
                status: "open",
                sheetDate: first.sheetDate,
                createdBy: { id: String(ctx.operator._id), name: "Operador A" },
            },
        });
        expect(await Movement.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments()).toBe(eventsBefore);
    });

    it("caixa com serviço que saiu e espera a liberação também está ocupada", async () => {
        const box = await createBox(ctx.business, "12");
        const first = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "Ótica" });
        await asOperator("post", `/api/movements/${first.id}/checkout`).send();

        const response = await asOperator("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "Outro",
        });

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("BOX_OCCUPIED");
        expect(response.body.error.message).toMatch(/O serviço já saiu; falta liberar a caixa\.$/);
        expect(response.body.error.details.box.currentMovement.status).toBe("out");
    });

    it("caixa inativa: 409 CONFLICT, sem gravar nada", async () => {
        const box = await createBox(ctx.business, "40", "verde", { active: false });

        const response = await asOperator("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "A",
        });

        expect(response.status).toBe(409);
        expect(response.body.error).toEqual({
            code: "CONFLICT",
            message: "A caixa 40 está desativada e não recebe serviço.",
        });
        expect(await Movement.countDocuments()).toBe(0);
        expect(await MovementSheet.countDocuments()).toBe(0);
        expect(await AuditEvent.countDocuments()).toBe(0);
    });

    it("caixa que não existe ou é de outra empresa: 404", async () => {
        const other = await createBusiness("Laboratório B");
        const boxOfB = await createBox(other, "5");

        for (const boxId of [MISSING_ID, String(boxOfB._id)]) {
            const response = await asOperator("post", "/api/movements").send({ boxId, clientName: "A" });
            expect(response.status).toBe(404);
            expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Caixa não encontrada." });
        }
        expect((await storedBox(boxOfB)).state).toBe("free");
        expect(await Movement.countDocuments()).toBe(0);
    });

    it("OS que já está num serviço aberto gera aviso com o lugar dela, sem bloquear (D16)", async () => {
        const red = await createBox(ctx.business, "12", "vermelha");
        const blue = await createBox(ctx.business, "15", "azul");
        const white = await createBox(ctx.business, "20", "branca");
        const first = await launchAs(ctx.operatorCookie, {
            boxId: String(red._id),
            clientName: "Ótica Central",
            orderService: "4521",
        });
        const day = `${first.sheetDate.slice(8, 10)}/${first.sheetDate.slice(5, 7)}`;

        const second = await asAdmin("post", "/api/movements").send({
            boxId: String(blue._id),
            clientName: "Ótica Central",
            orderService: "4521",
        });

        expect(second.status).toBe(201);
        expect(second.body.warnings).toEqual([
            {
                code: "DUPLICATE_ORDER_SERVICE",
                message: `A OS 4521 já está na caixa 12 (Vermelha), aberta desde ${day}.`,
                movements: [
                    {
                        id: first.id,
                        box: expect.objectContaining({ number: "12", color: "vermelha", colorLabel: "Vermelha" }),
                        sheetDate: first.sheetDate,
                        clientName: "Ótica Central",
                        createdBy: { id: String(ctx.operator._id), name: "Operador A" },
                    },
                ],
            },
        ]);

        const third = await asAdmin("post", "/api/movements").send({
            boxId: String(white._id),
            clientName: "Ótica Central",
            orderService: "4521",
        });
        expect(third.body.warnings[0].message).toBe(
            `A OS 4521 já está em outros serviços abertos: caixa 12 (Vermelha), aberta desde ${day}; caixa 15 (Azul), aberta desde ${day}.`
        );
        expect(third.body.warnings[0].movements).toHaveLength(2);
        expect(await Movement.countDocuments({ orderService: "4521" })).toBe(3);
    });

    it("OS de um serviço que já saiu não gera aviso", async () => {
        const first = await createBox(ctx.business, "1");
        const second = await createBox(ctx.business, "2");
        const old = await launchAs(ctx.operatorCookie, {
            boxId: String(first._id),
            clientName: "A",
            orderService: "777",
        });
        await asOperator("post", `/api/movements/${old.id}/checkout`).send();

        const response = await asOperator("post", "/api/movements").send({
            boxId: String(second._id),
            clientName: "A",
            orderService: "777",
        });

        expect(response.body.warnings).toEqual([]);
    });

    it("a mesma clientRequestId devolve o lançamento original, sem lançar de novo nem dar falso BOX_OCCUPIED (R13)", async () => {
        const box = await createBox(ctx.business, "8");
        const body = { boxId: String(box._id), clientName: "A", clientRequestId: "0b7c3c1e-6f0e-4b8e" };

        const first = await asOperator("post", "/api/movements").send(body);
        const retry = await asOperator("post", "/api/movements").send(body);

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.body.movement.id).toBe(first.body.movement.id);
        expect(await Movement.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments({ action: "movement.create" })).toBe(1);
    });

    it("a mesma chave enviada duas vezes ao mesmo tempo lança uma vez só", async () => {
        const box = await createBox(ctx.business, "8");
        const body = { boxId: String(box._id), clientName: "A", clientRequestId: "chave-simultanea-1" };

        const [a, b] = await Promise.all([
            asOperator("post", "/api/movements").send(body),
            asOperator("post", "/api/movements").send(body),
        ]);

        expect([a.status, b.status]).toEqual([201, 201]);
        expect(a.body.movement.id).toBe(b.body.movement.id);
        expect(await Movement.countDocuments()).toBe(1);
    });

    it("a chave é por usuário: outra pessoa com a mesma chave lança o próprio serviço", async () => {
        const first = await createBox(ctx.business, "8");
        const second = await createBox(ctx.business, "9");
        const key = "mesma-chave-123";

        const mine = await launchAs(ctx.operatorCookie, { boxId: String(first._id), clientName: "A", clientRequestId: key });
        const theirs = await launchAs(ctx.adminCookie, { boxId: String(second._id), clientName: "B", clientRequestId: key });

        expect(theirs.id).not.toBe(mine.id);
        expect(await Movement.countDocuments()).toBe(2);
    });

    it("a chave de um lançamento excluído não lança de novo", async () => {
        const box = await createBox(ctx.business, "8");
        const body = { boxId: String(box._id), clientName: "A", clientRequestId: "lancado-e-excluido" };
        const first = await launchAs(ctx.operatorCookie, body);
        await asOperator("delete", `/api/movements/${first.id}`).send();

        const retry = await asOperator("post", "/api/movements").send(body);

        expect(retry.status).toBe(409);
        expect(retry.body.error.message).toBe("Esse lançamento já foi feito e depois excluído.");
        expect(await Movement.countDocuments()).toBe(1);
    });

    it("fuso: lançamento às 23:30 de Brasília cai no dia certo, e 00:30 já é o dia seguinte (T8)", async () => {
        const first = await createBox(ctx.business, "1");
        const second = await createBox(ctx.business, "2");

        // 23:30 em Brasília, 02:30 do dia seguinte em UTC.
        setNow("2026-11-24T02:30:00.000Z");
        const late = await asOperator("post", "/api/movements").send({ boxId: String(first._id), clientName: "A" });
        expect(late.status).toBe(201);
        expect(late.body.movement.sheetDate).toBe("2026-11-23");

        setNow("2026-11-24T03:30:00.000Z");
        const early = await asOperator("post", "/api/movements").send({ boxId: String(second._id), clientName: "B" });
        expect(early.body.movement.sheetDate).toBe("2026-11-24");

        const dates = (await MovementSheet.find().sort({ date: 1 }).lean()).map((sheet) => sheet.date);
        expect(dates).toEqual(["2026-11-23", "2026-11-24"]);
    });
});

describe("PATCH /api/movements/:id", () => {
    let box;
    let movement;

    beforeEach(async () => {
        box = await createBox(ctx.business, "12");
        movement = await launchAs(ctx.operatorCookie, {
            boxId: String(box._id),
            clientName: "Ótica Central",
            orderService: "100",
        });
    });

    it("o operador edita o próprio lançamento no mesmo dia, com antes e depois no histórico", async () => {
        const response = await asOperator("patch", `/api/movements/${movement.id}`).send({
            clientName: "Óptica São João",
            note: "refação",
        });

        expect(response.status).toBe(200);
        expect(response.body.movement).toMatchObject({ clientName: "Óptica São João", note: "refação" });
        expect(response.body.warnings).toEqual([]);
        const stored = await Movement.findById(movement.id).lean();
        expect(stored.clientNameNormalized).toBe("optica sao joao");
        expect(String(stored.updatedBy)).toBe(String(ctx.operator._id));

        const event = await AuditEvent.findOne({ action: "movement.update" }).lean();
        expect(event.before).toEqual({ clientName: "Ótica Central", note: null });
        expect(event.after).toEqual({ clientName: "Óptica São João", note: "refação" });
    });

    it("sem mudança não grava nada", async () => {
        const response = await asOperator("patch", `/api/movements/${movement.id}`).send({
            clientName: "Ótica Central",
            orderService: "100",
        });

        expect(response.status).toBe(200);
        expect(await AuditEvent.countDocuments({ action: "movement.update" })).toBe(0);
    });

    it("trocar a OS para uma que já está aberta avisa (D16)", async () => {
        const other = await createBox(ctx.business, "13", "verde");
        await launchAs(ctx.adminCookie, { boxId: String(other._id), clientName: "B", orderService: "200" });

        const response = await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: "200" });

        expect(response.status).toBe(200);
        expect(response.body.warnings[0]).toMatchObject({ code: "DUPLICATE_ORDER_SERVICE" });
        expect(response.body.warnings[0].message).toMatch(/^A OS 200 já está na caixa 13 \(Verde\)/);
    });

    it("o operador não edita o lançamento de outra pessoa; o admin edita", async () => {
        const otherOperator = await createUser({ business: ctx.business, username: "outro-op" });
        const asOther = apiAs(app, await login(app, otherOperator.username));

        const denied = await asOther("patch", `/api/movements/${movement.id}`).send({ note: "x" });
        expect(denied.status).toBe(403);
        expect(denied.body.error).toEqual({
            code: "FORBIDDEN",
            message: "Você só pode alterar os seus próprios lançamentos, no mesmo dia.",
        });

        const allowed = await asAdmin("patch", `/api/movements/${movement.id}`).send({ note: "x" });
        expect(allowed.status).toBe(200);
        expect(allowed.body.movement.canEdit).toBe(true);
    });

    it("o operador não edita o próprio lançamento de ontem; o admin edita", async () => {
        await Movement.updateOne({ _id: movement.id }, { $set: { sheetDate: "2026-01-02" } });

        const denied = await asOperator("patch", `/api/movements/${movement.id}`).send({ note: "x" });
        expect(denied.status).toBe(403);

        const detail = await asOperator("get", `/api/movements/${movement.id}`);
        expect(detail.body.movement.canEdit).toBe(false);

        expect((await asAdmin("patch", `/api/movements/${movement.id}`).send({ note: "x" })).status).toBe(200);
    });

    it.each([
        [{}, undefined],
        [{ status: "out" }, { status: "Campo não permitido." }],
        [{ boxId: MISSING_ID }, { boxId: "Campo não permitido." }],
        [{ clientName: "" }, { clientName: "Informe o cliente." }],
    ])("valida o corpo %o", async (body, fields) => {
        const response = await asOperator("patch", `/api/movements/${movement.id}`).send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
        expect(response.body.error.fields).toEqual(fields);
        expect(await AuditEvent.countDocuments({ action: "movement.update" })).toBe(0);
    });

    it("404 para serviço que não existe", async () => {
        const response = await asAdmin("patch", `/api/movements/${MISSING_ID}`).send({ note: "x" });

        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Serviço não encontrado." });
    });
});

describe("DELETE /api/movements/:id (exclusão lógica)", () => {
    it("libera a caixa, some das listas, continua no histórico, e a caixa pode ser reutilizada", async () => {
        const box = await createBox(ctx.business, "12");
        const movement = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });

        const response = await asOperator("delete", `/api/movements/${movement.id}`).send();

        expect(response.status).toBe(204);
        expect(await storedBox(box)).toMatchObject({ state: "free", currentMovement: null });
        const stored = await Movement.findById(movement.id).lean();
        expect(stored.deletedAt).toBeInstanceOf(Date);
        expect(String(stored.deletedBy)).toBe(String(ctx.operator._id));

        expect((await asOperator("get", `/api/movements/${movement.id}`)).status).toBe(404);
        expect((await asOperator("get", "/api/movements")).body.items).toEqual([]);
        const event = await AuditEvent.findOne({ action: "movement.delete" }).lean();
        expect(event.after).toMatchObject({ boxFreed: true });
        expect(String(event.entityId)).toBe(movement.id);

        const again = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "B" });
        expect(again.box.id).toBe(String(box._id));
    });

    it("excluir um serviço que saiu e espera a liberação também libera a caixa", async () => {
        const box = await createBox(ctx.business, "12");
        const movement = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();

        expect((await asOperator("delete", `/api/movements/${movement.id}`).send()).status).toBe(204);
        expect((await storedBox(box)).state).toBe("free");
    });

    it("excluir um serviço com a caixa já liberada não mexe na caixa, que pode estar com outro serviço", async () => {
        const box = await createBox(ctx.business, "12");
        const old = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });
        await asOperator("post", "/api/movements/batch").send({ ids: [old.id], action: "checkout-and-release" });
        const current = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "B" });

        expect((await asOperator("delete", `/api/movements/${old.id}`).send()).status).toBe(204);

        const stored = await storedBox(box);
        expect(stored.state).toBe("occupied");
        expect(String(stored.currentMovement)).toBe(current.id);
    });

    it("o operador só exclui o próprio lançamento do dia; o admin exclui qualquer um", async () => {
        const box = await createBox(ctx.business, "12");
        const movement = await launchAs(ctx.adminCookie, { boxId: String(box._id), clientName: "A" });

        const denied = await asOperator("delete", `/api/movements/${movement.id}`).send();
        expect(denied.status).toBe(403);
        expect((await storedBox(box)).state).toBe("occupied");

        expect((await asAdmin("delete", `/api/movements/${movement.id}`).send()).status).toBe(204);
        expect((await asAdmin("delete", `/api/movements/${movement.id}`).send()).status).toBe(404);
    });
});

describe("POST /api/movements/:id/change-box (RN-12)", () => {
    let white;
    let red;
    let movement;

    beforeEach(async () => {
        white = await createBox(ctx.business, "12", "branca");
        red = await createBox(ctx.business, "30", "vermelha");
        movement = await launchAs(ctx.operatorCookie, { boxId: String(white._id), clientName: "A" });
    });

    it("libera a antiga e ocupa a nova numa operação, com o snapshot e o histórico", async () => {
        const response = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(red._id),
        });

        expect(response.status).toBe(200);
        expect(response.body.movement.box).toEqual({
            id: String(red._id),
            number: "30",
            color: "vermelha",
            colorLabel: "Vermelha",
            category: "urgent",
            categoryLabel: "Urgente",
        });
        expect(response.body.movement.delayLevel).toBe("normal");
        expect(await storedBox(white)).toMatchObject({ state: "free", currentMovement: null });
        const newBox = await storedBox(red);
        expect(newBox.state).toBe("occupied");
        expect(String(newBox.currentMovement)).toBe(movement.id);
        expect(await Movement.findById(movement.id).lean()).toMatchObject({ urgent: true });

        const event = await AuditEvent.findOne({ action: "movement.change_box" }).lean();
        expect(event.before.box).toEqual({ id: white._id, number: "12", color: "branca", category: "without_assembly" });
        expect(event.after.box).toEqual({ id: red._id, number: "30", color: "vermelha", category: "urgent" });
    });

    it("se a nova estiver ocupada, responde 409 BOX_OCCUPIED e nada muda", async () => {
        await launchAs(ctx.adminCookie, { boxId: String(red._id), clientName: "Ótica X" });

        const response = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(red._id),
        });

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("BOX_OCCUPIED");
        expect(response.body.error.details.box.currentMovement.clientName).toBe("Ótica X");
        expect(String((await storedBox(white)).currentMovement)).toBe(movement.id);
        expect(String((await Movement.findById(movement.id).lean()).box)).toBe(String(white._id));
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(0);
    });

    it("recusa a mesma caixa, caixa desativada, caixa de outra empresa e serviço que já saiu", async () => {
        const same = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(white._id),
        });
        expect(same.status).toBe(400);
        expect(same.body.error.fields).toEqual({ boxId: "Escolha uma caixa diferente da atual." });

        const inactive = await createBox(ctx.business, "40", "verde", { active: false });
        const deactivated = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(inactive._id),
        });
        expect(deactivated.status).toBe(409);
        expect(deactivated.body.error).toEqual({
            code: "CONFLICT",
            message: "A caixa 40 está desativada e não recebe serviço.",
        });

        const other = await createBusiness("Laboratório B");
        const boxOfB = await createBox(other, "77");
        const foreign = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(boxOfB._id),
        });
        expect(foreign.status).toBe(404);
        expect(foreign.body.error).toEqual({ code: "NOT_FOUND", message: "Caixa não encontrada." });
        expect((await storedBox(boxOfB)).state).toBe("free");

        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        const out = await asOperator("post", `/api/movements/${movement.id}/change-box`).send({
            boxId: String(red._id),
        });
        expect(out.status).toBe(409);
        expect(out.body.error.message).toBe("Só dá para trocar a caixa de um serviço aberto.");
        expect((await storedBox(red)).state).toBe("free");
        expect(String((await storedBox(white)).currentMovement)).toBe(movement.id);
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(0);
    });

    it.each([
        [{}, { boxId: "Escolha a caixa nova." }],
        [{ boxId: "abc" }, { boxId: "Identificador inválido." }],
        [{ boxId: MISSING_ID, clientName: "B" }, { clientName: "Campo não permitido." }],
    ])("valida o corpo %o", async (body, fields) => {
        const response = await asOperator("post", `/api/movements/${movement.id}/change-box`).send(body);

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Confira os campos destacados.",
            fields,
        });
    });
});

describe("trocar a caixa em qualquer dia, de qualquer autor (D19)", () => {
    // Ana lança na folha de 21/11; dois dias depois, outra pessoa troca a caixa na Conferência.
    const LAUNCHED_AT = "2026-11-21T12:00:00.000Z";
    const CHANGED_AT = "2026-11-23T12:00:00.000Z";

    let author;
    let authorCookie;
    let asAuthor;
    let white;
    let red;
    let movement;

    beforeEach(async () => {
        author = await createUser({ business: ctx.business, username: "ana", name: "Ana Souza" });
        authorCookie = await login(app, author.username);
        asAuthor = apiAs(app, authorCookie);
        white = await createBox(ctx.business, "12", "branca");
        red = await createBox(ctx.business, "30", "vermelha");
        setNow(LAUNCHED_AT);
        movement = await launchAs(authorCookie, { boxId: String(white._id), clientName: "Ótica Central" });
        setNow(CHANGED_AT);
    });

    function changeBox(as, box) {
        return as("post", `/api/movements/${movement.id}/change-box`).send({ boxId: String(box._id) });
    }

    it("o operador troca a caixa de um serviço aberto lançado por outra pessoa em outro dia", async () => {
        const response = await changeBox(asOperator, red);

        expect(response.status).toBe(200);
        expect(response.body.movement).toMatchObject({
            id: movement.id,
            box: { id: String(red._id), number: "30", color: "vermelha", category: "urgent" },
            // O serviço continua na folha do lançamento, com o mesmo autor e os mesmos dias em aberto.
            sheetDate: "2026-11-21",
            createdBy: { id: String(author._id), name: "Ana Souza" },
            status: "open",
            daysOpen: 2,
            // D15: com 2 dias, a branca pede atenção; na vermelha, sobe para atrasado.
            delayLevel: "late",
            canEdit: false,
            canChangeBox: true,
        });
        expect(await storedBox(white)).toMatchObject({ state: "free", currentMovement: null });
        const newBox = await storedBox(red);
        expect(newBox.state).toBe("occupied");
        expect(String(newBox.currentMovement)).toBe(movement.id);
        expect(String(newBox.lastMovement)).toBe(movement.id);

        const stored = await Movement.findById(movement.id).lean();
        expect(stored).toMatchObject({
            sheetDate: "2026-11-21",
            boxSnapshot: { number: "30", color: "vermelha", category: "urgent" },
            urgent: true,
        });
        expect(String(stored.box)).toBe(String(red._id));
        expect(String(stored.createdBy)).toBe(String(author._id));
        expect(String(stored.updatedBy)).toBe(String(ctx.operator._id));
    });

    it("o histórico grava quem trocou, de qual caixa e para qual, e aparece na linha do tempo", async () => {
        expect((await changeBox(asOperator, red)).status).toBe(200);

        const events = await AuditEvent.find({ action: "movement.change_box" }).lean();
        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event.entity).toBe("Movement");
        expect(String(event.entityId)).toBe(movement.id);
        expect(String(event.business)).toBe(String(ctx.business._id));
        expect(String(event.user)).toBe(String(ctx.operator._id));
        expect(event.at.toISOString()).toBe(CHANGED_AT);
        expect(event.before).toEqual({
            box: { id: white._id, number: "12", color: "branca", category: "without_assembly" },
        });
        expect(event.after).toEqual({
            box: { id: red._id, number: "30", color: "vermelha", category: "urgent" },
        });

        const detail = await asAuthor("get", `/api/movements/${movement.id}`);
        expect(detail.body.history.map((item) => [item.action, item.user.name])).toEqual([
            ["movement.create", "Ana Souza"],
            ["movement.change_box", "Operador A"],
        ]);
        expect(detail.body.history[1]).toMatchObject({
            at: CHANGED_AT,
            before: { box: { id: String(white._id), number: "12" } },
            after: { box: { id: String(red._id), number: "30" } },
        });
    });

    it("canChangeBox diz a cada pessoa se ela pode trocar a caixa, separado de editar e excluir (canEdit)", async () => {
        const viewers = [
            ["operador que não é o autor", asOperator, { canEdit: false, canChangeBox: true }],
            ["autora, em outro dia", asAuthor, { canEdit: false, canChangeBox: true }],
            ["admin", asAdmin, { canEdit: true, canChangeBox: true }],
        ];
        for (const [who, as, expected] of viewers) {
            const detail = await as("get", `/api/movements/${movement.id}`);
            expect(detail.body.movement, who).toMatchObject(expected);
            const conference = await as("get", "/api/movements?status=open");
            expect(conference.body.items, who).toEqual([expect.objectContaining({ id: movement.id, ...expected })]);
        }

        // Editar e excluir continuam com o autor no mesmo dia, ou com o admin (RN-11).
        expect((await asOperator("patch", `/api/movements/${movement.id}`).send({ note: "x" })).status).toBe(403);
        expect((await asAuthor("delete", `/api/movements/${movement.id}`).send()).status).toBe(403);

        // Depois da baixa, ninguém troca a caixa, nem o admin.
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        for (const [who, as] of viewers) {
            const detail = await as("get", `/api/movements/${movement.id}`);
            expect(detail.body.movement.canChangeBox, who).toBe(false);
        }
    });

    it("o serviço que já saiu continua sem troca, para o operador e para o admin, e nada muda", async () => {
        await asAuthor("post", `/api/movements/${movement.id}/checkout`).send();

        for (const as of [asOperator, asAdmin]) {
            const response = await changeBox(as, red);
            expect(response.status).toBe(409);
            expect(response.body.error).toEqual({
                code: "CONFLICT",
                message: "Só dá para trocar a caixa de um serviço aberto.",
            });
        }
        expect(String((await storedBox(white)).currentMovement)).toBe(movement.id);

        // Com a caixa já liberada, também não.
        await asAuthor("post", `/api/movements/${movement.id}/release-box`).send();
        expect((await changeBox(asOperator, red)).status).toBe(409);

        expect(await storedBox(red)).toMatchObject({ state: "free", currentMovement: null, lastMovement: null });
        expect(String((await Movement.findById(movement.id).lean()).box)).toBe(String(white._id));
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(0);
    });

    it("caixa nova ocupada: 409 BOX_OCCUPIED com o serviço que está nela, e nada muda", async () => {
        const other = await launchAs(ctx.adminCookie, { boxId: String(red._id), clientName: "Ótica X" });

        const response = await changeBox(asOperator, red);

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("BOX_OCCUPIED");
        expect(response.body.error.message).toBe(
            "A caixa 30 já está ocupada: Ótica X, lançado por Admin A em 23/11."
        );
        expect(response.body.error.details.box).toMatchObject({
            id: String(red._id),
            state: "occupied",
            currentMovement: { id: other.id, clientName: "Ótica X" },
        });
        expect(String((await storedBox(white)).currentMovement)).toBe(movement.id);
        expect(String((await storedBox(red)).currentMovement)).toBe(other.id);
        expect(String((await Movement.findById(movement.id).lean()).box)).toBe(String(white._id));
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(0);
    });

    it("a troca e o histórico entram juntos: se o histórico falhar, nenhuma caixa muda (mesma transação)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(AuditEvent, "create").mockRejectedValueOnce(new Error("falha simulada"));

        const response = await changeBox(asOperator, red);

        expect(response.status).toBe(500);
        expect(await storedBox(white)).toMatchObject({ state: "occupied" });
        expect(String((await storedBox(white)).currentMovement)).toBe(movement.id);
        expect(await storedBox(red)).toMatchObject({ state: "free", currentMovement: null, lastMovement: null });
        const stored = await Movement.findById(movement.id).lean();
        expect(String(stored.box)).toBe(String(white._id));
        expect(stored).toMatchObject({ boxSnapshot: { number: "12" }, urgent: false, updatedBy: null });
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(0);
    });
});

describe("baixa e liberação (RN-08, RN-09, D6)", () => {
    let box;
    let movement;

    beforeEach(async () => {
        box = await createBox(ctx.business, "12");
        movement = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });
    });

    it("a baixa marca quem e quando e mantém a caixa ocupada até a liberação", async () => {
        const response = await asOperator("post", `/api/movements/${movement.id}/checkout`).send();

        expect(response.status).toBe(200);
        expect(response.body.movement).toMatchObject({
            status: "out",
            outBy: { id: String(ctx.operator._id), name: "Operador A" },
            outDate: sheetDateOf(),
            daysOpen: null,
            delayLevel: null,
            boxReleasedAt: null,
            undo: { action: "checkout", until: expect.any(String) },
        });
        expect((await storedBox(box)).state).toBe("occupied");
        expect(await AuditEvent.countDocuments({ action: "movement.checkout" })).toBe(1);

        const again = await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        expect(again.status).toBe(409);
        expect(again.body.error).toEqual({ code: "CONFLICT", message: "Esse serviço já saiu." });
    });

    it("liberar exige a baixa antes (D6)", async () => {
        const response = await asOperator("post", `/api/movements/${movement.id}/release-box`).send();

        expect(response.status).toBe(409);
        expect(response.body.error).toEqual({ code: "CONFLICT", message: "Dê baixa antes de liberar a caixa." });
        expect((await storedBox(box)).state).toBe("occupied");
    });

    it("a liberação devolve a caixa e não se repete", async () => {
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();

        const response = await asAdmin("post", `/api/movements/${movement.id}/release-box`).send();

        expect(response.status).toBe(200);
        expect(response.body.movement).toMatchObject({
            status: "out",
            boxReleasedBy: { id: String(ctx.admin._id), name: "Admin A" },
            boxReleasedAt: expect.any(String),
            undo: { action: "release-box", until: null },
        });
        expect(await storedBox(box)).toMatchObject({ state: "free", currentMovement: null });
        expect(String((await storedBox(box)).lastMovement)).toBe(movement.id);

        const again = await asAdmin("post", `/api/movements/${movement.id}/release-box`).send();
        expect(again.status).toBe(409);
        expect(again.body.error.message).toBe("A caixa desse serviço já foi liberada.");
    });

    it("recusa corpo nas ações sem corpo e id malformado", async () => {
        const body = await asOperator("post", `/api/movements/${movement.id}/checkout`).send({ force: true });
        expect(body.status).toBe(400);
        expect(body.body.error.fields).toEqual({ force: "Campo não permitido." });

        const malformed = await asOperator("post", "/api/movements/abc/checkout").send();
        expect(malformed.status).toBe(400);
        expect(malformed.body.error.fields).toEqual({ id: "Identificador inválido." });
    });
});

describe("fluxo completo pela API", () => {
    it("lançar → conferir → baixa → liberar → reutilizar a caixa", async () => {
        const box = await createBox(ctx.business, "12", "vermelha");

        const launched = await asOperator("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "Ótica Central",
            orderService: "4521",
        });
        expect(launched.status).toBe(201);
        const { id } = launched.body.movement;

        const conference = await asOperator("get", "/api/movements?status=open");
        expect(conference.body.items.map((item) => item.id)).toEqual([id]);

        expect((await asOperator("post", `/api/movements/${id}/checkout`).send()).status).toBe(200);
        expect((await asOperator("get", "/api/movements?status=open")).body.items).toEqual([]);
        const notReleased = await asOperator("get", "/api/movements?status=out&boxReleased=false");
        expect(notReleased.body.items.map((item) => item.id)).toEqual([id]);

        expect((await asOperator("post", `/api/movements/${id}/release-box`).send()).status).toBe(200);
        expect((await asOperator("get", "/api/movements?status=out&boxReleased=false")).body.items).toEqual([]);
        expect((await asOperator("get", `/api/boxes/${box._id}`)).body.box).toMatchObject({
            state: "free",
            currentMovement: null,
        });

        const reused = await asOperator("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "Ótica Visão",
        });
        expect(reused.status).toBe(201);
        expect(reused.body.movement.box.number).toBe("12");

        const detail = await asOperator("get", `/api/movements/${id}`);
        expect(detail.body.history.map((event) => event.action)).toEqual([
            "movement.create",
            "movement.checkout",
            "movement.release_box",
        ]);
        expect(detail.body.history.every((event) => event.user.name === "Operador A")).toBe(true);
    });
});

describe("desfazer (RN-11)", () => {
    let box;
    let movement;

    beforeEach(async () => {
        setNow("2026-11-23T12:00:00.000Z");
        box = await createBox(ctx.business, "12");
        movement = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });
    });

    function undo(as, action) {
        return as("post", `/api/movements/${movement.id}/undo`).send({ action });
    }

    it("o operador desfaz a própria baixa em até 10 minutos, e não depois", async () => {
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();

        setNow("2026-11-23T12:10:00.000Z");
        const inTime = await undo(asOperator, "checkout");
        expect(inTime.status).toBe(200);
        expect(inTime.body.movement).toMatchObject({ status: "open", outBy: null, outAt: null, undo: null });
        expect(await AuditEvent.countDocuments({ action: "movement.undo_checkout" })).toBe(1);

        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        setNow("2026-11-23T12:20:00.001Z");
        const late = await undo(asOperator, "checkout");
        expect(late.status).toBe(403);
        expect(late.body.error.message).toBe("O prazo de 10 minutos para desfazer já passou.");
        expect((await Movement.findById(movement.id).lean()).status).toBe("out");
    });

    it("o movimento mostra a janela do desfazer só para quem pode (R7)", async () => {
        const out = await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        expect(out.body.movement.undo).toEqual({
            action: "checkout",
            until: "2026-11-23T12:10:00.000Z",
        });

        const asAdminView = await asAdmin("get", `/api/movements/${movement.id}`);
        expect(asAdminView.body.movement.undo).toEqual({ action: "checkout", until: null });

        setNow("2026-11-23T12:11:00.000Z");
        expect((await asOperator("get", `/api/movements/${movement.id}`)).body.movement.undo).toBeNull();
    });

    it("o operador não desfaz a ação de outra pessoa; o admin desfaz a qualquer tempo", async () => {
        await asAdmin("post", `/api/movements/${movement.id}/checkout`).send();

        const denied = await undo(asOperator, "checkout");
        expect(denied.status).toBe(403);
        expect(denied.body.error.message).toBe("Você só pode desfazer as suas próprias ações.");

        // Dois dias depois.
        setNow("2026-11-25T12:00:00.000Z");
        expect((await undo(asAdmin, "checkout")).status).toBe(200);
    });

    it("desfazer a liberação ocupa a caixa de novo, se ela não foi reutilizada", async () => {
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        await asOperator("post", `/api/movements/${movement.id}/release-box`).send();

        const response = await undo(asOperator, "release-box");

        expect(response.status).toBe(200);
        expect(response.body.movement).toMatchObject({
            status: "out",
            boxReleasedBy: null,
            boxReleasedAt: null,
            undo: { action: "checkout" },
        });
        const stored = await storedBox(box);
        expect(stored.state).toBe("occupied");
        expect(String(stored.currentMovement)).toBe(movement.id);
    });

    it("com a caixa reutilizada, desfazer a liberação responde 409, mesmo se o outro serviço já saiu dela", async () => {
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        await asOperator("post", `/api/movements/${movement.id}/release-box`).send();
        const next = await launchAs(ctx.operatorCookie, { boxId: String(box._id), clientName: "B" });

        const occupied = await undo(asOperator, "release-box");
        expect(occupied.status).toBe(409);
        expect(occupied.body.error.message).toBe(
            "A caixa 12 já recebeu outro serviço. Não dá para desfazer a liberação."
        );

        await asOperator("delete", `/api/movements/${next.id}`).send();
        expect((await storedBox(box)).state).toBe("free");
        const stillReused = await undo(asAdmin, "release-box");
        expect(stillReused.status).toBe(409);
        expect((await storedBox(box)).state).toBe("free");
        expect((await Movement.findById(movement.id).lean()).boxReleasedAt).toBeInstanceOf(Date);
    });

    it("a baixa só se desfaz depois de desfazer a liberação, e só se houver o que desfazer", async () => {
        const nothing = await undo(asOperator, "checkout");
        expect(nothing.status).toBe(409);
        expect(nothing.body.error.message).toBe("Esse serviço não tem baixa para desfazer.");

        const notReleased = await undo(asOperator, "release-box");
        expect(notReleased.status).toBe(409);
        expect(notReleased.body.error.message).toBe("A caixa desse serviço não foi liberada.");

        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        await asOperator("post", `/api/movements/${movement.id}/release-box`).send();
        const released = await undo(asOperator, "checkout");
        expect(released.status).toBe(409);
        expect(released.body.error.message).toBe("Desfaça primeiro a liberação da caixa.");
    });

    it("valida a ação", async () => {
        const response = await undo(asOperator, "delete");

        expect(response.status).toBe(400);
        expect(response.body.error.fields.action).toMatch(/^Ação inválida/);
    });
});
