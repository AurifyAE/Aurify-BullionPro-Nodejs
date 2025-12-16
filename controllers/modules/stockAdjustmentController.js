import StockAdjustmentService from '../../services/modules/stockAdjustmentService.js';


export const createStockAdjustment = async (req, res, next) => {
    try {
        console.log(req.admin)
        const adminId = req.admin?.id;
        console.log("Admin ID:", adminId);

        if (!adminId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const newStockAdjustment =
            await StockAdjustmentService.addStockAdjustment(req.body, adminId);

        res.status(201).json({
            success: true,
            data: newStockAdjustment,
        });
    } catch (error) {
        next(error);
    }
};


export const getAllStockAdjustments = async (req, res, next) => {
    try {
        const result = await StockAdjustmentService.getAllStockAdjustments(req.query);

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

export const getStockAdjustmentById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: "Stock adjustment ID is required" });
        }

        const adjustment =
            await StockAdjustmentService.getStockAdjustmentById(id);

        res.status(200).json({
            success: true,
            data: adjustment,
        });
    } catch (error) {
        next(error);
    }
};


export const updateStockAdjustment = async (req, res, next) => {
    // To be implemented
}

export const deleteStockAdjustment = async (req, res, next) => {
    // To be implemented
}