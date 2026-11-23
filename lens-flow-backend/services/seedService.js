import Business from "../models/Business.js";
import User from "../models/User.js";
import { audit } from "./auditService.js";
import { hashPassword } from "./passwordService.js";
import { userAuditSnapshot } from "./userPresenter.js";

export class SeedRefusedError extends Error {
    constructor(message) {
        super(message);
        this.name = "SeedRefusedError";
    }
}

/**
 * Cria a empresa e o primeiro admin (D2). Recusa se já houver admin ativo.
 *
 * Não usa transação, para rodar também num MongoDB sem replica set. Cada
 * passo pode ser repetido: se a execução parar no meio, rodar de novo
 * reaproveita a empresa já criada (pelo nome) e cria só o admin.
 */
export async function seedFirstAdmin({ businessName, name, username, password }) {
    const activeAdmin = await User.findOne({ role: "admin", active: true }).select("username").lean();
    if (activeAdmin) {
        throw new SeedRefusedError(
            `Já existe um administrador ativo (${activeAdmin.username}). Nada foi alterado.`
        );
    }
    if (await User.exists({ username })) {
        throw new SeedRefusedError(
            `O usuário "${username}" já existe. Escolha outro em SEED_ADMIN_USERNAME.`
        );
    }

    let business = await Business.findOne({ name: businessName }).sort({ createdAt: 1 }).lean();
    const businessCreated = !business;
    if (!business) {
        business = (await Business.create({ name: businessName })).toObject();
        await audit({
            businessId: business._id,
            actorId: null,
            action: "business.create",
            entity: "Business",
            entityId: business._id,
            after: { name: business.name },
        });
    }

    const user = await User.create({
        business: business._id,
        name,
        username,
        passwordHash: await hashPassword(password),
        role: "admin",
    });
    await audit({
        businessId: business._id,
        actorId: null,
        action: "user.create",
        entity: "User",
        entityId: user._id,
        after: userAuditSnapshot(user),
    });

    return {
        business: { id: String(business._id), name: business.name },
        businessCreated,
        user: { id: String(user._id), name: user.name, username: user.username },
    };
}
