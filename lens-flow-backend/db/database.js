import mongoose from "mongoose";

/**
 * Conecta no MongoDB. Lança erro se não conseguir: quem chama decide encerrar
 * (a API não sobe sem banco, seção 7 da especificação).
 *
 * `autoIndex: false`: os índices não são criados sozinhos ao registrar os
 * models, e sim pelo ensureIndexes abaixo, numa ordem só e com erro visível.
 */
export async function connectDB({ databaseUrl, databaseName }) {
    await mongoose.connect(databaseUrl, {
        dbName: databaseName,
        serverSelectionTimeoutMS: 10_000,
        autoIndex: false,
    });
    return mongoose.connection;
}

/**
 * Deixa coleções e índices iguais aos declarados nos models (syncIndexes):
 * cria as coleções e os índices que faltam e remove os índices que saíram do
 * schema. É o que migra um banco antigo, por exemplo o índice único do número
 * da caixa com colação numérica da F2, que tratava "007" e "7" como iguais
 * (D18). Rejeita se algum índice não puder ser criado, por exemplo por dados
 * duplicados.
 *
 * Índice criado à mão no banco também é removido: o schema é a fonte da
 * verdade dos índices.
 */
export async function ensureIndexes() {
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

/** Transações exigem replica set (Atlas, MongoMemoryReplSet) ou mongos. */
export async function supportsTransactions(connection = mongoose.connection) {
    const hello = await connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === "isdbgrid";
}
