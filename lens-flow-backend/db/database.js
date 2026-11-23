import mongoose from "mongoose";

/**
 * Conecta no MongoDB. Lança erro se não conseguir: quem chama decide encerrar
 * (a API não sobe sem banco, seção 7 da especificação).
 */
export async function connectDB({ databaseUrl, databaseName }) {
    await mongoose.connect(databaseUrl, {
        dbName: databaseName,
        serverSelectionTimeoutMS: 10_000,
    });
    return mongoose.connection;
}

/**
 * Cria as coleções e os índices de todos os models registrados, inclusive os
 * únicos (usuário, número da caixa, folha do dia). Rejeita se algum índice não
 * puder ser criado, por exemplo por dados duplicados.
 */
export async function ensureIndexes() {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

/** Transações exigem replica set (Atlas, MongoMemoryReplSet) ou mongos. */
export async function supportsTransactions(connection = mongoose.connection) {
    const hello = await connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === "isdbgrid";
}
