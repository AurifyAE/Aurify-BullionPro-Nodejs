import { Router } from "express";
import { SalesmanController } from "../../controllers/modules/SalesManController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = Router();
router.use(authenticateToken);
router.post("/", SalesmanController.createSalesman);
router.get("/", SalesmanController.getAllSalesmen);
router.get("/:id", SalesmanController.getSalesmanById);
router.put("/:id", SalesmanController.updateSalesman);
router.delete("/:id", SalesmanController.deleteSalesman);

export default router;