import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { accountToAccountTransfer, openingBalanceTransfer, getFundTransfers } from '../../controllers/modules/FundTransferController.js';

const router = express.Router();
router.use(authenticateToken);

router.post('/', accountToAccountTransfer);
router.get('/', getFundTransfers);
router.post('/opening-balance', openingBalanceTransfer);

export default router;