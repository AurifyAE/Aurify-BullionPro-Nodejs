import express from "express";
import {
  createCurrency,
  getAllCurrencies,
  getCurrencyById,
  updateCurrency,
  deleteCurrency,
  permanentDeleteCurrency,
  getActiveCurrencies,
  getCurrencyByCode,
} from "../../controllers/modules/CurrencyMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  validateCreateCurrency,
  validateUpdateCurrency,
  validateCurrencyId,
  validateCurrencyCode,
} from "../../utils/validators/currencyValidation.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", validateCreateCurrency, createCurrency);
router.get("/", getAllCurrencies);
router.get("/active", getActiveCurrencies);
router.get("/code/:code", validateCurrencyCode, getCurrencyByCode);
router.get("/:id", validateCurrencyId, getCurrencyById);
router.put("/:id", validateCurrencyId, validateUpdateCurrency, updateCurrency);
router.delete("/:id", validateCurrencyId, deleteCurrency);
router.delete("/:id/permanent", validateCurrencyId, permanentDeleteCurrency);

export default router;
