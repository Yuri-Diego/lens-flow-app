import mongoose from "mongoose";
import { BOX_CATEGORY_KEYS, BOX_COLOR_KEYS } from "../domain/boxColors.js";
import { MOVEMENT_STATUSES } from "../domain/enums.js";

const { ObjectId } = mongoose.Schema.Types;

/**
 * O serviço lançado numa caixa (seção 8 da especificação). As rotas chegam na
 * F3; na F2 o model já existe para a caixa apontar o serviço atual.
 */
const boxSnapshotSchema = new mongoose.Schema(
    {
        number: { type: String, required: true },
        color: { type: String, enum: BOX_COLOR_KEYS, required: true },
        category: { type: String, enum: BOX_CATEGORY_KEYS, required: true },
    },
    { _id: false }
);

const movementSchema = new mongoose.Schema(
    {
        business: { type: ObjectId, ref: "Business", required: true },
        sheet: { type: ObjectId, ref: "MovementSheet", required: true },
        sheetDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        box: { type: ObjectId, ref: "Box", required: true },
        // A caixa como estava no lançamento: o histórico não muda se a caixa
        // for renumerada ou trocar de cor depois.
        boxSnapshot: { type: boxSnapshotSchema, required: true },
        clientName: { type: String, required: true, trim: true, maxlength: 120 },
        orderService: { type: String, trim: true, maxlength: 40, default: null },
        note: { type: String, trim: true, maxlength: 500, default: null },
        status: { type: String, enum: MOVEMENT_STATUSES, default: "open" },
        createdBy: { type: ObjectId, ref: "User", required: true },
        outBy: { type: ObjectId, ref: "User", default: null },
        outAt: { type: Date, default: null },
        boxReleasedBy: { type: ObjectId, ref: "User", default: null },
        boxReleasedAt: { type: Date, default: null },
        updatedBy: { type: ObjectId, ref: "User", default: null },
        deletedBy: { type: ObjectId, ref: "User", default: null },
        deletedAt: { type: Date, default: null },
    },
    // createdAt e updatedAt automáticos (o antigo updateAt, B6, não existe mais).
    { timestamps: true }
);

// Consultas previstas na F3 (Conferência, caixa atual, OS repetida).
movementSchema.index({ business: 1, status: 1, sheetDate: 1 });
movementSchema.index({ business: 1, box: 1, status: 1 });
movementSchema.index({ business: 1, orderService: 1 });

const Movement = mongoose.model("Movement", movementSchema);

export default Movement;
