/**
 * npm run seed:demo: dados de demonstração e medição do p95 das listas (R18).
 *
 * Cria uma empresa de demonstração com cerca de um ano de serviços e, em
 * seguida, mede o tempo de resposta das listas principais por HTTP, com a API
 * rodando neste processo, numa porta livre. A meta é p95 abaixo de 300 ms
 * (seção 7 da especificação).
 *
 * Só roda num banco vazio, para nunca misturar com dados de verdade: use um
 * banco separado, passando DATABASE_NAME no próprio comando, por exemplo
 *   DATABASE_NAME=lens-flow-demo npm run seed:demo
 *
 * Variáveis (todas opcionais, menos as do banco):
 * - SEED_DEMO_PROFILE: base (60 por dia, padrão), alto (150) ou estresse (600);
 * - SEED_DEMO_PER_DAY: serviços por dia, no lugar do perfil;
 * - SEED_DEMO_DAYS: dias de dados, terminando hoje (padrão 365);
 * - SEED_DEMO_OPEN: pendentes na Conferência no fim (padrão 300);
 * - SEED_DEMO_NOT_RELEASED: serviços que saíram e esperam a liberação (padrão 20);
 * - SEED_DEMO_PASSWORD: senha dos usuários demo-*; sem ela, a senha é aleatória
 *   e ninguém entra com eles;
 * - SEED_DEMO_MEASURE: "false" para só gerar os dados;
 * - SEED_DEMO_SAMPLES: requisições medidas por lista (padrão 100);
 * - SEED_DEMO_SEED: semente do gerador (padrão 2026).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB, ensureIndexes, supportsTransactions } from "../db/database.js";
import { Business, Movement, User } from "../models/index.js";
import { DEMO_PROFILES, generateDemoData } from "../services/demoDataService.js";
import { hashPassword } from "../services/passwordService.js";
import { SESSION_COOKIE, signSession } from "../services/sessionService.js";
import { addDays, sheetDateOf } from "../utils/dateUtils.js";
import { password as passwordSchema } from "../validation/userSchemas.js";

const TARGET_P95_MS = 300;
const WARMUP_REQUESTS = 5;
const LOCAL_ORIGIN = "http://localhost";

class SeedDemoError extends Error {}

function positiveInteger(env, name, fallback, max) {
    const raw = env[name]?.trim();
    if (!raw) {
        return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new SeedDemoError(`${name} precisa ser um número inteiro de 1 a ${max}.`);
    }
    return value;
}

function readOptions(env) {
    if (process.argv.length > 2) {
        throw new SeedDemoError("Este script não aceita argumentos. Use as variáveis SEED_DEMO_*.");
    }
    if ((env.NODE_ENV ?? "").trim() === "production") {
        throw new SeedDemoError("O seed:demo não roda com NODE_ENV=production.");
    }
    const databaseUrl = env.DATABASE_URL?.trim();
    const databaseName = env.DATABASE_NAME?.trim();
    if (!databaseUrl || !databaseName) {
        throw new SeedDemoError("Defina DATABASE_URL e DATABASE_NAME (use um banco só para a demonstração).");
    }
    const profile = env.SEED_DEMO_PROFILE?.trim() || "base";
    if (!(profile in DEMO_PROFILES)) {
        throw new SeedDemoError(
            `SEED_DEMO_PROFILE inválido: use ${Object.keys(DEMO_PROFILES).join(", ")}.`
        );
    }
    let password = null;
    if (env.SEED_DEMO_PASSWORD) {
        const parsed = passwordSchema.safeParse(env.SEED_DEMO_PASSWORD);
        if (!parsed.success) {
            throw new SeedDemoError(`SEED_DEMO_PASSWORD: ${parsed.error.issues[0].message}`);
        }
        password = parsed.data;
    }
    return {
        databaseUrl,
        databaseName,
        profile,
        perDay: positiveInteger(env, "SEED_DEMO_PER_DAY", DEMO_PROFILES[profile], 5_000),
        days: positiveInteger(env, "SEED_DEMO_DAYS", 365, 3_650),
        openTarget: positiveInteger(env, "SEED_DEMO_OPEN", 300, 5_000),
        notReleasedTarget: positiveInteger(env, "SEED_DEMO_NOT_RELEASED", 20, 1_000),
        samples: positiveInteger(env, "SEED_DEMO_SAMPLES", 100, 10_000),
        seed: positiveInteger(env, "SEED_DEMO_SEED", 2026, 2 ** 31 - 1),
        measure: env.SEED_DEMO_MEASURE?.trim() !== "false",
        password,
    };
}

async function assertEmptyDatabase(databaseName) {
    const [businesses, users] = await Promise.all([
        Business.estimatedDocumentCount(),
        User.estimatedDocumentCount(),
    ]);
    if (businesses > 0 || users > 0) {
        throw new SeedDemoError(
            `O banco "${databaseName}" já tem dados. O seed:demo só roda num banco vazio: passe outro DATABASE_NAME no comando.`
        );
    }
}

const numberFormat = new Intl.NumberFormat("pt-BR");

function percentile(sorted, fraction) {
    return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function formatMs(value) {
    return value.toFixed(1).replace(".", ",");
}

/** Um cliente HTTP mínimo com a sessão do admin de demonstração. */
function apiClient(baseUrl, cookie) {
    return async function call(method, path, body) {
        const started = performance.now();
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                cookie,
                ...(body ? { "content-type": "application/json", origin: LOCAL_ORIGIN } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = response.status === 204 ? null : await response.json();
        const elapsed = performance.now() - started;
        if (!response.ok) {
            throw new SeedDemoError(`${method} ${path} respondeu ${response.status}: ${JSON.stringify(data)}`);
        }
        return { data, elapsed };
    };
}

async function timeList(call, path, samples) {
    for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
        await call("GET", typeof path === "function" ? path(index) : path);
    }
    const durations = [];
    for (let index = 0; index < samples; index += 1) {
        const { elapsed } = await call("GET", typeof path === "function" ? path(index) : path);
        durations.push(elapsed);
    }
    durations.sort((a, b) => a - b);
    return {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.at(-1),
    };
}

/** Lançar → conferir → baixa → liberar → reutilizar a caixa, contra o banco de verdade. */
async function smokeFlow(call) {
    const { data: freeBoxes } = await call("GET", "/api/boxes?state=free&active=true");
    const box = freeBoxes.boxes[0];
    const { data: launched } = await call("POST", "/api/movements", {
        boxId: box.id,
        clientName: "Teste do fluxo (seed:demo)",
    });
    const id = launched.movement.id;
    const { data: conference } = await call("GET", "/api/movements?status=open&sort=recent&limit=5");
    if (!conference.items.some((item) => item.id === id)) {
        throw new SeedDemoError("O serviço lançado não apareceu na Conferência.");
    }
    await call("POST", `/api/movements/${id}/checkout`, {});
    await call("POST", `/api/movements/${id}/release-box`, {});
    const { data: reused } = await call("POST", "/api/movements", {
        boxId: box.id,
        clientName: "Teste do fluxo, caixa reutilizada",
    });
    // Limpa o teste: exclusão lógica (fica no histórico) libera a caixa de novo.
    await call("DELETE", `/api/movements/${reused.movement.id}`);
    await call("DELETE", `/api/movements/${id}`);
    return box.number;
}

async function measure(options, summary) {
    const config = Object.freeze({
        nodeEnv: "development",
        isProduction: false,
        port: 0,
        databaseUrl: options.databaseUrl,
        databaseName: options.databaseName,
        // Segredo descartável, só deste processo: o .env não é usado aqui.
        jwtSecret: randomBytes(48).toString("hex"),
        corsOrigins: Object.freeze([LOCAL_ORIGIN]),
        trustProxy: false,
    });
    const server = createApp(config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
        const admin = await User.findById(summary.adminId).lean();
        const call = apiClient(baseUrl, `${SESSION_COOKIE}=${signSession(admin, config)}`);
        const today = sheetDateOf();
        const anyMovement = await Movement.findOne({ business: summary.businessId }).sort({ _id: 1 }).lean();
        const { data: page1 } = await call("GET", "/api/movements?status=open&limit=100");
        const page2 = page1.nextCursor
            ? (await call("GET", `/api/movements?status=open&limit=100&cursor=${page1.nextCursor}`)).data
            : null;
        const operator = await User.findOne({ business: summary.businessId, role: "operator" }).lean();
        const searches = ["otica", "sao joao", "visao", "maria", "central", "Óptica Popular", "jardim"];
        const orders = Array.from({ length: 20 }, (_, index) => String(10_000 + (index + 1) * 997));
        // O campo Cliente consulta a cada tecla (D24): "Ó", "Ót", "Óti"… até o nome.
        const typing = ["Ó", "Ót", "Óti", "Ótic", "Ótica", "Ótica ", "Ótica V", "Ótica Vi", "Ótica Vis", "Maria"];

        const lists = [
            ["Conferência (pendentes, priority)", "/api/movements?status=open"],
            ...(page2?.nextCursor
                ? [["Conferência, 3ª página de 100", `/api/movements?status=open&limit=100&cursor=${page2.nextCursor}`]]
                : []),
            ["Conferência por número (box)", "/api/movements?status=open&sort=box"],
            ["Conferência só vermelhas", "/api/movements?status=open&color=vermelha"],
            ["Saiu, caixa não liberada", "/api/movements?status=out&boxReleased=false&sort=oldest"],
            ["Baixas (mais recentes)", "/api/movements?status=out"],
            ["Baixas da última semana", `/api/movements?status=out&outFrom=${addDays(today, -6)}&outTo=${today}`],
            ["Baixas de um usuário", `/api/movements?status=out&outBy=${operator._id}`],
            ["Busca por cliente", (index) => `/api/movements?q=${encodeURIComponent(searches[index % searches.length])}`],
            ["Busca por OS (dígitos)", (index) => `/api/movements?q=${orders[index % orders.length]}`],
            [
                "Sugestões de cliente (cada tecla)",
                (index) => `/api/clients/suggestions?q=${encodeURIComponent(typing[index % typing.length])}`,
            ],
            ["Sugestões de cliente, 1 letra (pior caso)", `/api/clients/suggestions?q=${encodeURIComponent("Ó")}`],
            ["Opções de usuários", "/api/users/options"],
            ["Hoje (folha do dia)", `/api/sheets/${today}`],
            ["Folha de 6 meses atrás", `/api/sheets/${addDays(today, -180)}`],
            ["Folhas (31 dias, contadores)", "/api/sheets"],
            ["Resumo (contadores)", "/api/movements/summary"],
            ["Detalhe do serviço", `/api/movements/${anyMovement._id}`],
            ["Caixas (todas)", "/api/boxes"],
            ["Histórico geral (admin)", "/api/audit"],
            ["Histórico de um usuário", `/api/audit?user=${operator._id}`],
        ];

        const results = [];
        for (const [label, path] of lists) {
            results.push({ label, ...(await timeList(call, path, options.samples)) });
        }

        const batchIds = page1.items.slice(0, 100).map((item) => item.id);
        const { data: batch, elapsed: batchMs } = await call("POST", "/api/movements/batch", {
            ids: batchIds,
            action: "checkout-and-release",
        });
        const { data: undone, elapsed: undoMs } = await call(
            "POST",
            `/api/movements/batch/${batch.batchId}/undo`,
            {}
        );
        const flowBox = await smokeFlow(call);

        return {
            results,
            batch: { size: batchIds.length, ms: batchMs, ok: batch.summary.succeeded },
            undo: { ms: undoMs, ok: undone.summary.succeeded },
            flowBox,
        };
    } finally {
        server.close();
        await once(server, "close");
    }
}

function printSeed(options, summary, seconds) {
    const passwordNote = options.password
        ? "senha de SEED_DEMO_PASSWORD"
        : "senha aleatória, não exibida (defina SEED_DEMO_PASSWORD para entrar com eles)";
    console.log(`Dados de demonstração criados no banco "${options.databaseName}" em ${formatMs(seconds)} s:`);
    console.log(
        `- perfil ${options.profile}: ${numberFormat.format(options.perDay)} serviços por dia, de ${summary.firstDate} a ${summary.lastDate}`
    );
    console.log(
        `- ${numberFormat.format(summary.movements)} serviços: ${numberFormat.format(summary.open)} pendentes, ${numberFormat.format(summary.notReleased)} saíram sem liberar a caixa, ${numberFormat.format(summary.released)} concluídos`
    );
    console.log(
        `- ${numberFormat.format(summary.boxes)} caixas, ${numberFormat.format(summary.sheets)} folhas, ${numberFormat.format(summary.auditEvents)} eventos no histórico`
    );
    console.log(`- usuários: ${summary.usernames.join(", ")} (${passwordNote})`);
}

function printMeasurement(options, measured) {
    console.log("");
    console.log(`Tempo de resposta da API, com ${options.samples} requisições por lista (servidor local):`);
    console.log("");
    console.log("| Lista | p50 (ms) | p95 (ms) | máx. (ms) |");
    console.log("|---|---:|---:|---:|");
    for (const row of measured.results) {
        console.log(`| ${row.label} | ${formatMs(row.p50)} | ${formatMs(row.p95)} | ${formatMs(row.max)} |`);
    }
    console.log("");
    console.log(
        `Lote de ${measured.batch.size} (Saiu e liberar): ${formatMs(measured.batch.ms)} ms, ${measured.batch.ok} itens certos. Desfazer o lote: ${formatMs(measured.undo.ms)} ms, ${measured.undo.ok} itens certos.`
    );
    console.log(
        `Fluxo completo (lançar, conferir, baixa, liberar e reutilizar a caixa ${measured.flowBox}): ok.`
    );
    const missed = measured.results.filter((row) => row.p95 >= TARGET_P95_MS);
    console.log(
        missed.length === 0
            ? `Meta de p95 abaixo de ${TARGET_P95_MS} ms: atingida em todas as listas.`
            : `Meta de p95 abaixo de ${TARGET_P95_MS} ms: NÃO atingida em ${missed.map((row) => row.label).join("; ")}.`
    );
}

async function main() {
    const options = readOptions(process.env);
    await connectDB(options);
    try {
        if (!(await supportsTransactions())) {
            throw new SeedDemoError("O MongoDB precisa estar em replica set (transações, T6).");
        }
        await assertEmptyDatabase(options.databaseName);
        await ensureIndexes();
        const started = performance.now();
        const summary = await generateDemoData({
            perDay: options.perDay,
            days: options.days,
            openTarget: options.openTarget,
            notReleasedTarget: options.notReleasedTarget,
            passwordHash: await hashPassword(options.password ?? randomBytes(24).toString("base64url")),
            seed: options.seed,
        });
        printSeed(options, summary, (performance.now() - started) / 1000);
        if (options.measure) {
            printMeasurement(options, await measure(options, summary));
        }
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error(error instanceof SeedDemoError ? error.message : `Falha no seed:demo: ${error.message}`);
    process.exitCode = 1;
});
