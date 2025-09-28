import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { validateRequest } from "../../utils/validators/validation.js";
import accountMasterController from "../../controllers/modules/accountMasterController.js";

const router = express.Router();

router.post('/', authenticateToken, accountMasterController.createAccount);
router.get('/', authenticateToken, accountMasterController.getAccounts);
router.get('/:id', authenticateToken, accountMasterController.getAccountById);
router.get('/logs/:id', authenticateToken, accountMasterController.getAccountLogsById);
router.put('/:id', authenticateToken, accountMasterController.updateAccount);
router.delete('/:id', authenticateToken, accountMasterController.deleteAccount);

export default router;