import express from "express";
import {
  createTradeDebtor,
  getAllTradeDebtors,
  getTradeDebtorById,
  updateTradeDebtor,
  deleteTradeDebtor,
  hardDeleteTradeDebtor,
  toggleTradeDebtorStatus,
  getActiveDebtorsList,
  searchDebtors,
  getDebtorStatistics,
  bulkUpdateStatus,
  bulkDeleteDebtors,
  generateAcCode,
} from "../../controllers/modules/accountTypeController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { tradeDebtorUploadHandler } from "../../utils/fileUpload.js";

const router = express.Router();


router.use(authenticateToken);

// GET routes
router.get("/", getAllTradeDebtors);
router.get("/active", getActiveDebtorsList);
router.get("/search", searchDebtors);
router.get("/statistics", getDebtorStatistics);
router.get("/:id", getTradeDebtorById);
router.get("/generate-code/:accountModeId", generateAcCode);
router.post(
  "/",
  tradeDebtorUploadHandler({
    useLocalStorage: false,
    maxFileSize: 50 * 1024 * 1024,
  }),
  createTradeDebtor
);
router.post("/bulk-update-status", bulkUpdateStatus);
router.post("/bulk-delete", bulkDeleteDebtors);
// PUT routes
router.put(
  "/:id",
  tradeDebtorUploadHandler({
    useLocalStorage: false,
    maxFileSize: 50 * 1024 * 1024,
  }),
  updateTradeDebtor
);
router.put("/:id/toggle-status", toggleTradeDebtorStatus);
// DELETE routes
// router.delete("/:id", deleteTradeDebtor);
router.delete("/:id", hardDeleteTradeDebtor);
router.delete("/:id/hard-delete", hardDeleteTradeDebtor);

export default router;
