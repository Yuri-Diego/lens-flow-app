/**
 * npm run start:e2e: a API para os testes ponta a ponta (pasta e2e/ na raiz).
 *
 * Sobe um MongoDB em memória (replica set), cria o conjunto fixo de e2eLab.js e
 * escuta só neste computador (127.0.0.1). Não lê o .env e não encosta em banco
 * nenhum que já exista: ao encerrar, tudo some.
 *
 * Duas coisas só existem aqui, fora do app de produção (app.js):
 * - POST /__e2e__/labs cria um laboratório novo com o mesmo conjunto, para
 *   cada teste ter o seu;
 * - o cabeçalho X-E2E-Now fixa o relógio das regras naquela requisição.
 *
 * Variáveis (todas opcionais):
 * - E2E_API_PORT: porta (padrão 5055);
 * - E2E_WEB_ORIGIN: origem do site (padrão http://127.0.0.1:4173);
 * - E2E_JWT_SECRET: segredo da sessão; sem ela, um aleatório;
 * - E2E_PASSWORD: senha dos usuários de teste (padrão "senha-e2e-123").
 */
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { connectDB, ensureIndexes } from "../db/database.js";
import { applyClockAt } from "./e2eClock.js";
import { newLabPrefix, seedLab } from "./e2eLab.js";

const HOST = "127.0.0.1";
const DATABASE_NAME = "lens-flow-e2e";
const DEFAULT_PORT = "5055";
const DEFAULT_PASSWORD = "senha-e2e-123";
const DEFAULT_LAB_PREFIX = "e2e";
const LAUNCH_TIMEOUT_MS = 60_000;

function readOptions(env) {
    if ((env.NODE_ENV ?? "").trim() === "production") {
        throw new Error("O start:e2e não roda com NODE_ENV=production.");
    }
    return {
        port: env.E2E_API_PORT?.trim() || DEFAULT_PORT,
        webOrigin: env.E2E_WEB_ORIGIN?.trim() || "http://127.0.0.1:4173",
        jwtSecret: env.E2E_JWT_SECRET || randomBytes(48).toString("hex"),
        password: env.E2E_PASSWORD || DEFAULT_PASSWORD,
    };
}

function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

async function handleNewLab(res, password) {
    try {
        sendJson(res, 201, await seedLab({ prefix: newLabPrefix(), password }));
    } catch (error) {
        console.error(error);
        sendJson(res, 500, { message: error.message });
    }
}

function createE2eServer(app, { password }) {
    return createServer((req, res) => {
        if (req.method === "POST" && req.url === "/__e2e__/labs") {
            void handleNewLab(res, password);
            return;
        }
        const now = req.headers["x-e2e-now"];
        if (now === undefined) {
            app(req, res);
        } else if (Number.isNaN(Date.parse(now))) {
            sendJson(res, 400, { message: "X-E2E-Now precisa ser um instante ISO 8601." });
        } else {
            applyClockAt(now, () => app(req, res));
        }
    });
}

async function main() {
    const options = readOptions(process.env);
    // Muitos usuários de teste: bcrypt barato, como nos testes do backend.
    process.env.BCRYPT_ROUNDS ??= "4";

    const replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        instanceOpts: [{ launchTimeout: LAUNCH_TIMEOUT_MS }],
    });
    let server;
    const stop = async () => {
        server?.close();
        server?.closeAllConnections();
        await mongoose.disconnect();
        await replSet.stop();
    };
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            stop().then(
                () => process.exit(0),
                () => process.exit(1)
            );
        });
    }

    try {
        const config = loadConfig({
            NODE_ENV: "test",
            PORT: options.port,
            DATABASE_URL: replSet.getUri(),
            DATABASE_NAME,
            JWT_SECRET: options.jwtSecret,
            CORS_ORIGINS: options.webOrigin,
            // O site chega pelo proxy do Vite, neste computador. Cada teste manda
            // o próprio X-Forwarded-For e tem o próprio limite de tentativas.
            TRUST_PROXY: "loopback",
        });
        await connectDB(config);
        await ensureIndexes();
        await seedLab({ prefix: DEFAULT_LAB_PREFIX, password: options.password });

        server = createE2eServer(createApp(config), options);
        server.listen(config.port, HOST);
        await once(server, "listening");
        console.log(
            `API do E2E em http://${HOST}:${config.port} (usuários ${DEFAULT_LAB_PREFIX}-admin, ${DEFAULT_LAB_PREFIX}-ana e ${DEFAULT_LAB_PREFIX}-joao)`
        );
    } catch (error) {
        await stop();
        throw error;
    }
}

main().catch((error) => {
    console.error(`Falha no start:e2e: ${error.message}`);
    process.exit(1);
});
