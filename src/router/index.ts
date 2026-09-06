import { createRouter, createWebHistory } from 'vue-router'
import { isMode } from '@/core/types'
import SelectionView from '@/views/SelectionView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'selection',
      component: SelectionView,
    },
    {
      path: '/practice/:mode',
      name: 'practice',
      // Practice is only reachable after picking cases, so it is worth splitting out.
      component: () => import('@/views/PracticeView.vue'),
      props: true,
      beforeEnter: (to) => (isMode(to.params.mode) ? true : { name: 'selection' }),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'selection' },
    },
  ],
})

export default router
