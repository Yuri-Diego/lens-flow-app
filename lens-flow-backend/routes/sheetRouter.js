import express from "express";
import * as sheetController from "../controllers/sheetController.js";
import { validate } from "../middlewares/validate.js";
import { sheetItemsQuery } from "../validation/movementSchemas.js";
import { listSheetsQuery, sheetDateParams } from "../validation/sheetSchemas.js";

/** Folhas do dia (RN-06): todo logado consulta. */
const router = express.Router();

router.get("/", validate({ query: listSheetsQuery }), sheetController.list);
router.get(
    "/:date",
    validate({ params: sheetDateParams, query: sheetItemsQuery }),
    sheetController.getByDate
);

export default router;
