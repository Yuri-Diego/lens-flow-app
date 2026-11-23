import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { AuditEvent, Box, Movement, MovementSheet } from "../models/index.js";
import { auditListQuery } from "../services/auditQueryService.js";
import { generateDemoData } from "../services/demoDataService.js";
import {
    MOVEMENT_SORT_SPECS,
    holdingMovementsQuery,
    launchedOnFilter,
    movementListQuery,
} from "../services/movementQueryService.js";
import { encodeCursor } from "../services/pagination.js";
import { sheetCountsAggregation } from "../services/sheetService.js";
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
    ["OS exata (aviso D16)", { status: "open", orderService: "10500" }],
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

    it("a consulta por número de caixa é exata e usa o índice único", async () => {
        const stages = winningStages(
            await Box.find({ business: new mongoose.Types.ObjectId(auth.businessId), number: "12" }).explain(
                "queryPlanner"
            )
        );
        expect(stages).toContain("IXSCAN");
    });
});
