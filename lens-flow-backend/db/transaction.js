import mongoose from "mongoose";

/**
 * Roda `work(session)` numa transação (T6): grava tudo ou nada. É assim que a
 * mudança e o evento de auditoria entram juntos (RN-02).
 *
 * Exige MongoDB em replica set: Atlas em produção, MongoMemoryReplSet nos
 * testes. O driver repete o bloco em erro transitório (por exemplo, conflito
 * de escrita com outra transação), então `work` não deve ter efeitos fora do
 * banco.
 */
export async function withTransaction(work) {
    let result;
    await mongoose.connection.transaction(async (session) => {
        result = await work(session);
    });
    return result;
}
