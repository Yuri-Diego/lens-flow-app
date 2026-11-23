import { withTransaction } from "../db/transaction.js";
import Business from "../models/Business.js";
import User from "../models/User.js";
import {
    invalidCredentials,
    tooManyAttempts,
    unauthenticated,
    validationError,
} from "../utils/errors.js";
import { audit } from "./auditService.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./passwordService.js";

// RN-14: cinco senhas erradas seguidas bloqueiam o usuário por 15 min.
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Confere usuário e senha. Usuário inexistente, senha errada e usuário
 * inativo dão o mesmo erro genérico. A partir do bloqueio, toda tentativa
 * recebe 429, mesmo com a senha certa, até o bloqueio vencer.
 *
 * Não usa transação: o login funciona também num MongoDB sem replica set.
 */
export async function login({ username, password }) {
    const user = await User.findOne({ username }).select("+passwordHash");
    if (!user) {
        await burnPasswordCheck(password);
        throw invalidCredentials();
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
        throw tooManyAttempts((user.lockedUntil.getTime() - now.getTime()) / 1000);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
        await registerFailedLogin(user, now);
        throw invalidCredentials();
    }
    if (!user.active) {
        throw invalidCredentials();
    }
    const business = await Business.findById(user.business).select("name").lean();
    if (!business) {
        throw invalidCredentials();
    }

    const loggedIn = await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: now } },
        { new: true }
    ).lean();
    return { user: loggedIn, business };
}

/**
 * Conta o erro de forma atômica. Na quinta falha seguida, bloqueia por 15 min,
 * zera o contador e registra o bloqueio no histórico. O filtro com $gte faz só
 * uma requisição aplicar o bloqueio quando várias chegam juntas.
 */
async function registerFailedLogin(user, now) {
    const counted = await User.findOneAndUpdate(
        { _id: user._id },
        { $inc: { failedLogins: 1 } },
        { new: true }
    )
        .select("+failedLogins")
        .lean();
    if (!counted || counted.failedLogins < MAX_FAILED_LOGINS) {
        return;
    }

    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    const locked = await User.findOneAndUpdate(
        { _id: user._id, failedLogins: { $gte: MAX_FAILED_LOGINS } },
        { $set: { failedLogins: 0, lockedUntil } },
        { new: true }
    ).lean();
    if (locked) {
        await audit({
            businessId: locked.business,
            actorId: null,
            action: "user.lock",
            entity: "User",
            entityId: locked._id,
            after: { lockedUntil },
        });
    }
}

export async function getSessionUser(auth) {
    const [user, business] = await Promise.all([
        User.findById(auth.userId).lean(),
        Business.findById(auth.businessId).select("name").lean(),
    ]);
    if (!user || !business) {
        throw unauthenticated();
    }
    return { user, business };
}

/**
 * Troca a própria senha. Encerra as outras sessões do usuário (a versão da
 * sessão muda); o controller emite um cookie novo para esta.
 */
export async function changeOwnPassword(auth, { currentPassword, newPassword }) {
    const user = await User.findOne({ _id: auth.userId, business: auth.businessId }).select(
        "+passwordHash"
    );
    if (!user) {
        throw unauthenticated();
    }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw validationError({ currentPassword: "Senha atual incorreta." }, "Senha atual incorreta.");
    }

    const passwordHash = await hashPassword(newPassword);
    return withTransaction(async (session) => {
        const updated = await User.findOneAndUpdate(
            { _id: user._id },
            {
                $set: { passwordHash, failedLogins: 0, lockedUntil: null },
                $inc: { sessionVersion: 1 },
            },
            { new: true, session }
        ).lean();
        await audit(
            {
                businessId: auth.businessId,
                actorId: auth.userId,
                action: "user.change_password",
                entity: "User",
                entityId: user._id,
            },
            { session }
        );
        return updated;
    });
}
