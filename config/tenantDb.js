import mongoose from "mongoose";

const tenantConnections = {};

export const getTenantDb = async (dbName) => {
  if (tenantConnections[dbName]) return tenantConnections[dbName];

  const uri = `${process.env.MONGO_BASE_URI}/${dbName}`;

  const conn = await mongoose.createConnection(uri);
  tenantConnections[dbName] = conn;

  console.log("🟢 Connected tenant DB:", dbName);
  return conn;
};
