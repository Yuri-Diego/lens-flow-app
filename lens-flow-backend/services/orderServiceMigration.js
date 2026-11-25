import { normalizeOrderService } from "../domain/text.js";
import Business from "../models/Business.js";
import Movement, { MOVEMENT_HINTS } from "../models/Movement.js";

/**
 * A OS normalizada (D26) dos serviços que já estavam no banco. Os gravados por
 * uma versão anterior da API não têm o campo, e uma OS mudada por ela, ou
 * direto no banco, deixa o campo desatualizado. Roda a cada subida da API,
 * depois dos índices e antes de responder: a busca, o filtro e o aviso de OS
 * repetida valem para todos os serviços, sem passo manual.
 *
 * O que falta é achado pelos dados, sem marca de "já migrado", e cada serviço é
 * gravado sozinho. Se a API cair no meio, a próxima subida continua de onde
 * parou, e rodar de novo não muda nada. Sem transação, também roda sem replica
 * set. Grava pelo driver, para não mexer no `updatedAt`: ninguém editou o
 * serviço.
 */

const PARALLEL_PARTS = 4;
const BATCH_SIZE = 1_000;

// Só ASCII visível, sem espaço nas pontas. O $toLower do banco só conhece
// ASCII: nessas OS, e só nelas, ele dá o mesmo que normalizeOrderService.
const PLAIN_ORDER_SERVICE = "^[!-~]([ -~]*[!-~])?\\z";

// A hora do lançamento em milissegundos, ou 0 se ela faltar ou não for data.
const CREATED_AT_MS = { $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 } };

/**
 * Uma parte dos serviços com OS simples que ainda não têm o campo. As partes são
 * disjuntas: o resto da divisão da hora do lançamento.
 */
export function missingPartFilter(businessId, part) {
    return {
        business: businessId,
        orderServiceNormalized: null,
        orderService: { $regex: PLAIN_ORDER_SERVICE },
        $expr: { $eq: [{ $mod: [CREATED_AT_MS, PARALLEL_PARTS] }, part] },
    };
}

/**
 * Preenche, no próprio banco, as OS simples que faltam: o grosso de um banco
 * antigo. As partes vão ao mesmo tempo, o que leva cerca de um quarto do tempo
 * de uma atualização só. Com o hint, cada uma lê só as chaves do que falta: num
 * banco em dia, nenhuma.
 */
async function fillMissing(businessId) {
    const results = await Promise.all(
        Array.from({ length: PARALLEL_PARTS }, (_, part) =>
            Movement.collection.updateMany(
                missingPartFilter(businessId, part),
                [{ $set: { orderServiceNormalized: { $toLower: "$orderService" } } }],
                { hint: MOVEMENT_HINTS.orderServices }
            )
        )
    );
    return results.reduce((total, { modifiedCount }) => total + modifiedCount, 0);
}

/**
 * Os pares de OS digitada e OS normalizada de uma empresa, sem executar: é o que
 * tests/indexes.test.js explica. O índice do hint tem todos os campos lidos, e
 * a consulta não lê documentos.
 */
export function orderServicePairsQuery(businessId) {
    return Movement.collection.find(
        { business: businessId },
        {
            projection: { orderService: 1, orderServiceNormalized: 1 },
            hint: MOVEMENT_HINTS.orderServices,
        }
    );
}

/**
 * Confere todos os serviços com a regra do domínio e corrige os que não batem:
 * as OS com acento, que o banco não sabe comparar, e os campos desatualizados.
 */
async function fixMismatches(businessId) {
    let fixed = 0;
    let updates = [];
    const flush = async () => {
        if (updates.length === 0) {
            return;
        }
        const { modifiedCount } = await Movement.collection.bulkWrite(updates, { ordered: false });
        fixed += modifiedCount;
        updates = [];
    };

    for await (const { _id, orderService, orderServiceNormalized } of orderServicePairsQuery(businessId)) {
        const expected = normalizeOrderService(orderService);
        if ((orderServiceNormalized ?? null) === expected) {
            continue;
        }
        updates.push({
            updateOne: {
                // Só se a OS ainda for a que foi lida: uma edição feita no meio já
                // gravou a normalizada certa.
                filter: { _id, orderService: orderService ?? null },
                update: { $set: { orderServiceNormalized: expected } },
            },
        });
        if (updates.length === BATCH_SIZE) {
            await flush();
        }
    }
    await flush();
    return fixed;
}

/** Na subida da API: deixa a OS normalizada certa em todos os serviços e devolve quantos mudou. */
export async function migrateOrderServices() {
    let changed = 0;
    for (const { _id } of await Business.find().select("_id").lean()) {
        changed += await fillMissing(_id);
        changed += await fixMismatches(_id);
    }
    return changed;
}
