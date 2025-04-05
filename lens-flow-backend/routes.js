import express from 'express';
import businessRoutes from './routes/businessRouter.js';
import boxRoutes from './routes/boxRouter.js';
import movementRoutes from './routes/movementRouter.js';
import movementSheetRoutes from './routes/movementSheetRouter.js';

const routes = express.Router();

routes.use('/businesses', businessRoutes);
routes.use('/boxes', boxRoutes);
routes.use('/movements', movementRoutes);
routes.use('/movement-sheets', movementSheetRoutes);

export default routes;