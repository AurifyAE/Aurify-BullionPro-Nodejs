import express from 'express';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import {
  createMetalRate,
  getAllMetalRates,
  getMetalRateById,
  updateMetalRate,
  deleteMetalRate,
  getActiveMetalRatesByDivision
} from '../../controllers/modules/MetalRateMasterController.js';

const router = express.Router();


router.use(authenticateToken);

// Metal Rate Master Routes
router.post('/', createMetalRate);                                    // POST /api/metal-rates
router.get('/', getAllMetalRates);                                    // GET /api/metal-rates
router.get('/division/:divisionId', getActiveMetalRatesByDivision);   // GET /api/metal-rates/division/:divisionId
router.get('/:id', getMetalRateById);                                 // GET /api/metal-rates/:id
router.put('/:id', updateMetalRate);                                  // PUT /api/metal-rates/:id
router.delete('/:id', deleteMetalRate);                               // DELETE /api/metal-rates/:id

export default router;