import express from 'express';
import movementSheetController from '../controllers/movementSheetController.js';
const router = express.Router();

router.get("/", movementSheetController.getAll);
router.get("/:id", movementSheetController.getById);
router.get('/today/:businessId', movementSheetController.getTodayMovements);
router.post("/", movementSheetController.create);
router.delete("/:id", movementSheetController.delete);

export default router;