/*=====================================================================
  MetalTransactionService – REFACTORED
=====================================================================*/
import mongoose from "mongoose";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import Inventory from "../../models/modules/inventory.js";
import MetalStock from "../../models/modules/MetalStock.js";
import InventoryService from "./inventoryService.js";
import { createAppError } from "../../utils/errorHandler.js";

/* ---------- HARD-CODED LEDGER ACCOUNTS ---------- */
const LEDGER = {
  PURCHASE_GOLD: "6903960655465750446c4a47", // PURCHASE GOLD
  EXPENSE: "6904d457d45e7b24dcd05428", // EXPENSE (other charges)
  MAKING_CHARGE: "6904d4c6d45e7b24dcd054b7", // MAKING CHARGE
  PREMIUM_DISC: "6904d50bd45e7b24dcd05553", // PREMIUM / DISCOUNT
  VAT: "690530d979dafb076afc6eb3", // VAT
};

class MetalTransactionService {
  /* -----------------------------------------------------------------
     PUBLIC API
  ----------------------------------------------------------------- */
  /** CREATE ---------------------------------------------------------- */
  static async createMetalTransaction(transactionData, adminId) {
    const session = await mongoose.startSession();
    let createdTx;
    try {
      await session.withTransaction(async () => {
        this._validateCreatePayload(transactionData);
        const [party, metalTx] = await Promise.all([
          this._validateParty(transactionData.partyCode, session),
          this._buildTransaction(transactionData, adminId),
        ]);

        await metalTx.save({ session });
        createdTx = metalTx;

        const registryEntries = this._buildRegistryEntries(
          metalTx,
          party,
          adminId
        );

        await Promise.all([
          Registry.insertMany(registryEntries, { session, ordered: false }),
          this._updateAccountBalances(party, metalTx, session),
          this._updateInventory(metalTx, session, adminId),
        ]);
      });
      return this._populateTransaction(createdTx._id);
    } catch (err) {
      throw this._handleError(err);
    } finally {
      await session.endSession();
    }
  }

  /** UPDATE ---------------------------------------------------------- */
  static async updateMetalTransaction(txId, updatePayload, adminId) {
    const session = await mongoose.startSession();
    let tx;
    try {
      await session.withTransaction(async () => {
        this._validateUpdatePayload(txId, updatePayload, adminId);
        tx = await MetalTransaction.findById(txId).session(session);
        if (!tx || !tx.isActive)
          throw createAppError(
            "Transaction not found / inactive",
            404,
            "TX_NOT_FOUND"
          );

        const original = tx.toObject();
        const partyChanged =
          updatePayload.partyCode &&
          String(tx.partyCode) !== String(updatePayload.partyCode);

        const [oldParty, newParty] = await this._fetchParties(
          original.partyCode,
          updatePayload.partyCode,
          partyChanged,
          session
        );

        // ---- 1. Apply updates ------------------------------------------------
        this._applyUpdates(tx, updatePayload);
        if (updatePayload.stockItems || updatePayload.totalAmountSession)
          tx.calculateSessionTotals();

        tx.updatedBy = adminId;
        await tx.save({ session });

        // ---- 2. Re-build everything -----------------------------------------
        await this._replaceRegistryAndInventory(
          tx,
          original,
          oldParty,
          newParty,
          adminId,
          session,
          partyChanged
        );
      });

      return this._populateTransaction(tx._id);
    } catch (err) {
      await session.abortTransaction();
      throw this._handleError(err);
    } finally {
      await session.endSession();
    }
  }

  /* -----------------------------------------------------------------
     PRIVATE HELPERS – CREATE
  ----------------------------------------------------------------- */
  static _validateCreatePayload(data) {
    const required = [
      "partyCode",
      "transactionType",
      "stockItems",
      "voucherDate",
      "voucherNumber",
    ];
    const missing = required.filter((f) => !data[f]);
    if (missing.length)
      throw createAppError(
        `Missing fields: ${missing.join(", ")}`,
        400,
        "MISSING_FIELDS"
      );

    const validTypes = ["purchase", "sale", "purchaseReturn", "saleReturn"];
    if (!validTypes.includes(data.transactionType))
      throw createAppError("Invalid transactionType", 400, "INVALID_TX_TYPE");

    if (!Array.isArray(data.stockItems) || data.stockItems.length === 0)
      throw createAppError(
        "stockItems must be non-empty array",
        400,
        "INVALID_STOCK_ITEMS"
      );
  }

  static async _validateParty(partyCode, session) {
    const party = await Account.findById(partyCode)
      .select("_id isActive accountCode customerName balances")
      .session(session)
      .lean();
    if (!party?.isActive)
      throw createAppError("Party not found or inactive", 400, "INVALID_PARTY");
    return party;
  }

  static _buildTransaction(data, adminId) {
    const tx = new MetalTransaction({ ...data, createdBy: adminId });
    if (!data.totalAmountSession?.totalAmountAED) tx.calculateSessionTotals();
    return tx;
  }

  /* -----------------------------------------------------------------
     PRIVATE HELPERS – UPDATE
  ----------------------------------------------------------------- */
  static _validateUpdatePayload(txId, payload, adminId) {
    if (!mongoose.isValidObjectId(txId))
      throw createAppError("Invalid transaction id", 400, "BAD_ID");
    if (!mongoose.isValidObjectId(adminId))
      throw createAppError("Invalid admin id", 400, "BAD_ADMIN");
    if (!payload || typeof payload !== "object" || !Object.keys(payload).length)
      throw createAppError("No update payload", 400, "NO_PAYLOAD");
  }

  static async _fetchParties(oldId, newId, changed, session) {
    const fetches = [Account.findById(oldId).session(session).lean()];
    if (changed) fetches.push(Account.findById(newId).session(session).lean());
    const [oldParty, newParty] = await Promise.all(fetches);
    if (!oldParty?.isActive)
      throw createAppError("Old party not active", 400, "OLD_PARTY");
    if (changed && !newParty?.isActive)
      throw createAppError("New party not active", 400, "NEW_PARTY");
    return [oldParty, newParty || oldParty];
  }

  static _applyUpdates(tx, payload) {
    const allowed = [
      "partyCode",
      "stockItems",
      "totalAmountSession",
      "voucherDate",
      "voucherNumber",
      "transactionType",
      "fixed",
      "unfix",
      "hedged", // NEW flag
    ];
    for (const [k, v] of Object.entries(payload))
      if (allowed.includes(k)) tx[k] = v;
  }

  /* -----------------------------------------------------------------
     REGISTRY BUILDER – CORE
  ----------------------------------------------------------------- */
  static _buildRegistryEntries(tx, party, adminId) {
    const {
      transactionType,
      _id,
      stockItems,
      totalAmountSession,
      voucherDate,
      voucherNumber,
    } = tx;
    const mode = this._getMode(tx.fixed, tx.unfix);
    const hedged = !!tx.hedged; // <-- NEW
    const baseId = this._generateTxId();

    const entries = [];

    for (const item of stockItems) {
      const totals = this._calcItemTotals([item], totalAmountSession);

      // ----- SELECT BUILDER ------------------------------------------------
      const builder = this._selectBuilder(transactionType, mode, hedged);
      entries.push(
        ...builder(
          totals,
          _id,
          party,
          baseId,
          voucherDate,
          voucherNumber,
          adminId,
          item
        )
      );
    }
    return entries.filter(Boolean);
  }

  /** Choose the correct builder based on type / mode / hedged */
  static _selectBuilder(type, mode, hedged) {
    const map = {
      purchase: {
        fix: this._buildPurchaseFix,
        unfix: this._buildPurchaseUnfix,
        hedge: this._buildPurchaseHedge, // <-- NEW
      },
      sale: {
        fix: this._buildSaleFix,
        unfix: this._buildSaleUnfix,
        hedge: this._buildSaleHedge, // <-- NEW
      },
      purchaseReturn: {
        fix: this._buildPurchaseReturnFix,
        unfix: this._buildPurchaseReturnUnfix,
        hedge: this._buildPurchaseReturnHedge,
      },
      saleReturn: {
        fix: this._buildSaleReturnFix,
        unfix: this._buildSaleReturnUnfix,
        hedge: this._buildSaleReturnHedge,
      },
    };
    const key = hedged ? "hedge" : mode;
    const fn = map[type]?.[key];
    if (!fn) throw new Error(`No registry builder for ${type}/${key}`);
    return fn.bind(this);
  }

  static _getMode(fixed, unfix) {
    if (fixed && !unfix) return "fix";
    return "unfix"; // default
  }

  /* -----------------------------------------------------------------
     ITEM TOTALS (per stockItem)
  ----------------------------------------------------------------- */
  static _calcItemTotals(items, totalSession) {
    return items.reduce(
      (acc, i) => {
        const mc =
          i.itemTotal?.makingChargesTotal ?? i.makingCharges?.amount ?? 0;
        const pd = i.itemTotal?.premiumTotal ?? i.premium?.amount ?? 0;
        const vat = i.vat?.amount ?? 0;
        const oth = i.otherCharges?.amount ?? 0;
        const goldVal = i.itemTotal?.baseAmount ?? 0;

        const premium = pd > 0 ? pd : 0;
        const discount = pd < 0 ? Math.abs(pd) : 0;

        return {
          makingCharges: acc.makingCharges + mc,
          premium: acc.premium + premium,
          discount: acc.discount + discount,
          vatAmount: acc.vatAmount + vat,
          otherChargesAmount: acc.otherChargesAmount + oth,
          goldValue: acc.goldValue + goldVal,
          pureWeight: acc.pureWeight + (i.pureWeight ?? 0),
          grossWeight: acc.grossWeight + (i.grossWeight ?? 0),
          standerdPureWeight:
            acc.standerdPureWeight + (i.standerdPureWeight ?? 0),
          purityDiffWeight: acc.purityDiffWeight + (i.purityDiffWeight ?? 0),
          goldBidValue: i.metalRateRequirements?.rate ?? acc.goldBidValue,
        };
      },
      {
        makingCharges: 0,
        premium: 0,
        discount: 0,
        vatAmount: 0,
        otherChargesAmount: 0,
        goldValue: 0,
        pureWeight: 0,
        grossWeight: 0,
        standerdPureWeight: 0,
        purityDiffWeight: 0,
        goldBidValue: 0,
      }
    );
  }

  /* -----------------------------------------------------------------
     REGISTRY ENTRY FACTORY
  ----------------------------------------------------------------- */
  static _registryEntry(
    baseId,
    txId,
    suffix,
    type,
    desc,
    partyId,
    isBullion,
    value,
    credit,
    extra = {},
    voucherDate,
    ref,
    adminId
  ) {
    if (value <= 0 && !["sales-fixing", "sale-return-fixing"].includes(type))
      return null;

    const {
      cashDebit = 0,
      cashCredit = 0,
      goldDebit = 0,
      goldCredit = 0,
      debit = 0,
      grossWeight,
      pureWeight,
      purity,
      goldBidValue,
    } = extra;

    return {
      transactionId: `${baseId}`,
      metalTransactionId: txId,
      type,
      description: desc,
      party: partyId,
      isBullion,
      value: parseFloat(value) || 0,
      credit: parseFloat(credit) || 0,
      cashDebit: parseFloat(cashDebit) || 0,
      cashCredit: parseFloat(cashCredit) || 0,
      goldDebit: parseFloat(goldDebit) || 0,
      goldCredit: parseFloat(goldCredit) || 0,
      debit: parseFloat(debit) || 0,
      goldBidValue,
      transactionDate: voucherDate || new Date(),
      reference: ref,
      createdBy: adminId,
      createdAt: new Date(),
      grossWeight,
      pureWeight,
      purity,
    };
  }

  /* -----------------------------------------------------------------
     BUILDERS – FIX / UNFIX (unchanged – only extracted)
  ----------------------------------------------------------------- */
  static _buildPurchaseFix(t, id, p, base, vd, vn, admin, item) {
    const e = [];
    const n = p.customerName || p.accountCode;

    // PARTY GOLD (credit)
    if (t.pureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "PARTY-GOLD",
          "purchase-fixing",
          `Party gold – Purchase from ${n}`,
          p._id,
          true,
          t.pureWeight,
          t.pureWeight,
          {
            cashDebit: t.goldValue,
            goldCredit: t.pureWeight,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    // CASH / CHARGES (debit)
    if (t.goldValue)
      e.push(
        this._registryEntry(
          base,
          id,
          "001",
          "PARTY_CASH_BALANCE",
          `Cash – Purchase from ${n}`,
          p._id,
          false,
          t.goldValue,
          t.goldValue,
          {
            cashDebit: t.goldValue,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    this._pushIf(
      t.makingCharges,
      e,
      base,
      id,
      "002",
      "MAKING_CHARGES",
      `Making – ${n}`,
      p._id,
      false,
      t.makingCharges,
      t.makingCharges,
      { cashDebit: t.goldValue, grossWeight: t.grossWeight },
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.otherChargesAmount,
      e,
      base,
      id,
      "008",
      "OTHER_CHARGES",
      `${item.otherCharges?.description ?? "Other"} – ${n}`,
      LEDGER.EXPENSE,
      false,
      t.otherChargesAmount,
      t.otherChargesAmount,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.vatAmount,
      e,
      base,
      id,
      "009",
      "VAT_AMOUNT",
      `VAT – ${n}`,
      LEDGER.VAT,
      false,
      t.vatAmount,
      t.vatAmount,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.premium,
      e,
      base,
      id,
      "003",
      "PREMIUM",
      `Premium – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.premium,
      t.premium,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.discount,
      e,
      base,
      id,
      "007",
      "DISCOUNT",
      `Discount – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.discount,
      0,
      { debit: t.discount },
      vd,
      vn,
      admin
    );

    // INVENTORY
    if (t.standerdPureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "004",
          "GOLD",
          `Gold inventory – ${n}`,
          null,
          true,
          t.standerdPureWeight,
          0,
          { debit: t.standerdPureWeight, grossWeight: t.grossWeight },
          vd,
          vn,
          admin
        )
      );

    if (t.purityDiffWeight !== 0) {
      const credit = t.purityDiffWeight > 0 ? t.purityDiffWeight : 0;
      const debit = t.purityDiffWeight < 0 ? -t.purityDiffWeight : 0;
      e.push(
        this._registryEntry(
          base,
          id,
          "006",
          "PURITY_DIFFERENCE",
          `Purity diff ${t.purityDiffWeight} – ${n}`,
          null,
          true,
          Math.abs(t.purityDiffWeight),
          credit,
          {
            debit,
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );
    }

    if (t.grossWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "005",
          "GOLD_STOCK",
          `Gold stock – ${n}`,
          null,
          true,
          t.grossWeight,
          0,
          {
            debit: t.grossWeight,
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );

    return e;
  }

  /* -----------------------------------------------------------------
     NEW HEDGED BUILDERS
  ----------------------------------------------------------------- */
  /** PURCHASE – HEDGED (cash debit, gold credit) */
  static _buildPurchaseHedge(t, id, p, base, vd, vn, admin, item) {
    const e = [];
    const n = p.customerName || p.accountCode;

    // 1. PARTY CASH DEBIT
    if (t.totalAmount)
      e.push(
        this._registryEntry(
          base,
          id,
          "001",
          "PARTY_CASH_BALANCE",
          `Cash debit – Hedged purchase from ${n}`,
          p._id,
          false,
          t.totalAmount,
          0,
          {
            cashDebit: t.totalAmount,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    // 2. PARTY GOLD CREDIT
    if (t.pureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "PARTY-GOLD",
          "purchase-hedge",
          `Gold credit – Hedged purchase from ${n}`,
          p._id,
          true,
          t.pureWeight,
          t.pureWeight,
          {
            goldCredit: t.pureWeight,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    // 3. LEDGER ENTRIES (same as unfix but using the hard-coded accounts)
    this._pushIf(
      t.makingCharges,
      e,
      base,
      id,
      "002",
      "MAKING_CHARGES",
      `Making – ${n}`,
      LEDGER.MAKING_CHARGE,
      false,
      t.makingCharges,
      t.makingCharges,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.otherChargesAmount,
      e,
      base,
      id,
      "008",
      "OTHER_CHARGES",
      `${item.otherCharges?.description ?? "Other"} – ${n}`,
      LEDGER.EXPENSE,
      false,
      t.otherChargesAmount,
      t.otherChargesAmount,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.vatAmount,
      e,
      base,
      id,
      "009",
      "VAT_AMOUNT",
      `VAT – ${n}`,
      LEDGER.VAT,
      false,
      t.vatAmount,
      t.vatAmount,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.premium,
      e,
      base,
      id,
      "003",
      "PREMIUM",
      `Premium – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.premium,
      t.premium,
      {},
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.discount,
      e,
      base,
      id,
      "007",
      "DISCOUNT",
      `Discount – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.discount,
      0,
      { debit: t.discount },
      vd,
      vn,
      admin
    );

    // 4. INVENTORY (same as unfix)
    if (t.standerdPureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "004",
          "GOLD",
          `Gold inventory – ${n}`,
          null,
          true,
          t.standerdPureWeight,
          0,
          { debit: t.standerdPureWeight, grossWeight: t.grossWeight },
          vd,
          vn,
          admin
        )
      );

    if (t.purityDiffWeight !== 0) {
      const credit = t.purityDiffWeight > 0 ? t.purityDiffWeight : 0;
      const debit = t.purityDiffWeight < 0 ? -t.purityDiffWeight : 0;
      e.push(
        this._registryEntry(
          base,
          id,
          "006",
          "PURITY_DIFFERENCE",
          `Purity diff ${t.purityDiffWeight} – ${n}`,
          null,
          true,
          Math.abs(t.purityDiffWeight),
          credit,
          {
            debit,
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );
    }

    if (t.grossWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "005",
          "GOLD_STOCK",
          `Gold stock – ${n}`,
          null,
          true,
          t.grossWeight,
          0,
          {
            debit: t.grossWeight,
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );

    return e;
  }

  /** SALE – HEDGED (cash credit, gold debit) */
  static _buildSaleHedge(t, id, p, base, vd, vn, admin, item) {
    const e = [];
    const n = p.customerName || p.accountCode;

    // 1. PARTY CASH CREDIT
    if (t.totalAmount)
      e.push(
        this._registryEntry(
          base,
          id,
          "001",
          "PARTY_CASH_BALANCE",
          `Cash credit – Hedged sale to ${n}`,
          p._id,
          false,
          t.totalAmount,
          t.totalAmount,
          {
            cashCredit: t.totalAmount,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    // 2. PARTY GOLD DEBIT
    if (t.pureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "PARTY-GOLD",
          "sale-hedge",
          `Gold debit – Hedged sale to ${n}`,
          p._id,
          true,
          t.pureWeight,
          0,
          {
            goldDebit: t.pureWeight,
            grossWeight: t.grossWeight,
            goldBidValue: t.goldBidValue,
          },
          vd,
          vn,
          admin
        )
      );

    // LEDGER ENTRIES (opposite of purchase)
    this._pushIf(
      t.makingCharges,
      e,
      base,
      id,
      "002",
      "MAKING_CHARGES",
      `Making – ${n}`,
      LEDGER.MAKING_CHARGE,
      false,
      t.makingCharges,
      0,
      { debit: t.makingCharges },
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.otherChargesAmount,
      e,
      base,
      id,
      "008",
      "OTHER_CHARGES",
      `${item.otherCharges?.description ?? "Other"} – ${n}`,
      LEDGER.EXPENSE,
      false,
      t.otherChargesAmount,
      0,
      { debit: t.otherChargesAmount },
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.vatAmount,
      e,
      base,
      id,
      "009",
      "VAT_AMOUNT",
      `VAT – ${n}`,
      LEDGER.VAT,
      false,
      t.vatAmount,
      0,
      { debit: t.vatAmount },
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.premium,
      e,
      base,
      id,
      "003",
      "PREMIUM",
      `Premium – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.premium,
      0,
      { debit: t.premium },
      vd,
      vn,
      admin
    );

    this._pushIf(
      t.discount,
      e,
      base,
      id,
      "007",
      "DISCOUNT",
      `Discount – ${n}`,
      LEDGER.PREMIUM_DISC,
      false,
      t.discount,
      t.discount,
      {},
      vd,
      vn,
      admin
    );

    // INVENTORY (reduce)
    if (t.standerdPureWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "004",
          "GOLD",
          `Gold inventory – ${n}`,
          null,
          true,
          t.standerdPureWeight,
          t.standerdPureWeight,
          { grossWeight: t.grossWeight },
          vd,
          vn,
          admin
        )
      );

    if (t.purityDiffWeight !== 0) {
      const credit = t.purityDiffWeight < 0 ? -t.purityDiffWeight : 0;
      const debit = t.purityDiffWeight > 0 ? t.purityDiffWeight : 0;
      e.push(
        this._registryEntry(
          base,
          id,
          "006",
          "PURITY_DIFFERENCE",
          `Purity diff ${t.purityDiffWeight} – ${n}`,
          null,
          true,
          Math.abs(t.purityDiffWeight),
          credit,
          {
            debit,
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );
    }

    if (t.grossWeight)
      e.push(
        this._registryEntry(
          base,
          id,
          "005",
          "GOLD_STOCK",
          `Gold stock – ${n}`,
          null,
          true,
          t.grossWeight,
          t.grossWeight,
          {
            grossWeight: t.grossWeight,
            pureWeight: t.pureWeight,
            purity: t.purity,
          },
          vd,
          vn,
          admin
        )
      );

    return e;
  }

  /* -----------------------------------------------------------------
     RETURN HEDGED BUILDERS (reverse of the above)
  ----------------------------------------------------------------- */
  static _buildPurchaseReturnHedge(t, id, p, base, vd, vn, admin, item) {
    // reverse of purchase-hedge
    return this._reverseEntries(
      this._buildPurchaseHedge(t, id, p, base, vd, vn, admin, item)
    );
  }

  static _buildSaleReturnHedge(t, id, p, base, vd, vn, admin, item) {
    // reverse of sale-hedge
    return this._reverseEntries(
      this._buildSaleHedge(t, id, p, base, vd, vn, admin, item)
    );
  }

  /** Helper – flip debit/credit for return entries */
  static _reverseEntries(entries) {
    return entries.map((e) => ({
      ...e,
      value: e.credit,
      credit: e.value,
      cashDebit: e.cashCredit ?? 0,
      cashCredit: e.cashDebit ?? 0,
      goldDebit: e.goldCredit ?? 0,
      goldCredit: e.goldDebit ?? 0,
      debit: e.credit ?? 0,
    }));
  }

  /* -----------------------------------------------------------------
     SMALL UTILS
  ----------------------------------------------------------------- */
  static _pushIf(
    val,
    arr,
    base,
    id,
    suffix,
    type,
    desc,
    party,
    isBullion,
    value,
    credit,
    extra,
    vd,
    vn,
    admin
  ) {
    if (val > 0)
      arr.push(
        this._registryEntry(
          base,
          id,
          suffix,
          type,
          desc,
          party,
          isBullion,
          value,
          credit,
          extra,
          vd,
          vn,
          admin
        )
      );
  }

  static _generateTxId() {
    const ts = Date.now();
    const yr = new Date().getFullYear();
    const rnd = Math.floor(Math.random() * 900) + 100;
    return `TXN${yr}${rnd}${ts}`;
  }

  /* -----------------------------------------------------------------
     ACCOUNT BALANCE UPDATE (unchanged – just extracted)
  ----------------------------------------------------------------- */
  static async _updateAccountBalances(party, tx, session) {
    const {
      transactionType,
      fixed,
      unfix,
      stockItems,
      totalAmountSession,
      hedged,
    } = tx;
    const totals = this._calcItemTotals(stockItems, totalAmountSession);
    const mode = this._getMode(fixed, unfix);
    const changes = this._calcBalanceChanges(
      transactionType,
      mode,
      totals,
      !!hedged
    );
    const ops = this._buildBalanceOps(changes);
    if (Object.keys(ops).length) {
      await Account.findByIdAndUpdate(party._id, ops, { session, new: true });
    }
  }

  static _calcBalanceChanges(type, mode, t, hedged) {
    // existing matrix + hedged branch
    const matrix = {
      purchase: {
        fix: { gold: 0, cash: t.totalAmount },
        unfix: {
          gold: t.pureWeight,
          cash: t.makingCharges + t.premium - t.discount + t.otherChargesAmount,
        },
        hedge: { gold: t.pureWeight, cash: -t.totalAmount }, // cash debit
      },
      sale: {
        fix: { gold: 0, cash: -t.totalAmount },
        unfix: {
          gold: -t.pureWeight,
          cash: -(
            t.makingCharges +
            t.premium -
            t.discount +
            t.otherChargesAmount
          ),
        },
        hedge: { gold: -t.pureWeight, cash: t.totalAmount }, // cash credit
      },
      purchaseReturn: {
        fix: { gold: 0, cash: -t.totalAmount },
        unfix: {
          gold: -t.pureWeight,
          cash: -(
            t.makingCharges +
            t.premium -
            t.discount +
            t.otherChargesAmount
          ),
        },
        hedge: { gold: -t.pureWeight, cash: t.totalAmount },
      },
      saleReturn: {
        fix: { gold: 0, cash: t.totalAmount },
        unfix: {
          gold: t.pureWeight,
          cash: t.makingCharges + t.premium - t.discount + t.otherChargesAmount,
        },
        hedge: { gold: t.pureWeight, cash: -t.totalAmount },
      },
    };
    const key = hedged ? "hedge" : mode;
    const m = matrix[type]?.[key] ?? { gold: 0, cash: 0 };
    return { goldBalance: m.gold, cashBalance: m.cash };
  }

  static _buildBalanceOps({ goldBalance, cashBalance }) {
    const inc = {};
    const set = { "balances.lastBalanceUpdate": new Date() };
    if (goldBalance) inc["balances.goldBalance.totalGrams"] = goldBalance;
    if (cashBalance)
      inc["balances.cashBalance.amount"] = parseFloat(cashBalance.toFixed(2));
    const ops = {};
    if (Object.keys(inc).length) ops.$inc = inc;
    if (Object.keys(set).length) ops.$set = set;
    return ops;
  }

  /* -----------------------------------------------------------------
     INVENTORY UPDATE (delegated)
  ----------------------------------------------------------------- */
  static async _updateInventory(tx, session, adminId) {
    const isSale = ["sale", "purchaseReturn"].includes(tx.transactionType);
    await InventoryService.updateInventory(tx, isSale, adminId, session);
  }

  /* -----------------------------------------------------------------
     REPLACE REGISTRY + INVENTORY (used by UPDATE)
  ----------------------------------------------------------------- */
  static async _replaceRegistryAndInventory(
    tx,
    original,
    oldParty,
    newParty,
    adminId,
    session,
    partyChanged
  ) {
    // 1. delete old stuff
    await Promise.all([
      this._deleteRegistry(tx, session),
      this._deleteInventoryLogs(tx.voucherNumber, session),
    ]);

    // 2. reverse old balances (old party)
    await this._updateAccountBalances(
      oldParty,
      { ...original, ...tx.toObject() },
      session
    );

    // 3. create new registry
    const freshEntries = this._buildRegistryEntries(tx, newParty, adminId);
    if (freshEntries.length)
      await Registry.insertMany(freshEntries, { session, ordered: false });

    // 4. apply new balances (new party)
    await this._updateAccountBalances(newParty, tx, session);

    // 5. inventory
    await this._updateInventory(tx, session, adminId);
  }

  static async _deleteRegistry(tx, session) {
    const q = Registry.deleteMany({ metalTransactionId: tx._id });
    if (session) q.session(session);
    await q;
  }

  static async _deleteInventoryLogs(voucher, session) {
    const q = InventoryLog.deleteMany({ voucherCode: voucher });
    if (session) q.session(session);
    await q;
  }

  /* -----------------------------------------------------------------
     POPULATE FINAL DOC
  ----------------------------------------------------------------- */
  static async _populateTransaction(id) {
    return MetalTransaction.findById(id)
      .populate("partyCode", "accountCode customerName")
      .populate("stockItems.stockCode", "code")
      .lean();
  }

  /* -----------------------------------------------------------------
     ERROR HANDLER
  ----------------------------------------------------------------- */
  static _handleError(err) {
    if (err.name === "ValidationError") {
      const msgs = Object.values(err.errors).map((e) => e.message);
      throw createAppError(`Validation: ${msgs.join(", ")}`, 400, "VALIDATION");
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      throw createAppError(`Duplicate ${field}`, 409, "DUP");
    }
    if (err.statusCode) throw err;
    throw createAppError(err.message || "Server error", 500, "INTERNAL");
  }
}

/* ---------------------------------------------------------------------
   EXPORT
--------------------------------------------------------------------- */
export default MetalTransactionService;
