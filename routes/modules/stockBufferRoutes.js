import express from "express";
import {
  createOrUpdateStockBuffer,
  getStockBufferById,
  getAllStockBuffers,
  getTodayBuffer,
  getBufferByDate,
  deactivateStockBuffer,
  deleteStockBuffer,
} from "../../controllers/modules/stockBufferController.js";
import { authenticateToken } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create or update stock buffer (daily based)
router.post("/", createOrUpdateStockBuffer);

// Get all stock buffers
router.get("/", getAllStockBuffers);

// Get today's stock buffer
router.get("/today", getTodayBuffer);

// Get buffer by date
router.get("/date/:date", getBufferByDate);

// Get stock buffer by ID
router.get("/:id", getStockBufferById);

// Deactivate stock buffer
router.patch("/:id/deactivate", deactivateStockBuffer);

// Delete stock buffer
router.delete("/:id", deleteStockBuffer);

export default router;

