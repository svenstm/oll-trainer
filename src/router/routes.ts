/**
 * The route table, kept apart from `index.ts` so it can be imported without
 * constructing a router. `createWebHistory` touches `window` at module load,
 * which would make this table unusable from any node-environment test.
 */

import type { RouteRecordRaw } from 'vue-router'
import { isMode } from '@/core/types'
import LandingView from '@/views/LandingView.vue'
import { useSelectionStore } from '@/stores/selection'

export const SITE_NAME = 'Sunetzu'

/** Where the trainer lives; '/' is the landing page. */
export const TRAINER_PATH = '/oll-trainer'

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
    path: TRAINER_PATH,
    name: 'selection',
    // Lazy: someone who reads the landing page and leaves never pays for the
    // case grid or the case data behind it.
    component: () => import('@/views/SelectionView.vue'),
    meta: { title: `Cases · ${SITE_NAME}` },
  },
  {
    path: `${TRAINER_PATH}/practice/:mode`,
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
