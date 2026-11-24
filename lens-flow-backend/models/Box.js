import mongoose from "mongoose";
import { BOX_CATEGORY_KEYS, BOX_COLOR_KEYS, categoryForColor } from "../domain/boxColors.js";
import { BOX_STATES } from "../domain/enums.js";

/**
 * Comparação de texto exata, byte a byte (D18): "007" e "7" são caixas
 * diferentes.
 *
 * Até a F2 a coleção tinha a colação numérica como padrão, e uma coleção não
 * troca de colação depois de criada. Para o comportamento não depender de
 * quando a coleção foi criada, todo índice declara a colação exata e toda
 * consulta usa a colação exata (o hook abaixo), a menos que peça outra. A ordem
 * natural da listagem é feita pela chave de domain/boxNumbers.js.
 */
const EXACT_COLLATION = Object.freeze({ locale: "simple" });

const QUERY_OPERATIONS = [
    "countDocuments",
    "deleteMany",
    "deleteOne",
    "distinct",
    "find",
    "findOne",
    "findOneAndDelete",
    "findOneAndReplace",
    "findOneAndUpdate",
    "replaceOne",
    "updateMany",
    "updateOne",
];

const boxSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        // Só dígitos, até 6, como na etiqueta (domain/boxNumbers.js).
        number: { type: String, required: true, match: /^(?!0+$)\d{1,6}$/ },
        color: { type: String, enum: BOX_COLOR_KEYS, required: true },
        // Derivada da cor (RN-04): os hooks abaixo preenchem.
        category: { type: String, enum: BOX_CATEGORY_KEYS, required: true },
        state: { type: String, enum: BOX_STATES, default: "free" },
        currentMovement: { type: mongoose.Schema.Types.ObjectId, ref: "Movement", default: null },
        // O último serviço que ocupou a caixa. Fica depois da liberação: desfazer
        // a liberação só vale se a caixa não recebeu outro serviço (RN-11).
        lastMovement: { type: mongoose.Schema.Types.ObjectId, ref: "Movement", default: null },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// D4 e D18: o número é único na empresa, independente da cor, com comparação exata.
boxSchema.index({ business: 1, number: 1 }, { unique: true, collation: EXACT_COLLATION });
boxSchema.index({ business: 1, state: 1 }, { collation: EXACT_COLLATION });

boxSchema.pre(QUERY_OPERATIONS, function useExactCollation() {
    if (!this.getOptions().collation) {
        this.collation(EXACT_COLLATION);
    }
});

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
