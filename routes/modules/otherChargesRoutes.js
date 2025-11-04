
import express from "express";
import OtherChargesController from "../../controllers/modules/OtherChargesController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - POST /api/other-charges
router.post("/", OtherChargesController.createOtherCharge);

// GET ALL - GET /api/other-charges
router.get("/", OtherChargesController.getAllOtherCharges);

// GET BY ID - GET /api/other-charges/:id
router.get("/:id", OtherChargesController.getOtherChargeById);

// UPDATE - PUT /api/other-charges/:id
router.put("/:id", OtherChargesController.updateOtherCharge);

// DELETE - DELETE /api/other-charges/:id
router.delete("/:id", OtherChargesController.deleteOtherCharge);

export default router;
 