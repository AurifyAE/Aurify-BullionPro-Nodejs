import AccountType from "../../models/modules/AccountType.js";
import { createAppError } from "../../utils/errorHandler.js";
import { deleteMultipleS3Files } from "../../utils/s3Utils.js";
import bcrypt from "bcrypt";
import { hashPassword, encryptPassword, decryptPassword, verifyPassword } from "../../utils/passwordUtils.js";


class AccountTypeService {
  // Create new trade debtor
  static async createTradeDebtor(debtorData, adminId) {
    try {
      // Check if account code already exists
      const isCodeExists = await AccountType.isAccountCodeExists(
        debtorData.accountCode
      );
      if (isCodeExists) {
        throw createAppError(
          "Account code already exists",
          400,
          "DUPLICATE_ACCOUNT_CODE"
        );
      }


      // hash the password if provided
      if (debtorData.password) {
        // Hash for login
        const passwordHash = await hashPassword(debtorData.password);
        // Encrypt for admin
        const { encrypted, iv } = encryptPassword(debtorData.password);
        debtorData.passwordHash = passwordHash;
        debtorData.passwordEncrypted = encrypted;
        debtorData.passwordIV = iv
      }



      // Set created by
      debtorData.createdBy = adminId;

      // FIXED: Clean up empty objects to prevent validation errors
      if (debtorData.vatGstDetails && Object.keys(debtorData.vatGstDetails).length === 0) {
        delete debtorData.vatGstDetails; // Remove empty object
      }

      if (debtorData.kycDetails && Array.isArray(debtorData.kycDetails) && debtorData.kycDetails.length === 0) {
        delete debtorData.kycDetails; // Remove empty array
      }

      // Clean up kycDetails array - remove items that have no meaningful data
      if (debtorData.kycDetails && Array.isArray(debtorData.kycDetails)) {
        debtorData.kycDetails = debtorData.kycDetails.filter(kyc => {
          // Keep KYC record if it has documents or any meaningful data
          return (kyc.documents && kyc.documents.length > 0) ||
            kyc.documentType ||
            kyc.documentNumber ||
            kyc.issueDate ||
            kyc.expiryDate;
        });

        // If no valid KYC records remain, remove the field entirely
        if (debtorData.kycDetails.length === 0) {
          delete debtorData.kycDetails;
        }
      }

      // Ensure only one primary address (if addresses provided)
      if (debtorData.addresses && debtorData.addresses.length > 0) {
        let primaryFound = false;
        debtorData.addresses.forEach((address, index) => {
          if (address.isPrimary && !primaryFound) {
            primaryFound = true;
          } else if (address.isPrimary && primaryFound) {
            address.isPrimary = false;
          } else if (index === 0 && !primaryFound) {
            address.isPrimary = true;
            primaryFound = true;
          }
        });
      }

      // Ensure only one primary employee (if employees provided)
      if (debtorData.employees && debtorData.employees.length > 0) {
        let primaryFound = false;
        debtorData.employees.forEach((employee, index) => {
          if (employee.isPrimary && !primaryFound) {
            primaryFound = true;
          } else if (employee.isPrimary && primaryFound) {
            employee.isPrimary = false;
          } else if (index === 0 && !primaryFound) {
            employee.isPrimary = true;
            primaryFound = true;
          }
        });
      }

      // Ensure only one primary bank (if bank details provided)
      if (debtorData.bankDetails && debtorData.bankDetails.length > 0) {
        let primaryFound = false;
        debtorData.bankDetails.forEach((bank, index) => {
          if (bank.isPrimary && !primaryFound) {
            primaryFound = true;
          } else if (bank.isPrimary && primaryFound) {
            bank.isPrimary = false;
          } else if (index === 0 && !primaryFound) {
            bank.isPrimary = true;
            primaryFound = true;
          }
        });
      }

      // Ensure only one default currency in acDefinition (required field)
      if (debtorData.acDefinition && debtorData.acDefinition.currencies && debtorData.acDefinition.currencies.length > 0) {
        let defaultFound = false;
        debtorData.acDefinition.currencies.forEach((currency, index) => {
          if (currency.isDefault && !defaultFound) {
            defaultFound = true;
          } else if (currency.isDefault && defaultFound) {
            currency.isDefault = false;
          } else if (index === 0 && !defaultFound) {
            currency.isDefault = true;
            defaultFound = true;
          }
        });
      }

      // Ensure only one default branch (if branches provided)
      if (debtorData.acDefinition && debtorData.acDefinition.branches && debtorData.acDefinition.branches.length > 0) {
        let defaultFound = false;
        debtorData.acDefinition.branches.forEach((branch, index) => {
          if (branch.isDefault && !defaultFound) {
            defaultFound = true;
          } else if (branch.isDefault && defaultFound) {
            branch.isDefault = false;
          } else if (index === 0 && !defaultFound) {
            branch.isDefault = true;
            defaultFound = true;
          }
        });
      }

      // Handle remaining KYC details if they exist
      if (debtorData.kycDetails && Array.isArray(debtorData.kycDetails)) {
        debtorData.kycDetails.forEach(kyc => {
          if (!kyc.documents) {
            kyc.documents = [];
          }
          if (kyc.isVerified === undefined) {
            kyc.isVerified = false;
          }
          // Don't set issueDate if it's not provided - let schema handle defaults
        });
      }

      // handle the password field and add to debtorData
      if (!debtorData.password) {
        debtorData.password = null; // or set to a default hashed password if required
      }


      // Create trade debtor - schema will handle defaults
      const tradeDebtor = new AccountType(debtorData);
      await tradeDebtor.save();

      // Populate references for response
      await tradeDebtor.populate([
        {
          path: "acDefinition.currencies.currency",
          select: "currencyCode currencyName symbol description",
        },
        {
          path: "acDefinition.branches.branch",
          select: "branchCode branchName address",
        },
        {
          path: "balances.cashBalance.currency",
          select: "currencyCode currencyName symbol",
        },
        {
          path: "createdBy",
          select: "name email role",
        },
      ]);

      return tradeDebtor;
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(
          `Validation failed: ${messages.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }

      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw createAppError(
          `Duplicate value for field: ${field}`,
          400,
          "DUPLICATE_FIELD_VALUE"
        );
      }

      if (error.name === "CastError") {
        throw createAppError(
          `Invalid value for field: ${error.path}`,
          400,
          "INVALID_FIELD_VALUE"
        );
      }

      throw error;
    }
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

      // Sort options
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

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
          .sort(sort)
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

  static async updateTradeDebtor(id, updateData, adminId) {
    try {
      const tradeDebtor = await AccountType.findById(id);
      if (!tradeDebtor) {
        throw createAppError("Trade debtor not found", 404, "DEBTOR_NOT_FOUND");
      }

      // Check if account code is being updated and if it already exists
      if (
        updateData.accountCode &&
        updateData.accountCode !== tradeDebtor.accountCode
      ) {
        const isCodeExists = await AccountType.isAccountCodeExists(
          updateData.accountCode,
          id
        );
        if (isCodeExists) {
          throw createAppError(
            "Account code already exists",
            400,
            "DUPLICATE_ACCOUNT_CODE"
          );
        }
      }

      // Determine which files need to be deleted
      const filesToDelete = this.getFilesToDelete(tradeDebtor, updateData);

      // Process document updates with proper merging
      if (updateData.vatGstDetails?.documents) {
        const oldVatDocs = tradeDebtor.vatGstDetails?.documents || [];

        if (updateData._replaceVatDocuments) {
          // Complete replacement - just use new documents
          // filesToDelete already contains old files
        } else if (updateData._removeVatDocuments?.length) {
          // Selective removal - merge remaining old docs with new docs
          const remainingOldDocs = oldVatDocs.filter(
            (doc) =>
              !updateData._removeVatDocuments.includes(doc._id?.toString())
          );
          updateData.vatGstDetails.documents = [
            ...remainingOldDocs,
            ...updateData.vatGstDetails.documents,
          ];
        } else {
          // Append mode - add new documents to existing ones
          updateData.vatGstDetails.documents = [
            ...oldVatDocs,
            ...updateData.vatGstDetails.documents,
          ];
        }
      }

      // Process KYC document updates
      if (updateData.kycDetails?.length) {
        updateData.kycDetails.forEach((kycUpdate, index) => {
          if (kycUpdate.documents) {
            const oldKycDocs = tradeDebtor.kycDetails?.[index]?.documents || [];

            if (kycUpdate._replaceDocuments) {
              // Complete replacement - just use new documents
              // filesToDelete already contains old files
            } else if (kycUpdate._removeDocuments?.length) {
              // Selective removal - merge remaining old docs with new docs
              const remainingOldDocs = oldKycDocs.filter(
                (doc) =>
                  !kycUpdate._removeDocuments.includes(doc._id?.toString())
              );
              kycUpdate.documents = [
                ...remainingOldDocs,
                ...kycUpdate.documents,
              ];
            } else {
              // Append mode - add new documents to existing ones
              kycUpdate.documents = [...oldKycDocs, ...kycUpdate.documents];
            }
          }
        });
      }

      // Clean up temporary flags used for file management
      delete updateData._replaceVatDocuments;
      delete updateData._removeVatDocuments;
      if (updateData.kycDetails) {
        updateData.kycDetails.forEach((kyc) => {
          delete kyc._replaceDocuments;
          delete kyc._removeDocuments;
        });
      }

      // Set updated by and timestamp
      updateData.updatedBy = adminId;
      updateData.updatedAt = new Date();

      // Update the database first
      const updatedTradeDebtor = await AccountType.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate([
        {
          path: "acDefinition.currencies.currency",
          select: "code name symbol",
        },
        { path: "acDefinition.branches.branch", select: "code name" },
        // { path: "limitsMargins.currency", select: "code name symbol" }, // Dont need to populate limitsMargins here
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      // Delete old S3 files if any need to be removed (after successful DB update)
      let s3DeletionResult = { successful: [], failed: [] };
      if (filesToDelete.length > 0) {
        console.log(
          `Deleting ${filesToDelete.length} replaced/removed S3 files:`,
          filesToDelete
        );

        try {
          s3DeletionResult = await deleteMultipleS3Files(filesToDelete);

          if (s3DeletionResult.failed?.length > 0) {
            console.warn(
              "Some S3 files could not be deleted:",
              s3DeletionResult.failed
            );
          }

          if (s3DeletionResult.successful?.length > 0) {
            console.log(
              `Successfully deleted ${s3DeletionResult.successful.length} S3 files`
            );
          }
        } catch (s3Error) {
          console.error("Error deleting S3 files:", s3Error);
          // Don't fail the update operation if S3 deletion fails
          s3DeletionResult = {
            successful: [],
            failed: filesToDelete.map((key) => ({
              key,
              error: s3Error.message,
            })),
          };
        }
      }

      return {
        ...updatedTradeDebtor.toObject(),
        _filesManagement: {
          filesDeleted: s3DeletionResult.successful?.length || 0,
          filesFailedToDelete: s3DeletionResult.failed?.length || 0,
          deletedKeys:
            s3DeletionResult.successful?.map((result) => result.key) || [],
          failedKeys:
            s3DeletionResult.failed?.map((result) => result.key) || [],
        },
      };
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(
          `Validation failed: ${messages.join(", ")}`,
          400,
          "VALIDATION_ERROR"
        );
      }
      if (error.name === "CastError") {
        throw createAppError("Invalid trade debtor ID", 400, "INVALID_ID");
      }
      throw error;
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

      console.log(
        `Preparing to delete trade debtor ${id} with ${s3Keys.length} associated files`
      );

      // Delete the trade debtor from database first
      await AccountType.findByIdAndDelete(id);

      // Delete associated S3 files if any exist
      let s3DeletionResult = { successful: [], failed: [] };
      if (s3Keys.length > 0) {
        console.log(
          `Deleting ${s3Keys.length} S3 files for trade debtor ${id}:`,
          s3Keys
        );

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
}

export default AccountTypeService;
