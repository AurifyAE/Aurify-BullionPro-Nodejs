import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
    createAccountFixing,
    getAllAccountFixings,
    getAccountFixingById,
    updateAccountFixing,
    deleteAccountFixing
} from "../../controllers/modules/AccountFixingController.js";



const router = express.Router();
router.use(authenticateToken);

router.post("/", createAccountFixing);
router.get("/", getAllAccountFixings);
router.get("/:id", getAccountFixingById);
router.put("/:id", updateAccountFixing);
router.delete("/:id", deleteAccountFixing);



export default router;
