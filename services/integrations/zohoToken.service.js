// services/integrations/zohoToken.service.js
import axios from "axios";
import ZohoConfig from "../../models/integrations/ZohoConfig.js";

export async function getZohoConfig() {
  const config = await ZohoConfig.findOne({ isActive: true });
  if (!config) throw new Error("Zoho not connected");

  // token still valid
  if (config.accessTokenExpiresAt > new Date()) {
    return config;
  }

  // 🔁 refresh token
  const res = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    null,
    {
      params: {
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      },
    }
  );

  config.accessToken = res.data.access_token;
  config.accessTokenExpiresAt = new Date(
    Date.now() + res.data.expires_in * 1000
  );
  config.lastRefreshedAt = new Date();
  await config.save();

  return config;
}
