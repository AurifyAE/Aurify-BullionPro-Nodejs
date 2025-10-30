import AccountType from "../../models/modules/AccountType.js";
import { createAppError } from "../../utils/errorHandler.js";
import { deleteMultipleS3Files } from "../../utils/s3Utils.js";
import bcrypt from "bcrypt";
import { hashPassword, encryptPassword, decryptPassword, verifyPassword } from "../../utils/passwordUtils.js";


class AccountTypeService {
  // Create new trade debtor
// In AccountTypeService.js
// In AccountTypeService.js
static async createTradeDebtor(debtorData, adminId) {
  try {
    // 1. Check duplicate account code
    const isCodeExists = await AccountType.isAccountCodeExists(debtorData.accountCode);
    if (isCodeExists) {
      throw createAppError('Account code already exists', 400, 'DUPLICATE_ACCOUNT_CODE');
    }

    // 2. Hash password (if provided)
    if (debtorData.password) {
      const passwordHash = await hashPassword(debtorData.password);
      const { encrypted, iv } = encryptPassword(debtorData.password);
      debtorData.passwordHash = passwordHash;
      debtorData.passwordEncrypted = encrypted;
      debtorData.passwordIV = iv;
    } else {
      debtorData.passwordHash = null;
      debtorData.passwordEncrypted = null;
      debtorData.passwordIV = null;
    }

    // 3. Set createdBy
    debtorData.createdBy = adminId;

    // 4. Process VAT/GST
    if (debtorData.vatGstDetails) {
      const validStatuses = ['REGISTERED', 'UNREGISTERED', 'EXEMPTED'];
      debtorData.vatGstDetails.vatStatus = debtorData.vatGstDetails.vatStatus
        ? validStatuses.includes(debtorData.vatGstDetails.vatStatus.toUpperCase())
          ? debtorData.vatGstDetails.vatStatus.toUpperCase()
          : 'UNREGISTERED'
        : 'UNREGISTERED';
      debtorData.vatGstDetails.vatNumber = debtorData.vatGstDetails.vatNumber || '';
      debtorData.vatGstDetails.documents = debtorData.vatGstDetails.documents || [];

      if (debtorData.vatGstDetails.vatStatus === 'REGISTERED' && !debtorData.vatGstDetails.vatNumber) {
        throw createAppError('VAT number is required for REGISTERED status', 400, 'MISSING_VAT_NUMBER');
      }
    } else {
      debtorData.vatGstDetails = { vatStatus: 'UNREGISTERED', vatNumber: '', documents: [] };
    }

    // 5. Process KYC
    if (debtorData.kycDetails && Array.isArray(debtorData.kycDetails)) {
      debtorData.kycDetails = debtorData.kycDetails
        .filter((kyc) => kyc.documentType && kyc.documentNumber)
        .map((kyc) => ({
          ...kyc,
          documents: kyc.documents || [],
          isVerified: kyc.isVerified ?? false,
          issueDate: kyc.issueDate ? new Date(kyc.issueDate) : null,
          expiryDate: kyc.expiryDate ? new Date(kyc.expiryDate) : null,
        }));

      if (debtorData.kycDetails.length === 0) delete debtorData.kycDetails;
    }

    // 6. Ensure single primary: address, employee, bank
    ['addresses', 'employees', 'bankDetails'].forEach((field) => {
      if (debtorData[field]?.length > 0) {
        let primaryFound = false;
        debtorData[field].forEach((item, i) => {
          if (item.isPrimary && !primaryFound) {
            primaryFound = true;
          } else if (item.isPrimary && primaryFound) {
            item.isPrimary = false;
          } else if (i === 0 && !primaryFound) {
            item.isPrimary = true;
            primaryFound = true;
          }
        });
      }
    });

    // 7. Initialize balances from acDefinition.currencies
    if (debtorData.acDefinition?.currencies?.length > 0) {
      const cashBalance = debtorData.acDefinition.currencies.map((c) => ({
        currency: c.currency?._id || c.currency,
        amount: 0,
        isDefault: !!c.isDefault,
        lastUpdated: new Date(),
      }));

      debtorData.balances = {
        goldBalance: { totalGrams: 0, totalValue: 0, lastUpdated: new Date() },
        cashBalance,
        totalOutstanding: 0,
        lastBalanceUpdate: new Date(),
      };
    }

    // 8. Create document
    const tradeDebtor = new AccountType(debtorData);
    await tradeDebtor.save();

    // 9. Populate response
    await tradeDebtor.populate([
      { path: 'acDefinition.currencies.currency', select: 'currencyCode currencyName symbol description' },
      { path: 'acDefinition.branches.branch', select: 'branchCode branchName address' },
      { path: 'balances.cashBalance.currency', select: 'currencyCode currencyName symbol' },
      { path: 'limitsMargins.currency', select: 'currencyCode' },
      { path: 'createdBy', select: 'name email role' },
    ]);

    return tradeDebtor;
  } catch (error) {
    this._handleServiceError(error);
  }
}


static async updateTradeDebtor(id, updateData, adminId) {
  try {
    const tradeDebtor = await AccountType.findById(id);
    if (!tradeDebtor) {
      throw createAppError('Trade debtor not found', 404, 'DEBTOR_NOT_FOUND');
    }

    // 1. Check account code uniqueness
    if (updateData.accountCode && updateData.accountCode !== tradeDebtor.accountCode) {
      const exists = await AccountType.isAccountCodeExists(updateData.accountCode, id);
      if (exists) {
        throw createAppError('Account code already exists', 400, 'DUPLICATE_ACCOUNT_CODE');
      }
    }

    // 2. Process VAT/GST updates
    if (updateData.vatGstDetails) {
      const validStatuses = ['REGISTERED', 'UNREGISTERED', 'EXEMPTED'];
      updateData.vatGstDetails.vatStatus = updateData.vatGstDetails.vatStatus
        ? validStatuses.includes(updateData.vatGstDetails.vatStatus.toUpperCase())
          ? updateData.vatGstDetails.vatStatus.toUpperCase()
          : 'UNREGISTERED'
        : 'UNREGISTERED';
      updateData.vatGstDetails.vatNumber = updateData.vatGstDetails.vatNumber || '';
      updateData.vatGstDetails.documents = updateData.vatGstDetails.documents || [];

      if (updateData.vatGstDetails.vatStatus === 'REGISTERED' && !updateData.vatGstDetails.vatNumber) {
        throw createAppError('VAT number is required for REGISTERED status', 400, 'MISSING_VAT_NUMBER');
      }

      // Handle document replace/remove
      const oldDocs = tradeDebtor.vatGstDetails?.documents || [];
      if (updateData.vatGstDetails._replaceDocuments) {
        updateData.vatGstDetails.documents = updateData.vatGstDetails.documents || [];
      } else if (updateData._removeVatDocuments?.length) {
        updateData.vatGstDetails.documents = oldDocs.filter(
          (doc) => !updateData._removeVatDocuments.includes(doc._id?.toString())
        );
        updateData.vatGstDetails.documents.push(...(updateData.vatGstDetails.documents || []));
      } else {
        updateData.vatGstDetails.documents = [...oldDocs, ...(updateData.vatGstDetails.documents || [])];
      }
      delete updateData.vatGstDetails._replaceDocuments;
      delete updateData._removeVatDocuments;
    }

    // 3. Process KYC updates
    if (updateData.kycDetails?.length) {
      const oldKyc = tradeDebtor.kycDetails || [];
      updateData.kycDetails = updateData.kycDetails
        .filter((kyc) => kyc.documentType && kyc.documentNumber)
        .map((kycUpdate) => {
          const old = oldKyc.find(
            (k) => k.documentType === kycUpdate.documentType && k.documentNumber === kycUpdate.documentNumber
          ) || {};
          const oldDocs = old.documents || [];

          let finalDocs = oldDocs;
          if (kycUpdate.documents) {
            if (kycUpdate._replaceDocuments) {
              finalDocs = kycUpdate.documents;
            } else if (kycUpdate._removeDocuments?.length) {
              finalDocs = oldDocs.filter((doc) => !kycUpdate._removeDocuments.includes(doc._id?.toString()));
              finalDocs.push(...kycUpdate.documents);
            } else {
              finalDocs = [...oldDocs, ...kycUpdate.documents];
            }
          }

          return {
            ...kycUpdate,
            documents: finalDocs,
            isVerified: kycUpdate.isVerified ?? false,
            issueDate: kycUpdate.issueDate ? new Date(kycUpdate.issueDate) : null,
            expiryDate: kycUpdate.expiryDate ? new Date(kycUpdate.expiryDate) : null,
          };
        });
    }

    // 4. Re-init cash balances if currencies changed
    if (updateData.acDefinition?.currencies?.length > 0) {
      updateData.balances = {
        cashBalance: updateData.acDefinition.currencies.map((c) => ({
          currency: c.currency?._id || c.currency,
          amount: 0,
          isDefault: !!c.isDefault,
          lastUpdated: new Date(),
        })),
        goldBalance: { totalGrams: 0, totalValue: 0, lastUpdated: new Date() },
        totalOutstanding: 0,
        lastBalanceUpdate: new Date(),
      };
    }

    // 5. Set audit fields
    updateData.updatedBy = adminId;
    updateData.updatedAt = new Date();

    // 6. Collect S3 keys to delete
    const filesToDelete = this.getFilesToDelete(tradeDebtor, updateData);

    // 7. Update DB
    const updated = await AccountType.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate([
      { path: 'acDefinition.currencies.currency', select: 'currencyCode currencyName symbol description' },
      { path: 'acDefinition.branches.branch', select: 'branchCode branchName address' },
      { path: 'balances.cashBalance.currency', select: 'currencyCode currencyName symbol' },
      { path: 'limitsMargins.currency', select: 'currencyCode' },
      { path: 'createdBy', select: 'name email role' },
      { path: 'updatedBy', select: 'name email role' },
    ]);

    // 8. Delete old S3 files
    let s3Result = { successful: [], failed: [] };
    if (filesToDelete.length > 0) {
      try {
        s3Result = await deleteMultipleS3Files(filesToDelete);
      } catch (err) {
        console.error('S3 cleanup failed:', err);
        s3Result.failed = filesToDelete.map((key) => ({ key, error: err.message }));
      }
    }

    return {
      ...updated.toObject(),
      _filesManagement: {
        filesDeleted: s3Result.successful?.length || 0,
        filesFailedToDelete: s3Result.failed?.length || 0,
        deletedKeys: s3Result.successful?.map((r) => r.key) || [],
        failedKeys: s3Result.failed?.map((r) => r.key) || [],
      },
    };
  } catch (error) {
    this._handleServiceError(error);
  }
}


// Helper method to determine files to delete
static getFilesToDelete(tradeDebtor, updateData) {
  const filesToDelete = [];

  // Handle VAT/GST document deletion
  if (updateData.vatGstDetails && updateData.vatGstDetails._replaceDocuments) {
    const oldVatDocs = tradeDebtor.vatGstDetails?.documents || [];
    oldVatDocs.forEach((doc) => {
      if (doc.s3Key) {
        filesToDelete.push(doc.s3Key);
      }
    });
  } else if (updateData._removeVatDocuments?.length) {
    const oldVatDocs = tradeDebtor.vatGstDetails?.documents || [];
    oldVatDocs.forEach((doc) => {
      if (updateData._removeVatDocuments.includes(doc._id?.toString()) && doc.s3Key) {
        filesToDelete.push(doc.s3Key);
      }
    });
  }

  // Handle KYC document deletion
  if (updateData.kycDetails?.length) {
    updateData.kycDetails.forEach((kycUpdate, index) => {
      if (kycUpdate._replaceDocuments) {
        const oldKyc = tradeDebtor.kycDetails?.find(
          (kyc) =>
            kyc.documentType === kycUpdate.documentType &&
            kyc.documentNumber === kycUpdate.documentNumber
        );
        if (oldKyc?.documents) {
          oldKyc.documents.forEach((doc) => {
            if (doc.s3Key) {
              filesToDelete.push(doc.s3Key);
            }
          });
        }
      } else if (kycUpdate._removeDocuments?.length) {
        const oldKyc = tradeDebtor.kycDetails?.find(
          (kyc) =>
            kyc.documentType === kycUpdate.documentType &&
            kyc.documentNumber === kycUpdate.documentNumber
        );
        if (oldKyc?.documents) {
          oldKyc.documents.forEach((doc) => {
            if (kycUpdate._removeDocuments.includes(doc._id?.toString()) && doc.s3Key) {
              filesToDelete.push(doc.s3Key);
            }
          });
        }
      }
    });
  }

  return filesToDelete;
}


 // Get all trade debtors with pagination and filters
static async getAllTradeDebtors(options = {}) {
  try {
    const {
      page = 1,
      limit = 100,
      search = "",
      status = "",
      classification = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      accountType,
      sort,
    } = options;

    const skip = (page - 1) * limit;
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { accountType: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { accountCode: { $regex: search, $options: "i" } },
        { shortName: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Classification filter
    if (classification) {
      query.classification = classification;
    }

    // AccountType filter (array)
    if (Array.isArray(accountType) && accountType.length > 0) {
      query.accountType = { $in: accountType };
    }

    // Sort options - Always prioritize favorites first
    let sortObj = {};
    if (Array.isArray(sort)) {
      sort.forEach(([field, dir]) => {
        sortObj[field] = dir;
      });
    } else {
      // fallback to old logic
      if (sortBy === "favorite") {
        sortObj.favorite = sortOrder === "desc" ? -1 : 1;
        sortObj.createdAt = -1;
      } else {
        sortObj.favorite = -1;
        sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
      }
    }

    const [tradeDebtors, total] = await Promise.all([
      AccountType.find(query)
        .populate([
          {
            path: "acDefinition.currencies.currency",
            select: "currencyCode description",
          },
          { path: "acDefinition.branches.branch", select: "code name" },
          { path: "createdBy", select: "name email" },
          { path: "updatedBy", select: "name email" },
        ])
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit)),
      AccountType.countDocuments(query),
    ]);

    return {
      tradeDebtors,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };
  } catch (error) {
    throw createAppError("Error fetching trade debtors", 500, "FETCH_ERROR");
  }
}

  // Get trade debtor by ID
  static async getTradeDebtorById(id) {
    try {
      const tradeDebtor = await AccountType.findById(id).populate([
        {
          path: "acDefinition.currencies.currency",
          select: "code name symbol",
        },
        { path: "acDefinition.branches.branch", select: "code name" },
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      if (!tradeDebtor) {
        throw createAppError("Trade debtor not found", 404, "DEBTOR_NOT_FOUND");
      }

      return tradeDebtor;
    } catch (error) {
      if (error.name === "CastError") {
        throw createAppError("Invalid trade debtor ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }
  static extractS3Keys(tradeDebtor) {
    const s3Keys = [];

    try {
      // Extract from VAT/GST documents
      if (tradeDebtor.vatGstDetails?.documents?.length) {
        tradeDebtor.vatGstDetails.documents.forEach((doc) => {
          if (doc.s3Key && typeof doc.s3Key === "string" && doc.s3Key.trim()) {
            s3Keys.push(doc.s3Key.trim());
          }
        });
      }

      // Extract from KYC documents
      if (tradeDebtor.kycDetails?.length) {
        tradeDebtor.kycDetails.forEach((kyc) => {
          if (kyc.documents?.length) {
            kyc.documents.forEach((doc) => {
              if (
                doc.s3Key &&
                typeof doc.s3Key === "string" &&
                doc.s3Key.trim()
              ) {
                s3Keys.push(doc.s3Key.trim());
              }
            });
          }
        });
      }

      // Remove duplicates
      return [...new Set(s3Keys)];
    } catch (error) {
      console.error("Error extracting S3 keys:", error);
      return s3Keys;
    }
  }

  // Helper function to extract S3 keys from update data
  static extractS3KeysFromUpdateData(updateData) {
    const s3Keys = [];

    try {
      // Extract from VAT/GST documents in update data
      if (updateData.vatGstDetails?.documents?.length) {
        updateData.vatGstDetails.documents.forEach((doc) => {
          if (doc.s3Key && typeof doc.s3Key === "string" && doc.s3Key.trim()) {
            s3Keys.push(doc.s3Key.trim());
          }
        });
      }

      // Extract from KYC documents in update data
      if (updateData.kycDetails?.length) {
        updateData.kycDetails.forEach((kyc) => {
          if (kyc.documents?.length) {
            kyc.documents.forEach((doc) => {
              if (
                doc.s3Key &&
                typeof doc.s3Key === "string" &&
                doc.s3Key.trim()
              ) {
                s3Keys.push(doc.s3Key.trim());
              }
            });
          }
        });
      }

      // Remove duplicates
      return [...new Set(s3Keys)];
    } catch (error) {
      console.error("Error extracting S3 keys from update data:", error);
      return s3Keys;
    }
  }

  // Helper function to get files to delete based on replacement/removal logic
  static getFilesToDelete(existingTradeDebtor, updateData) {
    const filesToDelete = [];

    try {
      // Handle VAT documents
      if (updateData.vatGstDetails?.documents) {
        const oldVatDocs = existingTradeDebtor.vatGstDetails?.documents || [];

        // If we're completely replacing VAT documents
        if (updateData._replaceVatDocuments) {
          oldVatDocs.forEach((doc) => {
            if (
              doc.s3Key &&
              typeof doc.s3Key === "string" &&
              doc.s3Key.trim()
            ) {
              filesToDelete.push(doc.s3Key.trim());
            }
          });
        }
        // If we're selectively removing documents
        else if (updateData._removeVatDocuments?.length) {
          updateData._removeVatDocuments.forEach((docId) => {
            const docToRemove = oldVatDocs.find(
              (doc) => doc._id?.toString() === docId
            );
            if (
              docToRemove?.s3Key &&
              typeof docToRemove.s3Key === "string" &&
              docToRemove.s3Key.trim()
            ) {
              filesToDelete.push(docToRemove.s3Key.trim());
            }
          });
        }
      }

      // Handle KYC documents
      if (updateData.kycDetails?.length) {
        updateData.kycDetails.forEach((kycUpdate, index) => {
          if (kycUpdate.documents) {
            const oldKycDocs =
              existingTradeDebtor.kycDetails?.[index]?.documents || [];

            // If we're completely replacing KYC documents for this entry
            if (kycUpdate._replaceDocuments) {
              oldKycDocs.forEach((doc) => {
                if (
                  doc.s3Key &&
                  typeof doc.s3Key === "string" &&
                  doc.s3Key.trim()
                ) {
                  filesToDelete.push(doc.s3Key.trim());
                }
              });
            }
            // If we're selectively removing documents
            else if (kycUpdate._removeDocuments?.length) {
              kycUpdate._removeDocuments.forEach((docId) => {
                const docToRemove = oldKycDocs.find(
                  (doc) => doc._id?.toString() === docId
                );
                if (
                  docToRemove?.s3Key &&
                  typeof docToRemove.s3Key === "string" &&
                  docToRemove.s3Key.trim()
                ) {
                  filesToDelete.push(docToRemove.s3Key.trim());
                }
              });
            }
          }
        });
      }

      // Remove duplicates
      return [...new Set(filesToDelete)];
    } catch (error) {
      console.error("Error determining files to delete:", error);
      return filesToDelete;
    }
  }



  // Delete trade debtor (soft delete)
  static async deleteTradeDebtor(id, adminId) {
    try {
      const tradeDebtor = await AccountType.findById(id);
      if (!tradeDebtor) {
        throw createAppError("Trade debtor not found", 404, "DEBTOR_NOT_FOUND");
      }

      // Soft delete - mark as inactive
      const deletedTradeDebtor = await AccountType.findByIdAndUpdate(
        id,
        {
          isActive: false,
          status: "inactive",
          updatedBy: adminId,
        },
        { new: true }
      );

      return deletedTradeDebtor;
    } catch (error) {
      if (error.name === "CastError") {
        throw createAppError("Invalid trade debtor ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }

  // Hard delete trade debtor
  static async hardDeleteTradeDebtor(id) {
    try {
      const tradeDebtor = await AccountType.findById(id);
      if (!tradeDebtor) {
        throw createAppError("Trade debtor not found", 404, "DEBTOR_NOT_FOUND");
      }

      // Extract all S3 keys from the document
      const s3Keys = this.extractS3Keys(tradeDebtor);

      // console.log(
      //   `Preparing to delete trade debtor ${id} with ${s3Keys.length} associated files`
      // );

      // Delete the trade debtor from database first
      await AccountType.findByIdAndDelete(id);

      // Delete associated S3 files if any exist
      let s3DeletionResult = { successful: [], failed: [] };
      if (s3Keys.length > 0) {
        // console.log(
        //   `Deleting ${s3Keys.length} S3 files for trade debtor ${id}:`,
        //   s3Keys
        // );

        try {
          s3DeletionResult = await deleteMultipleS3Files(s3Keys);

          if (s3DeletionResult.failed?.length > 0) {
            console.warn(
              "Some S3 files could not be deleted:",
              s3DeletionResult.failed
            );
          }
        } catch (s3Error) {
          console.error("Error deleting S3 files:", s3Error);
          s3DeletionResult = {
            successful: [],
            failed: s3Keys.map((key) => ({ key, error: s3Error.message })),
          };
        }
      }

      const result = {
        message: "Trade debtor permanently deleted",
        filesDeleted: {
          total: s3Keys.length,
          successful: s3DeletionResult.successful?.length || 0,
          failed: s3DeletionResult.failed?.length || 0,
          successfulKeys:
            s3DeletionResult.successful?.map((result) => result.key) || [],
          failedKeys:
            s3DeletionResult.failed?.map((result) => result.key) || [],
        },
      };

      if (s3DeletionResult.failed?.length > 0) {
        result.message += " (warning: some files may remain in S3)";
        result.filesDeleted.errors = s3DeletionResult.failed;
      }

      return result;
    } catch (error) {
      if (error.name === "CastError") {
        throw createAppError("Invalid trade debtor ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }

  // Toggle status
  static async toggleStatus(id, adminId) {
    try {
      const tradeDebtor = await AccountType.findById(id);
      if (!tradeDebtor) {
        throw createAppError("Trade debtor not found", 404, "DEBTOR_NOT_FOUND");
      }

      const newStatus = tradeDebtor.status === "active" ? "inactive" : "active";
      const updatedTradeDebtor = await AccountType.findByIdAndUpdate(
        id,
        {
          status: newStatus,
          isActive: newStatus === "active",
          updatedBy: adminId,
        },
        { new: true }
      );

      return updatedTradeDebtor;
    } catch (error) {
      if (error.name === "CastError") {
        throw createAppError("Invalid trade debtor ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }

  // Get active debtors for dropdown
  static async getActiveDebtorsList() {
    try {
      const debtors = await AccountType.find(
        { isActive: true, status: "active" },
        { accountCode: 1, customerName: 1, shortName: 1 }
      ).sort({ customerName: 1 });

      return debtors;
    } catch (error) {
      throw createAppError(
        "Error fetching active debtors list",
        500,
        "FETCH_ERROR"
      );
    }
  }

  // Search debtors by name or code
  static async searchDebtors(searchTerm) {
    try {
      const debtors = await AccountType.find(
        {
          isActive: true,
          status: "active",
          $or: [
            { customerName: { $regex: searchTerm, $options: "i" } },
            { accountCode: { $regex: searchTerm, $options: "i" } },
            { shortName: { $regex: searchTerm, $options: "i" } },
          ],
        },
        { accountCode: 1, customerName: 1, shortName: 1 }
      ).limit(10);

      return debtors;
    } catch (error) {
      throw createAppError("Error searching debtors", 500, "SEARCH_ERROR");
    }
  }

  // Get debtor statistics
  static async getDebtorStatistics() {
    try {
      const stats = await AccountType.aggregate([
        {
          $group: {
            _id: null,
            totalDebtors: { $sum: 1 },
            activeDebtors: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
            },
            inactiveDebtors: {
              $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] },
            },
            suspendedDebtors: {
              $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] },
            },
          },
        },
      ]);

      const classificationStats = await AccountType.aggregate([
        {
          $group: {
            _id: "$classification",
            count: { $sum: 1 },
          },
        },
      ]);

      return {
        general: stats[0] || {
          totalDebtors: 0,
          activeDebtors: 0,
          inactiveDebtors: 0,
          suspendedDebtors: 0,
        },
        byClassification: classificationStats,
      };
    } catch (error) {
      throw createAppError(
        "Error fetching debtor statistics",
        500,
        "STATS_ERROR"
      );
    }
  }

  static _handleServiceError(error) {
    if (error.name === 'ValidationError') {
      const msgs = Object.values(error.errors).map((e) => e.message);
      throw createAppError(`Validation failed: ${msgs.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      throw createAppError(`Duplicate value for ${field}`, 400, 'DUPLICATE_FIELD');
    }
    if (error.name === 'CastError') {
      throw createAppError(`Invalid ID format`, 400, 'INVALID_ID');
    }
    throw error;
  }
}

export default AccountTypeService;
