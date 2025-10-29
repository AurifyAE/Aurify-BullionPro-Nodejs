import express from "express";
import BranchMasterController from "../../controllers/modules/BranchMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { uploadSingle } from "../../utils/fileUpload.js";

const router = express.Router();

router.use(authenticateToken);

const logoUpload = uploadSingle("logo", false); // field: logo, S3 = true (false = local for dev)

router.post(
  "/",
  logoUpload,
  BranchMasterController.createBranch
);

router.get("/", BranchMasterController.getAllBranches);
router.get("/:id", BranchMasterController.getBranchById);

router.put("/:id", logoUpload, BranchMasterController.updateBranch);

router.delete("/:id", BranchMasterController.deleteBranch);

router.patch("/:id/toggle-status", BranchMasterController.toggleBranchStatus);

export default router;
