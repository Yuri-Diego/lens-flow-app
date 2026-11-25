import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditEvent, Movement } from "../models/index.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { MISSING_ID, apiAs, createBox } from "./helpers/movements.js";

useTestDb();

let app;
let ctx;
let asAdmin;
let asOperator;
let boxCount;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
    asAdmin = apiAs(app, ctx.adminCookie);
    asOperator = apiAs(app, ctx.operatorCookie);
    boxCount = 0;
});

/** Lança um serviço numa caixa branca nova (1, 2, 3…) e devolve o corpo, com o serviço e os avisos. */
async function launchOrder(orderService, { owner = ctx, cookie = owner.operatorCookie, ...extra } = {}) {
    boxCount += 1;
    const box = await createBox(owner.business, String(boxCount));
    const response = await request(app)
        .post("/api/movements")
        .set("Cookie", cookie)
        .send({ boxId: String(box._id), clientName: "Ótica", orderService, ...extra });
    expect(response.status).toBe(201);
    return response.body;
}

/** Lança um serviço para cada OS e devolve os serviços. */
async function launchOrders(...orders) {
    const movements = [];
    for (const orderService of orders) {
        movements.push((await launchOrder(orderService)).movement);
    }
    return movements;
}

async function ordersOf(path, as = asOperator) {
    const response = await as("get", path);
    expect(response.status, path).toBe(200);
    return response.body.items.map((item) => item.orderService).sort();
}

/** As OS que a busca num campo só (q) acha. */
function search(q, as) {
    return ordersOf(`/api/movements?q=${encodeURIComponent(q)}`, as);
}

/** As OS abertas que o filtro exato acha: o que o web consulta enquanto a pessoa digita (R11). */
function filter(orderService, as) {
    return ordersOf(`/api/movements?status=open&orderService=${encodeURIComponent(orderService)}`, as);
}

/** Os serviços que o aviso de OS repetida aponta. */
function warnedIds({ warnings }) {
    return warnings.flatMap((warning) => warning.movements.map((movement) => movement.id));
}

function dayMonthOf({ sheetDate }) {
    return `${sheetDate.slice(8, 10)}/${sheetDate.slice(5, 7)}`;
}

// A OS guardada e a mesma OS digitada de outro jeito, nos dois sentidos.
const SAME_ORDER = [
    ["A-77", "a-77"],
    ["b-88", "B-88"],
    ["oS-12b", "Os-12B"],
    ["É-10", "é-10"],
    ["ção 3", "ÇÃO 3"],
    ["900Ab", "900aB"],
];
const STORED = SAME_ORDER.map(([stored]) => stored);

describe("a OS ignora maiúsculas e minúsculas (D26, RN-15)", () => {
    it("busca (q) pela OS inteira", async () => {
        await launchOrders(...STORED);

        for (const [stored, typed] of SAME_ORDER) {
            expect(await search(typed), typed).toEqual([stored]);
            expect(await search(stored), stored).toEqual([stored]);
        }
    });

    it("busca (q) pelo começo da OS, e não pelo meio", async () => {
        await launchOrders(...STORED, ...STORED.map((stored) => `Z ${stored}`));

        for (const [prefix, stored] of [
            ["a-7", "A-77"],
            ["B-8", "b-88"],
            ["Os-1", "oS-12b"],
            ["é-1", "É-10"],
            ["ÇÃO", "ção 3"],
            ["900", "900Ab"],
            ["900A", "900Ab"],
        ]) {
            expect(await search(prefix), prefix).toEqual([stored]);
        }
    });

    it("filtro orderService: exato, nos abertos e em qualquer situação", async () => {
        await launchOrders(...STORED, ...STORED.map((stored) => `${stored}0`));

        for (const [stored, typed] of SAME_ORDER) {
            expect(await filter(typed), typed).toEqual([stored]);
            expect(await filter(stored), stored).toEqual([stored]);
            expect(await ordersOf(`/api/movements?orderService=${encodeURIComponent(typed)}`), typed).toEqual([stored]);
            // O começo da OS não basta.
            expect(await filter(typed.slice(0, -1)), typed).toEqual([]);
        }
    });

    it("aviso ao lançar: diz onde a OS está, sem bloquear, com a OS como foi digitada agora", async () => {
        const movements = await launchOrders(...STORED);

        for (const [index, [, typed]] of SAME_ORDER.entries()) {
            const first = movements[index];
            const second = await launchOrder(typed, { cookie: ctx.adminCookie });

            expect(second.movement.orderService).toBe(typed);
            expect(second.warnings).toEqual([
                {
                    code: "DUPLICATE_ORDER_SERVICE",
                    message: `A OS ${typed} já está na caixa ${index + 1} (Branca), aberta desde ${dayMonthOf(first)}.`,
                    movements: [
                        {
                            id: first.id,
                            box: expect.objectContaining({ number: String(index + 1), colorLabel: "Branca" }),
                            sheetDate: first.sheetDate,
                            clientName: "Ótica",
                            createdBy: { id: String(ctx.operator._id), name: "Operador A" },
                        },
                    ],
                },
            ]);
        }
    });

    it("aviso ao editar: trocar a OS para uma que já está aberta", async () => {
        const movements = await launchOrders(...STORED);
        const { movement } = await launchOrder("Z-99");

        for (const [index, [, typed]] of SAME_ORDER.entries()) {
            const response = await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: typed });

            expect(response.status).toBe(200);
            expect(response.body.movement.orderService).toBe(typed);
            expect(warnedIds(response.body), typed).toEqual([movements[index].id]);
            expect(response.body.warnings[0].message).toBe(
                `A OS ${typed} já está na caixa ${index + 1} (Branca), aberta desde ${dayMonthOf(movements[index])}.`
            );
        }
    });

    it("o aviso junta as grafias da mesma OS", async () => {
        const [first, second] = await launchOrders("os-5", "OS-5");

        const third = await launchOrder("Os-5");

        expect(warnedIds(third)).toEqual([first.id, second.id]);
        expect(third.warnings[0].message).toMatch(
            /^A OS Os-5 já está em outros serviços abertos: caixa 1 .*; caixa 2 /
        );
        expect(await search("OS-5")).toEqual(["OS-5", "Os-5", "os-5"]);
        expect(await filter("oS-5")).toEqual(["OS-5", "Os-5", "os-5"]);
    });

    it("a OS de um serviço que já saiu não gera aviso, e a busca a acha em maiúsculas ou minúsculas", async () => {
        const [movement] = await launchOrders("A-77");
        await asOperator("post", `/api/movements/${movement.id}/checkout`).send();

        expect((await launchOrder("a-77")).warnings).toEqual([]);
        expect(await search("a-77")).toEqual(["A-77", "a-77"]);
        expect(await filter("A-77")).toEqual(["a-77"]);
        expect(await ordersOf("/api/movements?status=out&orderService=a-77")).toEqual(["A-77"]);
    });

    it("um serviço excluído não aparece nem gera aviso", async () => {
        const [movement] = await launchOrders("A-77");
        expect((await asOperator("delete", `/api/movements/${movement.id}`)).status).toBe(204);

        expect((await launchOrder("a-77")).warnings).toEqual([]);
        expect(await search("A-77")).toEqual(["a-77"]);
        expect(await filter("A-77")).toEqual(["a-77"]);
    });

    it("repetir o lançamento com a mesma chave (R13) devolve o mesmo aviso", async () => {
        const [first] = await launchOrders("A-77");
        const box = await createBox(ctx.business, "50");
        const body = { boxId: String(box._id), clientName: "Ótica", orderService: "a-77", clientRequestId: "chave-da-os-77" };

        const launched = await asOperator("post", "/api/movements").send(body);
        const retry = await asOperator("post", "/api/movements").send(body);

        expect(warnedIds(launched.body)).toEqual([first.id]);
        expect(retry.body).toEqual(launched.body);
        expect(await Movement.countDocuments()).toBe(2);
    });
});

describe("a OS continua como foi digitada (D26)", () => {
    it("no lançamento, na lista, no detalhe, na caixa e no histórico", async () => {
        const [movement] = await launchOrders("aB-7c");
        expect(movement.orderService).toBe("aB-7c");

        const list = await asOperator("get", "/api/movements?status=open&orderService=AB-7C");
        expect(list.body.items).toEqual([movement]);
        const detail = await asOperator("get", `/api/movements/${movement.id}`);
        expect(detail.body.movement).toEqual(movement);
        expect(detail.body.history[0].after.orderService).toBe("aB-7c");
        const box = await asOperator("get", `/api/boxes/${movement.box.id}`);
        expect(box.body.box.currentMovement.orderService).toBe("aB-7c");
        const audit = await asAdmin("get", `/api/audit?entityId=${movement.id}`);
        expect(audit.body.items[0].after.orderService).toBe("aB-7c");
        // A OS normalizada é interna: não sai em resposta nenhuma.
        for (const { body } of [list, detail, box, audit]) {
            expect(JSON.stringify(body)).not.toContain("orderServiceNormalized");
        }
    });

    it("editar só maiúsculas e minúsculas é uma mudança: grava como digitada, vai para o histórico e não avisa de si mesma", async () => {
        const [movement] = await launchOrders("a-77");

        const response = await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: "A-77" });

        expect(response.status).toBe(200);
        expect(response.body.movement.orderService).toBe("A-77");
        expect(response.body.warnings).toEqual([]);
        const event = await AuditEvent.findOne({ action: "movement.update" }).lean();
        expect(event.before).toEqual({ orderService: "a-77" });
        expect(event.after).toEqual({ orderService: "A-77" });
        for (const typed of ["a-77", "A-77"]) {
            expect(await search(typed)).toEqual(["A-77"]);
            expect(await filter(typed)).toEqual(["A-77"]);
        }
    });

    it("trocar a OS leva a busca, o filtro e o aviso para a nova, e a antiga deixa de valer", async () => {
        const [movement] = await launchOrders("A-77");

        await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: "B-88" });

        expect(await search("a-77")).toEqual([]);
        expect(await filter("a-77")).toEqual([]);
        expect(await search("b-8")).toEqual(["B-88"]);
        expect(await filter("b-88")).toEqual(["B-88"]);
        expect((await launchOrder("a-77")).warnings).toEqual([]);
        expect(warnedIds(await launchOrder("b-88"))).toEqual([movement.id]);
    });

    it("editar outro campo não mexe na OS", async () => {
        const [movement] = await launchOrders("A-77");

        const response = await asOperator("patch", `/api/movements/${movement.id}`).send({ note: "refação" });

        expect(response.body.movement).toMatchObject({ orderService: "A-77", note: "refação" });
        expect(await search("a-77")).toEqual(["A-77"]);
        expect(await filter("a-77")).toEqual(["A-77"]);
    });
});

describe("só maiúsculas e minúsculas deixam de contar (D26)", () => {
    it("acentos, espaços do meio, pontuação e zeros continuam diferenciando", async () => {
        for (const [stored, typed] of [
            ["É-10", "E-10"],
            ["E-20", "é-20"],
            ["ÇA 1", "ca 1"],
            ["A-77", "A77"],
            ["A-78", "a 78"],
            ["B  79", "b 79"],
            ["0789", "789"],
        ]) {
            await launchOrder(stored);

            expect(await search(typed), typed).toEqual([]);
            expect(await filter(typed), typed).toEqual([]);
            expect((await launchOrder(typed)).warnings, typed).toEqual([]);
        }
    });

    it("os espaços das pontas saem, como sempre", async () => {
        const [movement] = await launchOrders("  A-77 ");
        expect(movement.orderService).toBe("A-77");

        expect(await search("  a-77 ")).toEqual(["A-77"]);
        expect(await filter(" a-77  ")).toEqual(["A-77"]);
        expect(warnedIds(await launchOrder(" a-77 "))).toEqual([movement.id]);
    });
});

describe("serviço sem OS nunca conta como repetido (RN-15)", () => {
    const EMPTY = [undefined, null, "", "   "];

    it("lançar sem OS não avisa, por mais serviços sem OS que existam", async () => {
        for (const orderService of [...EMPTY, ...EMPTY]) {
            const { movement, warnings } = await launchOrder(orderService);

            expect(movement.orderService).toBeNull();
            expect(warnings).toEqual([]);
        }
    });

    it("tirar a OS não avisa, e a OS que saiu deixa de ser achada e de gerar aviso", async () => {
        await launchOrder(null);
        for (const empty of [null, "", "  "]) {
            const [movement] = await launchOrders("A-77");

            const response = await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: empty });

            expect(response.status).toBe(200);
            expect(response.body.movement.orderService).toBeNull();
            expect(response.body.warnings).toEqual([]);
            expect(await search("a-77")).toEqual([]);
            expect(await filter("a-77")).toEqual([]);
        }
        expect((await launchOrder("a-77")).warnings).toEqual([]);
    });

    it("um serviço gravado à mão só com espaços na OS também é um serviço sem OS", async () => {
        const [first, second] = await launchOrders(null, null);
        await Movement.collection.updateMany({}, { $set: { orderService: "  ", orderServiceNormalized: null } });

        for (const { id } of [first, second]) {
            const response = await asOperator("patch", `/api/movements/${id}`).send({ note: "refação" });
            expect(response.status).toBe(200);
            expect(response.body.warnings).toEqual([]);
        }
    });

    it("nenhum texto acha os serviços sem OS", async () => {
        await launchOrders(...EMPTY);

        for (const typed of ["null", "undefined", "Sem OS", "sem os", "-", "0"]) {
            expect(await search(typed), typed).toEqual([]);
            expect(await filter(typed), typed).toEqual([]);
        }
        for (const empty of ["", "%20%20"]) {
            const response = await asOperator("get", `/api/movements?orderService=${empty}`);
            expect(response.status).toBe(400);
            expect(response.body.error.fields).toEqual({ orderService: "Informe a OS." });
        }
    });
});

describe("caracteres especiais na OS são texto (S5)", () => {
    const SPECIAL = [
        "A.7",
        "AX7",
        "(B",
        "[C",
        "D+E",
        "DDE",
        "F*",
        "G|H",
        "^I",
        "J$",
        "K\\d",
        "K5",
        "L{2}",
        "M?",
        "N-/_#&%",
        "\"O'",
        "P ${x}",
        "Q\u0000R",
    ];

    it("cada uma é achada em minúsculas, e só ela, na busca, no filtro e no aviso", async () => {
        const movements = await launchOrders(...SPECIAL);

        for (const stored of SPECIAL) {
            const typed = stored.toLowerCase();
            expect(await search(typed), typed).toEqual([stored]);
            expect(await filter(typed), typed).toEqual([stored]);
        }
        for (const [index, stored] of SPECIAL.entries()) {
            expect(warnedIds(await launchOrder(stored.toLowerCase())), stored).toEqual([movements[index].id]);
        }
    });

    it("nenhum texto vira expressão regular", async () => {
        await launchOrders(...SPECIAL);

        for (const typed of [".*", "^a", "a|b", "[a-z]", "\\w", "(?i)a", "\\x41", "\\", "a\u0000"]) {
            expect(await search(typed), typed).toEqual([]);
            expect(await filter(typed), typed).toEqual([]);
        }
        // O ponto é um ponto: "a." é o começo de "A.7", e não de "AX7".
        expect(await search("a.")).toEqual(["A.7"]);
    });
});

describe("isolamento entre empresas", () => {
    it("a OS de outra empresa não aparece na busca, no filtro nem no aviso, em maiúsculas ou minúsculas", async () => {
        const other = await setupBusiness(app, "b");
        const ofB = (await launchOrder("A-77", { owner: other })).movement;

        for (const typed of ["A-77", "a-77", "a-7"]) {
            expect(await search(typed), typed).toEqual([]);
            expect(await filter(typed), typed).toEqual([]);
        }
        const launched = await launchOrder("a-77");
        expect(launched.warnings).toEqual([]);
        const [movement] = await launchOrders("Z-99");
        const edited = await asOperator("patch", `/api/movements/${movement.id}`).send({ orderService: "A-77" });
        expect(warnedIds(edited.body)).toEqual([launched.movement.id]);

        const asB = apiAs(app, other.adminCookie);
        expect(await search("a-77", asB)).toEqual(["A-77"]);
        expect(await filter("a-77", asB)).toEqual(["A-77"]);
        expect(warnedIds(await launchOrder("a-77", { owner: other }))).toEqual([ofB.id]);
    });

    it("a empresa e a OS normalizada não vêm de fora, e o filtro não aceita objeto, operador nem repetição", async () => {
        const other = await setupBusiness(app, "b");
        await launchOrder("A-77", { owner: other });

        const business = await asOperator("get", `/api/movements?orderService=a-77&business=${other.business._id}`);
        expect(business.status).toBe(400);
        expect(business.body.error.fields).toEqual({ business: "Campo não permitido." });
        const operator = await asOperator("get", "/api/movements?orderService[$ne]=x");
        expect(operator.status).toBe(400);
        const repeated = await asOperator("get", "/api/movements?orderService=a-77&orderService=A-77");
        expect(repeated.status).toBe(400);
        expect(repeated.body.error.fields).toEqual({ orderService: "Envie a OS como texto." });
        const normalized = await asOperator("get", "/api/movements?orderServiceNormalized=a-77");
        expect(normalized.status).toBe(400);
        const body = await asOperator("post", "/api/movements").send({
            boxId: MISSING_ID,
            clientName: "A",
            orderServiceNormalized: "a-77",
        });
        expect(body.status).toBe(400);
        expect(body.body.error.fields).toEqual({ orderServiceNormalized: "Campo não permitido." });
    });
});
