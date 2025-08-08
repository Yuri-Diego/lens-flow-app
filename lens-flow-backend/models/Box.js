import mongoose from "mongoose";

const boxSchema = new mongoose.Schema({
    number: { type: String, required: true},
    color: { type: String, default: '#FFFFFF00', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }, // Relacionamento N:1 com Business
});

const Box = mongoose.model('Box', boxSchema);

export default Box;