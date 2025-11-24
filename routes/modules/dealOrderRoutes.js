import express from "express";
import {
  createDealOrder,
  deleteDealOrder,
  getDealOrderById,
  getDealOrders,
  updateDealOrder,
  updateDealOrderStatus,
} from "../../controllers/modules/dealOrderController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

router
  .route("/")
  .post(createDealOrder)
  .get(getDealOrders);

router
  .route("/:id")
  .get(getDealOrderById)
  .put(updateDealOrder)
  .delete(deleteDealOrder);

router.patch("/:id/status", updateDealOrderStatus);

export default router;

