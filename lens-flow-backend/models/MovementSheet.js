import mongoose from "mongoose";

const movementSheetSchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // Relacionamento N:1 com Business
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, },
    movements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movement' }], // Relacionamento 1:N com Movement
});

const MovementSheet = mongoose.model('MovementSheet', movementSheetSchema);

export default MovementSheet;