import express from "express";
import * as userController from "../controllers/userController.js";
import { validate } from "../middlewares/validate.js";
import { emptyQuery } from "../validation/common.js";

/**
 * Opções de usuários (id, nome e ativo) para os filtros das telas, como
 * "Quem deu baixa". Qualquer pessoa logada usa.
 *
 * Fica montado em /users antes do router de gestão, que tem o
 * requireRole("admin") no routes/index.js. Não ponha rota de gestão aqui:
 * ela ficaria aberta para o operador.
 */
const router = express.Router();

router.get("/options", validate({ query: emptyQuery }), userController.options);

export default router;
