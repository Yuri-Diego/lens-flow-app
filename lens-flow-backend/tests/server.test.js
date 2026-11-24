import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { testDbUri, useTestDb } from "./helpers/db.js";

useTestDb();

const SERVER = fileURLToPath(new URL("../server.js", import.meta.url));
const running = [];

afterEach(async () => {
    for (const { child, standalone } of running.splice(0)) {
        child?.kill();
        await standalone?.stop();
    }
});

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = createServer().listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
        probe.on("error", reject);
    });
}

/**
 * Sobe o server.js como o npm start faria, com cwd numa pasta temporária para
 * o .env local não entrar no teste. Resolve quando a saída casa com `until`
 * ou quando o processo termina.
 */
async function startServer(env, until) {
    const port = await freePort();
    const childEnv = Object.fromEntries(
        Object.entries({
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            PORT: String(port),
            CORS_ORIGINS: "http://localhost:5173",
            ...env,
        }).filter(([, value]) => value !== undefined)
    );
    const child = spawn(process.execPath, [SERVER], { cwd: tmpdir(), env: childEnv });
    const entry = { child };
    running.push(entry);

    let output = "";
    const result = await new Promise((resolve) => {
        const check = (chunk) => {
            output += chunk;
            if (until && until.test(output)) {
                resolve({ code: null, output });
            }
        };
        child.stdout.on("data", check);
        child.stderr.on("data", check);
        child.on("exit", (code) => resolve({ code, output }));
    });
    return { ...result, port, entry };
}

const VALID_ENV = {
    DATABASE_NAME: "lens-flow-server-test",
    JWT_SECRET: "segredo-de-teste-do-servidor-com-32-ou-mais",
};

describe("server.js: a API não sobe sem banco ou sem JWT_SECRET", () => {
    it("encerra com a lista do que falta no ambiente", async () => {
        const { code, output } = await startServer({});

        expect(code).toBe(1);
        expect(output).toContain("Configuração inválida");
        expect(output).toContain("DATABASE_URL não definida.");
        expect(output).toContain("JWT_SECRET não definida.");
    });

    it("encerra quando o banco não responde", async () => {
        const { code, output } = await startServer({
            ...VALID_ENV,
            DATABASE_URL: "mongodb://127.0.0.1:1",
        });

        expect(code).toBe(1);
        expect(output).toContain("Não foi possível preparar o banco de dados");
    }, 40_000);

    it("sobe com replica set e responde /api/health", async () => {
        const { code, port, output } = await startServer(
            { ...VALID_ENV, DATABASE_URL: testDbUri() },
            /rodando na porta/
        );

        expect(code).toBeNull();
        expect(output).not.toContain("Aviso");
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "ok" });
    });

    it("ao subir, refaz o resumo dos nomes de cliente (D24) a partir dos serviços que já estavam no banco", async () => {
        const { db } = mongoose.connection.useDb(VALID_ENV.DATABASE_NAME);
        const business = new mongoose.Types.ObjectId();
        const at = (iso) => new Date(iso);
        await db.collection("businesses").insertOne({ _id: business, name: "Laboratório Antigo" });
        const movement = (clientName, clientNameNormalized, createdAt, deletedAt = null) => ({
            business,
            sheet: new mongoose.Types.ObjectId(),
            sheetDate: "2026-11-20",
            box: new mongoose.Types.ObjectId(),
            boxSnapshot: { number: "1", color: "branca", category: "without_assembly" },
            urgent: false,
            boxSortKey: "1",
            clientName,
            clientNameNormalized,
            status: "out",
            createdBy: new mongoose.Types.ObjectId(),
            deletedAt,
            createdAt,
        });
        await db.collection("movements").insertMany([
            movement("Ótica Antiga", "otica antiga", at("2026-11-20T10:00:00.000Z")),
            movement("ÓTICA ANTIGA", "otica antiga", at("2026-11-21T10:00:00.000Z")),
            movement("Ótica Excluída", "otica excluida", at("2026-11-21T11:00:00.000Z"), at("2026-11-22T09:00:00.000Z")),
        ]);
        try {
            const { code } = await startServer({ ...VALID_ENV, DATABASE_URL: testDbUri() }, /rodando na porta/);

            expect(code).toBeNull();
            const summary = await db
                .collection("clientnames")
                .find({ business })
                .project({ _id: 0, business: 0 })
                .toArray();
            expect(summary).toEqual([
                { key: "otica antiga", name: "ÓTICA ANTIGA", uses: 2, lastUsedAt: at("2026-11-21T10:00:00.000Z") },
            ]);
        } finally {
            await db.dropDatabase();
        }
    });

    it("sem replica set: avisa fora de produção e recusa em produção", async () => {
        const standalone = await MongoMemoryServer.create();
        running.push({ standalone });
        const env = { ...VALID_ENV, DATABASE_URL: standalone.getUri() };

        const development = await startServer(env, /rodando na porta/);
        expect(development.code).toBeNull();
        expect(development.output).toContain("Aviso: O MongoDB não está em replica set");
        development.entry.child.kill();

        const production = await startServer({ ...env, NODE_ENV: "production" });
        expect(production.code).toBe(1);
        expect(production.output).toContain("O MongoDB não está em replica set");
        expect(production.output).not.toContain("rodando na porta");
    });
});
