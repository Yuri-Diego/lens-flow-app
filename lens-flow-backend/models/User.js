import mongoose from "mongoose";
import { ROLES } from "../domain/enums.js";

const userSchema = new mongoose.Schema(
    {
        business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        // Único em todas as empresas e sempre minúsculo, então o login não
        // distingue maiúsculas.
        username: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 30,
            unique: true,
        },
        passwordHash: { type: String, required: true, select: false },
        role: { type: String, enum: ROLES, required: true },
        active: { type: Boolean, default: true },
        failedLogins: { type: Number, default: 0, select: false },
        lockedUntil: { type: Date, default: null },
        lastLoginAt: { type: Date, default: null },
        // Vai dentro do token. Trocar ou redefinir a senha e desativar o
        // usuário incrementam o número, e as sessões antigas deixam de valer.
        sessionVersion: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                delete ret.passwordHash;
                delete ret.failedLogins;
                delete ret.sessionVersion;
                return ret;
            },
        },
    }
);

// Listagem por empresa e contagem de admins ativos (RN-13).
userSchema.index({ business: 1, role: 1, active: 1 });

const User = mongoose.model("User", userSchema);

export default User;
