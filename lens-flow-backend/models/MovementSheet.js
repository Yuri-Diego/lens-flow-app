import mongoose from "mongoose";

/**
 * A folha do dia (RN-06). Não guarda a lista de serviços, que cresceria sem
 * limite: cada serviço aponta para a folha. O índice único impede duas folhas
 * no mesmo dia (B5).
 */
const movementSheetSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        // AAAA-MM-DD no fuso America/Sao_Paulo, calculado no servidor (T8).
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    },
    { timestamps: true }
);

movementSheetSchema.index({ business: 1, date: 1 }, { unique: true });

const MovementSheet = mongoose.model("MovementSheet", movementSheetSchema);

export default MovementSheet;
