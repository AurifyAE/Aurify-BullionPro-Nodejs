// controllers/zohoOAuth.controller.js
import axios from "axios";
import ZohoConfig from "../../models/integrations/ZohoConfig.js";

export const zohoOAuthCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing OAuth code");
  }

  const tokenRes = await axios.post(
    "https://accounts.zoho.in/oauth/v2/token",
    null,
    {
      params: {
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.ZOHO_REDIRECT_URI,
      },
    }
  );

  const { access_token, refresh_token, expires_in } = tokenRes.data;

  await ZohoConfig.findOneAndUpdate(
    {},
    {
      orgId: process.env.ZOHO_ORG_ID,
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: refresh_token,
      accessToken: access_token,
      accessTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      lastRefreshedAt: new Date(),
      isActive: true,
    },
    { upsert: true, new: true }
  );

  res.redirect("/settings/integrations?zoho=connected");
};
