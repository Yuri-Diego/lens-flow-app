import express from "express";
import * as userController from "../controllers/userController.js";
import { validate } from "../middlewares/validate.js";
import { emptyQuery, idParams } from "../validation/common.js";
import { createUserBody, resetPasswordBody, updateUserBody } from "../validation/userSchemas.js";

/** Gestão de usuários (RN-13). Só admin: o requireRole fica no routes/index.js. */
const router = express.Router();

router.get("/", validate({ query: emptyQuery }), userController.list);
router.post("/", validate({ query: emptyQuery, body: createUserBody }), userController.create);
router.patch(
    "/:id",
    validate({ params: idParams, query: emptyQuery, body: updateUserBody }),
    userController.update
);
router.post(
    "/:id/reset-password",
    validate({ params: idParams, query: emptyQuery, body: resetPasswordBody }),
    userController.resetPassword
);

export default router;
