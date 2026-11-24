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

describe("concorrência na troca de caixa (RN-12, D19: qualquer pessoa troca)", () => {
    function changeBox(as, movement, box) {
        return as("post", `/api/movements/${movement.id}/change-box`).send({ boxId: String(box._id) });
    }

    it("duas pessoas trocam a caixa do mesmo serviço ao mesmo tempo: ele fica numa caixa só, e o histórico conta as duas trocas", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const origin = await createBox(ctx.business, String(600 + round));
            const first = await createBox(ctx.business, String(610 + round));
            const second = await createBox(ctx.business, String(620 + round));
            const movement = await launch(app, ctx.operatorCookie, { boxId: String(origin._id), clientName: "A" });

            const responses = await Promise.all([
                changeBox(asOperator, movement, first),
                changeBox(asAdmin, movement, second),
            ]);

            // As duas valem, uma depois da outra: a segunda encontra o serviço na caixa da primeira.
            expect(responses.map((response) => response.status)).toEqual([200, 200]);
            const stored = await Movement.findById(movement.id).lean();
            const boxes = await Box.find({ _id: { $in: [origin._id, first._id, second._id] } }).lean();
            const occupied = boxes.filter((box) => box.state === "occupied");
            expect(occupied).toHaveLength(1);
            expect(String(occupied[0]._id)).toBe(String(stored.box));
            expect(String(occupied[0].currentMovement)).toBe(movement.id);
            expect(stored.boxSnapshot.number).toBe(occupied[0].number);
            expect(boxes.filter((box) => box.state === "free").map((box) => box.currentMovement)).toEqual([null, null]);

            const events = await AuditEvent.find({ entityId: movement.id, action: "movement.change_box" })
                .sort({ at: 1, _id: 1 })
                .lean();
            expect(events).toHaveLength(2);
            expect(String(events[0].before.box.id)).toBe(String(origin._id));
            expect(String(events[1].before.box.id)).toBe(String(events[0].after.box.id));
            expect(String(events[1].after.box.id)).toBe(String(stored.box));
        }
    });

    it("dois serviços trocados para a mesma caixa ao mesmo tempo: só um entra, o outro recebe BOX_OCCUPIED", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const target = await createBox(ctx.business, String(700 + round));
            const firstOrigin = await createBox(ctx.business, String(710 + round));
            const secondOrigin = await createBox(ctx.business, String(720 + round));
            const first = await launch(app, ctx.operatorCookie, { boxId: String(firstOrigin._id), clientName: "A" });
            const second = await launch(app, ctx.adminCookie, { boxId: String(secondOrigin._id), clientName: "B" });

            // Cada um troca a caixa do serviço que o outro lançou.
            const responses = await Promise.all([
                changeBox(asOperator, second, target),
                changeBox(asAdmin, first, target),
            ]);

            expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
            const winner = responses.find((response) => response.status === 200).body.movement;
            const loser = responses.find((response) => response.status === 409).body.error;
            expect(loser.code).toBe("BOX_OCCUPIED");
            expect(loser.details.box.currentMovement.id).toBe(winner.id);

            expect(String((await Box.findById(target._id).lean()).currentMovement)).toBe(winner.id);
            const [winnerOrigin, loserOrigin, loserId] =
                winner.id === first.id
                    ? [firstOrigin, secondOrigin, second.id]
                    : [secondOrigin, firstOrigin, first.id];
            expect(await Box.findById(winnerOrigin._id).lean()).toMatchObject({ state: "free", currentMovement: null });
            expect(String((await Box.findById(loserOrigin._id).lean()).currentMovement)).toBe(loserId);
            expect(String((await Movement.findById(loserId).lean()).box)).toBe(String(loserOrigin._id));
        }
        expect(await AuditEvent.countDocuments({ action: "movement.change_box" })).toBe(ROUNDS);
    });

    it("troca de caixa e baixa do mesmo serviço ao mesmo tempo: a caixa em que ele está continua com ele", async () => {
        for (let round = 1; round <= ROUNDS; round += 1) {
            const origin = await createBox(ctx.business, String(800 + round));
            const target = await createBox(ctx.business, String(810 + round));
            const movement = await launch(app, ctx.operatorCookie, { boxId: String(origin._id), clientName: "A" });

            const [changed, checkedOut] = await Promise.all([
                changeBox(asAdmin, movement, target),
                asOperator("post", `/api/movements/${movement.id}/checkout`).send(),
            ]);

            expect(checkedOut.status).toBe(200);
            if (changed.status !== 200) {
                // A baixa veio antes: o serviço que saiu não troca de caixa.
                expect(changed.status).toBe(409);
                expect(changed.body.error.message).toBe("Só dá para trocar a caixa de um serviço aberto.");
            }
            const [kept, other] = changed.status === 200 ? [target, origin] : [origin, target];
            const stored = await Movement.findById(movement.id).lean();
            expect(stored.status).toBe("out");
            expect(String(stored.box)).toBe(String(kept._id));
            const holder = await Box.findById(kept._id).lean();
            expect(holder.state).toBe("occupied");
            expect(String(holder.currentMovement)).toBe(movement.id);
            expect(await Box.findById(other._id).lean()).toMatchObject({ state: "free", currentMovement: null });
        }
    });
});
