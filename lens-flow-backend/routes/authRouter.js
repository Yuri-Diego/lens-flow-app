import express from "express";
import * as authController from "../controllers/authController.js";
import { validate } from "../middlewares/validate.js";
import { changePasswordBody, loginBody } from "../validation/authSchemas.js";
import { emptyQuery } from "../validation/common.js";

/** Rotas públicas: entrar e sair. */
export function createPublicAuthRouter({ loginLimiter }) {
    const router = express.Router();
    router.post(
        "/login",
        loginLimiter,
        validate({ query: emptyQuery, body: loginBody }),
        authController.login
    );
    router.post("/logout", authController.logout);
    return router;
}

/** Rotas da sessão atual. Montadas depois do requireAuth. */
export function createSessionAuthRouter({ passwordLimiter }) {
    const router = express.Router();
    router.get("/me", validate({ query: emptyQuery }), authController.me);
    router.patch(
        "/password",
        passwordLimiter,
        validate({ query: emptyQuery, body: changePasswordBody }),
        authController.changePassword
    );
    return router;
}
