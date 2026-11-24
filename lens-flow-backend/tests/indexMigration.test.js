import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { ensureIndexes } from "../db/database.js";
import { Box, Movement } from "../models/index.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

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
