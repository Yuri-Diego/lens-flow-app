import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "lf_session";
// RN-14: a sessão expira em 12 h.
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const COOKIE_PATH = "/api";
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Token da sessão: usuário (sub), empresa (bid) e versão da sessão (ver). */
export function signSession(user, config) {
    return jwt.sign(
        { bid: String(user.business), ver: user.sessionVersion ?? 0 },
        config.jwtSecret,
        { algorithm: "HS256", subject: String(user._id), expiresIn: SESSION_TTL_SECONDS }
    );
}

/** Lança erro se o token for inválido, vencido ou malformado. */
export function verifySession(token, config) {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (
        typeof payload !== "object" ||
        !OBJECT_ID.test(payload.sub ?? "") ||
        !OBJECT_ID.test(payload.bid ?? "") ||
        !Number.isInteger(payload.ver)
    ) {
        throw new jwt.JsonWebTokenError("sessão malformada");
    }
    return payload;
}

function cookieOptions(config) {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
        path: COOKIE_PATH,
    };
}

export function setSessionCookie(res, user, config) {
    res.cookie(SESSION_COOKIE, signSession(user, config), {
        ...cookieOptions(config),
        maxAge: SESSION_TTL_SECONDS * 1000,
    });
}

export function clearSessionCookie(res, config) {
    res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}
