import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet;

export async function startTestDb() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: "lens-flow-test" });
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
