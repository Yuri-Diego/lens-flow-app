import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { ClientName, Movement } from "../models/index.js";
import { rebuildClientNames } from "../services/clientService.js";
import { sheetDateOf } from "../utils/dateUtils.js";
import { createTestApp, setupBusiness } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { apiAs, createBox, launch, setNow } from "./helpers/movements.js";

useTestDb();

let app;
let a;
let b;

beforeEach(async () => {
    app = createTestApp();
    a = await setupBusiness(app, "a");
    b = await setupBusiness(app, "b");
});

afterEach(() => {
    vi.restoreAllMocks();
});

function suggest(q, { cookie = a.operatorCookie, extra = "" } = {}) {
    const query = q === undefined ? "" : `q=${encodeURIComponent(q)}`;
    return request(app).get(`/api/clients/suggestions?${query}${extra}`).set("Cookie", cookie);
}

function names(response) {
    return response.body.items.map((item) => item.name);
}

let sequence = 0;

/**
 * Usos de nomes com a hora do lançamento dada: serviços que já saíram e
 * liberaram a caixa, gravados direto no banco (pela API, a hora é a do
 * relógio). Como nos dados de demonstração, o resumo dos nomes é refeito a
 * partir deles. Cada uso é [nome, hora] ou [nome, hora, campos a mais].
 */
async function seedUses(ctx, uses) {
    for (const [clientName, at, extra = {}] of uses) {
        sequence += 1;
        const instant = new Date(at);
        await Movement.create({
            business: ctx.business._id,
            sheet: new mongoose.Types.ObjectId(),
            sheetDate: sheetDateOf(instant),
            box: new mongoose.Types.ObjectId(),
            boxSnapshot: { number: String(sequence), color: "branca", category: "without_assembly" },
            clientName,
            status: "out",
            createdBy: ctx.operator._id,
            outBy: ctx.operator._id,
            outAt: instant,
            boxReleasedBy: ctx.operator._id,
            boxReleasedAt: instant,
            createdAt: instant,
            ...extra,
        });
    }
    await rebuildClientNames(ctx.business._id);
}

/** O resumo dos nomes de uma empresa, comparável com toEqual. */
async function summaryOf(ctx) {
    const rows = await ClientName.find({ business: ctx.business._id }).sort({ key: 1 }).lean();
    return rows.map(({ key, name, uses, lastUsedAt }) => ({ key, name, uses, lastUsedAt }));
}

describe("GET /api/clients/suggestions: busca pelo começo do nome (D24)", () => {
    beforeEach(async () => {
        await seedUses(a, [
            ["Ótica Visão Clara", "2026-11-20T10:00:00.000Z"],
            ["ÓTICA VISÃO TOTAL", "2026-11-21T10:00:00.000Z"],
            ["Óptica Visão", "2026-11-22T10:00:00.000Z"],
            ["Ótica Central", "2026-11-23T10:00:00.000Z"],
            ["Nova Ótica Visão", "2026-11-23T11:00:00.000Z"],
        ]);
    });

    it.each(["otica vi", "Ótica Vi", "OTICA VI", "  otica   vi  ", "ótica visão"])(
        "%j acha os nomes que começam com \"Ótica Vi\", sem acento e sem diferenciar maiúsculas",
        async (q) => {
            const response = await suggest(q);

            expect(response.status).toBe(200);
            expect(names(response)).toEqual(["ÓTICA VISÃO TOTAL", "Ótica Visão Clara"]);
        }
    );

    it("é só o começo do nome: o trecho do meio não conta", async () => {
        expect(names(await suggest("visao"))).toEqual([]);
        expect(names(await suggest("op"))).toEqual(["Óptica Visão"]);
        expect(names(await suggest("nova"))).toEqual(["Nova Ótica Visão"]);
    });

    it("o operador e o admin usam a rota, e a resposta tem só nome, usos e data", async () => {
        for (const cookie of [a.operatorCookie, a.adminCookie]) {
            const response = await suggest("otica c", { cookie });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                items: [{ name: "Ótica Central", uses: 1, lastUsedAt: "2026-11-23T10:00:00.000Z" }],
            });
        }
    });

    it("sem nome com esse começo, responde 200 com a lista vazia", async () => {
        const response = await suggest("zz");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ items: [] });
    });
});

describe("GET /api/clients/suggestions: um item por nome, contagem e ordem", () => {
    it("junta as grafias do mesmo nome: a do uso mais recente, quantos usos e a data do mais recente", async () => {
        await seedUses(a, [
            ["Ótica Visão Clara", "2026-11-20T10:00:00.000Z"],
            ["otica  visao clara", "2026-11-21T10:00:00.000Z"],
            ["ÓTICA VISÃO CLARA", "2026-11-23T14:02:00.000Z"],
            ["Ótica Visão Clara", "2026-11-22T09:00:00.000Z"],
        ]);

        const response = await suggest("otica vi");

        expect(response.body).toEqual({
            items: [{ name: "ÓTICA VISÃO CLARA", uses: 4, lastUsedAt: "2026-11-23T14:02:00.000Z" }],
        });
    });

    it("mais usados primeiro; no empate, o uso mais recente; depois o nome", async () => {
        await seedUses(a, [
            ["Ótica Alfa", "2026-10-01T12:00:00.000Z"],
            ["Ótica Alfa", "2026-10-02T12:00:00.000Z"],
            ["Ótica Alfa", "2026-10-03T12:00:00.000Z"],
            ["Ótica Beta", "2026-11-10T12:00:00.000Z"],
            ["Ótica Beta", "2026-11-22T12:00:00.000Z"],
            ["Ótica Gama", "2026-11-05T12:00:00.000Z"],
            ["Ótica Gama", "2026-11-23T12:00:00.000Z"],
            ["Ótica Delta", "2026-11-24T12:00:00.000Z"],
            // Mesmos usos e mesma data: vale a ordem do nome sem acento.
            ["Ótica Zeta", "2026-11-01T12:00:00.000Z"],
            ["Ótica Épsilon", "2026-11-01T12:00:00.000Z"],
        ]);

        const response = await suggest("otica");

        expect(response.body.items.map(({ name, uses }) => [name, uses])).toEqual([
            ["Ótica Alfa", 3],
            ["Ótica Gama", 2],
            ["Ótica Beta", 2],
            ["Ótica Delta", 1],
            ["Ótica Épsilon", 1],
            ["Ótica Zeta", 1],
        ]);
    });

    it("limit: 8 por padrão, de 1 a 20", async () => {
        const base = Date.parse("2026-11-01T12:00:00.000Z");
        await seedUses(
            a,
            Array.from({ length: 21 }, (_, index) => [
                `Ótica Cliente ${String(index + 1).padStart(2, "0")}`,
                base + (index + 1) * 60_000,
            ])
        );
        // Todos com um uso: do mais recente (21) para o mais antigo.
        const expected = (count) =>
            Array.from({ length: count }, (_, index) => `Ótica Cliente ${String(21 - index).padStart(2, "0")}`);

        expect(names(await suggest("otica"))).toEqual(expected(8));
        expect(names(await suggest("otica", { extra: "&limit=1" }))).toEqual(expected(1));
        expect(names(await suggest("otica", { extra: "&limit=3" }))).toEqual(expected(3));
        expect(names(await suggest("otica", { extra: "&limit=20" }))).toEqual(expected(20));
    });

    it.each(["0", "21", "100", "abc", "2.5", "-1", ""])("limit=%j responde 400", async (limit) => {
        const response = await suggest("otica", { extra: `&limit=${limit}` });

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Confira os campos destacados.",
            fields: { limit: "Use um número de 1 a 20." },
        });
    });
});

describe("GET /api/clients/suggestions: excluídos", () => {
    it("serviço excluído não conta: nem o nome, nem o uso, nem a grafia", async () => {
        const deleted = { deletedAt: new Date("2026-11-23T15:00:00.000Z"), deletedBy: a.admin._id };
        await seedUses(a, [
            ["Ótica Excluída", "2026-11-20T10:00:00.000Z", deleted],
            ["Ótica Mista", "2026-11-21T10:00:00.000Z"],
            ["ÓTICA MISTA", "2026-11-22T10:00:00.000Z", deleted],
        ]);

        const response = await suggest("otica");

        expect(response.body).toEqual({
            items: [{ name: "Ótica Mista", uses: 1, lastUsedAt: "2026-11-21T10:00:00.000Z" }],
        });
    });
});

describe("as sugestões acompanham os lançamentos pela API, sem esperar a subida da API", () => {
    let api;
    let boxes;

    beforeEach(async () => {
        api = apiAs(app, a.operatorCookie);
        boxes = [];
        for (let number = 1; number <= 10; number += 1) {
            boxes.push(await createBox(a.business, String(number)));
        }
    });

    function launchAt(iso, index, clientName, extra = {}) {
        setNow(iso);
        return launch(app, a.operatorCookie, { boxId: String(boxes[index]._id), clientName, ...extra });
    }

    it("lançar, editar o cliente e excluir mudam as sugestões na hora", async () => {
        const first = await launch(app, a.operatorCookie, { boxId: String(boxes[0]._id), clientName: "Ótica Pelo Site" });
        const second = await launch(app, a.operatorCookie, { boxId: String(boxes[1]._id), clientName: "Ótica Antes" });
        expect((await suggest("otica")).body.items).toEqual([
            { name: "Ótica Antes", uses: 1, lastUsedAt: second.createdAt },
            { name: "Ótica Pelo Site", uses: 1, lastUsedAt: first.createdAt },
        ]);

        // A edição leva o uso para o nome novo, com a hora do lançamento.
        expect((await api("patch", `/api/movements/${second.id}`).send({ clientName: "Ótica Depois" })).status).toBe(200);
        expect(names(await suggest("otica"))).toEqual(["Ótica Depois", "Ótica Pelo Site"]);

        expect((await api("delete", `/api/movements/${first.id}`)).status).toBe(204);
        expect(names(await suggest("otica"))).toEqual(["Ótica Depois"]);
        expect(await summaryOf(a)).toEqual([
            { key: "otica depois", name: "Ótica Depois", uses: 1, lastUsedAt: new Date(second.createdAt) },
        ]);
    });

    it("a grafia segue o lançamento mais recente, também quando a edição só muda maiúsculas e acentos", async () => {
        const older = await launchAt("2026-11-24T11:00:00.000Z", 0, "otica central");
        const newer = await launchAt("2026-11-24T12:00:00.000Z", 1, "OTICA CENTRAL");
        expect((await suggest("otica")).body.items).toEqual([
            { name: "OTICA CENTRAL", uses: 2, lastUsedAt: "2026-11-24T12:00:00.000Z" },
        ]);

        // Editar o mais antigo não muda a grafia; editar o mais recente, sim.
        await api("patch", `/api/movements/${older.id}`).send({ clientName: "Ótica central" });
        expect(names(await suggest("otica"))).toEqual(["OTICA CENTRAL"]);
        await api("patch", `/api/movements/${newer.id}`).send({ clientName: "Ótica Central" });
        expect(names(await suggest("otica"))).toEqual(["Ótica Central"]);

        // Excluir o mais recente devolve a grafia e a data do anterior.
        await api("delete", `/api/movements/${newer.id}`);
        expect((await suggest("otica")).body.items).toEqual([
            { name: "Ótica central", uses: 1, lastUsedAt: "2026-11-24T11:00:00.000Z" },
        ]);
    });

    it("o resumo mantido pelos lançamentos é igual ao refeito a partir dos serviços", async () => {
        await launchAt("2026-11-24T10:00:00.000Z", 0, "Ótica Alfa");
        await launchAt("2026-11-24T10:05:00.000Z", 1, "ÓTICA ALFA");
        const beta = await launchAt("2026-11-24T10:10:00.000Z", 2, "Ótica Beta");
        await launchAt("2026-11-24T10:15:00.000Z", 3, "Ótica Gama");
        const delta = await launchAt("2026-11-24T10:20:00.000Z", 4, "Ótica Delta");
        // Dois lançamentos na mesma hora, com grafias diferentes.
        await launchAt("2026-11-24T10:25:00.000Z", 5, "Ótica Épsilon");
        await launchAt("2026-11-24T10:25:00.000Z", 6, "ótica épsilon");
        setNow("2026-11-24T10:30:00.000Z");
        await api("patch", `/api/movements/${beta.id}`).send({ clientName: "Ótica Gama" });
        await api("delete", `/api/movements/${delta.id}`);

        const maintained = await summaryOf(a);
        await rebuildClientNames(a.business._id);

        expect(await summaryOf(a)).toEqual(maintained);
        expect(maintained.map(({ name, uses }) => [name, uses])).toEqual([
            ["ÓTICA ALFA", 2],
            ["Ótica Épsilon", 2],
            ["Ótica Gama", 2],
        ]);
    });

    it("lançamentos simultâneos do mesmo cliente: todos entram e todos contam", async () => {
        const spellings = ["Ótica Simultânea", "OTICA SIMULTANEA", "ótica simultânea"];

        const responses = await Promise.all(
            boxes.map((box, index) =>
                request(app)
                    .post("/api/movements")
                    .set("Cookie", index % 2 ? a.adminCookie : a.operatorCookie)
                    .send({ boxId: String(box._id), clientName: spellings[index % spellings.length] })
            )
        );

        expect(responses.map((response) => response.status)).toEqual(boxes.map(() => 201));
        const [item] = (await suggest("otica si")).body.items;
        expect(item.uses).toBe(10);
        const maintained = await summaryOf(a);
        await rebuildClientNames(a.business._id);
        expect(await summaryOf(a)).toEqual(maintained);
    });

    it("repetir o lançamento com a mesma chave (R13) não conta duas vezes", async () => {
        const body = { boxId: String(boxes[0]._id), clientName: "Ótica Repetida", clientRequestId: "chave-repetida-123" };

        expect((await api("post", "/api/movements").send(body)).status).toBe(201);
        expect((await api("post", "/api/movements").send(body)).status).toBe(201);

        expect((await suggest("otica re")).body.items.map((item) => item.uses)).toEqual([1]);
    });

    it("um nome com \"$\" é guardado como texto", async () => {
        await launch(app, a.operatorCookie, { boxId: String(boxes[0]._id), clientName: "$ul Ótica" });

        expect(names(await suggest("$u"))).toEqual(["$ul Ótica"]);
    });
});

describe("rebuildClientNames: o resumo é refeito a partir dos serviços", () => {
    it("corrige contagens erradas e tira nomes sem uso, só na empresa dada", async () => {
        await seedUses(a, [["Ótica Certa", "2026-11-20T10:00:00.000Z"]]);
        await seedUses(b, [["Ótica de B", "2026-11-20T10:00:00.000Z"]]);
        await ClientName.updateOne({ business: a.business._id, key: "otica certa" }, { $set: { uses: 99, name: "Errada" } });
        await ClientName.create({
            business: a.business._id,
            key: "otica sem uso",
            name: "Ótica Sem Uso",
            uses: 3,
            lastUsedAt: new Date("2026-11-01T10:00:00.000Z"),
        });

        expect(await rebuildClientNames(a.business._id)).toBe(1);

        expect(await summaryOf(a)).toEqual([
            { key: "otica certa", name: "Ótica Certa", uses: 1, lastUsedAt: new Date("2026-11-20T10:00:00.000Z") },
        ]);
        expect((await summaryOf(b)).map((row) => row.name)).toEqual(["Ótica de B"]);
    });
});

describe("GET /api/clients/suggestions: isolamento entre empresas", () => {
    it("só os nomes e os usos da empresa da sessão", async () => {
        await seedUses(b, [
            ["Ótica Visão Clara", "2026-11-20T10:00:00.000Z"],
            ["Ótica Visão Clara", "2026-11-21T10:00:00.000Z"],
            ["Ótica Visão Clara", "2026-11-22T10:00:00.000Z"],
            ["Ótica Só de B", "2026-11-23T10:00:00.000Z"],
        ]);
        await seedUses(a, [["Ótica Visão Clara", "2026-11-19T10:00:00.000Z"]]);

        for (const cookie of [a.operatorCookie, a.adminCookie]) {
            expect((await suggest("otica", { cookie })).body).toEqual({
                items: [{ name: "Ótica Visão Clara", uses: 1, lastUsedAt: "2026-11-19T10:00:00.000Z" }],
            });
            const onlyB = await suggest("otica so", { cookie });
            expect(onlyB.status).toBe(200);
            expect(onlyB.body).toEqual({ items: [] });
        }

        expect((await suggest("otica", { cookie: b.operatorCookie })).body.items).toEqual([
            { name: "Ótica Visão Clara", uses: 3, lastUsedAt: "2026-11-22T10:00:00.000Z" },
            { name: "Ótica Só de B", uses: 1, lastUsedAt: "2026-11-23T10:00:00.000Z" },
        ]);
    });

    it("um lançamento de B não mexe no resumo de A", async () => {
        await seedUses(a, [["Ótica Comum", "2026-11-19T10:00:00.000Z"]]);
        const boxOfB = await createBox(b.business, "1");

        await launch(app, b.operatorCookie, { boxId: String(boxOfB._id), clientName: "Ótica Comum" });

        expect((await suggest("otica")).body.items).toEqual([
            { name: "Ótica Comum", uses: 1, lastUsedAt: "2026-11-19T10:00:00.000Z" },
        ]);
        expect((await suggest("otica", { cookie: b.operatorCookie })).body.items.map((item) => item.uses)).toEqual([1]);
    });

    it("a empresa não vem da consulta", async () => {
        await seedUses(b, [["Ótica de B", "2026-11-20T10:00:00.000Z"]]);

        const response = await suggest("otica", { extra: `&business=${b.business._id}` });

        expect(response.status).toBe(400);
        expect(response.body.error.fields).toEqual({ business: "Campo não permitido." });
    });
});

describe("GET /api/clients/suggestions: validação de q", () => {
    const missing = "Digite o começo do nome do cliente.";

    it.each([
        ["ausente", undefined, missing],
        ["vazio", "", missing],
        ["só com espaços", "   ", missing],
        ["só com um acento solto", "́", missing],
        ["com 81 caracteres", "o".repeat(81), "Use no máximo 80 caracteres na busca."],
    ])("q %s responde 400", async (label, q, message) => {
        const response = await suggest(q);

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Confira os campos destacados.",
            fields: { q: message },
        });
    });

    it("aceita até 80 caracteres, contados sem os espaços das pontas", async () => {
        expect((await suggest("o".repeat(80))).status).toBe(200);
        expect((await suggest(`  ${"o".repeat(80)}  `)).status).toBe(200);
    });

    it("q repetido ou parâmetro a mais responde 400", async () => {
        const repeated = await suggest("otica", { extra: "&q=visao" });
        expect(repeated.status).toBe(400);
        expect(repeated.body.error.fields).toEqual({ q: "Envie a busca como texto." });

        const extra = await suggest("otica", { extra: "&sort=name" });
        expect(extra.status).toBe(400);
        expect(extra.body.error.fields).toEqual({ sort: "Campo não permitido." });
    });
});

describe("GET /api/clients/suggestions: caracteres especiais são texto (S5)", () => {
    beforeEach(async () => {
        const at = "2026-11-20T10:00:00.000Z";
        await seedUses(
            a,
            ["Ótica (Centro)", "Ótica .Com", "Ótica A+B", "Ótica Ábaco", "Ótica [Sul]", "Ótica \\ Barra", "Ótica $ul"].map(
                (name) => [name, at]
            )
        );
    });

    it.each([
        // Sem escapar, "(" e "[" quebrariam a expressão (500), "." acharia
        // qualquer letra, "a+" acharia também "Ótica Ábaco" e "|" acharia tudo.
        ["otica (", ["Ótica (Centro)"]],
        ["otica .", ["Ótica .Com"]],
        ["otica a+", ["Ótica A+B"]],
        ["otica [", ["Ótica [Sul]"]],
        ["otica \\", ["Ótica \\ Barra"]],
        ["otica $", ["Ótica $ul"]],
        [".*", []],
        ["^otica", []],
        ["(", []],
        ["otica |", []],
        // O MongoDB recusa uma expressão com um NUL cru (500).
        ["otica \u0000", []],
    ])("%j", async (q, expected) => {
        const response = await suggest(q);

        expect(response.status).toBe(200);
        expect(names(response)).toEqual(expected);
    });
});
