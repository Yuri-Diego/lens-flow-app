import mongoose from "mongoose";

const boxSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: ['disponivel', 'ocupado'] },
    color: { type: String, default: '#FFFFFF00', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
});

const Box = mongoose.model('Box', boxSchema);

export default Box;