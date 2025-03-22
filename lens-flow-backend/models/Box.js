import mongoose, { mongo } from "mongoose";

const boxSchema = new mongoose.Schema({
    number: { type: Number, required: true },
    status: { type: String, enum: ['disponível', 'ocupado'] },
    color: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
});

const Box = mongoose.model('Box', boxSchema);

export default Box;