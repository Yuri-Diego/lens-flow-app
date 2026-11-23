import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { AuditEvent, Box, Movement, MovementSheet, User } from "../models/index.js";
import { generateDemoData, planHolding } from "../services/demoDataService.js";
import { hashPassword } from "../services/passwordService.js";
import { sheetDateOf } from "../utils/dateUtils.js";
import { createTestApp, login } from "./helpers/app.js";
import { testDbUri, useTestDb } from "./helpers/db.js";
import { apiAs } from "./helpers/movements.js";

useTestDb();

const SCRIPT = fileURLToPath(new URL("../scripts/seedDemo.js", import.meta.url));
const DEMO_PASSWORD = "senha-da-demonstracao";

/** Roda o script como o npm run seed:demo faria, sem o .env local (cwd temporário). */
function runSeedDemo(env, args = []) {
    const childEnv = Object.fromEntries(
        Object.entries({
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            BCRYPT_ROUNDS: "4",
            DATABASE_URL: testDbUri(),
            ...env,
        }).filter(([, value]) => value !== undefined)
    );
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [SCRIPT, ...args],
            { cwd: tmpdir(), env: childEnv, timeout: 120_000 },
            (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })
        );
    });
}

describe("planHolding", () => {
    it("espalha os pendentes pelos últimos dias, sem passar do volume de cada dia", () => {
        const plan = planHolding({ perDay: 60, days: 365, openTarget: 300, notReleasedTarget: 20 });

        expect(plan.open.reduce((sum, count) => sum + count, 0)).toBe(300);
        expect(plan.open.every((count) => count <= 60)).toBe(true);
        // Há pendentes de hoje, de ontem, de 2 dias e de 3 ou mais (todos os níveis da D15).
        expect(plan.open.slice(0, 4).every((count) => count > 0)).toBe(true);
        expect(plan.open.slice(3).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
        expect(plan.notReleased.reduce((sum, count) => sum + count, 0)).toBe(20);
        plan.open.forEach((count, daysAgo) => {
            expect(count + plan.notReleased[daysAgo]).toBeLessThanOrEqual(60);
        });
    });
});

describe("generateDemoData", () => {
    it("gera dados consistentes: folhas, caixas ocupadas pelos pendentes e o histórico de cada ação", async () => {
        const summary = await generateDemoData({
            perDay: 10,
            days: 15,
            openTarget: 25,
            notReleasedTarget: 5,
            passwordHash: await hashPassword(DEMO_PASSWORD),
        });

        expect(summary).toMatchObject({ movements: 150, open: 25, notReleased: 5, released: 120, sheets: 15 });
        expect(summary.lastDate).toBe(sheetDateOf());
        expect(await MovementSheet.countDocuments()).toBe(15);

        const holding = await Movement.find({ boxReleasedAt: null }).lean();
        expect(holding).toHaveLength(30);
        expect(new Set(holding.map((movement) => String(movement.box))).size).toBe(30);
        for (const movement of holding) {
            const box = await Box.findById(movement.box).lean();
            expect(box.state).toBe("occupied");
            expect(String(box.currentMovement)).toBe(String(movement._id));
            expect(movement.boxSnapshot).toEqual({ number: box.number, color: box.color, category: box.category });
        }
        expect(await Box.countDocuments({ state: "occupied" })).toBe(30);

        const now = Date.now();
        for (const movement of await Movement.find().lean()) {
            expect(movement.createdAt.getTime()).toBeLessThanOrEqual(now);
            if (movement.outAt) {
                expect(movement.outAt.getTime()).toBeGreaterThanOrEqual(movement.createdAt.getTime());
            }
            if (movement.boxReleasedAt) {
                expect(movement.boxReleasedAt.getTime()).toBeGreaterThanOrEqual(movement.outAt.getTime());
            }
        }

        // Empresa, 5 usuários, as caixas, as folhas e uma ação por lançamento, baixa e liberação.
        expect(summary.auditEvents).toBe(1 + 5 + summary.boxes + 15 + 150 + 125 + 120);
        expect(await AuditEvent.countDocuments()).toBe(summary.auditEvents);
    });

    it("a API funciona sobre os dados de demonstração", async () => {
        await generateDemoData({
            perDay: 10,
            days: 15,
            openTarget: 25,
            notReleasedTarget: 5,
            passwordHash: await hashPassword(DEMO_PASSWORD),
        });
        const app = createTestApp();
        const api = apiAs(app, await login(app, "demo-ana", DEMO_PASSWORD));

        const conference = await api("get", "/api/movements?status=open&limit=100");
        expect(conference.body.items).toHaveLength(25);
        const summary = await api("get", "/api/movements/summary");
        expect(summary.body.counts).toMatchObject({ open: 25, outNotReleased: 5 });
        expect((await User.countDocuments({ role: "admin" }))).toBe(1);
    });
});

describe("npm run seed:demo (scripts/seedDemo.js)", () => {
    it("gera os dados num banco vazio, mede as listas e recusa rodar de novo no mesmo banco", async () => {
        const env = {
            DATABASE_NAME: "lens-flow-seed-demo-cli",
            SEED_DEMO_PER_DAY: "8",
            SEED_DEMO_DAYS: "5",
            SEED_DEMO_OPEN: "10",
            SEED_DEMO_NOT_RELEASED: "3",
            SEED_DEMO_SAMPLES: "3",
            SEED_DEMO_PASSWORD: DEMO_PASSWORD,
        };

        const first = await runSeedDemo(env);

        expect(first.stderr).toBe("");
        expect(first.code).toBe(0);
        expect(first.stdout).toContain('Dados de demonstração criados no banco "lens-flow-seed-demo-cli"');
        expect(first.stdout).toContain("- 40 serviços: 10 pendentes, 3 saíram sem liberar a caixa, 27 concluídos");
        expect(first.stdout).toContain("| Lista | p50 (ms) | p95 (ms) | máx. (ms) |");
        expect(first.stdout).toContain("| Conferência (pendentes, priority) |");
        expect(first.stdout).toContain("Lote de 10 (Saiu e liberar)");
        expect(first.stdout).toMatch(/Fluxo completo .*: ok\./);
        expect(first.stdout).toMatch(/Meta de p95 abaixo de 300 ms/);
        expect(first.stdout + first.stderr).not.toContain(DEMO_PASSWORD);

        const again = await runSeedDemo(env);
        expect(again.code).toBe(1);
        expect(again.stderr).toContain('O banco "lens-flow-seed-demo-cli" já tem dados.');
    }, 120_000);

    it.each([
        [{}, [], "Defina DATABASE_URL e DATABASE_NAME"],
        [{ DATABASE_NAME: "x" }, ["--reset"], "não aceita argumentos"],
        [{ DATABASE_NAME: "x", SEED_DEMO_PROFILE: "enorme" }, [], "SEED_DEMO_PROFILE inválido"],
        [{ DATABASE_NAME: "x", SEED_DEMO_DAYS: "0" }, [], "SEED_DEMO_DAYS precisa ser um número inteiro"],
        [{ DATABASE_NAME: "x", SEED_DEMO_PASSWORD: "curta" }, [], "SEED_DEMO_PASSWORD: A senha precisa ter pelo menos 8 caracteres."],
        [{ DATABASE_NAME: "x", NODE_ENV: "production" }, [], "não roda com NODE_ENV=production"],
    ])("recusa entrada inválida (%o %o)", async (env, args, message) => {
        const result = await runSeedDemo({ DATABASE_URL: env.DATABASE_NAME ? testDbUri() : "", ...env }, args);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(message);
        expect(result.stdout).toBe("");
    });
});
