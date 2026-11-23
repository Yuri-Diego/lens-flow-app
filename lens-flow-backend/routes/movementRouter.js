import express from "express";
import * as movementController from "../controllers/movementController.js";
import { validate } from "../middlewares/validate.js";
import { emptyBody, emptyQuery, idParams } from "../validation/common.js";
import {
    batchBody,
    batchParams,
    changeBoxBody,
    createMovementBody,
    listMovementsQuery,
    undoBody,
    updateMovementBody,
} from "../validation/movementSchemas.js";

/**
 * Serviços (F3). Todo logado lança, confere, dá baixa e libera; as regras de
 * quem edita, exclui, troca a caixa e desfaz (RN-11) ficam no service.
 * As rotas fixas (/summary, /batch) vêm antes das que têm :id.
 */
const router = express.Router();
const noBody = { query: emptyQuery, body: emptyBody };
const byId = { params: idParams, ...noBody };

router.get("/", validate({ query: listMovementsQuery }), movementController.list);
router.get("/summary", validate({ query: emptyQuery }), movementController.summary);
router.post("/", validate({ query: emptyQuery, body: createMovementBody }), movementController.create);
router.post("/batch", validate({ query: emptyQuery, body: batchBody }), movementController.batch);
router.post(
    "/batch/:batchId/undo",
    validate({ params: batchParams, ...noBody }),
    movementController.undoBatch
);
router.get("/:id", validate({ params: idParams, query: emptyQuery }), movementController.getById);
router.patch(
    "/:id",
    validate({ params: idParams, query: emptyQuery, body: updateMovementBody }),
    movementController.update
);
router.delete("/:id", validate(byId), movementController.remove);
router.post(
    "/:id/change-box",
    validate({ params: idParams, query: emptyQuery, body: changeBoxBody }),
    movementController.changeBox
);
router.post("/:id/checkout", validate(byId), movementController.checkout);
router.post("/:id/release-box", validate(byId), movementController.releaseBox);
router.post(
    "/:id/undo",
    validate({ params: idParams, query: emptyQuery, body: undoBody }),
    movementController.undo
);

export default router;
