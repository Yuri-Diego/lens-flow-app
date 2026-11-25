import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { ensureIndexes } from "../db/database.js";
import { boxNumberSortKey } from "../domain/boxNumbers.js";
import { Box, Movement } from "../models/index.js";
import { migrateOrderServices } from "../services/orderServiceMigration.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { apiAs, createBox } from "./helpers/movements.js";

useTestDb();

const NUMERIC_COLLATION = { locale: "pt", numericOrdering: true };

/**
 * Recria a coleção de caixas como a F2 deixou o banco de desenvolvimento:
 * colação numérica como padrão da coleção e índice único do número com essa
 * colação, que tratava "007" e "7" como iguais.
 */
async function recreateF2BoxesCollection(businessId) {
    const { db } = mongoose.connection;
    await db.dropCollection("boxes");
    await db.createCollection("boxes", { collation: NUMERIC_COLLATION });
    const boxes = db.collection("boxes");
    await boxes.createIndex({ business: 1, number: 1 }, { unique: true, name: "business_1_number_1" });
    await boxes.createIndex({ business: 1, state: 1 }, { name: "business_1_state_1" });
    await boxes.insertOne({
        business: businessId,
        number: "7",
        color: "branca",
        category: "without_assembly",
        state: "free",
        currentMovement: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

describe("migração do banco da F2 (D18)", () => {
    it("troca o índice único com colação numérica pelo exato, e 007 passa a conviver com 7", async () => {
        const app = createTestApp();
        const ctx = await setupBusiness(app, "a");
        await recreateF2BoxesCollection(ctx.business._id);

        await ensureIndexes();

        const indexes = await Box.listIndexes();
        const unique = indexes.find((index) => index.name === "business_1_number_1");
        expect(unique.unique).toBe(true);
        expect(unique.collation?.locale ?? "simple").toBe("simple");
        expect(indexes.filter((index) => index.collation?.numericOrdering)).toEqual([
            expect.objectContaining({ name: "_id_" }),
        ]);

        const api = (method, path) => request(app)[method](path).set("Cookie", ctx.adminCookie);
        expect((await api("post", "/api/boxes").send({ number: "007", color: "azul" })).status).toBe(201);
        expect((await api("post", "/api/boxes").send({ number: "007", color: "verde" })).status).toBe(409);

        // A coleção antiga continua com a colação numérica, mas as consultas são exatas.
        const byNumber = async (number) =>
            (await api("get", `/api/boxes?number=${number}`)).body.boxes.map((box) => box.number);
        expect(await byNumber("7")).toEqual(["7"]);
        expect(await byNumber("007")).toEqual(["007"]);
        expect(await byNumber("07")).toEqual([]);
        expect((await api("get", "/api/boxes")).body.boxes.map((box) => box.number)).toEqual(["7", "007"]);
    });

    it("rodar de novo não muda nada (os índices já batem com o schema)", async () => {
        await ensureIndexes();
        const before = await Box.listIndexes();

        await ensureIndexes();

        expect(await Box.listIndexes()).toEqual(before);
    });

    it("o índice parcial das sugestões de cliente (D24) é criado uma vez e não é refeito ao subir", async () => {
        await ensureIndexes();
        const before = await Movement.listIndexes();
        const suggestions = before.find(
            (index) => index.name === "business_1_clientNameNormalized_1_createdAt_-1_clientName_1"
        );
        expect(suggestions).toMatchObject({
            key: { business: 1, clientNameNormalized: 1, createdAt: -1, clientName: 1 },
            partialFilterExpression: { deletedAt: null },
        });

        await ensureIndexes();

        expect(await Movement.diffIndexes()).toEqual({ toDrop: [], toCreate: [] });
        expect(await Movement.listIndexes()).toEqual(before);
    });
});

describe("migração da OS sem distinguir maiúsculas (D26)", () => {
    const OLD_INDEX = "business_1_orderService_1";
    const NEW_INDEX = "business_1_orderServiceNormalized_1_orderService_1__id_1";

    let app;
    let a;
    let b;
    let sequence;

    beforeEach(async () => {
        app = createTestApp();
        a = await setupBusiness(app, "a");
        b = await setupBusiness(app, "b");
        sequence = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** O índice da OS como a versão 1.3 da API o deixava. */
    async function restoreOldIndex() {
        if ((await Movement.listIndexes()).some((index) => index.name === NEW_INDEX)) {
            await Movement.collection.dropIndex(NEW_INDEX);
        }
        await Movement.collection.createIndex({ business: 1, orderService: 1 }, { name: OLD_INDEX });
    }

    /** Um serviço como a versão 1.3 da API o gravava: sem a OS normalizada. */
    function oldMovement(ctx, orderService, extra = {}) {
        sequence += 1;
        const at = new Date(Date.UTC(2026, 10, 20, 13, 0, 0, sequence));
        return {
            _id: new mongoose.Types.ObjectId(),
            business: ctx.business._id,
            sheet: new mongoose.Types.ObjectId(),
            sheetDate: "2026-11-20",
            box: new mongoose.Types.ObjectId(),
            boxSnapshot: { number: String(sequence), color: "branca", category: "without_assembly" },
            urgent: false,
            boxSortKey: boxNumberSortKey(String(sequence)),
            clientName: "Ótica Central",
            clientNameNormalized: "otica central",
            orderService,
            note: null,
            status: "open",
            createdBy: ctx.operator._id,
            outBy: null,
            outAt: null,
            boxReleasedBy: null,
            boxReleasedAt: null,
            updatedBy: null,
            deletedBy: null,
            deletedAt: null,
            clientRequestId: null,
            createdAt: at,
            updatedAt: at,
            __v: 0,
            ...extra,
        };
    }

    async function insertOld(ctx, ...orders) {
        const docs = orders.map((orderService) => oldMovement(ctx, orderService));
        await Movement.collection.insertMany(docs);
        return docs;
    }

    function storedMovements() {
        return Movement.find().sort({ _id: 1 }).lean();
    }

    /** [OS como foi digitada, OS normalizada] de cada serviço. */
    async function pairs() {
        return (await storedMovements()).map((doc) => [doc.orderService ?? null, doc.orderServiceNormalized ?? null]);
    }

    it("um banco da versão anterior funciona depois de subir, sem passo manual: índice, busca, filtro e aviso", async () => {
        await restoreOldIndex();
        const out = { status: "out", outBy: a.operator._id, outAt: new Date("2026-11-21T12:00:00.000Z") };
        const deleted = { deletedBy: a.admin._id, deletedAt: new Date("2026-11-21T12:00:00.000Z") };
        const docs = [
            oldMovement(a, "A-77"),
            oldMovement(a, "os-12b", out),
            oldMovement(a, "4521"),
            oldMovement(a, "É-10"),
            oldMovement(a, "ÇÃO 3"),
            oldMovement(a, null),
            oldMovement(a, ""),
            oldMovement(a, "X-1", deleted),
            oldMovement(b, "A-77"),
        ];
        const withoutOrder = oldMovement(a, null);
        delete withoutOrder.orderService;
        await Movement.collection.insertMany([...docs, withoutOrder]);
        const before = await storedMovements();

        await ensureIndexes();
        expect(await migrateOrderServices()).toBe(7);

        const indexes = (await Movement.listIndexes()).map((index) => index.name);
        expect(indexes).toContain(NEW_INDEX);
        expect(indexes).not.toContain(OLD_INDEX);
        expect(await Movement.diffIndexes()).toEqual({ toDrop: [], toCreate: [] });

        const after = await storedMovements();
        expect(new Map(after.map((doc) => [doc.orderService, doc.orderServiceNormalized]))).toEqual(
            new Map([
                ["A-77", "a-77"],
                ["os-12b", "os-12b"],
                ["4521", "4521"],
                ["É-10", "é-10"],
                ["ÇÃO 3", "ção 3"],
                [null, undefined],
                ["", undefined],
                ["X-1", "x-1"],
                [undefined, undefined],
            ])
        );
        // Nada mais muda: nem a OS como foi digitada, nem o updatedAt.
        for (const doc of after) {
            delete doc.orderServiceNormalized;
        }
        expect(after).toEqual(before);

        const api = apiAs(app, a.operatorCookie);
        const found = async (query) =>
            (await api("get", `/api/movements?${query}`)).body.items.map((item) => item.orderService);
        expect(await found("q=a-7")).toEqual(["A-77"]);
        expect(await found("q=OS-12")).toEqual(["os-12b"]);
        expect(await found(`q=${encodeURIComponent("é-1")}`)).toEqual(["É-10"]);
        expect(await found("q=45")).toEqual(["4521"]);
        expect(await found("q=x-1")).toEqual([]);
        expect(await found("status=open&orderService=a-77")).toEqual(["A-77"]);
        expect(await found(`status=open&orderService=${encodeURIComponent("ção 3")}`)).toEqual(["ÇÃO 3"]);

        const box = await createBox(a.business, "900");
        const launched = await api("post", "/api/movements").send({
            boxId: String(box._id),
            clientName: "Ótica",
            orderService: "a-77",
        });
        expect(launched.body.warnings[0].message).toBe("A OS a-77 já está na caixa 1 (Branca), aberta desde 20/11.");
        expect(launched.body.warnings[0].movements.map((other) => other.box.number)).toEqual(["1"]);
    });

    it("rodar de novo não muda nada: nem os serviços, nem os índices", async () => {
        await restoreOldIndex();
        await insertOld(a, "A-77", "É-10", "4521", null, "");
        await ensureIndexes();
        expect(await migrateOrderServices()).toBe(3);
        const before = await storedMovements();
        const indexesBefore = await Movement.listIndexes();

        await ensureIndexes();
        expect(await migrateOrderServices()).toBe(0);

        expect(await storedMovements()).toEqual(before);
        expect(await Movement.listIndexes()).toEqual(indexesBefore);
    });

    it("se a API cair no meio, a próxima subida continua de onde parou", async () => {
        // Com acento, para passarem pelos lotes: mais de um lote de 1.000.
        const orders = Array.from({ length: 1_200 }, (_, index) => `É-${index}`);
        await insertOld(a, ...orders, "A-77");
        await insertOld(b, "B-88");
        const bulkWrite = Movement.collection.bulkWrite.bind(Movement.collection);
        vi.spyOn(Movement.collection, "bulkWrite")
            .mockImplementationOnce(bulkWrite)
            .mockRejectedValueOnce(new Error("queda simulada"));

        await expect(migrateOrderServices()).rejects.toThrow("queda simulada");

        // Parou no segundo lote: o que já foi gravado está certo, e o resto ainda falta.
        const partial = await pairs();
        const missing = partial.filter(([, normalized]) => normalized === null).length;
        expect(missing).toBe(1_200 - 1_000 + 1);
        for (const [orderService, normalized] of partial) {
            expect([null, orderService.toLowerCase()]).toContain(normalized);
        }

        vi.restoreAllMocks();
        expect(await migrateOrderServices()).toBe(missing);

        for (const [orderService, normalized] of await pairs()) {
            expect(normalized).toBe(orderService.toLowerCase());
        }
        expect(await migrateOrderServices()).toBe(0);
    });

    it("corrige a OS mudada por uma versão anterior da API, ou direto no banco, depois da migração", async () => {
        await insertOld(a, "A-77", "É-10", "4521", "B-88", null);
        await migrateOrderServices();
        const change = (from, to) =>
            Movement.collection.updateOne({ business: a.business._id, orderService: from }, { $set: { orderService: to } });
        await change("A-77", "C-99");
        await change("É-10", "Ô-20");
        await change(null, "D-11");
        await change("4521", null);
        await insertOld(a, "E-22");

        // Quatro mudadas e uma lançada; a "B-88" não muda.
        expect(await migrateOrderServices()).toBe(5);

        expect(Object.fromEntries(await pairs())).toEqual({
            "C-99": "c-99",
            "Ô-20": "ô-20",
            "B-88": "b-88",
            "D-11": "d-11",
            "E-22": "e-22",
            null: null,
        });
    });

    it("não passa por cima de uma edição feita no meio da migração", async () => {
        const [doc] = await insertOld(a, "É-10");
        const bulkWrite = Movement.collection.bulkWrite.bind(Movement.collection);
        vi.spyOn(Movement.collection, "bulkWrite").mockImplementationOnce(async (...args) => {
            // Entre a leitura e a gravação, outra instância da API edita a OS.
            await Movement.updateOne(
                { _id: doc._id },
                { $set: { orderService: "Ô-20", orderServiceNormalized: "ô-20" } }
            );
            return bulkWrite(...args);
        });

        expect(await migrateOrderServices()).toBe(0);

        expect(await pairs()).toEqual([["Ô-20", "ô-20"]]);
    });

    it("não para por causa de um serviço com dados estranhos gravados à mão", async () => {
        await insertOld(a, "A-77", " b-88 ", "   ", "linha\nnova", 4521);
        await Movement.collection.insertMany([
            oldMovement(a, "C-99", { createdAt: "ontem" }),
            oldMovement(a, "D-11", { createdAt: null }),
        ]);

        await migrateOrderServices();

        expect(new Map(await pairs())).toEqual(
            new Map([
                ["A-77", "a-77"],
                [" b-88 ", "b-88"],
                // Só espaços é como não ter OS.
                ["   ", null],
                ["linha\nnova", "linha\nnova"],
                [4521, "4521"],
                ["C-99", "c-99"],
                ["D-11", "d-11"],
            ])
        );
        expect(await migrateOrderServices()).toBe(0);
    });
});
