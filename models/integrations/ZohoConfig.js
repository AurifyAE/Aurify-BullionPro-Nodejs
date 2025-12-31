// models/integrations/ZohoConfig.js
import mongoose from "mongoose";

const ZohoConfigSchema = new mongoose.Schema({
    orgId: String,
    clientId: String,
    clientSecret: String,
    accessToken: String,
    refreshToken: String,
    accessTokenExpiresAt: Date,
    lastRefreshedAt: Date,
    isActive: { type: Boolean, default: true },
});


export default mongoose.model("ZohoConfig", ZohoConfigSchema);
