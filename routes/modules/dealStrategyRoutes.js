import express from "express";
import {
  createOrUpdateDealStrategy,
  getDealStrategyByDate,
  getAllDealStrategies,
  getLatestDealStrategy,
} from "../../controllers/modules/dealStrategyController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create or update deal strategy (POST for create, PUT for update - both use same endpoint)
router.post("/", createOrUpdateDealStrategy);
router.put("/", createOrUpdateDealStrategy);

// Get deal strategy by date
router.get("/date/:date", getDealStrategyByDate);

// Get latest deal strategy
router.get("/latest", getLatestDealStrategy);

// Get all deal strategies with pagination and filters
router.get("/", getAllDealStrategies);

export default router;

