import mongoose from "mongoose";
import { BOX_CATEGORY_KEYS, BOX_COLOR_KEYS, categoryForColor } from "../domain/boxColors.js";
import { BOX_STATES } from "../domain/enums.js";

/**
 * Ordem natural do número da caixa ("2" antes de "10"). É a collation padrão
 * da coleção e dos índices, então a ordenação por número usa o índice.
 */
export const BOX_NUMBER_COLLATION = Object.freeze({ locale: "pt", numericOrdering: true });

const boxSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        // Só dígitos, sem zeros à esquerda (domain/boxNumbers.js).
        number: { type: String, required: true, match: /^[1-9]\d{0,5}$/ },
        color: { type: String, enum: BOX_COLOR_KEYS, required: true },
        // Derivada da cor (RN-04): os hooks abaixo preenchem.
        category: { type: String, enum: BOX_CATEGORY_KEYS, required: true },
        state: { type: String, enum: BOX_STATES, default: "free" },
        currentMovement: { type: mongoose.Schema.Types.ObjectId, ref: "Movement", default: null },
        active: { type: Boolean, default: true },
    },
    { timestamps: true, collation: BOX_NUMBER_COLLATION }
);

// D4: o número é único na empresa, independente da cor.
boxSchema.index({ business: 1, number: 1 }, { unique: true, collation: BOX_NUMBER_COLLATION });
boxSchema.index({ business: 1, state: 1 }, { collation: BOX_NUMBER_COLLATION });

boxSchema.pre("validate", function deriveCategory() {
    const category = categoryForColor(this.color);
    if (category) {
        this.category = category;
    }
});

boxSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function deriveCategory() {
    const update = this.getUpdate() ?? {};
    const color = update.$set?.color ?? update.color;
    const category = categoryForColor(color);
    if (category) {
        this.set("category", category);
    }
});

const Box = mongoose.model("Box", boxSchema);

export default Box;
