import express from "express";
import CategoryMasterController from "../../controllers/modules/CategoryMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { validateRequest } from "../../utils/validators/validation.js";

const router = express.Router();

router.use(authenticateToken);

router.post(
  "/main-categories",
  validateRequest(["code", "description"]),
  CategoryMasterController.createMainCategory
);

router.get("/main-categories", CategoryMasterController.getAllMainCategories);
router.get(
  "/main-categories/:id",
  CategoryMasterController.getMainCategoryById
);
router.put("/main-categories/:id", CategoryMasterController.updateMainCategory);
router.delete(
  "/main-categories/:id",
  CategoryMasterController.deleteMainCategory
);
router.patch(
  "/main-categories/:id/toggle-status",
  CategoryMasterController.toggleMainCategoryStatus
);

// ==================== SUB CATEGORY ROUTES ====================
router.post(
  "/sub-categories",
  validateRequest(["code", "description"]),
  CategoryMasterController.createSubCategory
);

router.get("/sub-categories", CategoryMasterController.getAllSubCategories);

router.get("/sub-categories/:id", CategoryMasterController.getSubCategoryById);

router.put("/sub-categories/:id", CategoryMasterController.updateSubCategory);

router.delete(
  "/sub-categories/:id",
  CategoryMasterController.deleteSubCategory
);

router.patch(
  "/sub-categories/:id/toggle-status",
  CategoryMasterController.toggleSubCategoryStatus
);

// ==================== TYPE ROUTES ====================
router.post(
  "/types",
  validateRequest(["code", "description"]),
  CategoryMasterController.createType
);

router.get("/types", CategoryMasterController.getAllTypes);

router.get("/types/:id", CategoryMasterController.getTypeById);

router.put("/types/:id", CategoryMasterController.updateType);

router.delete("/types/:id", CategoryMasterController.deleteType);

router.patch(
  "/types/:id/toggle-status",
  CategoryMasterController.toggleTypeStatus
);

export default router;
