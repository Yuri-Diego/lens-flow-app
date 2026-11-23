import { withTransaction } from "../db/transaction.js";
import Business from "../models/Business.js";
import User from "../models/User.js";
import { conflict, isDuplicateKeyError, notFound } from "../utils/errors.js";
import { audit } from "./auditService.js";
import { hashPassword } from "./passwordService.js";
import { toPublicUser, userAuditSnapshot } from "./userPresenter.js";

const EDITABLE_FIELDS = ["name", "role", "active"];
const NAME_COLLATION = { locale: "pt", strength: 1 };

function usernameTaken() {
    return conflict("Esse nome de usuário já está em uso.", {
        username: "Esse nome de usuário já está em uso.",
    });
}

function userNotFound() {
    return notFound("Usuário não encontrado.");
}

/** Usuários da empresa, ativos e inativos, por nome (sem distinguir acento). */
export async function listUsers(auth) {
    const users = await User.find({ business: auth.businessId })
        .sort({ name: 1, _id: 1 })
        .collation(NAME_COLLATION)
        .lean();
    const now = new Date();
    return users.map((user) => toPublicUser(user, now));
}

export async function createUser(auth, { name, username, password, role }) {
    if (await User.exists({ username })) {
        throw usernameTaken();
    }
    const passwordHash = await hashPassword(password);
    try {
        return await withTransaction(async (session) => {
            const [user] = await User.create(
                [{ business: auth.businessId, name, username, passwordHash, role }],
                { session }
            );
            await audit(
                {
                    businessId: auth.businessId,
                    actorId: auth.userId,
                    action: "user.create",
                    entity: "User",
                    entityId: user._id,
                    after: userAuditSnapshot(user),
                },
                { session }
            );
            return toPublicUser(user);
        });
    } catch (error) {
        // Dois cadastros simultâneos com o mesmo usuário: o índice único barra.
        if (isDuplicateKeyError(error)) {
            throw usernameTaken();
        }
        throw error;
    }
}

/**
 * Edita nome, perfil e ativo (RN-13). Ninguém desativa a si mesmo, e a empresa
 * nunca fica sem admin ativo: desativar ou rebaixar o último admin dá 409.
 * Desativar encerra as sessões do usuário.
 */
export async function updateUser(auth, userId, changes) {
    return withTransaction(async (session) => {
        const user = await User.findOne({ _id: userId, business: auth.businessId })
            .session(session)
            .lean();
        if (!user) {
            throw userNotFound();
        }

        const before = {};
        const after = {};
        for (const field of EDITABLE_FIELDS) {
            if (changes[field] !== undefined && changes[field] !== user[field]) {
                before[field] = user[field];
                after[field] = changes[field];
            }
        }
        if (Object.keys(after).length === 0) {
            return toPublicUser(user);
        }

        if (after.active === false && String(user._id) === auth.userId) {
            throw conflict("Você não pode desativar o seu próprio usuário.");
        }

        const losesAdmin =
            user.role === "admin" &&
            user.active &&
            (after.active === false || (after.role !== undefined && after.role !== "admin"));
        if (losesAdmin) {
            // Escreve na empresa para duas mudanças simultâneas de admins
            // entrarem em conflito (a segunda é refeita e vê a primeira).
            await Business.updateOne(
                { _id: auth.businessId },
                { $inc: { adminRevision: 1 } },
                { session }
            );
            const otherActiveAdmins = await User.countDocuments({
                business: auth.businessId,
                role: "admin",
                active: true,
                _id: { $ne: user._id },
            }).session(session);
            if (otherActiveAdmins === 0) {
                throw conflict(
                    "A empresa precisa de pelo menos um administrador ativo. Promova outra pessoa antes."
                );
            }
        }

        const update = { $set: after };
        if (after.active === false) {
            update.$inc = { sessionVersion: 1 };
        }
        const updated = await User.findOneAndUpdate({ _id: user._id }, update, {
            new: true,
            runValidators: true,
            session,
        }).lean();
        await audit(
            {
                businessId: auth.businessId,
                actorId: auth.userId,
                action: "user.update",
                entity: "User",
                entityId: user._id,
                before,
                after,
            },
            { session }
        );
        return toPublicUser(updated);
    });
}

/**
 * Redefine a senha (RN-13): encerra todas as sessões do usuário e tira o
 * bloqueio por senhas erradas, se houver. Devolve o usuário atualizado para o
 * controller renovar o cookie quando o admin redefine a própria senha.
 */
export async function resetPassword(auth, userId, { password }) {
    const passwordHash = await hashPassword(password);
    return withTransaction(async (session) => {
        const updated = await User.findOneAndUpdate(
            { _id: userId, business: auth.businessId },
            {
                $set: { passwordHash, failedLogins: 0, lockedUntil: null },
                $inc: { sessionVersion: 1 },
            },
            { new: true, session }
        ).lean();
        if (!updated) {
            throw userNotFound();
        }
        await audit(
            {
                businessId: auth.businessId,
                actorId: auth.userId,
                action: "user.reset_password",
                entity: "User",
                entityId: updated._id,
            },
            { session }
        );
        return updated;
    });
}
