import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import entryMasterController from "../../controllers/modules/EntryMasterController.js";

const router = express.Router();

router.post('/', authenticateToken, entryMasterController.createEntry);
router.put('/:id', authenticateToken, entryMasterController.editEntry);
router.get('/cash-receipts', authenticateToken, entryMasterController.getCashReceipts);
router.get('/cash-payments', authenticateToken, entryMasterController.getCashPayments);
router.get('/metal-receipts', authenticateToken, entryMasterController.getMetalReceipts);
router.get('/metal-payments', authenticateToken, entryMasterController.getMetalPayments);
router.get('/:id', authenticateToken, entryMasterController.getEntryById);
router.delete('/:id', authenticateToken, entryMasterController.deleteEntryById);
router.patch('/:id/status', authenticateToken, entryMasterController.updateStatus);
export default router;                      