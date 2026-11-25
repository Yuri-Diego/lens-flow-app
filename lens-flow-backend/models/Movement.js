import mongoose from "mongoose";
import { BOX_CATEGORY_KEYS, BOX_COLOR_KEYS } from "../domain/boxColors.js";
import { boxNumberSortKey } from "../domain/boxNumbers.js";
import { MOVEMENT_STATUSES } from "../domain/enums.js";
import { normalizeOrderService, normalizeSearchText } from "../domain/text.js";

const { ObjectId } = mongoose.Schema.Types;

/**
 * A caixa em que o serviço está (ou estava), como ela era quando o serviço
 * entrou nela: no lançamento, na troca de caixa (RN-12) ou ao desfazer a
 * liberação. O serviço não muda se a caixa for renumerada ou trocar de cor
 * depois de liberada. A caixa do lançamento fica no histórico.
 */
const boxSnapshotSchema = new mongoose.Schema(
    {
        number: { type: String, required: true },
        color: { type: String, enum: BOX_COLOR_KEYS, required: true },
        category: { type: String, enum: BOX_CATEGORY_KEYS, required: true },
    },
    { _id: false }
);

/** Campos derivados da caixa, gravados para ordenar no banco com índice. */
export function boxPlacement(box) {
    return {
        boxSnapshot: { number: box.number, color: box.color, category: box.category },
        // RN-10: a caixa vermelha (urgente) vem primeiro e sobe um nível de atraso (D15).
        urgent: box.category === "urgent",
        // Ordem natural do número ("2" antes de "10"), comparável como texto.
        boxSortKey: boxNumberSortKey(box.number),
    };
}

/** O serviço lançado numa caixa (seção 8 da especificação). */
const movementSchema = new mongoose.Schema(
    {
        business: { type: ObjectId, ref: "Business", required: true },
        sheet: { type: ObjectId, ref: "MovementSheet", required: true },
        // AAAA-MM-DD da folha do lançamento, no fuso America/Sao_Paulo (T8).
        sheetDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        box: { type: ObjectId, ref: "Box", required: true },
        boxSnapshot: { type: boxSnapshotSchema, required: true },
        urgent: { type: Boolean, required: true },
        boxSortKey: { type: String, required: true },
        clientName: { type: String, required: true, trim: true, maxlength: 120 },
        // Sem acento e em minúsculas, para a busca por prefixo ou trecho (R9).
        clientNameNormalized: { type: String, required: true },
        // Como foi digitada: é o que a API devolve.
        orderService: { type: String, trim: true, maxlength: 40, default: null },
        // A mesma OS sem distinguir maiúsculas, para a busca, o filtro e o aviso
        // de OS repetida (D26). Null sem OS.
        orderServiceNormalized: { type: String, default: null },
        note: { type: String, trim: true, maxlength: 500, default: null },
        status: { type: String, enum: MOVEMENT_STATUSES, default: "open" },
        createdBy: { type: ObjectId, ref: "User", required: true },
        outBy: { type: ObjectId, ref: "User", default: null },
        outAt: { type: Date, default: null },
        boxReleasedBy: { type: ObjectId, ref: "User", default: null },
        boxReleasedAt: { type: Date, default: null },
        updatedBy: { type: ObjectId, ref: "User", default: null },
        // Exclusão lógica (RN-11): some das listas e continua no histórico.
        deletedBy: { type: ObjectId, ref: "User", default: null },
        deletedAt: { type: Date, default: null },
        // Chave de idempotência do lançamento (R13), gerada pelo web por tentativa.
        clientRequestId: { type: String, default: null },
    },
    // createdAt e updatedAt automáticos (o antigo updateAt, B6, não existe mais).
    { timestamps: true }
);

movementSchema.pre("validate", function deriveFields() {
    if (this.boxSnapshot?.number && this.boxSnapshot?.category) {
        const { urgent, boxSortKey } = boxPlacement(this.boxSnapshot);
        this.urgent = urgent;
        this.boxSortKey = boxSortKey;
    }
    if (typeof this.clientName === "string") {
        this.clientNameNormalized = normalizeSearchText(this.clientName);
    }
    if (this.isNew || this.isModified("orderService")) {
        this.orderServiceNormalized = normalizeOrderService(this.orderService);
    }
});

// Índices das consultas (conferidos com explain em tests/indexes.test.js).
// Conferência por data e folhas; com createdAt e _id, também ordena por lançamento.
movementSchema.index({ business: 1, status: 1, sheetDate: 1, createdAt: 1, _id: 1 });
// Serviços de uma caixa.
movementSchema.index({ business: 1, box: 1, status: 1 });
// Busca por cliente (prefixo ou trecho, sem acento).
movementSchema.index({ business: 1, clientNameNormalized: 1 });
// Busca pelo número da caixa.
movementSchema.index({ business: 1, "boxSnapshot.number": 1 });
// Ordenação padrão da Conferência (RN-10): urgente, mais antigo, número natural.
movementSchema.index({ business: 1, status: 1, urgent: -1, sheetDate: 1, boxSortKey: 1, _id: 1 });
// Ordenação pelo número da caixa, seguindo a prateleira.
movementSchema.index({ business: 1, status: 1, boxSortKey: 1, _id: 1 });
// Baixas, pela hora da baixa.
movementSchema.index({ business: 1, status: 1, outAt: -1, _id: -1 });

/**
 * Índices que as contagens e os trabalhos da subida da API usam com hint. Numa
 * consulta sem ordenação, vários índices que começam por `business` empatam no
 * teste do planejador do MongoDB (todos devolvem os primeiros documentos no
 * mesmo número de passos), e ele pode escolher um que depois percorre a coleção
 * inteira.
 */
export const MOVEMENT_HINTS = Object.freeze({
    // Os serviços que seguram caixa: abertos e "saiu, caixa não liberada" (R15).
    holdingBox: Object.freeze({ business: 1, status: 1, boxReleasedAt: 1, outAt: 1, _id: 1 }),
    // A folha de um dia (contadores e lista Hoje), pela hora do lançamento.
    bySheetDate: Object.freeze({ business: 1, sheetDate: -1, createdAt: -1, _id: -1 }),
    // Os usos de cada nome de cliente sem acento, do mais recente para o mais
    // antigo: o recálculo do resumo das sugestões (D24, models/ClientName.js).
    clientNames: Object.freeze({ business: 1, clientNameNormalized: 1, createdAt: -1, clientName: 1 }),
    // A OS sem distinguir maiúsculas (D26): busca por OS exata ou prefixo, filtro
    // e aviso de OS repetida. Os dois últimos campos só servem para a conferência
    // da subida da API (services/orderServiceMigration.js) não ler documentos.
    orderServices: Object.freeze({ business: 1, orderServiceNormalized: 1, orderService: 1, _id: 1 }),
});
movementSchema.index(MOVEMENT_HINTS.holdingBox);
movementSchema.index(MOVEMENT_HINTS.bySheetDate);
movementSchema.index(MOVEMENT_HINTS.orderServices);
// Parcial (só os não excluídos) e com todos os campos que o recálculo lê: ele
// é respondido pelo índice, sem ler os documentos (consulta coberta).
movementSchema.index(MOVEMENT_HINTS.clientNames, {
    partialFilterExpression: { deletedAt: null },
});
// Idempotência (R13): a mesma chave do mesmo usuário lança uma vez só.
movementSchema.index(
    { business: 1, createdBy: 1, clientRequestId: 1 },
    { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }
);

const Movement = mongoose.model("Movement", movementSchema);

export default Movement;
