import mongoose from "mongoose";
import { getBrazilianDate } from "../utils/dateUtils.js";

const movementSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    orderService: { type: String, default: 'Sem OS' },
    note: { type: String, default: '' },
    status: { type: String , enum: ['finalizado', 'na surfaçagem', 'na montagem']},
    createdAt: { type: Date, default: getBrazilianDate() },
    updateAt: { type: Date, },
    box: { type: mongoose.Schema.Types.ObjectId, ref: 'Box', required: true }, // Relacionamento N:1 com Box
    movementSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'MovementSheet', required: true }, // Relacionamento N:1 com MovementSheet
});

// Middleware para atualizar updatedAt
movementSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updatedAt = getBrazilianDate();
    }
    next();
});

// Middleware para updates
movementSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ updatedAt: getBrazilianDate() });
    next();
});

const Movement = mongoose.model('Movement', movementSchema);

export default Movement;