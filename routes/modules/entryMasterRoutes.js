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

// PDC (Post-Dated Cheque) Management Routes - must be before /:id routes
router.get('/pdc/pending', authenticateToken, entryMasterController.getPendingPDCs);
router.get('/pdc/due-today', authenticateToken, entryMasterController.getPDCsDueToday);
router.post('/pdc/:id/clear', authenticateToken, entryMasterController.clearPDC);
router.post('/pdc/:id/bounce', authenticateToken, entryMasterController.bouncePDC);

// General entry routes - must be after specific routes
router.get('/:id', authenticateToken, entryMasterController.getEntryById);
router.delete('/:id', authenticateToken, entryMasterController.deleteEntryById);
router.patch('/:id/status', authenticateToken, entryMasterController.updateStatus);

export default router;