import express from 'express';
import movementController from '../controllers/movementController.js';
const router = express.Router();

router.get("/", movementController.getAllMovements);
router.get("/box/:number", movementController.getMovementsByBoxNumber);
router.post("/", movementController.create);
router.put("/:id", movementController.update);
router.put("/status/:id", movementController.updateStatusMovement);
router.put("/box/:id", movementController.updateBoxMovement);
router.delete("/:id", movementController.delete);

export default router;