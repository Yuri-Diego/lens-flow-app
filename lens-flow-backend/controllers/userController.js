import { setSessionCookie } from "../services/sessionService.js";
import * as userService from "../services/userService.js";

export async function list(req, res) {
    res.json({ users: await userService.listUsers(req.auth) });
}

export async function create(req, res) {
    const user = await userService.createUser(req.auth, req.validated.body);
    res.status(201).json({ user });
}

export async function update(req, res) {
    const user = await userService.updateUser(req.auth, req.validated.params.id, req.validated.body);
    res.json({ user });
}

export async function resetPassword(req, res) {
    const updated = await userService.resetPassword(
        req.auth,
        req.validated.params.id,
        req.validated.body
    );
    // Redefinir encerra as sessões do usuário; se for o próprio admin, esta
    // sessão continua com um cookie novo.
    if (String(updated._id) === req.auth.userId) {
        setSessionCookie(res, updated, req.app.locals.config);
    }
    res.status(204).end();
}
