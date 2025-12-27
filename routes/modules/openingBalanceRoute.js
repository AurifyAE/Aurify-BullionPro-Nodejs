import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createPartyOpeningBalance, getAllPartyOpeningBalances, updateOpeningBalance } from "../../controllers/modules/OpeningBalanceController.js";

const router = express.Router();
router.use(authenticateToken);

router.post('/add', createPartyOpeningBalance);
router.put('/voucher/:VoucherID', updateOpeningBalance);
router.get('/', getAllPartyOpeningBalances);
// router.post('/opening-balance', openingBalanceTransfer);

export default router;