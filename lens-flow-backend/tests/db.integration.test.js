import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Box from "../models/Box.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const business = new mongoose.Types.ObjectId();

describe("banco em memória (MongoMemoryReplSet)", () => {
    it("grava e lê documentos pelos models", async () => {
        await Box.create({ business, number: "12", color: "vermelha" });

        const boxes = await Box.find({ business }).lean();

        expect(boxes).toHaveLength(1);
        expect(boxes[0]).toMatchObject({
            number: "12",
            color: "vermelha",
            category: "urgent",
            state: "free",
            currentMovement: null,
            active: true,
        });
    });

    it("começa cada teste com as coleções limpas", async () => {
        expect(await Box.countDocuments()).toBe(0);
    });

    it("confirma transações (exige replica set)", async () => {
        await mongoose.connection.transaction(async (session) => {
            await Box.create([{ business, number: "1", color: "branca" }], { session });
        });

        expect(await Box.countDocuments()).toBe(1);
    });

    it("desfaz a transação quando ela falha", async () => {
        await expect(
            mongoose.connection.transaction(async (session) => {
                await Box.create([{ business, number: "2", color: "branca" }], { session });
                throw new Error("falha simulada");
            })
        ).rejects.toThrow("falha simulada");

        expect(await Box.countDocuments()).toBe(0);
    });
});
