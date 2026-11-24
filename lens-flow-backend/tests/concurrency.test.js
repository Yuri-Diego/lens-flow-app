import { beforeEach, describe, expect, it } from "vitest";
import { AuditEvent, Box, Movement, MovementSheet } from "../models/index.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { apiAs, createBox, launch } from "./helpers/movements.js";

useTestDb();

// Cada cenário roda algumas vezes, com caixas novas, para cobrir ordens diferentes.
const ROUNDS = 4;

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

function launchIn(as, box, clientName) {
    return as("post", "/api/movements").send({ boxId: String(box._id), clientName });
}

describe("concorrência (RN-05, T6)", () => {
    it("dois lançamentos simultâneos na mesma caixa: só um entra, o outro recebe BOX_OCCUPIED", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const box = await createBox(ctx.business, String(round));

            const responses = await Promise.all([
                launchIn(asOperator, box, "Primeiro"),
                launchIn(asAdmin, box, "Segundo"),
            ]);

            expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
            const winner = responses.find((response) => response.status === 201).body.movement;
            const loser = responses.find((response) => response.status === 409).body.error;
            expect(loser.code).toBe("BOX_OCCUPIED");
            expect(loser.details.box.currentMovement.id).toBe(winner.id);

            expect(await Movement.countDocuments({ box: box._id })).toBe(1);
            const stored = await Box.findById(box._id).lean();
            expect(stored.state).toBe("occupied");
            expect(String(stored.currentMovement)).toBe(winner.id);
        }
        expect(await AuditEvent.countDocuments({ action: "movement.create" })).toBe(ROUNDS);
    });

    it("cinco lançamentos ao mesmo tempo na mesma caixa: só um entra", async () => {
        const box = await createBox(ctx.business, "50");

        const responses = await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                launchIn(index % 2 ? asAdmin : asOperator, box, `Cliente ${index}`)
            )
        );

        expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
        expect(responses.filter((response) => response.body.error?.code === "BOX_OCCUPIED")).toHaveLength(4);
        expect(await Movement.countDocuments({ box: box._id })).toBe(1);
    });

    it("lançamento e renumeração da caixa ao mesmo tempo: o serviço sempre guarda o número que a caixa tem", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const box = await createBox(ctx.business, String(100 + round));
            const newNumber = String(900 + round);

            const [launched, patched] = await Promise.all([
                launchIn(asOperator, box, "Cliente"),
                asAdmin("patch", `/api/boxes/${box._id}`).send({ number: newNumber }),
            ]);

            expect(launched.status).toBe(201);
            const stored = await Box.findById(box._id).lean();
            const movement = await Movement.findById(launched.body.movement.id).lean();
            expect(movement.boxSnapshot.number).toBe(stored.number);
            if (patched.status === 200) {
                // A renumeração veio antes: o lançamento já pegou o número novo.
                expect(stored.number).toBe(newNumber);
            } else {
                expect(patched.status).toBe(409);
                expect(patched.body.error.code).toBe("BOX_OCCUPIED");
                expect(stored.number).toBe(String(100 + round));
            }
        }
    });

    it("lançamento e desativação da caixa ao mesmo tempo: nunca fica caixa inativa ocupada", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const box = await createBox(ctx.business, String(200 + round));

            const [launched, deactivated] = await Promise.all([
                launchIn(asOperator, box, "Cliente"),
                asAdmin("patch", `/api/boxes/${box._id}`).send({ active: false }),
            ]);

            const stored = await Box.findById(box._id).lean();
            if (launched.status === 201) {
                expect(deactivated.status).toBe(409);
                expect(deactivated.body.error.code).toBe("BOX_OCCUPIED");
                expect(stored).toMatchObject({ active: true, state: "occupied" });
            } else {
                expect(launched.status).toBe(409);
                expect(launched.body.error.code).toBe("CONFLICT");
                expect(deactivated.status).toBe(200);
                expect(stored).toMatchObject({ active: false, state: "free" });
                expect(await Movement.countDocuments({ box: box._id })).toBe(0);
            }
        }
    });

    it("os primeiros lançamentos do dia ao mesmo tempo criam uma folha só", async () => {
        const boxes = [];
        for (let number = 1; number <= 5; number += 1) {
            boxes.push(await createBox(ctx.business, String(300 + number)));
        }

        const responses = await Promise.all(
            boxes.map((box, index) => launchIn(index % 2 ? asAdmin : asOperator, box, `Cliente ${index}`))
        );

        expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
        expect(await MovementSheet.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments({ action: "sheet.create" })).toBe(1);
    });

    it("duas baixas do mesmo serviço ao mesmo tempo: só uma vale", async () => {
        const box = await createBox(ctx.business, "400");
        const movement = await launch(app, ctx.operatorCookie, { boxId: String(box._id), clientName: "A" });

        const responses = await Promise.all([
            asOperator("post", `/api/movements/${movement.id}/checkout`).send(),
            asAdmin("post", `/api/movements/${movement.id}/checkout`).send(),
        ]);

        expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
        expect(await AuditEvent.countDocuments({ action: "movement.checkout" })).toBe(1);
    });

    it("liberação e novo lançamento na mesma caixa ao mesmo tempo: a caixa fica com um serviço só", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const box = await createBox(ctx.business, String(500 + round));
            const old = await launch(app, ctx.operatorCookie, { boxId: String(box._id), clientName: "Antigo" });
            await asOperator("post", `/api/movements/${old.id}/checkout`).send();

            const [released, launched] = await Promise.all([
                asOperator("post", `/api/movements/${old.id}/release-box`).send(),
                launchIn(asAdmin, box, "Novo"),
            ]);

            expect(released.status).toBe(200);
            const stored = await Box.findById(box._id).lean();
            if (launched.status === 201) {
                expect(String(stored.currentMovement)).toBe(launched.body.movement.id);
                expect(stored.state).toBe("occupied");
            } else {
                expect(launched.body.error.code).toBe("BOX_OCCUPIED");
                expect(stored).toMatchObject({ state: "free", currentMovement: null });
            }
        }
    });
});
