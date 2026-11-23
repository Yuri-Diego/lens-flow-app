import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { clearSessionCookie, SESSION_COOKIE, verifySession } from "../services/sessionService.js";
import { forbidden, unauthenticated } from "../utils/errors.js";

/**
 * Exige sessão válida (RN-01). A empresa vem sempre do token, nunca do body,
 * da query ou da URL. O usuário é relido a cada requisição: desativar, trocar
 * a senha ou mudar o perfil vale na hora, sem esperar o token vencer.
 */
export async function requireAuth(req, res, next) {
    const { config } = req.app.locals;
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
        throw unauthenticated();
    }

    let payload;
    try {
        payload = verifySession(token, config);
    } catch (error) {
        clearSessionCookie(res, config);
        throw unauthenticated(
            error instanceof jwt.TokenExpiredError
                ? "Sua sessão expirou. Entre de novo."
                : "Sua sessão não é válida. Entre de novo."
        );
    }

    const user = await User.findById(payload.sub)
        .select("business name username role active sessionVersion")
        .lean();
    if (
        !user ||
        !user.active ||
        String(user.business) !== payload.bid ||
        user.sessionVersion !== payload.ver
    ) {
        clearSessionCookie(res, config);
        throw unauthenticated("Sua sessão não é mais válida. Entre de novo.");
    }

    req.auth = {
        userId: String(user._id),
        businessId: payload.bid,
        role: user.role,
        name: user.name,
        username: user.username,
    };
    next();
}

/** Depois do requireAuth: deixa passar só os perfis dados. */
export function requireRole(...roles) {
    return function requireRoleMiddleware(req, res, next) {
        if (!req.auth || !roles.includes(req.auth.role)) {
            return next(forbidden());
        }
        return next();
    };
}
