import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Box from "../models/Box.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const businessId = new mongoose.Types.ObjectId();

describe("banco em memória (MongoMemoryReplSet)", () => {
    it("grava e lê documentos pelos models", async () => {
        await Box.create({ number: "12", color: "#FF0000", businessId });

        const boxes = await Box.find({ businessId }).lean();

        expect(boxes).toHaveLength(1);
        expect(boxes[0]).toMatchObject({ number: "12", color: "#FF0000" });
    });

    it("começa cada teste com as coleções limpas", async () => {
        expect(await Box.countDocuments()).toBe(0);
    });

    it("confirma transações (exige replica set)", async () => {
        await mongoose.connection.transaction(async (session) => {
            await Box.create([{ number: "1", color: "#FFFFFF", businessId }], { session });
        });

        expect(await Box.countDocuments()).toBe(1);
    });

    it("desfaz a transação quando ela falha", async () => {
        await expect(
            mongoose.connection.transaction(async (session) => {
                await Box.create([{ number: "2", color: "#FFFFFF", businessId }], { session });
                throw new Error("falha simulada");
            })
        ).rejects.toThrow("falha simulada");

        expect(await Box.countDocuments()).toBe(0);
    });
});
