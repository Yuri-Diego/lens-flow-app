import * as authService from "../services/authService.js";
import { clearSessionCookie, setSessionCookie } from "../services/sessionService.js";
import { toSessionUser } from "../services/userPresenter.js";

export async function login(req, res) {
    const { config } = req.app.locals;
    const { user, business } = await authService.login(req.validated.body);
    setSessionCookie(res, user, config);
    res.json({ user: toSessionUser(user, business) });
}

/** Apaga o cookie deste aparelho. Funciona mesmo com a sessão já vencida. */
export function logout(req, res) {
    clearSessionCookie(res, req.app.locals.config);
    res.status(204).end();
}

export async function me(req, res) {
    const { user, business } = await authService.getSessionUser(req.auth);
    res.json({ user: toSessionUser(user, business) });
}

export async function changePassword(req, res) {
    const updated = await authService.changeOwnPassword(req.auth, req.validated.body);
    // As outras sessões caem; esta continua com um cookie novo.
    setSessionCookie(res, updated, req.app.locals.config);
    res.status(204).end();
}
