async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any))
    // 会话过期：跳转登录页（登录/登出等认证接口由路由守卫处理，避免循环跳转）
    if (res.status === 401 && !url.startsWith('/auth/') && location.pathname !== '/login') {
      const back = location.pathname + location.search
      location.href = back === '/' ? '/login' : `/login?redirect=${encodeURIComponent(back)}`
    }
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(url: string) => req<T>('GET', url),
  post: <T>(url: string, body?: unknown) => req<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => req<T>('PUT', url, body),
  del: <T>(url: string) => req<T>('DELETE', url)
}

// 轻量提示
let toastEl: HTMLDivElement | null = null
let hideTimer: number | undefined
export function toast(msg: string, type: 'ok' | 'err' = 'ok') {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:999;padding:10px 20px;border-radius:999px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);transition:opacity .25s;pointer-events:none;max-width:80vw;text-align:center'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = msg
  toastEl.style.background = type === 'ok' ? 'rgba(52, 50, 46, 0.92)' : 'rgba(190, 84, 84, 0.95)'
  toastEl.style.opacity = '1'
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => { if (toastEl) toastEl.style.opacity = '0' }, 2200)
}

// 金额格式化
export function money(n: number | null | undefined): string {
  const v = Number(n || 0)
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
