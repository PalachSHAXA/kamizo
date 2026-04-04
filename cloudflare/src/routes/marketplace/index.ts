// Barrel: registers all marketplace routes

import { registerCategoryRoutes } from './categories';
import { registerAdRoutes } from './ads';
import { registerAdPublicRoutes } from './ads-public';
import { registerCouponRoutes } from './coupons';
import { registerProductRoutes } from './products';
import { registerCartRoutes } from './cart';
import { registerOrderRoutes } from './orders';
import { registerOrderActionRoutes } from './orders-actions';
import { registerDeliveryRoutes } from './delivery';
import { registerAdminOrderRoutes } from './admin-orders';
import { registerAdminDashboardRoutes } from './admin-dashboard';
import { registerAdminProductRoutes } from './admin-products';

export function registerMarketplaceRoutes() {
  registerCategoryRoutes();
  registerAdRoutes();
  registerAdPublicRoutes();
  registerCouponRoutes();
  registerProductRoutes();
  registerCartRoutes();
  registerOrderRoutes();
  registerOrderActionRoutes();
  registerDeliveryRoutes();
  registerAdminOrderRoutes();
  registerAdminDashboardRoutes();
  registerAdminProductRoutes();
}
