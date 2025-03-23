import express from 'express';
import BusinessController from '../controllers/businessController.js';
const router = express.Router();

router.get("/", BusinessController.getAllBusinesses);
router.get("/:id", BusinessController.getBusinessById);
router.post("/", BusinessController.create);
router.put("/:id", BusinessController.update);
router.delete("/:id", BusinessController.delete);

export default router;