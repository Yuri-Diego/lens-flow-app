import mongoose from "mongoose";
import { BATCH_ACTIONS, UNDO_ACTIONS } from "../domain/movements.js";

const { ObjectId } = mongoose.Schema.Types;

/** Um passo aplicado pelo lote num serviço: a baixa ou a liberação, e quando. */
const stepSchema = new mongoose.Schema(
    {
        action: { type: String, enum: UNDO_ACTIONS, required: true },
        at: { type: Date, required: true },
    },
    { _id: false }
);

/**
 * Um serviço que o lote alterou. Entra aqui na mesma transação da mudança do
 * serviço, então o desfazer do lote (D9) sabe exatamente o que desfazer, mesmo
 * se o processo parar no meio do lote.
 */
const itemSchema = new mongoose.Schema(
    {
        movement: { type: ObjectId, ref: "Movement", required: true },
        steps: { type: [stepSchema], default: [] },
        undoneAt: { type: Date, default: null },
    },
    { _id: false }
);

/** Resultado de cada id pedido, na ordem pedida, para repetir a resposta (R13). */
const resultSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        ok: { type: Boolean, required: true },
        error: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { _id: false }
);

/**
 * Lote de baixas ou liberações (POST /movements/batch). O `_id` é o `batchId`
 * da resposta, usado para desfazer o lote inteiro (D9, R7).
 */
const movementBatchSchema = new mongoose.Schema(
    {
        business: { type: ObjectId, ref: "Business", required: true },
        user: { type: ObjectId, ref: "User", required: true },
        action: { type: String, enum: BATCH_ACTIONS, required: true },
        clientRequestId: { type: String, default: null },
        items: { type: [itemSchema], default: [] },
        results: { type: [resultSchema], default: [] },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Idempotência (R13): a mesma chave do mesmo usuário roda o lote uma vez só.
movementBatchSchema.index(
    { business: 1, user: 1, clientRequestId: 1 },
    { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }
);

const MovementBatch = mongoose.model("MovementBatch", movementBatchSchema);

export default MovementBatch;
