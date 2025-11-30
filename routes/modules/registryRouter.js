import express from "express";
import {
  createRegistry,
  getAllRegistries,
  getRegistryById,
  updateRegistry,
  deleteRegistry,
  permanentDeleteRegistry,
  getRegistriesByType,
  getRegistryStatistics,
  updateRegistryStatus,
  getRegistriesByCostCenter,
  getRegistryBalance,
  getRegistryStockBalance,
  getRegistryPremiumDiscount,
  getMakingChargesRegistries,
  getRegistriesByPartyId,
  getPremiumOrDiscountRegistries,
  getStatementByParty,
  getRegistryAuditTrailById,
  getRegistryHedgeAuditTrailById,
  getRegistryFixingTransaction,
} from "../../controllers/modules/RegistryController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  validateObjectId,
  validatePagination,
  validateDateRange,
  validateRegistryCreate,
  validateRegistryUpdate,
  validateRequiredFields,
  validateEnum,
} from "../../utils/validators/RegistryValidation.js";

const router = express.Router();

router.use(authenticateToken);

// Create new registry entry
router.post("/", validateRegistryCreate, createRegistry);

// Get all registries with filters and search
router.get("/", getAllRegistries);

// Get registry statistics
router.get("/statistics", validateDateRange, getRegistryStatistics);

// get registy for the premium and discount
router.get("/get-premium-discount", getPremiumOrDiscountRegistries);

// getting registry for stock_balance
router.get("/get-stock-balance", getRegistryStockBalance);

// getting registry for making_charge
router.get("/get-making-charge", getMakingChargesRegistries);

router.get("/premium-discount", getRegistryPremiumDiscount);

// getting registries by party Id
router.get("/get-by-party/:partyId", getRegistriesByPartyId);

// Get balance for cost center
router.get("/balance/:costCenter", getRegistryBalance);
router.get("/statement/:partyId", getStatementByParty);
// Get registries by type
router.get(
  "/type/:type",
  validatePagination,
  validateDateRange,
  getRegistriesByType
);

// Get registries by cost center
router.get(
  "/cost-center/:costCenter",
  validatePagination,
  validateDateRange,
  getRegistriesByCostCenter
);

// Get registry by ID
router.get("/:id", validateObjectId("id"), getRegistryById);

// Update registry
router.put(
  "/:id",
  validateObjectId("id"),
  validateRegistryUpdate,
  updateRegistry
);

// Update registry status only
router.patch(
  "/:id/status",
  validateObjectId("id"),
  validateRequiredFields(["status"]),
  validateEnum("status", ["pending", "completed", "cancelled"]),
  updateRegistryStatus
);

// Soft delete registry
router.delete(
  "/:id",
  validateObjectId("id"),
  authenticateToken,
  deleteRegistry
);

// Permanent delete registry
router.delete(
  "/:id/permanent",
  validateObjectId("id"),
  permanentDeleteRegistry
);


//AuditTrail
router.get("/transaction/:metalTransactionId", getRegistryAuditTrailById);
router.get("/Hedge/:metalTransactionId", getRegistryHedgeAuditTrailById);
router.get("/fixing/:fixingTransactionId", getRegistryFixingTransaction);
export default router;
