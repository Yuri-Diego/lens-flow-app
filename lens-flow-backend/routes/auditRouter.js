import express from "express";
import * as auditController from "../controllers/auditController.js";
import { validate } from "../middlewares/validate.js";
import { listAuditQuery } from "../validation/auditSchemas.js";

/** Histórico geral (RN-13). Só admin: o requireRole fica no routes/index.js. */
const router = express.Router();

router.get("/", validate({ query: listAuditQuery }), auditController.list);

export default router;
