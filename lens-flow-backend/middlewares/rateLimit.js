import { rateLimit } from "express-rate-limit";
import { tooManyAttempts } from "../utils/errors.js";

const WINDOW_MS = 15 * 60 * 1000;

// Conta só as tentativas que falham, porque o laboratório inteiro costuma
// sair pelo mesmo IP. O bloqueio por usuário (5 erros, RN-14) é à parte, no
// authService.
export const LOGIN_FAILURES_PER_IP = 20;
export const PASSWORD_CHANGE_FAILURES_PER_USER = 10;

function respondTooMany(req, res, next) {
    const resetTime = req.rateLimit?.resetTime;
    const seconds = resetTime ? (resetTime.getTime() - Date.now()) / 1000 : WINDOW_MS / 1000;
    next(tooManyAttempts(seconds));
}

/** Limite de tentativas de login erradas por IP. Uma instância por app. */
export function createLoginLimiter() {
    return rateLimit({
        windowMs: WINDOW_MS,
        limit: LOGIN_FAILURES_PER_IP,
        skipSuccessfulRequests: true,
        standardHeaders: false,
        legacyHeaders: false,
        handler: respondTooMany,
    });
}

/** Limite de erros da senha atual na troca de senha, por usuário logado. */
export function createPasswordChangeLimiter() {
    return rateLimit({
        windowMs: WINDOW_MS,
        limit: PASSWORD_CHANGE_FAILURES_PER_USER,
        skipSuccessfulRequests: true,
        standardHeaders: false,
        legacyHeaders: false,
        keyGenerator: (req) => req.auth.userId,
        handler: respondTooMany,
    });
}
