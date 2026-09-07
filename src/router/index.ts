import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes as RouteRecordRaw[],
})

// The site is more than one page now, so the tab should say which one.
router.afterEach((to) => {
  if (typeof to.meta.title === 'string') document.title = to.meta.title
})

export default router
