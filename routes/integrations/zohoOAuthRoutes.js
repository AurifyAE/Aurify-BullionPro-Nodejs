// routes/integrations/zohoOAuthRoutes.js
import express from "express";
import { zohoOAuthCallback } from "../../controllers/integrations/zohoOAuth.controller.js";

const router = express.Router();

router.get("/oauth/callback", zohoOAuthCallback);

export default router;
