import express from 'express';
import businessRoutes from './routes/businessRouter.js';

const routes = express.Router();

routes.use('/business', businessRoutes);

export default routes;