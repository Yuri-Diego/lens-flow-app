import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuditEvent, Box, Movement, MovementSheet, User } from "../models/index.js";
import { DEFAULT_PASSWORD, createTestApp, findSecrets, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { apiAs, createBox, launch } from "./helpers/movements.js";

useTestDb();

const PASSWORDS = [DEFAULT_PASSWORD, "senha-do-novo-123", "senha-redefinida-1", "troca-propria-22"];

describe("auditoria (RN-02)", () => {
    it("grava um evento por mutação, com quem fez, a empresa e sem senha", async () => {
        const app = createTestApp();
        const { business, admin, operator, adminCookie, operatorCookie } = await setupBusiness(app, "a");
        const asAdmin = (method, path) => request(app)[method](path).set("Cookie", adminCookie);

        const created = await asAdmin("post", "/api/users").send({
            name: "Novo",
            username: "novo",
            password: PASSWORDS[1],
            role: "operator",
        });
        const newUserId = created.body.user.id;
        await asAdmin("patch", `/api/users/${newUserId}`).send({ name: "Novo Nome" });
        await asAdmin("post", `/api/users/${newUserId}/reset-password`).send({ password: PASSWORDS[2] });
        await request(app)
            .patch("/api/auth/password")
            .set("Cookie", operatorCookie)
            .send({ currentPassword: DEFAULT_PASSWORD, newPassword: PASSWORDS[3] });
        const box = await asAdmin("post", "/api/boxes").send({ number: "1", color: "branca" });
        await asAdmin("post", "/api/boxes/batch").send({ color: "azul", numbers: "2-3" });
        await asAdmin("patch", `/api/boxes/${box.body.box.id}`).send({ color: "preta" });
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            await request(app).post("/api/auth/login").send({ username: "novo", password: "errada!" });
        }

        const events = await AuditEvent.find().sort({ at: 1, _id: 1 }).lean();
        const summary = events.map((event) => [event.action, event.entity, event.user && String(event.user)]);
        expect(summary).toEqual([
            ["user.create", "User", String(admin._id)],
            ["user.update", "User", String(admin._id)],
            ["user.reset_password", "User", String(admin._id)],
            ["user.change_password", "User", String(operator._id)],
            ["box.create", "Box", String(admin._id)],
            ["box.create", "Box", String(admin._id)],
            ["box.create", "Box", String(admin._id)],
            ["box.update", "Box", String(admin._id)],
            ["user.lock", "User", null],
        ]);
        expect(events.every((event) => String(event.business) === String(business._id))).toBe(true);
        expect(events.every((event) => event.at instanceof Date)).toBe(true);
        expect(findSecrets(events, PASSWORDS)).toEqual([]);

        const boxIds = new Set((await Box.find().lean()).map((doc) => String(doc._id)));
        const boxEvents = events.filter((event) => event.entity === "Box");
        expect(boxEvents.every((event) => boxIds.has(String(event.entityId)))).toBe(true);
    });

    it("uma mutação recusada não grava evento", async () => {
        const app = createTestApp();
        const { admin, adminCookie } = await setupBusiness(app, "a");
        const asAdmin = (method, path) => request(app)[method](path).set("Cookie", adminCookie);

        await asAdmin("post", "/api/boxes").send({ number: "1", color: "branca" });
        const before = await AuditEvent.countDocuments();

        expect((await asAdmin("post", "/api/boxes").send({ number: "1", color: "azul" })).status).toBe(409);
        expect((await asAdmin("patch", `/api/users/${admin._id}`).send({ active: false })).status).toBe(409);
        expect((await asAdmin("post", "/api/users").send({ name: "X" })).status).toBe(400);

        expect(await AuditEvent.countDocuments()).toBe(before);
        expect(await User.countDocuments()).toBe(2);
    });
});

describe("auditoria das operações de serviço (F3)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("cada mutação grava um evento do serviço, com quem fez", async () => {
        const app = createTestApp();
        const { business, admin, operator, adminCookie, operatorCookie } = await setupBusiness(app, "a");
        const asAdmin = apiAs(app, adminCookie);
        const asOperator = apiAs(app, operatorCookie);
        const first = await createBox(business, "1");
        const second = await createBox(business, "2");

        const movement = await launch(app, operatorCookie, { boxId: String(first._id), clientName: "A" });
        await asOperator("patch", `/api/movements/${movement.id}`).send({ clientName: "B" });
        await asOperator("post", `/api/movements/${movement.id}/change-box`).send({ boxId: String(second._id) });
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        await asOperator("post", `/api/movements/${movement.id}/release-box`).send();
        await asOperator("post", `/api/movements/${movement.id}/undo`).send({ action: "release-box" });
        await asOperator("post", `/api/movements/${movement.id}/undo`).send({ action: "checkout" });
        await asAdmin("delete", `/api/movements/${movement.id}`).send();

        const events = await AuditEvent.find({ entityId: movement.id }).sort({ at: 1, _id: 1 }).lean();
        expect(events.map((event) => [event.action, String(event.user)])).toEqual([
            ["movement.create", String(operator._id)],
            ["movement.update", String(operator._id)],
            ["movement.change_box", String(operator._id)],
            ["movement.checkout", String(operator._id)],
            ["movement.release_box", String(operator._id)],
            ["movement.undo_release_box", String(operator._id)],
            ["movement.undo_checkout", String(operator._id)],
            ["movement.delete", String(admin._id)],
        ]);
        expect(events.every((event) => event.entity === "Movement")).toBe(true);
        expect(events.every((event) => String(event.business) === String(business._id))).toBe(true);
        expect(findSecrets(events)).toEqual([]);
    });

    it("se o histórico não puder ser gravado, a mudança também não entra (mesma transação)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const app = createTestApp();
        const { business, operatorCookie } = await setupBusiness(app, "a");
        const asOperator = apiAs(app, operatorCookie);
        const box = await createBox(business, "1");
        const failNextAudit = () => vi.spyOn(AuditEvent, "create").mockRejectedValueOnce(new Error("falha simulada"));

        failNextAudit();
        const launchFailed = await asOperator("post", "/api/movements").send({ boxId: String(box._id), clientName: "A" });
        expect(launchFailed.status).toBe(500);
        expect(await Movement.countDocuments()).toBe(0);
        expect(await MovementSheet.countDocuments()).toBe(0);
        expect((await Box.findById(box._id).lean()).state).toBe("free");

        const movement = await launch(app, operatorCookie, { boxId: String(box._id), clientName: "A" });
        failNextAudit();
        expect((await asOperator("post", `/api/movements/${movement.id}/checkout`).send()).status).toBe(500);
        expect((await Movement.findById(movement.id).lean()).status).toBe("open");

        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();
        failNextAudit();
        expect((await asOperator("post", `/api/movements/${movement.id}/release-box`).send()).status).toBe(500);
        expect((await Movement.findById(movement.id).lean()).boxReleasedAt).toBeNull();
        expect((await Box.findById(box._id).lean()).state).toBe("occupied");
    });
});
