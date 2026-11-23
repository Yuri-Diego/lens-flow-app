import express from "express";
import * as metaController from "../controllers/metaController.js";
import { validate } from "../middlewares/validate.js";
import { emptyQuery } from "../validation/common.js";

const router = express.Router();

router.get("/box-colors", validate({ query: emptyQuery }), metaController.boxColors);

export default router;
