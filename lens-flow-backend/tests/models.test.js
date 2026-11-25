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

    it("aceita número de 1 a 6 dígitos, com zero à esquerda, e só cor do enum (D18)", async () => {
        await expect(Box.create({ business: businessA, number: "07", color: "azul" })).resolves.toBeDefined();
        for (const number of ["0", "000", "1234567", "12a", ""]) {
            await expect(Box.create({ business: businessA, number, color: "azul" })).rejects.toThrow(/number/);
        }
        await expect(Box.create({ business: businessA, number: "1", color: "#FF0000" })).rejects.toThrow(
            /color/
        );
    });

    it("o número é único na empresa com comparação exata: 7 e 007 convivem (D4, D18)", async () => {
        await Box.create({ business: businessA, number: "7", color: "branca" });
        await Box.create({ business: businessA, number: "007", color: "azul" });
        await Box.create({ business: businessB, number: "007", color: "azul" });

        await expect(Box.create({ business: businessA, number: "007", color: "verde" })).rejects.toMatchObject({
            code: 11000,
        });

        const query = Box.find({ business: businessA, number: "007" });
        expect((await query.clone().lean()).map((box) => box.number)).toEqual(["007"]);
        const plan = JSON.stringify((await query.clone().explain("queryPlanner")).queryPlanner.winningPlan);
        expect(plan).toContain("IXSCAN");
        expect(plan).toContain("business_1_number_1");
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

    it("guarda a OS como foi digitada e deriva a OS normalizada (D26) ao criar e quando ela muda", async () => {
        const movement = await Movement.create({
            business: businessA,
            sheet: new mongoose.Types.ObjectId(),
            sheetDate: "2026-11-22",
            box: new mongoose.Types.ObjectId(),
            boxSnapshot: { number: "1", color: "branca", category: "without_assembly" },
            clientName: "Ótica Central",
            orderService: "  A-77 ",
            createdBy: new mongoose.Types.ObjectId(),
        });
        const stored = () => Movement.findById(movement._id).lean();
        expect(await stored()).toMatchObject({ orderService: "A-77", orderServiceNormalized: "a-77" });

        movement.orderService = "É-10";
        await movement.save();
        expect(await stored()).toMatchObject({ orderService: "É-10", orderServiceNormalized: "é-10" });

        // Um documento carregado sem a OS não a perde ao salvar outro campo.
        const partial = await Movement.findById(movement._id).select("note");
        partial.note = "refação";
        await partial.save();
        expect(await stored()).toMatchObject({ orderService: "É-10", orderServiceNormalized: "é-10", note: "refação" });

        movement.orderService = " ";
        await movement.save();
        expect((await stored()).orderServiceNormalized).toBeNull();
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
