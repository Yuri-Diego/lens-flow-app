import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MovementSheet } from "../models/index.js";
import { addDays } from "../utils/dateUtils.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { MISSING_ID, apiAs, createBox, launch, setNow } from "./helpers/movements.js";

useTestDb();

// Hoje nos testes: 23/11/2026. As horas são em UTC (10:00 em Brasília = 13:00Z).
const TODAY = "2026-11-23";

let app;
let ctx;
let asAdmin;
let asOperator;
let boxes;

beforeEach(async () => {
    app = createTestApp();
    ctx = await setupBusiness(app, "a");
    asAdmin = apiAs(app, ctx.adminCookie);
    asOperator = apiAs(app, ctx.operatorCookie);
    boxes = {};
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Põe o relógio das regras de negócio no instante dado. */
function at(iso) {
    setNow(iso);
}

async function launchIn(number, color, fields = {}, cookieOf = () => asOperator) {
    boxes[number] ??= await createBox(ctx.business, number, color);
    const response = await cookieOf()("post", "/api/movements").send({
        boxId: String(boxes[number]._id),
        clientName: fields.clientName ?? `Cliente ${number}`,
        ...fields,
    });
    if (response.status !== 201) {
        throw new Error(`Lançamento falhou: ${JSON.stringify(response.body)}`);
    }
    return response.body.movement;
}

/**
 * Pendentes de quatro dias: vermelhas (urgentes) e comuns, com números que
 * testam a ordem natural ("2" antes de "10", "007" antes de "9").
 */
async function seedConference() {
    at("2026-11-20T13:00:00.000Z");
    await launchIn("10", "branca");
    await launchIn("30", "vermelha");
    at("2026-11-21T13:00:00.000Z");
    await launchIn("2", "preta");
    at("2026-11-22T13:00:00.000Z");
    await launchIn("100", "verde");
    await launchIn("7", "vermelha");
    at("2026-11-23T13:00:00.000Z");
    await launchIn("9", "azul");
    await launchIn("007", "amarela");
    await launchIn("3", "vermelha");
}

function numbersOf(response) {
    return response.body.items.map((item) => item.box.number);
}

describe("GET /api/movements: Conferência", () => {
    beforeEach(seedConference);

    it("ordem padrão priority: urgente primeiro, depois o mais antigo, depois o número natural (RN-10)", async () => {
        const response = await asOperator("get", "/api/movements?status=open");

        expect(response.status).toBe(200);
        expect(response.body.serverDate).toBe(TODAY);
        expect(numbersOf(response)).toEqual(["30", "7", "3", "10", "2", "100", "007", "9"]);
        expect(response.body.nextCursor).toBeNull();
    });

    it("sort=box segue a prateleira em ordem natural, com 7 antes de 007 (D18)", async () => {
        const response = await asOperator("get", "/api/movements?status=open&sort=box");

        expect(numbersOf(response)).toEqual(["2", "3", "7", "007", "9", "10", "30", "100"]);
    });

    it("sort=oldest e sort=recent seguem a hora do lançamento", async () => {
        const oldest = await asOperator("get", "/api/movements?status=open&sort=oldest");
        expect(numbersOf(oldest)).toEqual(["10", "30", "2", "100", "7", "9", "007", "3"]);

        const recent = await asOperator("get", "/api/movements?status=open&sort=recent");
        expect(numbersOf(recent)).toEqual(["3", "007", "9", "7", "100", "2", "30", "10"]);
    });

    it("cada aberto traz daysOpen e o nível de atraso, e a vermelha sobe um nível (D15)", async () => {
        const response = await asOperator("get", "/api/movements?status=open&sort=box");

        const levels = Object.fromEntries(
            response.body.items.map((item) => [item.box.number, [item.daysOpen, item.delayLevel]])
        );
        expect(levels).toEqual({
            10: [3, "late"],
            30: [3, "late"],
            2: [2, "attention"],
            100: [1, "normal"],
            7: [1, "attention"],
            9: [0, "neutral"],
            "007": [0, "neutral"],
            // A vermelha lançada hoje já é normal (confirmado em 2026-11-23).
            3: [0, "normal"],
        });
    });

    it("os pendentes atravessam os dias: no dia seguinte, cada um sobe de nível (D8)", async () => {
        at("2026-11-24T13:00:00.000Z");

        const response = await asOperator("get", "/api/movements?status=open&sort=box");

        expect(response.body.serverDate).toBe("2026-11-24");
        const levels = Object.fromEntries(
            response.body.items.map((item) => [item.box.number, [item.daysOpen, item.delayLevel]])
        );
        expect(levels).toMatchObject({
            2: [3, "late"],
            100: [2, "attention"],
            7: [2, "late"],
            9: [1, "normal"],
            3: [1, "attention"],
        });
    });

    it("pagina por cursor sem repetir nem pular, em qualquer ordenação", async () => {
        for (const sort of ["priority", "box", "recent", "oldest"]) {
            const full = numbersOf(await asOperator("get", `/api/movements?status=open&sort=${sort}`));
            const paged = [];
            let cursor = null;
            do {
                const query = `/api/movements?status=open&sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ""}`;
                const response = await asOperator("get", query);
                expect(response.status).toBe(200);
                expect(response.body.items.length).toBeLessThanOrEqual(3);
                paged.push(...numbersOf(response));
                cursor = response.body.nextCursor;
            } while (cursor);
            expect(paged).toEqual(full);
        }
    });

    it("um cursor de outra ordenação ou adulterado responde 400", async () => {
        const page = await asOperator("get", "/api/movements?status=open&sort=box&limit=2");

        const otherSort = await asOperator("get", `/api/movements?status=open&sort=priority&cursor=${page.body.nextCursor}`);
        expect(otherSort.status).toBe(400);
        expect(otherSort.body.error.fields).toEqual({ cursor: "Cursor inválido. Recarregue a lista." });

        for (const cursor of ["abc", Buffer.from('{"s":"box","v":[{"$gt":""},"x"]}').toString("base64url")]) {
            const response = await asOperator("get", `/api/movements?status=open&sort=box&cursor=${cursor}`);
            expect(response.status).toBe(400);
        }
    });

    it("filtra por cor e por categoria", async () => {
        const red = await asOperator("get", "/api/movements?status=open&color=vermelha");
        expect(numbersOf(red)).toEqual(["30", "7", "3"]);

        const assembly = await asOperator("get", "/api/movements?status=open&category=with_assembly&sort=box");
        expect(numbersOf(assembly)).toEqual(["007", "100"]);
    });

    it("filtra por período da folha e por quem lançou", async () => {
        const period = await asOperator("get", "/api/movements?from=2026-11-21&to=2026-11-22&sort=oldest");
        expect(numbersOf(period)).toEqual(["2", "100", "7"]);

        await launchIn("50", "branca", {}, () => asAdmin);
        const byAdmin = await asOperator("get", `/api/movements?createdBy=${ctx.admin._id}`);
        expect(numbersOf(byAdmin)).toEqual(["50"]);
    });
});

describe("GET /api/movements: Baixas e 'saiu, caixa não liberada'", () => {
    it("lista as baixas pela hora da baixa, filtra por dia da baixa, por quem deu baixa e pelas não liberadas (R15)", async () => {
        at("2026-11-20T13:00:00.000Z");
        const a = await launchIn("1", "branca");
        const b = await launchIn("2", "branca");
        const c = await launchIn("3", "branca");
        at("2026-11-21T12:00:00.000Z");
        await asOperator("post", "/api/movements/batch").send({ ids: [a.id], action: "checkout-and-release" });
        at("2026-11-22T12:00:00.000Z");
        await asAdmin("post", `/api/movements/${b.id}/checkout`).send();
        // 23:30 do dia 22 em Brasília: a baixa conta no dia 22.
        at("2026-11-23T02:30:00.000Z");
        await asOperator("post", `/api/movements/${c.id}/checkout`).send();
        at("2026-11-23T13:00:00.000Z");

        const out = await asOperator("get", "/api/movements?status=out");
        expect(numbersOf(out)).toEqual(["3", "2", "1"]);
        expect(out.body.items.map((item) => item.outDate)).toEqual(["2026-11-22", "2026-11-22", "2026-11-21"]);

        const oldestOut = await asOperator("get", "/api/movements?status=out&sort=oldest");
        expect(numbersOf(oldestOut)).toEqual(["1", "2", "3"]);

        const day22 = await asOperator("get", "/api/movements?status=out&outFrom=2026-11-22&outTo=2026-11-22");
        expect(numbersOf(day22)).toEqual(["3", "2"]);

        const byAdmin = await asOperator("get", `/api/movements?status=out&outBy=${ctx.admin._id}`);
        expect(numbersOf(byAdmin)).toEqual(["2"]);

        const notReleased = await asOperator("get", "/api/movements?status=out&boxReleased=false&sort=oldest");
        expect(numbersOf(notReleased)).toEqual(["2", "3"]);

        const released = await asOperator("get", "/api/movements?status=out&boxReleased=true");
        expect(numbersOf(released)).toEqual(["1"]);
    });

    it("os filtros de baixa exigem status=out", async () => {
        const response = await apiAs(app, ctx.operatorCookie)("get", "/api/movements?boxReleased=false");

        expect(response.status).toBe(400);
        expect(response.body.error.fields).toEqual({ boxReleased: "Use este filtro junto com status=out." });
    });
});

describe("GET /api/movements?q= (busca, R9)", () => {
    beforeEach(async () => {
        at("2026-11-20T13:00:00.000Z");
        const old = await launchIn("12", "vermelha", { clientName: "Ótica Central", orderService: "4521" });
        await asOperator("post", "/api/movements/batch").send({ ids: [old.id], action: "checkout-and-release" });
        at("2026-11-23T13:00:00.000Z");
        await launchIn("120", "branca", { clientName: "Óptica São João", orderService: "4590" });
        await launchIn("5", "azul", { clientName: "Maria (paciente) da Silva", orderService: "A-77" });
        await launchIn("6", "verde", { clientName: "Laboratório Central", orderService: "9999" });
    });

    async function search(q) {
        const response = await asOperator("get", `/api/movements?q=${encodeURIComponent(q)}`);
        expect(response.status).toBe(200);
        return numbersOf(response);
    }

    it("cliente por prefixo ou trecho, sem acento e sem maiúscula, em todos os dias", async () => {
        expect(await search("otic")).toEqual(["12"]);
        expect(await search("ÓTICA")).toEqual(["12"]);
        expect(await search("central")).toEqual(["6", "12"]);
        expect(await search("sao joao")).toEqual(["120"]);
        expect(await search("  são   joão ")).toEqual(["120"]);
    });

    it("só dígitos: OS exata ou por prefixo, e o número exato da caixa", async () => {
        expect(await search("4521")).toEqual(["12"]);
        expect(await search("45")).toEqual(["120", "12"]);
        // "12" não é prefixo de nenhuma OS: acha só a caixa 12, não a 120.
        expect(await search("12")).toEqual(["12"]);
        expect(await search("5")).toEqual(["5"]);
    });

    it("OS com letras por prefixo", async () => {
        expect(await search("A-7")).toEqual(["5"]);
    });

    it("a busca é um texto literal: caracteres especiais de regex não quebram nem casam tudo (S5)", async () => {
        expect(await search("(paciente)")).toEqual(["5"]);
        expect(await search(".*")).toEqual([]);
        expect(await search("[")).toEqual([]);
        expect(await search("a+".repeat(30))).toEqual([]);
    });

    it("cada resultado já diz onde o serviço está: caixa, situação, quem lançou e quando", async () => {
        const response = await asOperator("get", "/api/movements?q=4521");

        expect(response.body.items[0]).toMatchObject({
            box: { number: "12", color: "vermelha", colorLabel: "Vermelha" },
            status: "out",
            boxReleasedAt: expect.any(String),
            createdBy: { name: "Operador A" },
            createdAt: "2026-11-20T13:00:00.000Z",
        });
    });

    it("OS exata para o aviso de OS repetida (R11)", async () => {
        const response = await asOperator("get", "/api/movements?status=open&orderService=4590");

        expect(numbersOf(response)).toEqual(["120"]);
    });

    it.each([
        ["q=" + "x".repeat(81), "q"],
        ["status=closed", "status"],
        ["sort=nome", "sort"],
        ["limit=0", "limit"],
        ["limit=101", "limit"],
        ["from=2026-02-30", "from"],
        ["from=2026-11-23&to=2026-11-01", "to"],
        ["createdBy=abc", "createdBy"],
        ["business=" + MISSING_ID, "business"],
        ["q[$ne]=x", "q[$ne]"],
    ])("recusa a consulta %s", async (query, field) => {
        const response = await asOperator("get", `/api/movements?${query}`);

        expect(response.status).toBe(400);
        expect(Object.keys(response.body.error.fields)).toEqual([field]);
    });
});

describe("GET /api/movements/:id e /summary", () => {
    it("o detalhe traz a linha do tempo com quem fez cada ação", async () => {
        at("2026-11-23T11:12:00.000Z");
        const movement = await launchIn("12", "branca");
        at("2026-11-23T12:03:00.000Z");
        await asAdmin("post", `/api/movements/${movement.id}/checkout`).send();
        await asAdmin("post", `/api/movements/${movement.id}/release-box`).send();

        const response = await asOperator("get", `/api/movements/${movement.id}`);

        expect(response.status).toBe(200);
        expect(response.body.serverDate).toBe(TODAY);
        expect(response.body.movement.id).toBe(movement.id);
        expect(response.body.history.map((event) => [event.action, event.user.name, event.at])).toEqual([
            ["movement.create", "Operador A", "2026-11-23T11:12:00.000Z"],
            ["movement.checkout", "Admin A", "2026-11-23T12:03:00.000Z"],
            ["movement.release_box", "Admin A", "2026-11-23T12:03:00.000Z"],
        ]);
        expect(response.body.history[1]).toMatchObject({ before: { status: "open" }, after: { status: "out" } });
    });

    it("404 para serviço que não existe ou é de outra empresa", async () => {
        const other = await setupBusiness(app, "b");
        const box = await createBox(other.business, "1");
        const movementOfB = await launch(app, other.operatorCookie, { boxId: String(box._id), clientName: "B" });

        for (const id of [MISSING_ID, movementOfB.id]) {
            const response = await apiAs(app, ctx.adminCookie)("get", `/api/movements/${id}`);
            expect(response.status).toBe(404);
            expect(response.body.error.message).toBe("Serviço não encontrado.");
        }
    });

    it("o resumo conta lançados hoje, abertos, pendentes de antes, atenção, atrasados e não liberados (R8)", async () => {
        await seedConference();
        const out = await launchIn("200", "branca");
        await asOperator("post", `/api/movements/${out.id}/checkout`).send();

        const response = await asOperator("get", "/api/movements/summary");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            serverDate: TODAY,
            counts: {
                launchedToday: 4,
                open: 8,
                pendingFromPreviousDays: 5,
                attention: 2,
                late: 2,
                outNotReleased: 1,
            },
        });
    });
});

describe("GET /api/sheets e /api/sheets/:date", () => {
    beforeEach(async () => {
        at("2026-11-21T13:00:00.000Z");
        const a = await launchIn("1", "branca");
        await launchIn("2", "branca");
        const deleted = await launchIn("3", "branca");
        await asOperator("delete", `/api/movements/${deleted.id}`).send();
        await asOperator("post", `/api/movements/${a.id}/checkout`).send();
        at("2026-11-23T13:00:00.000Z");
        await launchIn("4", "branca");
    });

    it("lista os dias com contadores por agregação, do mais recente, sem os excluídos", async () => {
        const response = await asOperator("get", "/api/sheets");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            sheets: [
                { date: "2026-11-23", counts: { launched: 1, out: 0, open: 1 } },
                { date: "2026-11-21", counts: { launched: 2, out: 1, open: 1 } },
            ],
            nextCursor: null,
            serverDate: TODAY,
        });
    });

    it("sem limit, traz um mês de folhas por página", async () => {
        // Mais 35 folhas vazias, de 01/10 a 04/11, além das duas do beforeEach.
        for (let day = 0; day < 35; day += 1) {
            await MovementSheet.create({ business: ctx.business._id, date: addDays("2026-10-01", day) });
        }

        const response = await asOperator("get", "/api/sheets");

        expect(response.status).toBe(200);
        expect(response.body.sheets).toHaveLength(31);
        expect(response.body.sheets[0].date).toBe("2026-11-23");
        expect(response.body.nextCursor).not.toBeNull();
    });

    it("pagina e filtra por período", async () => {
        const first = await asOperator("get", "/api/sheets?limit=1");
        expect(first.body.sheets.map((sheet) => sheet.date)).toEqual(["2026-11-23"]);
        const second = await asOperator("get", `/api/sheets?limit=1&cursor=${first.body.nextCursor}`);
        expect(second.body.sheets.map((sheet) => sheet.date)).toEqual(["2026-11-21"]);
        expect(second.body.nextCursor).toBeNull();

        const period = await asOperator("get", "/api/sheets?from=2026-11-20&to=2026-11-22");
        expect(period.body.sheets.map((sheet) => sheet.date)).toEqual(["2026-11-21"]);
    });

    it("um dia traz os contadores e os serviços, do mais recente", async () => {
        const response = await asOperator("get", "/api/sheets/2026-11-21");

        expect(response.status).toBe(200);
        expect(response.body.sheet).toEqual({
            date: "2026-11-21",
            counts: { launched: 2, out: 1, open: 1 },
        });
        expect(numbersOf(response)).toEqual(["2", "1"]);
        expect(response.body.serverDate).toBe(TODAY);
    });

    it("um dia sem folha tem contadores zerados; data inválida é 400", async () => {
        const empty = await asOperator("get", "/api/sheets/2026-11-22");
        expect(empty.body).toMatchObject({
            sheet: { date: "2026-11-22", counts: { launched: 0, out: 0, open: 0 } },
            items: [],
        });

        expect((await asOperator("get", "/api/sheets/2026-13-01")).status).toBe(400);
        expect((await asOperator("get", "/api/sheets/ontem")).status).toBe(400);
        expect((await asOperator("get", "/api/sheets?status=open")).status).toBe(400);
    });
});

describe("GET /api/audit (admin)", () => {
    it("lista o histórico da empresa, do mais recente, com filtros e cursor", async () => {
        at("2026-11-22T13:00:00.000Z");
        const a = await launchIn("1", "branca");
        at("2026-11-23T13:00:00.000Z");
        await asAdmin("post", `/api/movements/${a.id}/checkout`).send();
        const other = await setupBusiness(app, "b");
        const boxOfB = await createBox(other.business, "1");
        await launch(app, other.operatorCookie, { boxId: String(boxOfB._id), clientName: "B" });

        const all = await asAdmin("get", "/api/audit");
        expect(all.status).toBe(200);
        expect(all.body.items.map((item) => [item.action, item.user?.name ?? null])).toEqual([
            ["movement.checkout", "Admin A"],
            ["movement.create", "Operador A"],
            ["sheet.create", "Operador A"],
        ]);
        expect(all.body.items[0]).toMatchObject({ entity: "Movement", entityId: a.id, at: "2026-11-23T13:00:00.000Z" });

        const byUser = await asAdmin("get", `/api/audit?user=${ctx.operator._id}`);
        expect(byUser.body.items.map((item) => item.action)).toEqual(["movement.create", "sheet.create"]);

        const byEntity = await asAdmin("get", "/api/audit?entity=MovementSheet");
        expect(byEntity.body.items.map((item) => item.action)).toEqual(["sheet.create"]);

        const byRecord = await asAdmin("get", `/api/audit?entityId=${a.id}`);
        expect(byRecord.body.items).toHaveLength(2);

        const byDay = await asAdmin("get", "/api/audit?from=2026-11-22&to=2026-11-22");
        expect(byDay.body.items.map((item) => item.action)).toEqual(["movement.create", "sheet.create"]);

        const page = await asAdmin("get", "/api/audit?limit=2");
        expect(page.body.items).toHaveLength(2);
        const next = await asAdmin("get", `/api/audit?limit=2&cursor=${page.body.nextCursor}`);
        expect(next.body.items.map((item) => item.action)).toEqual(["sheet.create"]);
        expect(next.body.nextCursor).toBeNull();
    });

    it("o operador recebe 403", async () => {
        const response = await apiAs(app, ctx.operatorCookie)("get", "/api/audit");

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it.each(["entity=Caixa", "user=abc", "from=2026-11-31", "limit=500"])("recusa a consulta %s", async (query) => {
        const response = await apiAs(app, ctx.adminCookie)("get", `/api/audit?${query}`);

        expect(response.status).toBe(400);
    });
});
