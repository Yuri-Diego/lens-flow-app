import express from 'express';
import BoxController from '../controllers/boxController.js';
const router = express.Router();

router.post("/", BoxController.create);
router.get("/", BoxController.getAllBoxes);
router.get(":number", BoxController.getBoxByNumber);
router.put("/:id", BoxController.update);
router.put("/:id/status", BoxController.updateStatusBox);
router.delete("/:id", BoxController.delete);

export default router;