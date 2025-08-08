import mongoose from "mongoose";
import { getBrazilianDate } from "../utils/dateUtils.js";

const movementSheetSchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // Relacionamento N:1 com Business
    createdAt: { type: Date, default: getBrazilianDate() },
    updatedAt: { type: Date, },
    movements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movement' }], // Relacionamento 1:N com Movement
});

// Middleware para atualizar updatedAt
movementSheetSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updatedAt = getBrazilianDate();
    }
    next();
});

// Middleware para updates
movementSheetSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ updatedAt: getBrazilianDate() });
    next();
});

const MovementSheet = mongoose.model('MovementSheet', movementSheetSchema);

export default MovementSheet;