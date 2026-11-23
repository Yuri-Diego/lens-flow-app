import mongoose from "mongoose";

export const AUDIT_ENTITIES = Object.freeze([
    "Business",
    "User",
    "Box",
    "MovementSheet",
    "Movement",
]);

/**
 * Histórico de quem fez o quê (RN-02). Somente inserção: os hooks abaixo
 * recusam qualquer alteração ou exclusão feita pelo Mongoose.
 */
const auditEventSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        // null quando a ação é do sistema (seed, bloqueio automático do login).
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        action: { type: String, required: true },
        entity: { type: String, enum: AUDIT_ENTITIES, required: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after: { type: mongoose.Schema.Types.Mixed, default: null },
        at: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

// Linha do tempo de um registro (detalhe do serviço).
auditEventSchema.index({ business: 1, entityId: 1, at: -1 });
// Histórico geral (GET /audit), do mais recente, com _id para desempatar o cursor.
auditEventSchema.index({ business: 1, at: -1, _id: -1 });
auditEventSchema.index({ business: 1, user: 1, at: -1, _id: -1 });
auditEventSchema.index({ business: 1, entity: 1, at: -1, _id: -1 });

function rejectChange() {
    throw new Error("O histórico é somente inserção (RN-02).");
}

auditEventSchema.pre(
    [
        "updateOne",
        "updateMany",
        "findOneAndUpdate",
        "findOneAndReplace",
        "replaceOne",
        "deleteOne",
        "deleteMany",
        "findOneAndDelete",
    ],
    { document: false, query: true },
    rejectChange
);
auditEventSchema.pre(["updateOne", "deleteOne"], { document: true, query: false }, rejectChange);
auditEventSchema.pre("save", function rejectUpdateOnSave() {
    if (!this.isNew) {
        rejectChange();
    }
});

const AuditEvent = mongoose.model("AuditEvent", auditEventSchema);

export default AuditEvent;
