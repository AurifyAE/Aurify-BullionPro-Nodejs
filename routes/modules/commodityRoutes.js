import { Router } from "express";
import CommodityController from "../../controllers/modules/CommodityController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = Router();

router.use(authenticateToken);

router.post("/", CommodityController.createCommodity);
router.get("/", CommodityController.getAllCommodities);
router.get("/:id", CommodityController.getCommodityById);
router.put("/:id", CommodityController.updateCommodity);
router.delete("/:id", CommodityController.deleteCommodity);

export default router;


