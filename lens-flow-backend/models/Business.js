import mongoose from "mongoose";

/** A empresa (o laboratório), dona de todos os dados (D10). */
const businessSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        // Campo técnico: toda mudança que pode tirar um admin ativo incrementa
        // este contador na mesma transação. Duas mudanças simultâneas entram
        // em conflito de escrita e a segunda é refeita já vendo a primeira,
        // então a empresa nunca fica sem admin (RN-13).
        adminRevision: { type: Number, default: 0, select: false },
    },
    { timestamps: true }
);

const Business = mongoose.model("Business", businessSchema);

export default Business;
