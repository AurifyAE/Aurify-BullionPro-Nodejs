import { ReportService } from "../../services/modules/reportService.js";
import { DashboardService } from "../../services/modules/dashboardService.js";
import { DashboardReportService } from "../../services/modules/DashboardReportService.js";

const reportService = new ReportService();
const dashboardService = new DashboardService();
const dashboardReportService = new DashboardReportService();


export const getReports = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getReportsData(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const accountStatements = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getAccountStatementReports(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const getStockAnalysis = async (req, res) => {
  try {
    const filters = req.body;

    // Call service to get report data
    const reportData = await reportService.getStockAnalysis(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const getSalesAnalysis = async (req, res) => {
  try {
    const filters = req.body;

    // Call service to get report data
    const reportData = await reportService.getSalesAnalysis(filters);

    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : 'No transactions found for the specified criteria',
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters,
    });
  } catch (error) {
    console.error('Error in getSalesAnalysis:', error);

    // Handle specific error types
    if (error.message.includes('From date cannot be greater than to date')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range: From date cannot be greater than to date',
        error: 'INVALID_DATE_RANGE',
      });
    }

    if (error.message.includes('From date and to date are required')) {
      return res.status(400).json({
        success: false,
        message: 'From date and to date are required',
        error: 'MISSING_REQUIRED_FIELDS',
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating report',
      error: error.message,
    });
  }
};
export const getStockMovement = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getStockMovementReport(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const getStockBalance = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getStockBalanceReport(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const getTransactionSummary = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getTransactionSummary(filters);

    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });

  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);

    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }

    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const getOwnStock = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getOwnStockReport(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal stock ledger report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });
  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);
    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }
    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};

export const metalFixing = async (req, res) => {
  try {
    const filters = req.body;
    // Call service to get report data
    const reportData = await reportService.getMetalFixingReports(filters);
    // Return success response (even if no data found)
    res.status(200).json({
      success: true,
      message: reportData.totalRecords > 0
        ? `Metal Fixing report generated successfully with ${reportData.totalRecords} records`
        : "No transactions found for the specified criteria",
      data: reportData.data,
      totalRecords: reportData.totalRecords,
      filters: reportData.filters
    });
  } catch (error) {
    console.error("Error in getMetalStockLedgerReport:", error);
    // Handle specific error types
    if (error.message.includes("From date cannot be greater than to date")) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range: From date cannot be greater than to date",
        error: "INVALID_DATE_RANGE"
      });
    }
    if (error.message.includes("From date and to date are required")) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
        error: "MISSING_REQUIRED_FIELDS"
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Internal server error while generating report",
      error: error.message
    });
  }
};


export const getDashboard = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      transactionType: req.query.transactionType,
      status: req.query.status,
    };
    const { success, data } = await dashboardService.getDashboardData(filters);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data',
      });
    }
    // console.log(data,'data to dashboard.....')
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Dashboard controller error:', error);

    next(error);
  }
};
export const getDashboardReport = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      transactionType: req.query.transactionType,
      status: req.query.status,
    };
    const { success, data } = await dashboardReportService.getDashboardReport(filters);

    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data',
      });
    }
    // console.log(data,'data to dashboard.....')
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Dashboard controller error:', error);

    next(error);
  }
};