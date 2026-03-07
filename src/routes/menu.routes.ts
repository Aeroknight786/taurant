import { Router } from 'express';
import * as Menu from '../controllers/menu.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { operatorReadLimiter, operatorWriteLimiter } from '../middleware/rateLimiter';
const router = Router();
router.get  ('/admin/current',         requireAuth, requireRole('OWNER','MANAGER'), operatorReadLimiter, Menu.getAdminMenu);
router.get  ('/:venueId',              Menu.getMenu);          // guest — no auth
router.post ('/categories',            requireAuth, requireRole('OWNER','MANAGER'), operatorWriteLimiter, Menu.createCategory);
router.post ('/items',                 requireAuth, requireRole('OWNER','MANAGER'), operatorWriteLimiter, Menu.createItem);
router.patch('/items/:itemId',         requireAuth, requireRole('OWNER','MANAGER'), operatorWriteLimiter, Menu.updateItem);
router.patch('/items/:itemId/toggle',  requireAuth, requireRole('OWNER','MANAGER'), operatorWriteLimiter, Menu.toggleItemAvailability);
router.delete('/items/:itemId',        requireAuth, requireRole('OWNER','MANAGER'), operatorWriteLimiter, Menu.deleteItem);
export default router;
