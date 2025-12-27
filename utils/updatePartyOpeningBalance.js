import Account from "../models/modules/AccountType.js";
import { createAppError } from "./errorHandler.js";

export const updatePartyOpeningBalance = async ({
  partyId,
  assetType,   // GOLD | CASH
  assetCode,   // XAU | AED | USD
  value,       // number
  reverse = false,
  session = null
}) => {
  const account = await Account.findById(partyId);
  if (!account) {
    throw createAppError("Account not found", 404);
  }

  const now = new Date();
  const signedValue = reverse ? -value : value;

  // Ensure balances root
  account.balances ??= {};
  account.balances.lastBalanceUpdate = now;

  switch (assetType) {
    // ======================
    // GOLD
    // ======================
    case "GOLD": {
      account.balances.goldBalance ??= {
        totalGrams: 0,
        totalValue: 0,
        lastUpdated: now,
      };

      account.balances.goldBalance.totalGrams += signedValue;
      account.balances.goldBalance.lastUpdated = now;
      break;
    }

    // ======================
    // CASH
    // ======================
    case "CASH": {
      account.balances.cashBalance ??= [];

      const cashRow = account.balances.cashBalance.find(
        (c) => c.code === assetCode
      );

      if (cashRow) {
        cashRow.amount += signedValue;
        cashRow.lastUpdated = now;
      } else {
        account.balances.cashBalance.push({
          code: assetCode,
          amount: signedValue,
          isDefault: false,
          lastUpdated: now,
        });
      }
      break;
    }

    // ======================
    // UNSUPPORTED
    // ======================
    default:
      throw createAppError(`Unsupported asset type: ${assetType}`, 400);
  }

  await account.save();
};
