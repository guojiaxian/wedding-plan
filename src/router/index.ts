import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

export const NAV_ITEMS = [
  { path: '/', title: '备婚首页', icon: '🏠' },
  { path: '/budget', title: '花销规划', icon: '💰' },
  { path: '/items', title: '物品清单', icon: '🛍️' },
  { path: '/tasks', title: '筹备任务', icon: '📝' },
  { path: '/timeline', title: '婚礼流程', icon: '⏰' },
  { path: '/decorations', title: '现场布置', icon: '🎀' },
  { path: '/staff', title: '人员分工', icon: '👥' },
  { path: '/guests', title: '宾客名单', icon: '💌' },
  { path: '/settings', title: '设置', icon: '⚙️' }
]

// 移动端底部导航：两排各 5 个，常用模块放在下排，首页居中
const TAB_ITEMS = [
  { path: '/guests', title: '宾客', icon: '💌' },
  { path: '/decorations', title: '布置', icon: '🎀' },
  { path: '/staff', title: '分工', icon: '👥' },
  { path: '/settings', title: '设置', icon: '⚙️' },
  { path: '/more', title: '更多', icon: '🗂️' },
  { path: '/items', title: '清单', icon: '🛍️' },
  { path: '/tasks', title: '任务', icon: '📝' },
  { path: '/', title: '首页', icon: '🏠' },
  { path: '/budget', title: '花销', icon: '💰' },
  { path: '/timeline', title: '流程', icon: '⏰' }
]
export { TAB_ITEMS }

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { title: '登录', blank: true } },
    { path: '/', component: () => import('../views/DashboardView.vue'), meta: { title: '备婚首页' } },
    { path: '/budget', component: () => import('../views/BudgetView.vue'), meta: { title: '花销规划' } },
    { path: '/items', component: () => import('../views/ItemsView.vue'), meta: { title: '物品清单' } },
    { path: '/tasks', component: () => import('../views/TasksView.vue'), meta: { title: '筹备任务' } },
    { path: '/timeline', component: () => import('../views/TimelineView.vue'), meta: { title: '婚礼流程' } },
    { path: '/decorations', component: () => import('../views/DecorationsView.vue'), meta: { title: '现场布置' } },
    { path: '/staff', component: () => import('../views/StaffView.vue'), meta: { title: '人员分工' } },
    { path: '/guests', component: () => import('../views/GuestsView.vue'), meta: { title: '宾客名单' } },
    { path: '/settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/more', component: () => import('../views/MoreView.vue'), meta: { title: '更多功能' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.checked) await auth.fetchMe()
  if (to.meta.blank) return auth.user ? { path: '/' } : true
  if (!auth.user) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  return true
})

router.afterEach(to => {
  document.title = `${to.meta.title} · 备婚计划`
})

export default router
