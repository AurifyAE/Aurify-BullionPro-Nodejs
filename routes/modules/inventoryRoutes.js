import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { getAllInventory, createInventory, updateInventory, getInventoryById, getAllLogs } from '../../controllers/modules/inventoryController.js';

const router = express.Router();
router.use(authenticateToken);

router.post("/", createInventory);
router.get("/logs", getAllLogs);        
router.get("/", getAllInventory);
router.put("/", updateInventory);
router.get("/:id", getInventoryById);    

export default router;