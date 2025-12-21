import Account from "../models/modules/AccountType.js";
import { createAppError } from "./errorHandler.js";

export const updatePartyOpeningBalance = async ({
  partyId,
  assetType,   // GOLD | CASH
  assetCode,   // XAU | AED | USD
  value,       // signed (+ / -)
}) => {
  const account = await Account.findById(partyId);

  if (!account) {
    throw createAppError("Account not found", 404);
  }

  const now = new Date();

  // ------------------------
  // GOLD OPENING
  // ------------------------
  if (assetType === "GOLD") {
    if (!account.balances) account.balances = {};
    if (!account.balances.goldBalance) {
      account.balances.goldBalance = {
        totalGrams: 0,
        totalValue: 0,
      };
    }

    account.balances.goldBalance.totalGrams += value;
    account.balances.goldBalance.lastUpdated = now;
  }

  // ------------------------
  // CASH OPENING
  // ------------------------
  if (assetType === "CASH") {
    if (!account.balances) account.balances = {};
    if (!account.balances.cashBalance) {
      account.balances.cashBalance = [];
    }

    const cashRow = account.balances.cashBalance.find(
      (c) => c.code === assetCode
    );

    if (cashRow) {
      cashRow.amount += value;
      cashRow.lastUpdated = now;
    } else {
      // New currency entry
      account.balances.cashBalance.push({
        code: assetCode,
        amount: value,
        isDefault: false,
        lastUpdated: now,
      });
    }
  }

  account.balances.lastBalanceUpdate = now;

  await account.save();
};
