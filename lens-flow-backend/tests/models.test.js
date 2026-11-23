import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { AuditEvent, Box, Movement, MovementSheet } from "../models/index.js";
import { useTestDb } from "./helpers/db.js";

useTestDb();

const businessA = new mongoose.Types.ObjectId();
const businessB = new mongoose.Types.ObjectId();

describe("Box", () => {
    it("deriva a categoria da cor ao criar e ao trocar a cor (RN-04)", async () => {
        const box = await Box.create({ business: businessA, number: "1", color: "azul" });
        expect(box.category).toBe("with_treatment");

        const updated = await Box.findOneAndUpdate(
            { _id: box._id },
            { $set: { color: "amarela" } },
            { new: true }
        ).lean();
        expect(updated.category).toBe("with_assembly");
    });

    it("só aceita número normalizado e cor do enum", async () => {
        await expect(Box.create({ business: businessA, number: "07", color: "azul" })).rejects.toThrow(
            /number/
        );
        await expect(Box.create({ business: businessA, number: "1", color: "#FF0000" })).rejects.toThrow(
            /color/
        );
    });

    it("ordena por número em ordem natural no banco, usando o índice", async () => {
        for (const number of ["10", "2", "1", "100"]) {
            await Box.create({ business: businessA, number, color: "branca" });
        }

        const query = Box.find({ business: businessA }).sort({ number: 1 });
        expect((await query.clone().lean()).map((box) => box.number)).toEqual(["1", "2", "10", "100"]);

        const plan = await query.clone().explain("queryPlanner");
        expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain("IXSCAN");
        expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('"SORT"');
    });
});

describe("MovementSheet", () => {
    it("tem uma folha por dia por empresa (B5)", async () => {
        await MovementSheet.create({ business: businessA, date: "2026-11-22" });

        await expect(MovementSheet.create({ business: businessA, date: "2026-11-22" })).rejects.toMatchObject({
            code: 11000,
        });
        await expect(MovementSheet.create({ business: businessB, date: "2026-11-22" })).resolves.toBeDefined();
        await expect(MovementSheet.create({ business: businessA, date: "2026-11-23" })).resolves.toBeDefined();
    });
});

describe("Movement", () => {
    it("grava createdAt e updatedAt de verdade (B6)", async () => {
        const movement = await Movement.create({
            business: businessA,
            sheet: new mongoose.Types.ObjectId(),
            sheetDate: "2026-11-22",
            box: new mongoose.Types.ObjectId(),
            boxSnapshot: { number: "1", color: "vermelha", category: "urgent" },
            clientName: "Ótica Central",
            createdBy: new mongoose.Types.ObjectId(),
        });
        expect(movement).toMatchObject({ status: "open", orderService: null, note: null });

        await new Promise((resolve) => setTimeout(resolve, 5));
        await Movement.updateOne({ _id: movement._id }, { $set: { note: "aguardando armação" } });

        const stored = await Movement.findById(movement._id).lean();
        expect(stored.updatedAt.getTime()).toBeGreaterThan(stored.createdAt.getTime());
        expect(stored).not.toHaveProperty("updateAt");
    });
});

describe("AuditEvent", () => {
    it("é somente inserção (RN-02)", async () => {
        const event = await AuditEvent.create({
            business: businessA,
            action: "box.create",
            entity: "Box",
            entityId: new mongoose.Types.ObjectId(),
            after: { number: "1" },
        });
        const filter = { _id: event._id };

        await expect(AuditEvent.updateOne(filter, { action: "x" })).rejects.toThrow(/somente inserção/);
        await expect(AuditEvent.findOneAndUpdate(filter, { action: "x" })).rejects.toThrow(/somente inserção/);
        await expect(AuditEvent.replaceOne(filter, { action: "x" })).rejects.toThrow(/somente inserção/);
        await expect(AuditEvent.deleteOne(filter)).rejects.toThrow(/somente inserção/);
        await expect(AuditEvent.deleteMany({})).rejects.toThrow(/somente inserção/);
        await expect(AuditEvent.findOneAndDelete(filter)).rejects.toThrow(/somente inserção/);
        await expect(event.deleteOne()).rejects.toThrow(/somente inserção/);

        event.action = "x";
        await expect(event.save()).rejects.toThrow(/somente inserção/);

        expect(await AuditEvent.findById(event._id).lean()).toMatchObject({ action: "box.create" });
    });
});
