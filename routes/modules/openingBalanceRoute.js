import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createPartyOpeningBalance, getAllPartyOpeningBalances } from "../../controllers/modules/OpeningBalanceController.js";

const router = express.Router();
router.use(authenticateToken);

router.post('/', createPartyOpeningBalance);
router.get('/', getAllPartyOpeningBalances);
// router.post('/opening-balance', openingBalanceTransfer);

export default router;