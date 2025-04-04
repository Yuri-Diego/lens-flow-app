import mongoose from "mongoose";

const movementSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    orderService: { type: String, default: 'Sem OS' },
    note: { type: String, default: '' },
    status: { type: String , enum: ['finalizado', 'na surfaçagem', 'na montagem']},
    createdAt: { type: Date, default: Date.now },
    updateAt: { type: Date, },
    box: { type: mongoose.Schema.Types.ObjectId, ref: 'Box', required: true }, // Relacionamento N:1 com Box
    movementSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'MovementSheet', required: true }, // Relacionamento N:1 com MovementSheet
});

const Movement = mongoose.model('Movement', movementSchema);

export default Movement;