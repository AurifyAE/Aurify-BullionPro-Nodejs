import mongoose from "mongoose";
import Admin from "../models/core/adminModel.js"; // adjust path if needed
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, "../.env") });

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/bullion_management", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Default admin dummy data
const dummyAdmins = [
  {
    name: "Super Administrator",
    email: "superadmin@bullion.com",
    password: "SuperAdmin123!",
    type: "super_admin",
    status: "active",
    isActive: true
  },
  {
    name: "System Administrator",
    email: "admin@bullion.com",
    password: "Admin123!",
    type: "admin", 
    status: "active",
    isActive: true
  },
  {
    name: "Operations Manager",
    email: "manager@bullion.com",
    password: "Manager123!",
    type: "manager",
    status: "active",
    isActive: true
  },
  {
    name: "Data Operator",
    email: "operator@bullion.com",
    password: "Operator123!",
    type: "operator",
    status: "active",
    isActive: true
  },
  {
    name: "Report Viewer",
    email: "viewer@bullion.com",
    password: "Viewer123!",
    type: "viewer",
    status: "active",
    isActive: true
  }
];

// Create admin dummy data
const createAdminData = async () => {
  try {
    console.log("📝 Creating admin dummy data...");
    console.log("=".repeat(50));
    
    // Create admins one by one
    for (const adminData of dummyAdmins) {
      try {
        // Check if admin with this email already exists
        const existingAdmin = await Admin.findOne({ email: adminData.email });
        
        if (existingAdmin) {
          console.log(`⚠️  Admin with email ${adminData.email} already exists. Skipping...`);
          continue;
        }

        const admin = new Admin(adminData);
        const savedAdmin = await admin.save();
        
        console.log(`✅ Created: ${adminData.name}`);
        console.log(`   📧 Email: ${adminData.email}`);
        console.log(`   🔑 Type: ${adminData.type}`);
        console.log(`   🛡️  Permissions: ${savedAdmin.permissions.join(', ')}`);
        console.log(`   🆔 ID: ${savedAdmin._id}`);
        console.log("-".repeat(50));
        
      } catch (adminError) {
        console.error(`❌ Error creating admin ${adminData.name}:`, adminError.message);
      }
    }

    console.log("\n🎉 Admin dummy data creation completed!");
    console.log("\n🔐 LOGIN CREDENTIALS:");
    console.log("=".repeat(60));
    
    dummyAdmins.forEach(admin => {
      console.log(`${admin.type.toUpperCase().padEnd(15)} | ${admin.email.padEnd(25)} | ${admin.password}`);
    });
    
    console.log("=".repeat(60));
    console.log("⚠️  IMPORTANT: Please change these default passwords after first login!");
    
  } catch (error) {
    console.error("❌ Error creating admin data:", error);
    throw error;
  }
};

// Main function
const runScript = async () => {
  console.log("🚀 Creating Bullion Management Admin Dummy Data...");
  console.log("=".repeat(50));
  
  try {
    await connectDB();
    await createAdminData();
    
    console.log("\n✨ Admin data creation completed successfully!");
    
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed.");
    process.exit(0);
  }
};

// Execute the script
runScript();