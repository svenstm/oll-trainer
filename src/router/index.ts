import { createRouter, createWebHistory } from 'vue-router'
import { isMode } from '@/core/types'
import SelectionView from '@/views/SelectionView.vue'
import { useSelectionStore } from '@/stores/selection'

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
      beforeEnter: (to) => {
        if (!isMode(to.params.mode)) return { name: 'selection' }
        // Practice has nothing to serve without a selection.
        return useSelectionStore().isEmpty ? { name: 'selection' } : true
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'selection' },
    },
  ],
})

export default router
