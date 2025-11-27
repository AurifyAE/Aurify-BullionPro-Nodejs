// services/modules/TransactionFixingService.js
import TransactionFixing from "../../models/modules/TransactionFixing.js";
import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import FixingPrice from "../../models/modules/FixingPrice.js";
import { createAppError } from "../../utils/errorHandler.js";
import mongoose from "mongoose";

/* --------------------------------------------------------------
   HELPER: Build 3 Registry Entries (CURRENCY + METAL)
   -------------------------------------------------------------- */
const buildRegistryEntries = ({
  regId,
  fixId,
  account,
  order,
  type,
  pureWeight,
  totalValue,
  bidValueOz,
  currencyId,
  adminId,
  voucherNumber,
  grossWeight,
}) => {
  const partyName = account.customerName || account.accountCode || "Unknown";
  const cashBalance = account.balances.cashBalance.find(
    (cb) => cb.currency?.toString() === currencyId
  );
  const currencyCode = cashBalance?.code || "UNKNOWN";
  const fmt = (n, d = 2) =>
    n.toLocaleString("en-AE", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  const fmtWeight = (n) => fmt(n, 3);
  const fmtAed = (n) => `AED ${fmt(n, 2)}`;

  const metalStr = `${fmtWeight(pureWeight)}g @ ${fmt(bidValueOz, 2)}oz`;
  const cashStr = `${currencyCode} ${totalValue}`;
  const isPurchase = type === "PURCHASE";
  const transactionType =
    type === "PURCHASE" ? "PURCHASE-FIXING" : "SALE-FIXING";
  return [
    // 1. PARTY_GOLD_BALANCE
    {
      transactionId: regId,
      transactionType,
      fixingTransactionId: fixId,
      type: "PARTY_GOLD_BALANCE",
      description: `Gold: ${metalStr} – ${
        isPurchase ? "Debited from" : "Credited to"
      } ${partyName}`,
      party: account._id,
      isBullion: false,
      goldBidValue: bidValueOz,
      value: pureWeight,
      grossWeight: grossWeight,
      debit: isPurchase ? pureWeight : 0,
      credit: isPurchase ? 0 : pureWeight,
      goldCredit: isPurchase ? pureWeight : 0,
      goldDebit: isPurchase ? 0 : pureWeight,
      transactionDate: new Date(),
      reference: voucherNumber,
      createdBy: adminId,
    },
    // 2. PURCHASE-FIXING / SALES-FIXING
    {
      transactionId: regId,
      transactionType,
      fixingTransactionId: fixId,
      type: isPurchase ? "purchase-fixing" : "sales-fixing",
      description: `Fixing: ${metalStr} – ${
        isPurchase ? "Purchase from" : "Sale to"
      } ${partyName}`,
      party: account._id,
      isBullion: false,
      goldBidValue: bidValueOz,
      value: pureWeight,
      grossWeight: grossWeight,
      debit: isPurchase ? 0 : pureWeight,
      credit: isPurchase ? pureWeight : 0,
      goldCredit: isPurchase ? pureWeight : 0,
      goldDebit: isPurchase ? 0 : pureWeight,
      cashCredit: isPurchase ? 0 : totalValue,
      cashDebit: isPurchase ? totalValue : 0,
      transactionDate: new Date(),
      reference: voucherNumber,
      createdBy: adminId,
    },
    // 3. PARTY_CASH_BALANCE
    {
      transactionId: regId,
      transactionType,
      fixingTransactionId: fixId,
      type: "PARTY_CASH_BALANCE",
      description: `Cash: ${cashStr} – ${metalStr} – ${
        isPurchase ? "Purchase from" : "Sale to"
      } ${partyName}`,
      party: account._id,
      isBullion: false,
      goldBidValue: bidValueOz,
      value: totalValue,
      grossWeight: grossWeight,
      debit: isPurchase ? 0 : totalValue,
      credit: isPurchase ? totalValue : 0,
      cashDebit: isPurchase ? totalValue : 0,
      cashCredit: isPurchase ? totalValue : 0,
      transactionDate: new Date(),
      reference: voucherNumber,
      createdBy: adminId,
    },
  ];
};

/* --------------------------------------------------------------
   HELPER: Generate Unique Transaction ID (ES-module safe)
   -------------------------------------------------------------- */
const generateUniqueTransactionId = async (prefix) => {
  let id, exists;
  do {
    const rand = Math.floor(10000 + Math.random() * 90000);
    id = `${prefix}${rand}`;
    exists = await TransactionFixing.exists({ transactionId: id });
  } while (exists);
  return id;
};

/* --------------------------------------------------------------
   NUMERIC HELPERS
   -------------------------------------------------------------- */
const toNumberOrThrow = (value, fieldName) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw createAppError(
      `Invalid numeric value for ${fieldName}`,
      400,
      "INVALID_NUMBER"
    );
  }
  return num;
};

const resolveOrderWeight = (order) => {
  // Priority: pureWeight → quantityGm → grossWeight
  if (order.pureWeight != null) {
    return toNumberOrThrow(order.pureWeight, "pureWeight");
  }
  if (order.quantityGm != null) {
    return toNumberOrThrow(order.quantityGm, "quantityGm");
  }
  if (order.grossWeight != null) {
    return toNumberOrThrow(order.grossWeight, "grossWeight");
  }
  throw createAppError(
    "Order is missing weight (pureWeight/quantityGm/grossWeight)",
    400,
    "MISSING_WEIGHT"
  );
};

/* --------------------------------------------------------------
   DELTA HELPERS (GOLD + CASH)
   -------------------------------------------------------------- */
const computeGoldDelta = (orders, type) => {
  const sign = type === "PURCHASE" ? -1 : 1; // PURCHASE reduces gold, SALE increases
  const totalWeight = orders.reduce(
    (sum, order) => sum + resolveOrderWeight(order),
    0
  );
  return sign * totalWeight;
};

const computeCashDeltas = (orders, type) => {
  const sign = type === "PURCHASE" ? 1 : -1; // PURCHASE: +cash, SALE: -cash (per your original logic)
  const deltas = {}; // { currencyId: amountDelta }

  for (const order of orders) {
    const cid = order.selectedCurrencyId?.toString();
    if (!cid) {
      throw createAppError(
        "Order missing selectedCurrencyId",
        400,
        "MISSING_CURRENCY"
      );
    }
    const amount = toNumberOrThrow(order.price, "price");
    deltas[cid] = (deltas[cid] || 0) + sign * amount;
  }

  return deltas;
};

const applyCashDeltasToAccount = (account, cashDeltas) => {
  if (!account.balances) account.balances = {};
  if (!Array.isArray(account.balances.cashBalance)) {
    account.balances.cashBalance = [];
  }

  for (const [cid, delta] of Object.entries(cashDeltas)) {
    let bal = account.balances.cashBalance.find(
      (cb) => cb.currency?.toString() === cid
    );
    if (!bal) {
      bal = {
        currency: cid,
        amount: 0,
        isDefault: false,
        lastUpdated: new Date(),
      };
      account.balances.cashBalance.push(bal);
    }
    bal.amount = (bal.amount || 0) + delta;
    bal.lastUpdated = new Date();
  }
};

const ensureGoldBalanceObject = (account) => {
  if (!account.balances) account.balances = {};
  if (!account.balances.goldBalance) {
    account.balances.goldBalance = {
      totalGrams: 0,
      totalValue: 0,
      lastUpdated: new Date(),
    };
  }
  if (!Number.isFinite(account.balances.goldBalance.totalGrams)) {
    account.balances.goldBalance.totalGrams = 0;
  }
};

/* --------------------------------------------------------------
   EXPORTED SERVICE
   -------------------------------------------------------------- */
export const TransactionFixingService = {
  // -----------------------------------------------------------------
  // CREATE
  // -----------------------------------------------------------------

  createTransaction: async (transactionData, adminId) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    console.log(transactionData,'transaction data of fixing')
    try {
      // ----- VALIDATIONS -----
      if (!mongoose.Types.ObjectId.isValid(transactionData.partyId))
        throw createAppError("Invalid Party ID", 400, "INVALID_PARTY_ID");

      const type = transactionData.type.toUpperCase();
      if (!["PURCHASE", "SALE"].includes(type))
        throw createAppError(
          "Type must be 'PURCHASE' or 'SELL'",
          400,
          "INVALID_TYPE"
        );

      if (
        !Array.isArray(transactionData.orders) ||
        transactionData.orders.length === 0
      )
        throw createAppError("At least one order required", 400, "NO_ORDERS");

      transactionData.orders.forEach((order, i) => {
        if (!order.oneGramRate || order.oneGramRate <= 0)
          throw createAppError(
            `Order ${i + 1}: oneGramRate must be positive`,
            400,
            "INVALID_QUANTITY"
          );
        if (!order.price || Number(order.price) <= 0)
          throw createAppError(
            `Order ${i + 1}: Price must be positive`,
            400,
            "INVALID_PRICE"
          );
        if (!mongoose.Types.ObjectId.isValid(order.metalType))
          throw createAppError(
            `Order ${i + 1}: Invalid metalType ID`,
            400,
            "INVALID_METAL_TYPE"
          );
        if (!order.bidValue || Number(order.bidValue) <= 0)
          throw createAppError(
            `Order ${i + 1}: Gold bid value must be positive`,
            400,
            "INVALID_GOLD_BID"
          );
        if (!mongoose.Types.ObjectId.isValid(order.selectedCurrencyId))
          throw createAppError(
            `Order ${i + 1}: Invalid selectedCurrencyId`,
            400,
            "INVALID_CURRENCY"
          );
        // Ensure weight exists and is numeric (will throw if invalid)
        resolveOrderWeight(order);
      });

      // ----- ACCOUNT & CURRENCY SETUP -----
      const account = await Account.findById(transactionData.partyId).session(
        session
      );
      if (!account)
        throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");

      // ensure every selected currency exists in cashBalance
      if (!account.balances) account.balances = {};
      if (!Array.isArray(account.balances.cashBalance))
        account.balances.cashBalance = [];

      for (const order of transactionData.orders) {
        const cid = order.selectedCurrencyId.toString();
        const exists = account.balances.cashBalance.some(
          (cb) => cb.currency?.toString() === cid
        );
        if (!exists) {
          account.balances.cashBalance.push({
            currency: cid,
            amount: 0,
            isDefault: false,
            lastUpdated: new Date(),
          });
        }
      }

      const prefix = type === "PURCHASE" ? "PUR" : "SEL";
      const transactionId = await generateUniqueTransactionId(prefix);
      transactionData.transactionId = transactionId;

      // ----- SAVE TRANSACTION -----
      const transaction = new TransactionFixing({
        ...transactionData,
        type,
        createdBy: adminId,
      });
      await transaction.save({ session });

      // ----- BULK PREP -----
      const registryEntries = [];
      const fixingPriceEntries = [];

      // GOLD & CASH DELTAS
      const goldDelta = computeGoldDelta(transactionData.orders, type);
      const cashDeltas = computeCashDeltas(transactionData.orders, type);

      for (const order of transactionData.orders) {
        const regId = await Registry.generateTransactionId();
        const pureWeight = resolveOrderWeight(order);
        const totalValue = toNumberOrThrow(order.price, "price");
        const bidValueOz = toNumberOrThrow(order.bidValue, "bidValue");
        const currencyId = order.selectedCurrencyId.toString();
        const oneGramRate = toNumberOrThrow(order.oneGramRate, "oneGramRate");
        const currentBidValue = toNumberOrThrow(
          order.currentBidValue ?? order.bidValue,
          "currentBidValue"
        );
        const voucherNumber = transaction.voucherNumber;
        const grossWeight = order.grossWeight;
        // FIXING PRICE
        fixingPriceEntries.push({
          transactionFix: transaction._id,
          transactionType:
            type === "PURCHASE" ? "PURCHASE-FIXING" : "SALE-FIXING",
          rateInGram: oneGramRate,
          bidValue: bidValueOz,
          currentBidValue,
          entryBy: adminId,
          metalRate: order.metalType,
          status: "active",
          fixedAt: new Date(),
        });

        // REGISTRY ENTRIES
        const entries = buildRegistryEntries({
          regId,
          fixId: transaction._id,
          account,
          order,
          type,
          pureWeight,
          totalValue,
          bidValueOz,
          currencyId,
          adminId,
          voucherNumber,
          grossWeight,
        });
        registryEntries.push(...entries);
      }

      // ----- BULK SAVE -----
      await Registry.insertMany(registryEntries, { session });
      await FixingPrice.insertMany(fixingPriceEntries, { session });

      // ----- UPDATE ACCOUNT -----
      ensureGoldBalanceObject(account);
      account.balances.goldBalance.totalGrams =
        (account.balances.goldBalance.totalGrams || 0) + goldDelta;
      account.balances.goldBalance.lastUpdated = new Date();

      applyCashDeltasToAccount(account, cashDeltas);

      account.balances.lastBalanceUpdate = new Date();
      await account.save({ session });

      await session.commitTransaction();

      return await TransactionFixing.findById(transaction._id)
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("orders.metalType", "rateType")
        .populate("orders.selectedCurrencyId", "code symbol")
        .lean();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },

  // -----------------------------------------------------------------
  // UPDATE (reverse → re-apply)
  // -----------------------------------------------------------------
  updateTransaction: async (id, updateData, adminId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existing = await TransactionFixing.findById(id).session(session);
      if (!existing)
        throw createAppError("Transaction not found", 404, "NOT_FOUND");

      const account = await Account.findById(
        updateData.partyId || existing.partyId
      ).session(session);
      if (!account)
        throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");

      ensureGoldBalanceObject(account);
      if (!Array.isArray(account.balances.cashBalance)) {
        account.balances.cashBalance = [];
      }

      // ----- REVERSE ORIGINAL -----
      const origType = existing.type.toUpperCase();
      const origOrders = existing.orders || [];

      // THIS is the original effect that was applied when the transaction was created
      const originalGoldDelta = computeGoldDelta(origOrders, origType);
      const originalCashDeltas = computeCashDeltas(origOrders, origType);

      // To reverse, we simply apply the negative of those deltas
      account.balances.goldBalance.totalGrams =
        (account.balances.goldBalance.totalGrams || 0) - originalGoldDelta;

      const reversedCashDeltas = {};
      for (const [cid, delta] of Object.entries(originalCashDeltas)) {
        reversedCashDeltas[cid] = -delta;
      }
      applyCashDeltasToAccount(account, reversedCashDeltas);

      // Remove existing registry & fixing price entries for this fixing
      console.log("Deleting existing Registry and FixingPrice entries...",existing._id);
      await Registry.deleteMany({ fixingTransactionId: existing._id }).session(
        session
      );
      await FixingPrice.deleteMany({ transactionFix: existing._id }).session(
        session
      );

      // ----- APPLY NEW -----
      const newType = (updateData.type || existing.type).toUpperCase();
      const newOrders =
        updateData.orders && updateData.orders.length
          ? updateData.orders
          : existing.orders;

      // Validate / normalize newOrders quickly
      newOrders.forEach((order, i) => {
        resolveOrderWeight(order); // will throw if missing / invalid
        if (!order.price || Number(order.price) <= 0)
          throw createAppError(
            `Order ${i + 1}: Price must be positive`,
            400,
            "INVALID_PRICE"
          );
        if (!mongoose.Types.ObjectId.isValid(order.metalType))
          throw createAppError(
            `Order ${i + 1}: Invalid metalType ID`,
            400,
            "INVALID_METAL_TYPE"
          );
        if (!order.bidValue || Number(order.bidValue) <= 0)
          throw createAppError(
            `Order ${i + 1}: Gold bid value must be positive`,
            400,
            "INVALID_GOLD_BID"
          );
        if (!mongoose.Types.ObjectId.isValid(order.selectedCurrencyId))
          throw createAppError(
            `Order ${i + 1}: Invalid selectedCurrencyId`,
            400,
            "INVALID_CURRENCY"
          );
      });

      const registryEntries = [];
      const fixingPriceEntries = [];

      // New gold & cash deltas
      const newGoldDelta = computeGoldDelta(newOrders, newType);
      const newCashDeltas = computeCashDeltas(newOrders, newType);

      for (const order of newOrders) {
        const regId = await Registry.generateTransactionId();
        const pureWeight = resolveOrderWeight(order);
        const totalValue = toNumberOrThrow(order.price, "price");
        const bidValueOz = toNumberOrThrow(order.bidValue, "bidValue");
        const currencyId = order.selectedCurrencyId.toString();
        const currentBidValue = toNumberOrThrow(
          order.currentBidValue ?? order.bidValue,
          "currentBidValue"
        );
        const oneGramRate = toNumberOrThrow(order.oneGramRate, "oneGramRate");
        const voucherNumber = existing.voucherNumber;
        const grossWeight = order.grossWeight;
        // FIXING PRICE
        fixingPriceEntries.push({
          transactionFix: existing._id,
          transactionType:
            newType === "PURCHASE" ? "PURCHASE-FIXING" : "SALE-FIXING",
          rateInGram: oneGramRate,
          bidValue: bidValueOz,
          currentBidValue,
          entryBy: adminId,
          metalRate: order.metalType,
          status: "active",
          fixedAt: new Date(),
        });

        // REGISTRY ENTRIES
        const entries = buildRegistryEntries({
          regId,
          fixId: existing._id,
          account,
          order,
          type: newType,
          pureWeight,
          totalValue,
          bidValueOz,
          currencyId,
          adminId,
          voucherNumber,
          grossWeight,
        });
        registryEntries.push(...entries);
      }

      await Registry.insertMany(registryEntries, { session });
      await FixingPrice.insertMany(fixingPriceEntries, { session });

      // Apply new deltas
      account.balances.goldBalance.totalGrams =
        (account.balances.goldBalance.totalGrams || 0) + newGoldDelta;
      account.balances.goldBalance.lastUpdated = new Date();

      applyCashDeltasToAccount(account, newCashDeltas);

      account.balances.lastBalanceUpdate = new Date();
      await account.save({ session });

      const updated = await TransactionFixing.findByIdAndUpdate(
        id,
        { ...updateData, type: newType, updatedBy: adminId },
        { new: true, runValidators: true, session }
      )
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("orders.selectedCurrencyId", "code symbol");

      await session.commitTransaction();
      return updated;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },

  // -----------------------------------------------------------------
  // LIST (pagination + filters)
  // -----------------------------------------------------------------
  getAllTransactions: async (
    page = 1,
    limit = 10,
    search = "",
    status = "",
    type = "",
    metalType = "",
    partyId = ""
  ) => {
    try {
      const skip = (page - 1) * limit;
      const filter = {};

      if (search) {
        filter.$or = [
          { transactionId: { $regex: search, $options: "i" } },
          { voucherNumber: { $regex: search, $options: "i" } },
          { notes: { $regex: search, $options: "i" } },
        ];
      }
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (partyId && mongoose.Types.ObjectId.isValid(partyId))
        filter.partyId = partyId;
      if (metalType) {
        // metalType lives inside orders → $elemMatch
        filter["orders.metalType"] = mongoose.Types.ObjectId(metalType);
      }

      const transactions = await TransactionFixing.find(filter)
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("orders.metalType")
        .populate("orders.commodity")
        .populate("orders.selectedCurrencyId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await TransactionFixing.countDocuments(filter);

      return {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      };
    } catch (err) {
      throw createAppError("Failed to fetch transactions", 500, "FETCH_ERROR");
    }
  },

  // -----------------------------------------------------------------
  // GET BY ID
  // -----------------------------------------------------------------
  getTransactionById: async (id) => {
    try {
      const transaction = await TransactionFixing.findById(id)
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("orders.metalType")
        .populate("orders.commodity")
        .populate("orders.selectedCurrencyId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      if (!transaction)
        throw createAppError("Transaction not found", 404, "NOT_FOUND");

      return transaction;
    } catch (err) {
      if (err.name === "CastError")
        throw createAppError("Invalid Transaction ID", 400, "INVALID_ID");
      throw err;
    }
  },

// -----------------------------------------------------------------
// DELETE (full reverse) - FIXED VERSION
// -----------------------------------------------------------------
deleteTransaction: async (id, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await TransactionFixing.findById(id).session(session);
    if (!transaction)
      throw createAppError("Transaction not found", 404, "NOT_FOUND");

    const account = await Account.findById(transaction.partyId).session(
      session
    );
    if (!account)
      throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");

    // Ensure account has proper balance structure
    ensureGoldBalanceObject(account);
    if (!Array.isArray(account.balances.cashBalance)) {
      account.balances.cashBalance = [];
    }

    const type = transaction.type.toUpperCase();
    
    // FIX: Use resolveOrderWeight to get the correct weight field
    // This will check pureWeight → quantityGm → grossWeight in priority order
    const goldDelta = transaction.orders.reduce((sum, order) => {
      const weight = resolveOrderWeight(order);
      return sum + weight;
    }, 0);

    // Reverse the original effect:
    // - If it was a PURCHASE (which reduced gold), add it back
    // - If it was a SALE (which added gold), subtract it back
    const reversalGoldDelta = type === "PURCHASE" ? goldDelta : -goldDelta;

    // Calculate cash reversals
    const cashDeltas = {};
    for (const order of transaction.orders) {
      const cid = order.selectedCurrencyId?.toString();
      if (!cid) continue;
      
      const price = toNumberOrThrow(order.price, "price");
      // Reverse the original cash effect:
      // - If it was a PURCHASE (which added cash), subtract it back
      // - If it was a SALE (which reduced cash), add it back
      const delta = type === "PURCHASE" ? -price : price;
      cashDeltas[cid] = (cashDeltas[cid] || 0) + delta;
    }

    // Apply reversals
    console.log('Before reversal:', account.balances.goldBalance.totalGrams);
    console.log('Reversal delta:', reversalGoldDelta);
    
    account.balances.goldBalance.totalGrams = 
      (account.balances.goldBalance.totalGrams || 0) + reversalGoldDelta;
    account.balances.goldBalance.lastUpdated = new Date();

    // Apply cash reversals
    for (const [cid, delta] of Object.entries(cashDeltas)) {
      let bal = account.balances.cashBalance.find(
        (cb) => cb.currency?.toString() === cid
      );
      if (bal) {
        bal.amount = (bal.amount || 0) + delta;
        bal.lastUpdated = new Date();
      }
    }

    console.log('After reversal:', account.balances.goldBalance.totalGrams);

    account.balances.lastBalanceUpdate = new Date();
    await account.save({ session });

    // Delete related records
    await Registry.deleteMany({ fixingTransactionId: id }).session(session);
    await FixingPrice.deleteMany({ transactionFix: id }).session(session);
    await TransactionFixing.deleteOne({ _id: id }).session(session);

    await session.commitTransaction();
    return { success: true, message: "Transaction deleted successfully" };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
},

  // -----------------------------------------------------------------
  // CANCEL (soft)
  // -----------------------------------------------------------------
  cancelTransaction: async (id, adminId) => {
    try {
      const transaction = await TransactionFixing.findById(id);
      if (!transaction)
        throw createAppError("Transaction not found", 404, "NOT_FOUND");

      const cancelled = await TransactionFixing.findByIdAndUpdate(
        id,
        { status: "cancelled", updatedBy: adminId },
        { new: true }
      )
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("orders.selectedCurrencyId", "code symbol");

      return cancelled;
    } catch (err) {
      if (err.name === "CastError")
        throw createAppError("Invalid Transaction ID", 400, "INVALID_ID");
      throw err;
    }
  },

  // -----------------------------------------------------------------
  // PERMANENT DELETE
  // -----------------------------------------------------------------
  permanentDeleteTransaction: async (id) => {
    try {
      const transaction = await TransactionFixing.findById(id);
      if (!transaction)
        throw createAppError("Transaction not found", 404, "NOT_FOUND");

      await TransactionFixing.findByIdAndDelete(id);
      return { message: "Transaction permanently deleted" };
    } catch (err) {
      if (err.name === "CastError")
        throw createAppError("Invalid Transaction ID", 400, "INVALID_ID");
      throw err;
    }
  },

  // -----------------------------------------------------------------
  // RESTORE (soft-deleted → active)
  // -----------------------------------------------------------------
  restoreTransaction: async (id, adminId) => {
    try {
      const transaction = await TransactionFixing.findById(id);
      if (!transaction)
        throw createAppError("Transaction not found", 404, "NOT_FOUND");

      const restored = await TransactionFixing.findByIdAndUpdate(
        id,
        { status: "active", isActive: true, updatedBy: adminId },
        { new: true }
      )
        .populate("partyId", "name code customerName accountCode")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("orders.selectedCurrencyId", "code symbol");

      return restored;
    } catch (err) {
      if (err.name === "CastError")
        throw createAppError("Invalid Transaction ID", 400, "INVALID_ID");
      throw err;
    }
  },

  // -----------------------------------------------------------------
  // GET BY PARTY
  // -----------------------------------------------------------------
  getTransactionsByParty: async (partyId, startDate = null, endDate = null) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(partyId))
        throw createAppError("Invalid Party ID", 400, "INVALID_PARTY_ID");

      const filter = { partyId };
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      return await TransactionFixing.find(filter)
        .populate("partyId", "name code customerName accountCode")
        .populate("orders.metalType", "rateType")
        .populate("orders.selectedCurrencyId", "code symbol")
        .sort({ createdAt: -1 })
        .lean();
    } catch (err) {
      throw err;
    }
  },

  // -----------------------------------------------------------------
  // GET BY METAL TYPE
  // -----------------------------------------------------------------
  getTransactionsByMetal: async (
    metalType,
    startDate = null,
    endDate = null
  ) => {
    try {
      const filter = { "orders.metalType": mongoose.Types.ObjectId(metalType) };
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      return await TransactionFixing.find(filter)
        .populate("partyId", "name code customerName accountCode")
        .populate("orders.metalType", "rateType")
        .populate("orders.selectedCurrencyId", "code symbol")
        .sort({ createdAt: -1 })
        .lean();
    } catch (err) {
      throw err;
    }
  },

  // -----------------------------------------------------------------
  // PARTY METAL SUMMARY
  // -----------------------------------------------------------------
  getPartyMetalSummary: async (partyId, metalType) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(partyId))
        throw createAppError("Invalid Party ID", 400, "INVALID_PARTY_ID");

      const pipeline = [
        { $match: { partyId: mongoose.Types.ObjectId(partyId) } },
        { $unwind: "$orders" },
        {
          $match: {
            "orders.metalType": mongoose.Types.ObjectId(metalType),
          },
        },
        {
          $group: {
            _id: "$type",
            totalGrams: { $sum: "$orders.quantityGm" },
            totalValue: { $sum: "$orders.price" },
          },
        },
      ];

      const result = await TransactionFixing.aggregate(pipeline);
      return result;
    } catch (err) {
      throw err;
    }
  },
};
