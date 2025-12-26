import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
// import {
//     createOpeningFixing,
//     getAllOpeningFixings,
//     getOpeningFixingById,
// } from "../../controllers/modules/AccountFixingController.js";


const router = express.Router();
router.use(authenticateToken);

// router.post("/", createAccountFixing);
// router.get("/", getAllAccountFixings);
// router.get("/:id", getAccountFixingById);

export default router;
