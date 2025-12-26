import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import adminRouter from "./routes/core/admin/index.js";
import divisionRouter from "./routes/modules/divisionsRoutes.js";
import karatMasterRoutes from "./routes/modules/karatMasterRoutes.js";
import categoryMasterRoutes from "./routes/modules/categoryMasterRoutes.js";
import productMasterRoutes from "./routes/modules/productMasterRoutes.js";
import metalRateMasterRoutes from "./routes/modules/metalRateMasterRoutes.js";
import currencyMasterRoutes from "./routes/modules/currencyMasterRoutes.js";
import accountTypeRoutes from "./routes/modules/accountTypeRoutes.js";
import metalStockRoutes from "./routes/modules/metalStockRoutes.js";
import costCenterMasterRoutes from "./routes/modules/costCenterMasterRoutes.js";
import metalTransaction from "./routes/modules/metalTransactionRoutes.js";
import transactionFixingRoutes from "./routes/modules/transactionFixingRoutes.js";
import RegistryRouter from "./routes/modules/registryRouter.js";
import VoucherRoute from "./routes/modules/VoucherMasterRoute.js";
import accountRoutes from "./routes/modules/accountMasterRoutes.js";
import entryRoutes from "./routes/modules/entryMasterRoutes.js";
import pdcRoutes from "./routes/modules/pdcRoutes.js";
import fundTransferRoutes from "./routes/modules/fundTransferRoutes.js";
import openingBalanceRoutes from "./routes/modules/openingBalanceRoute.js";
import inventoryRoutes from "./routes/modules/inventoryRoutes.js";
import stockAdjustmentRoutes from "./routes/modules/stockAdjustmentRoutes.js";
import reportsRoutes from "./routes/modules/reportsRoutes.js";
import userRouter from './routes/user/userRouters.js'
import classificationRoutes from "./routes/modules/classificationRoutes.js"
import branchMasterRoutes from "./routes/modules/branchMasterRoutes.js"
import otherChargesRoutes from "./routes/modules/otherChargesRoutes.js"
import accountModeRoutes from './routes/modules/accountModeRoutes.js'
import financialYearRoutes from "./routes/modules/financialYearMasterRoutes.js";
import commodityRoutes from "./routes/modules/commodityRoutes.js";
import salesmanRoutes from "./routes/modules/salesManRoutes.js";
import documentTypeRoutes from "./routes/modules/documentTypeRoutes.js";
import dealOrderRoutes from "./routes/modules/dealOrderRoutes.js";
import dealStrategyRoutes from "./routes/modules/dealStrategyRoutes.js";
import draftingRoutes from "./routes/modules/draftingRoutes.js";
import openingFixingRoutes from "./routes/modules/openingFixingRoutes.js";
import designationRoutes from "./routes/modules/designationRoutes.js";
import { mongodb } from "./config/db.js";
import { errorHandler } from "./utils/errorHandler.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4444;

app.use(cookieParser());
app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase URL-encoded payload limit

// CORS configuration - BEFORE other middleware
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
      "https://bullion-system-react2.onrender.com",
      "https://altawasel.bullionpro.net",
      "https://aurify.bullionpro.net",
      "https://uat.aurify.bullionpro.net",
      "https://switz.bullionpro.net"
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for now, change in production
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-secret-key", "Authorization"],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Database connecting
mongodb();

// Routes
app.use('/api/v1/user', userRouter);
app.use("/api/v1", adminRouter);
app.use("/api/v1/divisions", divisionRouter);
app.use("/api/v1/karats", karatMasterRoutes);
app.use("/api/v1/category-master", categoryMasterRoutes);
app.use("/api/v1/product-master", productMasterRoutes);
app.use("/api/v1/metal-rates", metalRateMasterRoutes);
app.use("/api/v1/currency-master", currencyMasterRoutes);
app.use("/api/v1/account-type", accountTypeRoutes);
app.use("/api/v1/metal-stocks", metalStockRoutes);
app.use("/api/v1/cost-centers", costCenterMasterRoutes);
app.use("/api/v1/metal-transaction", metalTransaction);
app.use("/api/v1/metal-transaction-fix", transactionFixingRoutes);
app.use("/api/v1/registry", RegistryRouter);
app.use("/api/v1/voucher", VoucherRoute);
app.use("/api/v1/account", accountRoutes);
app.use("/api/v1/entry", entryRoutes);
app.use("/api/v1/pdc", pdcRoutes);
app.use("/api/v1/fund-transfer", fundTransferRoutes);
app.use("/api/v1/opening-balance", openingBalanceRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/stock-adjustments", stockAdjustmentRoutes);
app.use("/api/v1/reports", reportsRoutes)
app.use("/api/v1/classification", classificationRoutes)
app.use("/api/v1/branch", branchMasterRoutes)
app.use("/api/v1/other-charges", otherChargesRoutes)
app.use("/api/v1/account-mode", accountModeRoutes)
app.use("/api/v1/financial-year", financialYearRoutes);
app.use("/api/v1/commodity", commodityRoutes);
app.use("/api/v1/salesman", salesmanRoutes);
app.use("/api/v1/document-type", documentTypeRoutes);
app.use("/api/v1/deal-orders", dealOrderRoutes);
app.use("/api/v1/deal-strategy", dealStrategyRoutes);
app.use("/api/v1/draftings", draftingRoutes);
app.use("/api/v1/opening-fixing", openingFixingRoutes);
app.use("/api/v1/designations", designationRoutes);

// Global error handling middleware
app.use(errorHandler);

app.listen(port, () => {
  console.log("Server running !!!!!");
  console.log(`http://localhost:${port}`);
});
