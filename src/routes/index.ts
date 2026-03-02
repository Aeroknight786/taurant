import { Router } from 'express';
import authRoutes    from './auth.routes';
import venueRoutes   from './venue.routes';
import queueRoutes   from './queue.routes';
import tableRoutes   from './table.routes';
import menuRoutes    from './menu.routes';
import orderRoutes   from './order.routes';
import paymentRoutes from './payment.routes';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'flock-api', ts: new Date().toISOString() }));

router.use('/auth',     authRoutes);
router.use('/venues',   venueRoutes);
router.use('/queue',    queueRoutes);
router.use('/tables',   tableRoutes);
router.use('/menu',     menuRoutes);
router.use('/orders',   orderRoutes);
router.use('/payments', paymentRoutes);

export default router;
