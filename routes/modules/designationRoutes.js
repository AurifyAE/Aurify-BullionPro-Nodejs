import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createDesignation, getAllDesignations, getDesignationById } from "../../controllers/modules/designationController.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", createDesignation);
router.get("/", getAllDesignations);
router.get("/:id", getDesignationById);


export default router;