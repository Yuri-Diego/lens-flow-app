import express from 'express';
import businessRoutes from './routes/businessRouter.js';
import boxRoutes from './routes/boxRouter.js';

const routes = express.Router();

routes.use('/businesses', businessRoutes);
routes.use('/boxes', boxRoutes);

export default routes;