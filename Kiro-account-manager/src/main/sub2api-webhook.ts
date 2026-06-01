import type { RegistrationResult } from './registration/registrar'

// sub2api Webhook 配置（存到 electron-store 的 sub2apiWebhook key）
//
// 用户在 KM 设置页填写 baseUrl + adminToken 后，注册流程结束时
// 自动 POST 到 sub2api 的 /api/v1/admin/accounts/import-kiro 接口，
// 把账号导入到 sub2api 账号池。
//
// sub2api 那边已经接受这种格式：
//   { content: JSON.stringify({email, idp, credentials:{accessToken,...}}), name_prefix }

// 与 main/index.ts 里的 wrapped store 形态对齐（只用到 get/set）
export interface KiroStoreLike {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

export interface Sub2apiWebhookConfig {
  enabled: boolean
  baseUrl: string       // 例：http://10.10.9.104:8080
  adminToken: string    // sub2api 管理员 Bearer token
  namePrefix?: string   // 可选，账号名前缀，默认 auto-kiro
  groupIds?: number[]   // 可选，自动绑分组 ID 列表
}

const STORE_KEY = 'sub2apiWebhook'

const DEFAULT_CONFIG: Sub2apiWebhookConfig = {
  enabled: false,
  baseUrl: '',
  adminToken: '',
  namePrefix: 'auto-kiro',
  groupIds: []
}

export function getSub2apiWebhookConfig(store: KiroStoreLike): Sub2apiWebhookConfig {
  const raw = store.get(STORE_KEY) as Partial<Sub2apiWebhookConfig> | undefined
  return { ...DEFAULT_CONFIG, ...(raw || {}) }
}

export function setSub2apiWebhookConfig(store: KiroStoreLike, cfg: Sub2apiWebhookConfig): Sub2apiWebhookConfig {
  // 简单清洗：trim + 去尾部斜杠
  const cleaned: Sub2apiWebhookConfig = {
    enabled: !!cfg.enabled,
    baseUrl: (cfg.baseUrl || '').trim().replace(/\/+$/, ''),
    adminToken: (cfg.adminToken || '').trim(),
    namePrefix: (cfg.namePrefix || '').trim() || 'auto-kiro',
    groupIds: Array.isArray(cfg.groupIds)
      ? cfg.groupIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : []
  }
  store.set(STORE_KEY, cleaned)
  return cleaned
}

// 测试连通性：调 sub2api /health（无副作用）
export async function testSub2apiWebhook(
  cfg: Sub2apiWebhookConfig
): Promise<{ ok: boolean; status?: number; message: string }> {
  if (!cfg.baseUrl) return { ok: false, message: '缺少 sub2api 地址' }
  try {
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/health`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const resp = await fetch(url, { method: 'GET', signal: ctrl.signal })
    clearTimeout(timer)
    if (resp.ok) {
      return { ok: true, status: resp.status, message: `连接成功 (HTTP ${resp.status})` }
    }
    return { ok: false, status: resp.status, message: `HTTP ${resp.status}` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

// 把单个注册结果推送到 sub2api
//
// 失败时抛错；调用方决定是否仅 log 警告。
export async function pushRegistrationToSub2api(
  cfg: Sub2apiWebhookConfig,
  result: RegistrationResult
): Promise<{ created: number; failed: number; accountId?: number; message?: string }> {
  if (!cfg.enabled) {
    throw new Error('webhook 未启用')
  }
  if (!cfg.baseUrl || !cfg.adminToken) {
    throw new Error('webhook 配置不完整（缺少 baseUrl 或 adminToken）')
  }
  if (result.status !== 'success') {
    throw new Error(`注册结果不是 success：${result.error || 'unknown'}`)
  }

  const payload = {
    email: result.email,
    idp: result.provider || 'BuilderId',
    credentials: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      clientId: result.clientId,
      clientSecret: result.clientSecret,
      region: result.region || 'us-east-1'
    }
  }

  const body = {
    content: JSON.stringify(payload),
    name_prefix: cfg.namePrefix || 'auto-kiro',
    group_ids: cfg.groupIds && cfg.groupIds.length > 0 ? cfg.groupIds : undefined
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api/v1/admin/accounts/import-kiro`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.adminToken}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
  } finally {
    clearTimeout(timer)
  }

  const respText = await resp.text()
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${respText.slice(0, 200)}`)
  }
  let parsed: { total?: number; created?: number; failed?: number; items?: Array<{ account_id?: number }>; errors?: Array<{ message?: string }> } = {}
  try {
    parsed = JSON.parse(respText)
  } catch {
    // 服务端返回非 JSON 但 200，宽松接受
  }
  const created = parsed.created || 0
  const failed = parsed.failed || 0
  const accountId = parsed.items?.find((i) => i?.account_id)?.account_id
  const errMsg = failed > 0 ? parsed.errors?.[0]?.message : undefined
  return { created, failed, accountId, message: errMsg }
}
