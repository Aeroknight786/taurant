import { Router } from 'express';
import * as Menu from '../controllers/menu.controller';
import { requireAuth, requireRole } from '../middleware/auth';
const router = Router();
router.get  ('/admin/current',         requireAuth, requireRole('OWNER','MANAGER'), Menu.getAdminMenu);
router.get  ('/:venueId',              Menu.getMenu);          // guest — no auth
router.post ('/categories',            requireAuth, requireRole('OWNER','MANAGER'), Menu.createCategory);
router.post ('/items',                 requireAuth, requireRole('OWNER','MANAGER'), Menu.createItem);
router.patch('/items/:itemId',         requireAuth, requireRole('OWNER','MANAGER'), Menu.updateItem);
router.patch('/items/:itemId/toggle',  requireAuth, requireRole('OWNER','MANAGER'), Menu.toggleItemAvailability);
router.delete('/items/:itemId',        requireAuth, requireRole('OWNER','MANAGER'), Menu.deleteItem);
export default router;
