import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

/**
 * Resumo dos nomes de cliente já usados (D24): um documento por nome sem
 * acento em cada empresa. `key` é o mesmo `clientNameNormalized` dos
 * serviços; `name` é a grafia do lançamento mais recente; `uses` conta os
 * serviços não excluídos com o nome; `lastUsedAt` é a hora do lançamento mais
 * recente.
 *
 * É derivado dos serviços e mantido na mesma transação do lançamento, da
 * edição do cliente e da exclusão (services/clientService.js). Não é um
 * cadastro de clientes nem tem histórico próprio: a ação de cada pessoa fica
 * no histórico do serviço. As sugestões leem só este resumo, então o custo
 * depende de quantos nomes começam com o texto, e não de quantos serviços a
 * empresa já lançou.
 */
const clientNameSchema = new mongoose.Schema(
    {
        business: { type: ObjectId, ref: "Business", required: true },
        key: { type: String, required: true },
        name: { type: String, required: true },
        uses: { type: Number, required: true, min: 1 },
        lastUsedAt: { type: Date, required: true },
    },
    { versionKey: false }
);

// Um documento por nome na empresa; é também o índice da busca pelo começo
// do nome (intervalo de prefixo em `key`).
clientNameSchema.index({ business: 1, key: 1 }, { unique: true });

const ClientName = mongoose.model("ClientName", clientNameSchema);

export default ClientName;
