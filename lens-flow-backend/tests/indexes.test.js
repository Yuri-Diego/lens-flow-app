import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { escapeRegex, normalizeOrderService, normalizeSearchText } from "../domain/text.js";
import { AuditEvent, Box, ClientName, Movement, MovementSheet } from "../models/index.js";
import { MOVEMENT_HINTS } from "../models/Movement.js";
import { auditListQuery } from "../services/auditQueryService.js";
import { clientStatsAggregation, clientSuggestionsQuery } from "../services/clientService.js";
import { generateDemoData } from "../services/demoDataService.js";
import {
    MOVEMENT_SORT_SPECS,
    holdingMovementsQuery,
    launchedOnFilter,
    movementListQuery,
    openMovementsWithOrderService,
} from "../services/movementQueryService.js";
import { missingPartFilter, orderServicePairsQuery } from "../services/orderServiceMigration.js";
import { encodeCursor } from "../services/pagination.js";
import { sheetCountsAggregation } from "../services/sheetService.js";
import { userOptionsQuery } from "../services/userService.js";
import { addDays, sheetDateOf } from "../utils/dateUtils.js";
import { startTestDb, stopTestDb } from "./helpers/db.js";

let demo;
let auth;
let today;
let boxId;

// Um banco só para o arquivo: os dados de demonstração são gerados uma vez.
beforeAll(async () => {
    await startTestDb();
    demo = await generateDemoData({
        perDay: 40,
        days: 90,
        openTarget: 120,
        notReleasedTarget: 12,
        // Hash que não confere com senha nenhuma: aqui ninguém entra.
        passwordHash: "$2b$04$naoconferenaoconferenaoconferenaoconferenaoconferenaoc",
        seed: 7,
    });
    auth = { businessId: demo.businessId, userId: demo.adminId, role: "admin" };
    today = sheetDateOf();
    boxId = String((await Box.findOne({ business: demo.businessId, number: "1" }).lean())._id);
});

afterAll(stopTestDb);

/** Os estágios do plano vencedor, onde quer que ele esteja no explain (find ou aggregate). */
function winningStages(explain) {
    const stages = [];
    const walk = (node, inWinning) => {
        if (Array.isArray(node)) {
            node.forEach((child) => walk(child, inWinning));
            return;
        }
        if (!node || typeof node !== "object") {
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === "rejectedPlans") {
                continue;
            }
            if (key === "stage" && inWinning && typeof value === "string") {
                stages.push(value);
            }
            walk(value, inWinning || key === "winningPlan");
        }
    };
    walk(explain, false);
    return stages;
}

/** As estatísticas de execução, onde quer que estejam no explain (find ou aggregate). */
function executionStatsOf(explain) {
    if (!explain || typeof explain !== "object") {
        return undefined;
    }
    if (typeof explain.totalKeysExamined === "number") {
        return explain;
    }
    for (const value of Object.values(explain)) {
        const found = executionStatsOf(value);
        if (found) {
            return found;
        }
    }
    return undefined;
}

async function stagesOfList(params) {
    return winningStages(await movementListQuery(auth, params).explain("queryPlanner"));
}

const MAIN_LISTS = [
    ["Conferência (priority)", { status: "open" }],
    ["Conferência por número (box)", { status: "open", sort: "box" }],
    ["Conferência mais antigos", { status: "open", sort: "oldest" }],
    ["Conferência mais recentes", { status: "open", sort: "recent" }],
    ["Baixas (pela hora da baixa)", { status: "out" }],
    ["Saiu, caixa não liberada (R15)", { status: "out", boxReleased: false, sort: "oldest" }],
    ["Folha do dia (Hoje)", { from: "{today}", to: "{today}" }],
    ["Todos, mais recentes", {}],
];

const FILTERED_LISTS = [
    ["Conferência por cor", { status: "open", color: "vermelha" }],
    ["Conferência por categoria", { status: "open", category: "with_assembly" }],
    ["Baixas de um período", { status: "out", outFrom: "{week}", outTo: "{today}" }],
    ["Baixas de um usuário", { status: "out", outBy: "{admin}" }],
    ["Período da folha", { from: "{week}", to: "{today}", sort: "oldest" }],
    ["Busca por cliente (trecho)", { q: "otica central" }],
    ["Busca por cliente (prefixo)", { q: "Óptica" }],
    ["Busca por OS ou caixa (dígitos)", { q: "1012" }],
    ["Busca por OS com letras (prefixo)", { q: "Os-7" }],
    ["OS exata nos abertos (aviso ao digitar, D16)", { status: "open", orderService: "10500" }],
    ["OS exata em qualquer situação", { orderService: "Os-7" }],
    ["Serviços de uma caixa", { box: "{box}" }],
    ["Lançados por um usuário", { createdBy: "{admin}" }],
];

function resolve(params) {
    return JSON.parse(
        JSON.stringify(params)
            .replaceAll("{today}", today)
            .replaceAll("{week}", addDays(today, -6))
            .replaceAll("{admin}", demo.adminId)
            .replaceAll("{box}", boxId)
    );
}

describe("explain: as listas usam índice (IXSCAN), sem COLLSCAN", () => {
    it("os dados de demonstração têm o volume esperado", () => {
        expect(demo.movements).toBe(40 * 90);
        expect(demo.open).toBe(120);
        expect(demo.notReleased).toBe(12);
    });

    it.each(MAIN_LISTS)("%s: IXSCAN, e a ordem vem do índice (sem SORT em memória)", async (label, params) => {
        const stages = await stagesOfList(resolve(params));

        expect(stages).toContain("IXSCAN");
        expect(stages).not.toContain("COLLSCAN");
        expect(stages).not.toContain("SORT");
    });

    it.each(FILTERED_LISTS)("%s: IXSCAN, sem COLLSCAN", async (label, params) => {
        const stages = await stagesOfList(resolve(params));

        expect(stages).toContain("IXSCAN");
        expect(stages).not.toContain("COLLSCAN");
    });

    it("a página seguinte (cursor) continua no índice, sem SORT", async () => {
        for (const [sortName, params] of [
            ["priority", { status: "open" }],
            ["recentOut", { status: "out" }],
            ["recent", {}],
        ]) {
            const [first] = await movementListQuery(auth, params).lean();
            const cursor = encodeCursor(sortName, MOVEMENT_SORT_SPECS[sortName], first);
            const stages = await stagesOfList({ ...params, cursor });
            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
            expect(stages).not.toContain("SORT");
        }
    });

    it("as contagens usam o índice certo e só leem o que contam (hint, sem empate no planejador)", async () => {
        const holding = await holdingMovementsQuery(auth).explain("executionStats");
        expect(JSON.stringify(holding.queryPlanner.winningPlan)).toContain(
            "business_1_status_1_boxReleasedAt_1_outAt_1__id_1"
        );
        expect(holding.executionStats.nReturned).toBe(demo.open + demo.notReleased);
        expect(holding.executionStats.totalKeysExamined).toBeLessThanOrEqual(holding.executionStats.nReturned + 2);

        const dates = Array.from({ length: 31 }, (_, index) => addDays(today, -index));
        const counts = await sheetCountsAggregation(auth.businessId, dates).explain("executionStats");
        expect(JSON.stringify(counts.queryPlanner.winningPlan)).toContain("business_1_sheetDate_-1_createdAt_-1__id_-1");
        // Só os serviços dos 31 dias (40 por dia), mais um passo por intervalo do $in.
        expect(counts.executionStats.totalKeysExamined).toBeLessThanOrEqual(31 * 40 + 31);
    });

    it("contadores das folhas e do resumo, folhas e caixas: IXSCAN", async () => {
        const dates = Array.from({ length: 31 }, (_, index) => addDays(today, -index));
        const plans = [
            await sheetCountsAggregation(auth.businessId, dates).explain("queryPlanner"),
            await holdingMovementsQuery(auth).explain("queryPlanner"),
            await Movement.find(launchedOnFilter(auth, today)).explain("queryPlanner"),
            await MovementSheet.find({ business: auth.businessId }).sort({ date: -1 }).limit(32).explain("queryPlanner"),
            await Box.find({ business: auth.businessId }).explain("queryPlanner"),
            await Box.find({ business: auth.businessId, state: "occupied" }).explain("queryPlanner"),
        ];
        for (const plan of plans) {
            const stages = winningStages(plan);
            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
        }
    });

    it("histórico geral e linha do tempo do serviço: IXSCAN, e o geral sem SORT", async () => {
        const movement = await Movement.findOne({ business: auth.businessId }).lean();
        for (const params of [{}, { user: demo.adminId }, { entity: "Box" }, { from: addDays(today, -6), to: today }]) {
            const stages = winningStages(await auditListQuery(auth, params).explain("queryPlanner"));
            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
            expect(stages).not.toContain("SORT");
        }
        const timeline = winningStages(
            await AuditEvent.find({ business: auth.businessId, entityId: movement._id })
                .sort({ at: 1, _id: 1 })
                .explain("queryPlanner")
        );
        expect(timeline).toContain("IXSCAN");
        expect(timeline).not.toContain("COLLSCAN");
    });

    it.each([
        ["uma letra (o pior caso: quase todos os serviços são de uma Ótica)", "o"],
        ["prefixo com espaço", "otica vi"],
        ["caracteres especiais", "Ótica (Centro"],
    ])(
        "sugestões de cliente, %s: IXSCAN no resumo {business, key}, lendo um documento por nome e não por serviço",
        async (label, q) => {
            const prefix = normalizeSearchText(q);
            const explain = await clientSuggestionsQuery(auth.businessId, prefix, 8).explain("executionStats");
            const stages = winningStages(explain);

            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
            expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain("business_1_key_1");

            const names = await ClientName.countDocuments({
                business: auth.businessId,
                key: { $regex: `^${escapeRegex(prefix)}` },
            });
            const uses = await Movement.countDocuments({
                business: auth.businessId,
                clientNameNormalized: { $regex: `^${escapeRegex(prefix)}` },
                deletedAt: null,
            });
            const stats = executionStatsOf(explain);
            expect(stats.totalDocsExamined).toBe(names);
            expect(stats.totalKeysExamined).toBeLessThanOrEqual(names + 1);
            if (q === "o") {
                // Na primeira letra: dezenas de nomes no lugar de milhares de serviços.
                expect(uses).toBeGreaterThan(demo.movements / 2);
                expect(names).toBeLessThan(200);
            }
        }
    );

    it.each([
        ["de um nome (edição do cliente e exclusão)", ["otica central"]],
        ["de todos os nomes (subida da API e dados de demonstração)", undefined],
    ])(
        "recálculo do resumo %s: IXSCAN no índice parcial dos nomes, coberto (sem FETCH) e sem SORT antes do agrupamento",
        async (label, keys) => {
            const explain = await clientStatsAggregation(auth.businessId, keys).explain("executionStats");
            const stages = winningStages(explain);
            // O que fica abaixo do $group (no MongoDB 8, ele roda junto da consulta).
            const groupAt = stages.indexOf("GROUP");
            const belowGroup = groupAt === -1 ? stages : stages.slice(groupAt + 1);

            expect(stages).not.toContain("COLLSCAN");
            expect(belowGroup).toContain("IXSCAN");
            expect(belowGroup).not.toContain("FETCH");
            expect(belowGroup).not.toContain("SORT");
            expect(JSON.stringify(explain)).toContain("business_1_clientNameNormalized_1_createdAt_-1_clientName_1");

            // Lê só as chaves dos usos desses nomes, e nenhum documento.
            const filter = { business: auth.businessId, deletedAt: null };
            if (keys) {
                filter.clientNameNormalized = { $in: keys };
            }
            const uses = await Movement.countDocuments(filter);
            const stats = executionStatsOf(explain);
            expect(stats.totalDocsExamined).toBe(0);
            expect(stats.totalKeysExamined).toBeLessThanOrEqual(uses + 1);
        }
    );

    it("o resumo dos nomes dos dados de demonstração bate com os serviços", async () => {
        const rows = await clientStatsAggregation(auth.businessId);
        const summary = await ClientName.find({ business: auth.businessId }).lean();

        expect(summary).toHaveLength(rows.length);
        expect(demo.clientNames).toBe(rows.length);
        const byKey = new Map(summary.map((row) => [row.key, row]));
        for (const row of rows) {
            expect(byKey.get(row._id)).toMatchObject({ name: row.name, uses: row.uses, lastUsedAt: row.lastUsedAt });
        }
    });

    describe("OS sem distinguir maiúsculas (D26)", () => {
        const INDEX = "business_1_orderServiceNormalized_1_orderService_1__id_1";
        let business;
        let openOrder;

        // Os dados de demonstração só têm OS com dígitos: estas têm letras.
        beforeAll(async () => {
            business = new mongoose.Types.ObjectId(auth.businessId);
            openOrder = (await Movement.findOne({ business, status: "open" }).lean()).orderService;
            const docs = await Movement.find({ business, status: "out" }).limit(40).lean();
            for (const [index, { _id }] of docs.entries()) {
                const orderService = `Os-7${String(index).padStart(2, "0")}a`;
                await Movement.updateOne(
                    { _id },
                    { $set: { orderService, orderServiceNormalized: normalizeOrderService(orderService) } }
                );
            }
        });

        it.each([
            ["filtro nos abertos (aviso ao digitar)", () => movementListQuery(auth, { status: "open", orderService: openOrder }), 10],
            ["filtro em qualquer situação", () => movementListQuery(auth, { orderService: "oS-705A" }), 2],
            ["aviso ao lançar e ao editar (D16)", () => openMovementsWithOrderService(auth, openOrder, demo.adminId), 10],
            ["busca por prefixo com dígitos", () => movementListQuery(auth, { q: "1012" }), 30],
        ])("%s: IXSCAN no índice da OS, sem COLLSCAN, lendo só as chaves da OS", async (label, query, maxKeys) => {
            const explain = await query().explain("executionStats");
            const stages = winningStages(explain);

            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
            expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain(INDEX);
            expect(executionStatsOf(explain).totalKeysExamined).toBeLessThanOrEqual(maxKeys);
            expect(executionStatsOf(explain).nReturned).toBeGreaterThan(0);
        });

        it("o prefixo da OS vira um intervalo do índice, também com letras", async () => {
            const explain = await Movement.find({
                business,
                orderServiceNormalized: { $regex: `^${escapeRegex(normalizeOrderService("OS-7"))}` },
            }).explain("executionStats");

            const { indexName, indexBounds } = explain.queryPlanner.winningPlan.inputStage;
            expect(indexName).toBe(INDEX);
            expect(indexBounds.orderServiceNormalized[0]).toBe('["os-7", "os-8")');
            expect(executionStatsOf(explain).nReturned).toBe(40);
            expect(executionStatsOf(explain).totalKeysExamined).toBeLessThanOrEqual(41);
        });

        it("a conferência da subida é coberta pelo índice: uma chave por serviço, sem ler documentos", async () => {
            const explain = await orderServicePairsQuery(business).explain("executionStats");
            const stages = winningStages(explain);

            expect(stages).toContain("IXSCAN");
            expect(stages).not.toContain("COLLSCAN");
            expect(stages).not.toContain("FETCH");
            expect(executionStatsOf(explain).totalDocsExamined).toBe(0);
            expect(executionStatsOf(explain).totalKeysExamined).toBe(demo.movements);
        });

        it("num banco em dia, procurar o que falta não lê nenhum serviço", async () => {
            const explain = await Movement.collection
                .find(missingPartFilter(business, 0), { hint: MOVEMENT_HINTS.orderServices })
                .explain("executionStats");

            expect(executionStatsOf(explain).totalDocsExamined).toBe(0);
            expect(executionStatsOf(explain).totalKeysExamined).toBeLessThanOrEqual(1);
        });
    });

    it("opções de usuários: IXSCAN pela empresa, sem COLLSCAN", async () => {
        const stages = winningStages(await userOptionsQuery(auth).explain("queryPlanner"));

        expect(stages).toContain("IXSCAN");
        expect(stages).not.toContain("COLLSCAN");
    });

    it("a consulta por número de caixa é exata e usa o índice único", async () => {
        const stages = winningStages(
            await Box.find({ business: new mongoose.Types.ObjectId(auth.businessId), number: "12" }).explain(
                "queryPlanner"
            )
        );
        expect(stages).toContain("IXSCAN");
    });
});
