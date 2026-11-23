import express from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import auditRouter from "./auditRouter.js";
import { createPublicAuthRouter, createSessionAuthRouter } from "./authRouter.js";
import boxRouter from "./boxRouter.js";
import metaRouter from "./metaRouter.js";
import movementRouter from "./movementRouter.js";
import sheetRouter from "./sheetRouter.js";
import userRouter from "./userRouter.js";

export function healthCheck(req, res) {
    res.json({ status: "ok" });
}

/**
 * Rotas sob /api (T3). Só a saúde, o login e o logout ficam antes do
 * requireAuth; tudo o que é montado depois dele exige sessão (RN-01), então
 * uma rota nova nasce protegida.
 */
export function createApiRouter({ loginLimiter, passwordLimiter }) {
    const router = express.Router();

    router.get("/health", healthCheck);
    router.use("/auth", createPublicAuthRouter({ loginLimiter }));

    router.use(requireAuth);

    router.use("/auth", createSessionAuthRouter({ passwordLimiter }));
    router.use("/meta", metaRouter);
    router.use("/boxes", boxRouter);
    router.use("/sheets", sheetRouter);
    router.use("/movements", movementRouter);
    router.use("/users", requireRole("admin"), userRouter);
    router.use("/audit", requireRole("admin"), auditRouter);

    return router;
}
