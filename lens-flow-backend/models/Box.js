import mongoose from "mongoose";
import { getBrazilianDate } from "../utils/dateUtils.js";

const boxSchema = new mongoose.Schema({
    number: { type: String, required: true},
    color: { type: String, default: '#FFFFFF00', required: true },
    createdAt: { type: Date, default: getBrazilianDate() },
    updatedAt: { type: Date },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // Relacionamento N:1 com Business
});

// Middleware para atualizar updatedAt
boxSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updatedAt = getBrazilianDate();
    }
    next();
});

// Middleware para updates
boxSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ updatedAt: getBrazilianDate() });
    next();
});

const Box = mongoose.model('Box', boxSchema);

export default Box;