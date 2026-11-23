import express from "express";
import * as boxController from "../controllers/boxController.js";
import { requireRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
    batchBoxesBody,
    createBoxBody,
    listBoxesQuery,
    updateBoxBody,
} from "../validation/boxSchemas.js";
import { emptyQuery, idParams } from "../validation/common.js";

/** Caixas: todo logado consulta; só admin cadastra e edita. */
const router = express.Router();
const adminOnly = requireRole("admin");

router.get("/", validate({ query: listBoxesQuery }), boxController.list);
router.get("/:id", validate({ params: idParams, query: emptyQuery }), boxController.getById);
router.post("/", adminOnly, validate({ query: emptyQuery, body: createBoxBody }), boxController.create);
router.post(
    "/batch",
    adminOnly,
    validate({ query: emptyQuery, body: batchBoxesBody }),
    boxController.createBatch
);
router.patch(
    "/:id",
    adminOnly,
    validate({ params: idParams, query: emptyQuery, body: updateBoxBody }),
    boxController.update
);

export default router;
