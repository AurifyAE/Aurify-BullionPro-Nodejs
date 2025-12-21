import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createPartyOpeningBalance } from '../../controllers/modules/OpeningBalanceController.js';

const router = express.Router();
router.use(authenticateToken);

router.post('/', createPartyOpeningBalance);
// router.get('/', getFundTransfers);
// router.post('/opening-balance', openingBalanceTransfer);

export default router;