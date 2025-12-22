import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import EntryService from "../../services/modules/EntryService.js";
import PDCCronService from "../../services/modules/PDCCronService.js";

const router = express.Router();

/**
 * Manual trigger for PDC maturity processing (for testing/admin)
 * POST /api/pdc/process-matured
 */
router.post(
  "/process-matured",
  authenticateToken,
  async (req, res) => {
    try {
      const results = await PDCCronService.processMaturedPDCs(req.admin.id);
      res.json({
        success: true,
        message: "PDC maturity processing completed",
        data: results,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

/**
 * Cancel a PDC transaction
 * POST /api/pdc/:entryId/:cashItemIndex/cancel
 */
router.post(
  "/:entryId/:cashItemIndex/cancel",
  authenticateToken,
  async (req, res) => {
    try {
      const { entryId, cashItemIndex } = req.params;
      const entry = await EntryService.cancelPDC(
        entryId,
        parseInt(cashItemIndex),
        req.admin.id
      );
      res.json({
        success: true,
        message: "PDC cancelled successfully",
        data: entry,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

export default router;

