import "./env.js";
import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ensureIndexes } from "../../db/database.js";
import "../../models/index.js";

let replSet;

// O Mongoose 8 considera a conexão caída quando o Date.now() passa de dois
// heartbeats sem notícia do servidor. Testes que adiantam o Date em horas
// (sessão de 12 h, bloqueio de 15 min) derrubariam a conexão por engano; com o
// heartbeat de 1 dia, a janela é de 2 dias. O banco em memória é local e não cai.
const TEST_HEARTBEAT_MS = 24 * 60 * 60 * 1000;

export async function startTestDb() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    // Como no connectDB: os índices vêm só do ensureIndexes (syncIndexes).
    await mongoose.connect(replSet.getUri(), {
        dbName: "lens-flow-test",
        autoIndex: false,
        heartbeatFrequencyMS: TEST_HEARTBEAT_MS,
    });
    // Coleções e índices únicos prontos antes do primeiro teste.
    await ensureIndexes();
}

/** URI do replica set em memória (para scripts rodados como processo filho). */
export function testDbUri() {
    return replSet.getUri();
}

export async function clearTestDb() {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function stopTestDb() {
    await mongoose.disconnect();
    if (replSet) {
        await replSet.stop();
        replSet = undefined;
    }
}

/**
 * Registra os hooks do arquivo de teste: sobe o replica set em memória antes
 * de tudo, limpa as coleções depois de cada teste e derruba no fim.
 */
export function useTestDb() {
    beforeAll(startTestDb);
    afterEach(clearTestDb);
    afterAll(stopTestDb);
}
