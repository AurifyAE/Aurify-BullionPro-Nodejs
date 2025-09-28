import express from "express";
import ProductMasterController from "../../controllers/modules/ProductMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { validateRequest } from "../../utils/validators/validation.js";

const router = express.Router();

router.use(authenticateToken);

// ==================== COLOR ROUTES ====================
router.post(
  "/colors",
  validateRequest(["code", "description"]),
  ProductMasterController.createColor
);
router.get("/colors", ProductMasterController.getAllColors);
router.get("/colors/:id", ProductMasterController.getColorById);
router.put("/colors/:id", ProductMasterController.updateColor);
router.delete("/colors/:id", ProductMasterController.deleteColor);
router.patch(
  "/colors/:id/toggle-status",
  ProductMasterController.toggleColorStatus
);

// ==================== SIZE ROUTES ====================
router.post(
  "/sizes",
  validateRequest(["code", "description"]),
  ProductMasterController.createSize
);

router.get("/sizes", ProductMasterController.getAllSizes);

router.get("/sizes/:id", ProductMasterController.getSizeById);

router.put("/sizes/:id", ProductMasterController.updateSize);

router.delete("/sizes/:id", ProductMasterController.deleteSize);

router.patch(
  "/sizes/:id/toggle-status",
  ProductMasterController.toggleSizeStatus
);

// ==================== BRAND ROUTES ====================
router.post(
  "/brands",
  validateRequest(["code", "description"]),
  ProductMasterController.createBrand
);

router.get("/brands", ProductMasterController.getAllBrands);

router.get("/brands/:id", ProductMasterController.getBrandById);

router.put("/brands/:id", ProductMasterController.updateBrand);

router.delete("/brands/:id", ProductMasterController.deleteBrand);

router.patch(
  "/brands/:id/toggle-status",
  ProductMasterController.toggleBrandStatus
);

export default router;
