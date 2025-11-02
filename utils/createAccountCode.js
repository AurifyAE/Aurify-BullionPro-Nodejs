// server/utils/createAccountCode.js
import AccountMode from "../models/modules/AccountMode.js";   // ← .js !
import Account from "../models/modules/AccountType.js";       // ← .js !

/**
 * Generates a unique account code based on AccountMode prefix
 * @param {string} accountModeId - The ObjectId of the AccountMode
 * @returns {Promise<string>} - The generated unique account code
 */
export const generateUniqueAccountCode = async (accountModeId) => {
  const MAX_ATTEMPTS = 10;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    const accountCode = await AccountMode.generateNextAccountCode(
      accountModeId,
      Account
    );

    const exists = await Account.isAccountCodeExists(accountCode);
    if (!exists) return accountCode;

    console.warn(
      `Account code ${accountCode} already exists. Retry ${attempts}/${MAX_ATTEMPTS}`
    );
  }

  throw new Error(
    "Failed to generate unique account code after maximum attempts."
  );
};

/**
 * Validates if an account mode exists and is active
 * @param {string} accountModeId - The ObjectId of the AccountMode
 * @returns {Promise<Object>} - The AccountMode document
 */
export const validateAccountMode = async (accountModeId) => {
  const accountMode = await AccountMode.findById(accountModeId);
  if (!accountMode) throw new Error("Account mode not found");
  if (!accountMode.status) throw new Error("Account mode is inactive");
  return accountMode;
};