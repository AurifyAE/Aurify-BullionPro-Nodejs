import DraftingService from "../../services/modules/draftingService.js";
import { parseGoldCertificatePDF } from "../../utils/pdfParser.js";
import fs from "fs";
import path from "path";

// Helper function to parse FormData fields
const parseFormDataField = (value) => {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  
  // Try to parse as number
  if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
    return parseFloat(value);
  }
  
  // Try to parse as boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Try to parse as JSON
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
    try {
      return JSON.parse(value);
    } catch {
      // Not valid JSON, return as string
    }
  }
  
  // Return as string or original value
  return value;
};

// Helper function to parse draft data from FormData
const parseDraftDataFromFormData = (body) => {
  const draftData = {};
  
  Object.keys(body).forEach((key) => {
    if (key !== 'labReportPdf') {
      draftData[key] = parseFormDataField(body[key]);
    }
  });
  
  return draftData;
};

class DraftingController {
  // Parse PDF and return extracted data
  static async parsePDF(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No PDF file uploaded",
        });
      }

      // Check if file is PDF
      if (req.file.mimetype !== "application/pdf") {
        // Clean up uploaded file
        if (req.file.path) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "File must be a PDF",
        });
      }

      // Parse PDF
      const parsedData = await parseGoldCertificatePDF(req.file.path);

      // Clean up temporary file after parsing
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(200).json({
        success: true,
        message: "PDF parsed successfully",
        data: parsedData,
      });
    } catch (error) {
      console.error("Error parsing PDF:", error);
      
      // Clean up file on error
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error("Error deleting temp file:", unlinkError);
        }
      }

      return res.status(500).json({
        success: false,
        message: error.message || "Failed to parse PDF",
      });
    }
  }

  // Create a new draft
  static async createDraft(req, res, next) {
    try {
      // Handle multipart/form-data (with PDF) or JSON data
      let draftData;
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // Extract data from FormData
        draftData = parseDraftDataFromFormData(req.body);
        
        // Handle lab report PDF if uploaded
        if (req.fileInfo) {
          draftData.labReportPdf = {
            url: req.fileInfo.location || req.fileInfo.path,
            key: req.fileInfo.filename || req.fileInfo.key,
          };
        }
      } else {
        // Regular JSON data
        draftData = req.body;
      }
      
      const adminId = req.admin.id;

      const draft = await DraftingService.createDraft(draftData, adminId);

      return res.status(201).json({
        success: true,
        message: "Draft created successfully",
        data: draft,
      });
    } catch (error) {
      console.error("Error creating draft:", error);
      
      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
        const value = error.keyValue ? Object.values(error.keyValue)[0] : 'value';
        return res.status(409).json({
          success: false,
          message: `A draft with this ${field} (${value}) already exists. Please try again.`,
          error: "DUPLICATE_KEY_ERROR",
        });
      }
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validation error: ${errors}`,
          error: "VALIDATION_ERROR",
        });
      }
      
      // Handle custom error messages
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to create draft. Please try again.",
        error: error.name || "INTERNAL_ERROR",
      });
    }
  }

  // Get all drafts
  static async getAllDrafts(req, res, next) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const adminId = req.admin.id;

      const result = await DraftingService.getAllDrafts(
        adminId,
        parseInt(page),
        parseInt(limit),
        search
      );

      return res.status(200).json({
        success: true,
        message: "Drafts fetched successfully",
        data: result.drafts,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalDrafts: result.totalDrafts,
        },
      });
    } catch (error) {
      console.error("Error fetching drafts:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch drafts",
      });
    }
  }

  // Get draft by ID
  static async getDraftById(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.admin.id;

      const draft = await DraftingService.getDraftById(id, adminId);

      if (!draft) {
        return res.status(404).json({
          success: false,
          message: "Draft not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Draft fetched successfully",
        data: draft,
      });
    } catch (error) {
      console.error("Error fetching draft:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch draft",
      });
    }
  }

  // Update draft
  static async updateDraft(req, res, next) {
    try {
      const { id } = req.params;
      
      // Handle multipart/form-data (with PDF) or JSON data
      let draftData;
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // Extract data from FormData
        draftData = parseDraftDataFromFormData(req.body);
        
        // Handle lab report PDF if uploaded (only update if new file is provided)
        if (req.fileInfo) {
          draftData.labReportPdf = {
            url: req.fileInfo.location || req.fileInfo.path,
            key: req.fileInfo.filename || req.fileInfo.key,
          };
        }
      } else {
        // Regular JSON data
        draftData = req.body;
      }
      
      const adminId = req.admin.id;

      const draft = await DraftingService.updateDraft(id, draftData, adminId);

      if (!draft) {
        return res.status(404).json({
          success: false,
          message: "Draft not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Draft updated successfully",
        data: draft,
      });
    } catch (error) {
      console.error("Error updating draft:", error);
      
      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
        const value = error.keyValue ? Object.values(error.keyValue)[0] : 'value';
        return res.status(409).json({
          success: false,
          message: `A draft with this ${field} (${value}) already exists. Please use a different value.`,
          error: "DUPLICATE_KEY_ERROR",
        });
      }
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validation error: ${errors}`,
          error: "VALIDATION_ERROR",
        });
      }
      
      // Handle custom error messages
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || "Failed to update draft. Please try again.",
        error: error.name || "INTERNAL_ERROR",
      });
    }
  }

  // Delete draft
  static async deleteDraft(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.admin.id;

      const deleted = await DraftingService.deleteDraft(id, adminId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Draft not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Draft deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting draft:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete draft",
      });
    }
  }
}

export default DraftingController;

