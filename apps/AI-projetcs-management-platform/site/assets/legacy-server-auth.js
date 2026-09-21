const LEGACY_USER_ID_KEY = 'ai_project_hub_user_id'
const LEGACY_AUTH_KEY = 'ai_project_hub_authenticated'
const LEGACY_LOGOUT_BRIDGE = '__AI_PROJECT_HUB_LOGOUT__'
const LEGACY_PERSPECTIVE_KEY = 'ai_project_hub_perspective'
const LEGACY_PERSPECTIVE_CAPABILITY = '__AI_PROJECT_HUB_CAN_SWITCH_PERSPECTIVE__'
const LEGACY_ACTIVE_PERSPECTIVE = '__AI_PROJECT_HUB_ACTIVE_PERSPECTIVE__'

function clearLegacyIdentity() {
  localStorage.removeItem(LEGACY_USER_ID_KEY)
  localStorage.removeItem(LEGACY_AUTH_KEY)
  sessionStorage.removeItem(LEGACY_AUTH_KEY)
  sessionStorage.removeItem(LEGACY_PERSPECTIVE_KEY)
  window[LEGACY_PERSPECTIVE_CAPABILITY] = false
  window[LEGACY_ACTIVE_PERSPECTIVE] = 'admin'
  document.documentElement.removeAttribute('data-project-hub-server-auth')
}

function returnToSecureShell() {
  const target = new URL('/', window.location.origin)
  target.searchParams.set('logged_out', '1')
  if (window.top && window.top !== window) {
    window.top.location.replace(target.toString())
    return
  }
  window.location.replace(target.toString())
}

function showAuthenticatedBootstrapError() {
  document.documentElement.setAttribute('data-project-hub-bootstrap-error', 'true')
  const root = document.getElementById('root')
  if (!root) return

  root.replaceChildren()
  const panel = document.createElement('main')
  panel.className = 'legacy-auth-bootstrap-error'
  panel.innerHTML =
    '<h1>系统界面加载失败</h1><p>你的飞书登录仍然有效。请刷新页面重试；不要重复授权。</p>'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = '刷新页面'
  retry.addEventListener('click', () => window.location.reload())
  panel.append(retry)
  root.append(panel)
}

async function performServerLogout(logoutButton) {
  const originalText = logoutButton?.textContent || ''
  logoutButton?.setAttribute('disabled', 'true')
  if (logoutButton) logoutButton.textContent = '正在安全退出…'

  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`退出接口返回 ${response.status}`)
    clearLegacyIdentity()
    returnToSecureShell()
  } catch (error) {
    console.error('[server-auth] logout failed', error)
    logoutButton?.removeAttribute('disabled')
    if (logoutButton) logoutButton.textContent = '退出失败，请重试'
    window.setTimeout(() => {
      if (logoutButton) logoutButton.textContent = originalText || '退出登录'
    }, 1800)
  }
}

function installServerLogout() {
  window[LEGACY_LOGOUT_BRIDGE] = performServerLogout
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return
      const logoutButton = event.target.closest('.sidebar-logout')
      if (!logoutButton) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void performServerLogout(logoutButton)
    },
    true,
  )
}

function keepAuthenticatedIdentityVisible(user) {
  const roleLabel = user.role === 'admin' ? '管理员' : user.role === 'tester' ? '内测用户' : '普通成员'
  const label = `${roleLabel} · 飞书已认证`
  const syncLabel = () => {
    const sidebarAccount = document.querySelector('.sidebar-foot')
    const accountMeta = sidebarAccount?.querySelector('small')
    const accountAvatar = sidebarAccount?.querySelector('.avatar')
    const feishuAvatarUrl = user.feishu_avatar_url || ''
    if (accountAvatar && feishuAvatarUrl && accountAvatar.dataset.feishuAvatarUrl !== feishuAvatarUrl) {
      const image = document.createElement('img')
      image.src = feishuAvatarUrl
      image.alt = user.name || 'Feishu user'
      image.referrerPolicy = 'no-referrer'
      accountAvatar.replaceChildren(image)
      accountAvatar.dataset.feishuAvatarUrl = feishuAvatarUrl
    }
    if (sidebarAccount?.getAttribute('title') !== '当前身份来自飞书统一认证') {
      sidebarAccount?.setAttribute('title', '当前身份来自飞书统一认证')
    }
    if (accountMeta && accountMeta.textContent !== label) accountMeta.textContent = label
  }
  const observer = new MutationObserver(syncLabel)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  syncLabel()
}

let response
let sessionValidationFailed = false
try {
  response = await fetch('/api/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
} catch (error) {
  console.error('[server-auth] session validation failed', error)
  sessionValidationFailed = true
}

if (sessionValidationFailed) {
  showAuthenticatedBootstrapError()
} else if (!response.ok) {
  clearLegacyIdentity()
  returnToSecureShell()
} else {
  try {
    const user = await response.json()
    const userId = Number(user.id)
    if (!Number.isFinite(userId) || userId <= 0) throw new Error('登录用户缺少有效 ID')

    localStorage.setItem(LEGACY_USER_ID_KEY, String(userId))
    localStorage.removeItem(LEGACY_AUTH_KEY)
    sessionStorage.setItem(LEGACY_AUTH_KEY, '1')
    document.documentElement.setAttribute('data-project-hub-server-auth', 'true')

    const canSwitchPerspective = user.can_switch_perspective === true
    if (!canSwitchPerspective) sessionStorage.removeItem(LEGACY_PERSPECTIVE_KEY)
    window[LEGACY_PERSPECTIVE_CAPABILITY] = canSwitchPerspective
    window[LEGACY_ACTIVE_PERSPECTIVE] =
      canSwitchPerspective && sessionStorage.getItem(LEGACY_PERSPECTIVE_KEY) === 'member'
        ? 'member'
        : 'admin'
    window.dispatchEvent(new CustomEvent('ai-project-hub:perspective-ready'))

    installServerLogout()
    keepAuthenticatedIdentityVisible(user)
    await import('/assets/index-CgLvW7V7.js')
  } catch (error) {
    console.error('[server-auth] authenticated UI bootstrap failed', error)
    showAuthenticatedBootstrapError()
  }
}
