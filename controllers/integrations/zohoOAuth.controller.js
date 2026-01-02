import axios from "axios";
import ZohoConfig from "../../models/integrations/ZohoConfig.js";

export const zohoOAuthCallback = async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ message: "Authorization code missing" });
    }

    const tokenRes = await axios.post(
      "https://accounts.zoho.com/oauth/v2/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          redirect_uri: process.env.ZOHO_REDIRECT_URI,
          code,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    if (!access_token) {
      throw new Error("Access token missing from Zoho response");
    }

    const updateData = {
      orgId: process.env.ZOHO_ORG_ID,
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      accessToken: access_token,
      accessTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      lastRefreshedAt: new Date(),
      isActive: true,
    };

    // ✅ Only update refreshToken if Zoho sends it
    if (refresh_token) {
      updateData.refreshToken = refresh_token;
    }

    await ZohoConfig.findOneAndUpdate(
      {},
      updateData,
      { upsert: true, new: true }
    );

    return res.redirect("/settings/integrations?zoho=connected");
  } catch (err) {
    next(err);
  }
};
