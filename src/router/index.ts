import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { isMode } from '@/core/types'
import LandingView from '@/views/LandingView.vue'
import { useSelectionStore } from '@/stores/selection'

const SITE_NAME = 'Sunetzu'

/**
 * Exported so the view tests drive the real table under a memory history,
 * rather than restating it. A duplicated table lets the tests pass while the
 * paths the app actually ships are wrong.
 */
export const routes: readonly RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    // Eager: this is the entry route, so lazy-loading it would only add a
    // round trip before first paint.
    component: LandingView,
    meta: { title: `${SITE_NAME} — The Art of the Last Layer` },
  },
  {
    path: '/oll-trainer',
    name: 'selection',
    // Lazy: someone who reads the landing page and leaves never pays for the
    // case grid or the case data behind it.
    component: () => import('@/views/SelectionView.vue'),
    meta: { title: `Cases · ${SITE_NAME}` },
  },
  {
    path: '/oll-trainer/practice/:mode',
    name: 'practice',
    // Practice is only reachable after picking cases, so it is worth splitting out.
    component: () => import('@/views/PracticeView.vue'),
    props: true,
    meta: { title: `Practice · ${SITE_NAME}` },
    beforeEnter: (to) => {
      if (!isMode(to.params.mode)) return { name: 'selection' }
      // Practice has nothing to serve without a selection.
      return useSelectionStore().isEmpty ? { name: 'selection' } : true
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'landing' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes as RouteRecordRaw[],
})

// The site is more than one page now, so the tab should say which one.
router.afterEach((to) => {
  if (typeof to.meta.title === 'string') document.title = to.meta.title
})

export default router
