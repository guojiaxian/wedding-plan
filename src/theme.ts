// 主题切换：minimal = 简约清新（默认）；ivory = 西式白花；romance = 浪漫粉金
export type ThemeName = 'minimal' | 'ivory' | 'romance'

const KEY = 'wedding-theme'
export const THEME_LABEL: Record<ThemeName, string> = {
  minimal: '简约清新',
  ivory: '西式白花',
  romance: '浪漫粉金'
}
export const THEME_ORDER: ThemeName[] = ['minimal', 'ivory', 'romance']

export function currentTheme(): ThemeName {
  const t = localStorage.getItem(KEY)
  return t === 'romance' || t === 'ivory' ? t : 'minimal'
}

export function applyTheme(t: ThemeName) {
  if (t === 'minimal') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(KEY, t)
}
