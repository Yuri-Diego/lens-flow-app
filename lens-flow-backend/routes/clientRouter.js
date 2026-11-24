import express from "express";
import * as clientController from "../controllers/clientController.js";
import { validate } from "../middlewares/validate.js";
import { clientSuggestionsQuery } from "../validation/clientSchemas.js";

/** Clientes (as óticas, D24). Qualquer pessoa logada usa. */
const router = express.Router();

router.get("/suggestions", validate({ query: clientSuggestionsQuery }), clientController.suggestions);

export default router;
