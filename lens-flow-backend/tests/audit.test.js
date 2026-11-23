import { describe, expect, it } from "vitest";
import request from "supertest";
import { AuditEvent, Box, User } from "../models/index.js";
import { DEFAULT_PASSWORD, createTestApp, findSecrets, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";

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
