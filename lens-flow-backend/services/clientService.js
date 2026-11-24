import mongoose from "mongoose";
import { withTransaction } from "../db/transaction.js";
import { CLIENT_SUGGESTIONS } from "../domain/clients.js";
import { escapeRegex, normalizeSearchText } from "../domain/text.js";
import Business from "../models/Business.js";
import ClientName from "../models/ClientName.js";
import Movement, { MOVEMENT_HINTS } from "../models/Movement.js";

/**
 * Sugestões de cliente (D24, R12). O cliente é a ótica, e o mesmo nome se
 * repete: o lançamento sugere os nomes já usados na empresa.
 *
 * Os nomes ficam resumidos em ClientName, um documento por nome sem acento,
 * mantido na mesma transação do lançamento, da edição do cliente e da
 * exclusão. Assim a busca, chamada a cada tecla, custa o número de nomes que
 * começam com o texto, e não o número de serviços: contar os usos na hora
 * percorreria quase todos os serviços na primeira letra ("Ó" pega quase toda
 * "Ótica"), e o custo cresceria a cada ano de dados.
 */

const EPOCH = new Date(0);

/**
 * O resumo de cada nome a partir dos serviços não excluídos: a grafia do
 * lançamento mais recente (no empate de hora, a menor grafia), quantos usos e
 * a hora do mais recente. Sem `keys`, todos os nomes da empresa.
 *
 * Usa o índice parcial MOVEMENT_HINTS.clientNames, que tem todos os campos
 * lidos: a agregação não lê documentos, e o $sort vem pronto do índice. A
 * agregação não converte tipos, então a empresa vai como ObjectId.
 */
export function clientStatsAggregation(businessId, keys) {
    const match = { business: new mongoose.Types.ObjectId(String(businessId)), deletedAt: null };
    if (keys) {
        match.clientNameNormalized = { $in: keys };
    }
    return Movement.aggregate([
        { $match: match },
        { $sort: { clientNameNormalized: 1, createdAt: -1, clientName: 1 } },
        {
            $group: {
                _id: "$clientNameNormalized",
                name: { $first: "$clientName" },
                uses: { $sum: 1 },
                lastUsedAt: { $max: "$createdAt" },
            },
        },
    ]).hint(MOVEMENT_HINTS.clientNames);
}

function summaryUpdate(row) {
    return { $set: { name: row.name, uses: row.uses, lastUsedAt: row.lastUsedAt } };
}

/**
 * Um serviço novo: soma um uso ao nome, dentro da transação do lançamento.
 * Custa uma escrita, por mais usos que o nome já tenha. A grafia passa a ser a
 * deste lançamento quando ele é o mais recente; no empate de hora, fica a
 * menor grafia, como no recálculo. Dois lançamentos simultâneos do mesmo nome
 * entram em conflito de escrita, e a transação do segundo é refeita.
 */
export async function recordClientUse(businessId, { clientName, createdAt }, { session }) {
    const lastUsedAt = { $ifNull: ["$lastUsedAt", EPOCH] };
    // $literal: um nome como "$ul" é texto, e não um campo do documento.
    const name = { $literal: clientName };
    await ClientName.updateOne(
        { business: businessId, key: normalizeSearchText(clientName) },
        [
            {
                $set: {
                    name: {
                        $switch: {
                            branches: [
                                { case: { $gt: [createdAt, lastUsedAt] }, then: name },
                                { case: { $eq: [createdAt, lastUsedAt] }, then: { $min: ["$name", name] } },
                            ],
                            default: "$name",
                        },
                    },
                    uses: { $add: [{ $ifNull: ["$uses", 0] }, 1] },
                    lastUsedAt: { $max: ["$lastUsedAt", createdAt] },
                },
            },
        ],
        { upsert: true, session }
    );
}

/**
 * Recalcula os nomes dados a partir dos serviços, dentro da transação da
 * edição do cliente ou da exclusão. Um nome sem nenhum uso sai do resumo. O
 * custo é uma chave lida por uso desses nomes, coberta pelo índice.
 */
export async function refreshClientNames(businessId, clientNames, { session }) {
    const keys = [...new Set(clientNames.map((clientName) => normalizeSearchText(clientName)))];
    const rows = await clientStatsAggregation(businessId, keys).session(session);
    const byKey = new Map(rows.map((row) => [row._id, row]));
    for (const key of keys) {
        const filter = { business: businessId, key };
        const row = byKey.get(key);
        if (row) {
            await ClientName.updateOne(filter, summaryUpdate(row), { upsert: true, session });
        } else {
            await ClientName.deleteOne(filter, { session });
        }
    }
}

/**
 * Refaz o resumo de uma empresa a partir dos serviços, numa transação. Roda na
 * subida da API, o que também preenche um banco que já tinha serviços antes
 * das sugestões, e depois dos dados de demonstração, que vão direto para o
 * banco. Devolve quantos nomes a empresa tem.
 */
export async function rebuildClientNames(businessId) {
    return withTransaction(async (session) => {
        const rows = await clientStatsAggregation(businessId).session(session);
        await ClientName.deleteMany(
            { business: businessId, key: { $nin: rows.map((row) => row._id) } },
            { session }
        );
        if (rows.length > 0) {
            await ClientName.bulkWrite(
                rows.map((row) => ({
                    updateOne: {
                        filter: { business: businessId, key: row._id },
                        update: summaryUpdate(row),
                        upsert: true,
                    },
                })),
                { session }
            );
        }
        return rows.length;
    });
}

/** Na subida da API: refaz o resumo de todas as empresas. */
export async function rebuildAllClientNames() {
    const businesses = await Business.find().select("_id").lean();
    for (const business of businesses) {
        await rebuildClientNames(business._id);
    }
}

/**
 * A consulta das sugestões, sem executar: é o que tests/indexes.test.js
 * explica. O começo do nome sem acento vira um intervalo do índice
 * {business, key}, com a expressão regular ancorada e escapada (o texto é
 * literal, S5). A ordem: mais usados, depois o uso mais recente, depois o
 * nome sem acento.
 */
export function clientSuggestionsQuery(businessId, prefix, limit) {
    return ClientName.find({ business: businessId, key: { $regex: `^${escapeRegex(prefix)}` } })
        .select("name uses lastUsedAt -_id")
        .sort({ uses: -1, lastUsedAt: -1, key: 1 })
        .limit(limit);
}

/**
 * GET /clients/suggestions: os nomes de cliente já usados na empresa que
 * começam com `q`, sem distinguir acento nem maiúscula.
 */
export async function suggestClientNames(auth, { q, limit = CLIENT_SUGGESTIONS.defaultLimit }) {
    const rows = await clientSuggestionsQuery(auth.businessId, normalizeSearchText(q), limit).lean();
    return rows.map((row) => ({ name: row.name, uses: row.uses, lastUsedAt: row.lastUsedAt }));
}
