import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEvent, Box, Movement, MovementBatch } from "../models/index.js";
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

/** Caixas 1..n livres e um serviço aberto em cada uma. */
async function openMovements(count, cookie = ctx.operatorCookie) {
    const movements = [];
    for (let number = 1; number <= count; number += 1) {
        const box = await createBox(ctx.business, String(number), number % 6 === 0 ? "vermelha" : "branca");
        movements.push(await launch(app, cookie, { boxId: String(box._id), clientName: `Cliente ${number}` }));
    }
    return movements;
}

function batch(as, body) {
    return as("post", "/api/movements/batch").send(body);
}

function boxOf(movement) {
    return Box.findById(movement.box.id).lean();
}

describe("POST /api/movements/batch", () => {
    it("saiu e liberar em lote: resultado item a item, com falha parcial permitida", async () => {
        const [a, b, c] = await openMovements(3);
        // b já saiu e já teve a caixa liberada; c saiu e espera a liberação.
        await batch(asOperator, { ids: [b.id], action: "checkout-and-release" });
        await asOperator("post", `/api/movements/${c.id}/checkout`).send();

        const response = await batch(asOperator, {
            ids: [a.id, b.id, MISSING_ID, a.id, c.id],
            action: "checkout-and-release",
        });

        expect(response.status).toBe(200);
        expect(response.body.batchId).toMatch(/^[0-9a-f]{24}$/);
        expect(response.body.action).toBe("checkout-and-release");
        expect(response.body.summary).toEqual({ requested: 5, succeeded: 2, failed: 3 });
        expect(response.body.results.map((result) => [result.id, result.ok, result.error?.code ?? null])).toEqual([
            [a.id, true, null],
            [b.id, false, "CONFLICT"],
            [MISSING_ID, false, "NOT_FOUND"],
            [a.id, false, "DUPLICATE_IN_BATCH"],
            [c.id, true, null],
        ]);
        expect(response.body.results[1].error.message).toBe("Esse serviço já saiu e a caixa já foi liberada.");
        expect(response.body.results[2].error.message).toBe("Serviço não encontrado.");
        expect(response.body.results[0].movement).toMatchObject({
            status: "out",
            outBy: { name: "Operador A" },
            boxReleasedBy: { name: "Operador A" },
        });
        expect((await boxOf(a)).state).toBe("free");
        expect((await boxOf(c)).state).toBe("free");

        const record = await MovementBatch.findById(response.body.batchId).lean();
        expect(record.items.map((item) => [String(item.movement), item.steps.map((step) => step.action)])).toEqual([
            [a.id, ["checkout", "release-box"]],
            [c.id, ["release-box"]],
        ]);
        expect(record.completedAt).toBeInstanceOf(Date);

        const events = await AuditEvent.find({ "after.batchId": record._id }).lean();
        expect(events.map((event) => event.action).sort()).toEqual([
            "movement.checkout",
            "movement.release_box",
            "movement.release_box",
        ]);
    });

    it("baixa em lote: o que já saiu volta como falha, o resto sai", async () => {
        const [a, b] = await openMovements(2);
        await asOperator("post", `/api/movements/${b.id}/checkout`).send();

        const response = await batch(asOperator, { ids: [a.id, b.id], action: "checkout" });

        expect(response.body.summary).toEqual({ requested: 2, succeeded: 1, failed: 1 });
        expect(response.body.results[1].error).toEqual({ code: "CONFLICT", message: "Esse serviço já saiu." });
        expect((await boxOf(a)).state).toBe("occupied");
    });

    it("liberação em lote exige a baixa antes de cada item (D6)", async () => {
        const [a, b] = await openMovements(2);
        await asOperator("post", `/api/movements/${b.id}/checkout`).send();

        const response = await batch(asOperator, { ids: [a.id, b.id], action: "release-box" });

        expect(response.body.results.map((result) => result.ok)).toEqual([false, true]);
        expect(response.body.results[0].error.message).toBe("Dê baixa antes de liberar a caixa.");
        expect((await boxOf(a)).state).toBe("occupied");
        expect((await boxOf(b)).state).toBe("free");
    });

    it("a mesma clientRequestId repete a resposta sem aplicar de novo (R13)", async () => {
        const [a, b] = await openMovements(2);
        const body = { ids: [a.id, b.id], action: "checkout", clientRequestId: "lote-0001-abcd" };

        const first = await batch(asOperator, body);
        const eventsAfterFirst = await AuditEvent.countDocuments();
        const retry = await batch(asOperator, body);

        expect(retry.status).toBe(200);
        expect(retry.body.batchId).toBe(first.body.batchId);
        expect(retry.body.results.map((result) => result.ok)).toEqual([true, true]);
        expect(retry.body.results[0].movement.status).toBe("out");
        expect(await AuditEvent.countDocuments()).toBe(eventsAfterFirst);
        expect(await MovementBatch.countDocuments()).toBe(1);
    });

    it("um serviço de outra empresa volta como não encontrado e não muda", async () => {
        const other = await setupBusiness(app, "b");
        const boxOfB = await createBox(other.business, "1");
        const movementOfB = await launch(app, other.operatorCookie, { boxId: String(boxOfB._id), clientName: "B" });

        const response = await batch(asOperator, { ids: [movementOfB.id], action: "checkout-and-release" });

        expect(response.body.results).toEqual([
            { id: movementOfB.id, ok: false, error: { code: "NOT_FOUND", message: "Serviço não encontrado." } },
        ]);
        expect((await Movement.findById(movementOfB.id).lean()).status).toBe("open");
        expect((await Box.findById(boxOfB._id).lean()).state).toBe("occupied");
    });

    it.each([
        [{ ids: [], action: "checkout" }, "ids", "Escolha pelo menos um serviço."],
        [{ ids: Array.from({ length: 101 }, () => MISSING_ID), action: "checkout" }, "ids", "Escolha no máximo 100 serviços por lote."],
        [{ ids: ["abc"], action: "checkout" }, "ids.0", "Identificador inválido."],
        [{ ids: "abc", action: "checkout" }, "ids", "Envie os serviços numa lista de ids."],
        [{ ids: [MISSING_ID], action: "delete" }, "action", expect.stringMatching(/^Ação inválida/)],
        [{ ids: [MISSING_ID], action: "checkout", force: true }, "force", "Campo não permitido."],
    ])("valida o corpo %#", async (body, field, message) => {
        const response = await batch(asOperator, body);

        expect(response.status).toBe(400);
        expect(response.body.error.fields[field]).toEqual(message);
        expect(await MovementBatch.countDocuments()).toBe(0);
    });

    it("o mesmo id escrito em maiúsculas é o mesmo serviço", async () => {
        const [a] = await openMovements(1);

        const response = await batch(asOperator, { ids: [a.id, a.id.toUpperCase()], action: "checkout" });

        expect(response.body.results.map((result) => [result.id, result.ok])).toEqual([
            [a.id, true],
            [a.id, false],
        ]);
    });

    it("um lote de 100 serviços (R18) sai e libera todos", async () => {
        const movements = await openMovements(100);

        const response = await batch(asAdmin, {
            ids: movements.map((movement) => movement.id),
            action: "checkout-and-release",
        });

        expect(response.body.summary).toEqual({ requested: 100, succeeded: 100, failed: 0 });
        expect(await Box.countDocuments({ state: "occupied" })).toBe(0);
        expect(await Movement.countDocuments({ status: "out", boxReleasedAt: { $ne: null } })).toBe(100);
    }, 60_000);
});

describe("POST /api/movements/batch/:batchId/undo (D9)", () => {
    function undoBatch(as, batchId) {
        return as("post", `/api/movements/batch/${batchId}/undo`).send();
    }

    it("desfaz o lote inteiro, item a item, na ordem inversa dos passos", async () => {
        const [a, b, c] = await openMovements(3);
        await asOperator("post", `/api/movements/${c.id}/checkout`).send();
        const done = await batch(asOperator, { ids: [a.id, b.id, c.id], action: "checkout-and-release" });

        const response = await undoBatch(asOperator, done.body.batchId);

        expect(response.status).toBe(200);
        expect(response.body.summary).toEqual({ requested: 3, succeeded: 3, failed: 0 });
        expect(response.body.results.map((result) => [result.id, result.movement.status])).toEqual([
            [a.id, "open"],
            [b.id, "open"],
            // c já tinha saído antes do lote: o lote só liberou a caixa, e é isso que se desfaz.
            [c.id, "out"],
        ]);
        for (const movement of [a, b, c]) {
            const box = await boxOf(movement);
            expect(box.state).toBe("occupied");
            expect(String(box.currentMovement)).toBe(movement.id);
        }
        const undone = await AuditEvent.find({ action: /^movement\.undo_/ }).lean();
        expect(undone).toHaveLength(5);
        expect(undone.every((event) => String(event.after.batchId) === done.body.batchId)).toBe(true);
    });

    it("com a caixa de um item reutilizada, só esse item falha", async () => {
        const [a, b] = await openMovements(2);
        const done = await batch(asOperator, { ids: [a.id, b.id], action: "checkout-and-release" });
        await launch(app, ctx.operatorCookie, { boxId: b.box.id, clientName: "Outro" });

        const response = await undoBatch(asOperator, done.body.batchId);

        expect(response.body.summary).toEqual({ requested: 2, succeeded: 1, failed: 1 });
        expect(response.body.results[1]).toEqual({
            id: b.id,
            ok: false,
            error: {
                code: "CONFLICT",
                message: `A caixa ${b.box.number} já recebeu outro serviço. Não dá para desfazer a liberação.`,
            },
        });
        // A transação do item com falha não deixa nada pela metade.
        expect((await Movement.findById(b.id).lean()).status).toBe("out");
        expect((await Movement.findById(a.id).lean()).status).toBe("open");
    });

    it("um item que mudou depois do lote não é desfeito por cima", async () => {
        const [a] = await openMovements(1);
        const done = await batch(asOperator, { ids: [a.id], action: "checkout-and-release" });
        await asOperator("post", `/api/movements/${a.id}/undo`).send({ action: "release-box" });
        await asAdmin("post", `/api/movements/${a.id}/release-box`).send();

        const response = await undoBatch(asOperator, done.body.batchId);

        expect(response.body.results[0].error).toEqual({
            code: "CONFLICT",
            message: "Esse serviço mudou depois do lote.",
        });
        expect((await Movement.findById(a.id).lean()).boxReleasedAt).toBeInstanceOf(Date);
    });

    it("desfazer de novo avisa que o item já foi desfeito", async () => {
        const [a] = await openMovements(1);
        const done = await batch(asOperator, { ids: [a.id], action: "checkout" });
        await undoBatch(asOperator, done.body.batchId);

        const again = await undoBatch(asOperator, done.body.batchId);

        expect(again.body.results[0].error.message).toBe("Esse item do lote já foi desfeito.");
    });

    it("só o autor (em até 10 min) ou o admin desfaz; lote de outra empresa é 404", async () => {
        setNow("2026-11-23T12:00:00.000Z");
        const [a, b] = await openMovements(2);
        const done = await batch(asOperator, { ids: [a.id, b.id], action: "checkout" });

        const otherOperator = await createUser({ business: ctx.business, username: "outro-op" });
        const asOther = apiAs(app, await login(app, otherOperator.username));
        const notAuthor = await undoBatch(asOther, done.body.batchId);
        expect(notAuthor.status).toBe(403);
        expect(notAuthor.body.error.message).toBe("Só quem fez o lote pode desfazê-lo.");

        setNow("2026-11-23T12:10:01.000Z");
        const late = await undoBatch(asOperator, done.body.batchId);
        expect(late.body.summary).toEqual({ requested: 2, succeeded: 0, failed: 2 });
        expect(late.body.results[0].error).toEqual({
            code: "FORBIDDEN",
            message: "O prazo de 10 minutos para desfazer já passou.",
        });

        const byAdmin = await undoBatch(asAdmin, done.body.batchId);
        expect(byAdmin.body.summary.succeeded).toBe(2);

        const other = await createBusiness("Laboratório B");
        const foreign = await MovementBatch.create({ business: other._id, user: ctx.admin._id, action: "checkout" });
        const response = await undoBatch(asAdmin, String(foreign._id));
        expect(response.status).toBe(404);
        expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Lote não encontrado." });

        const malformed = await undoBatch(asAdmin, "abc");
        expect(malformed.status).toBe(400);
    });
});
