import express from "express";
import {
  createKarat,
  getKarats,
  getKarat,
  updateKarat,
  deleteKarat,
  getKaratsByDivision,
  bulkUpdateKaratStatus,
  toggleKaratStatus,
  permanentDeleteKarat,
  bulkPermanentDeleteKarats,
} from "../../controllers/modules/KaratMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { validateObjectId } from "../../utils/validators/DivisionValidation.js";

const router = express.Router();
router.use(authenticateToken);

router.post("/karat-add", createKarat);                                   
router.get("/karat", getKarats);                                   
router.get("/:id", validateObjectId, getKarat);                 
router.put("/:id", validateObjectId, updateKarat);               
router.delete("/:id", validateObjectId, deleteKarat);          
router.delete("/:id/permanent", validateObjectId, permanentDeleteKarat); 
router.delete("/bulk/permanent", bulkPermanentDeleteKarats);   
router.get("/division/:divisionId", validateObjectId, getKaratsByDivision); 
router.patch("/bulk-status", bulkUpdateKaratStatus);          
router.patch("/:id/toggle-status", validateObjectId, toggleKaratStatus);

export default router;
