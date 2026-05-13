import { defaultDailyPrompt, defaultWeeklyPrompt } from './aiPrompts.js'

export const AI_SETTINGS_DOC_ID = 'settings/ai'
export const DEFAULT_MODEL_PLACEHOLDER = 'GPT-5.5'

export const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com' },
  { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com' },
  { id: 'qwen', name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode' },
  { id: 'siliconflow', name: '硅基流动', baseURL: 'https://api.siliconflow.cn' },
  { id: 'custom', name: '自定义', baseURL: '' }
]

export const defaultAiSettings = {
  provider: 'openai',
  baseURL: 'https://api.openai.com',
  apiKey: '',
  model: '',
  dailyPrompt: defaultDailyPrompt,
  weeklyPrompt: defaultWeeklyPrompt,
  temperature: 0.3
}

export function getProviderDefaultBaseURL (provider) {
  return AI_PROVIDERS.find(item => item.id === provider)?.baseURL || ''
}

export function normalizeBaseURL (baseURL) {
  return String(baseURL || '').trim().replace(/\/+$/, '')
}

export function normalizeAiSettings (settings) {
  const source = settings || {}
  const temperature = Number(source.temperature)
  const provider = AI_PROVIDERS.some(item => item.id === source.provider) ? source.provider : defaultAiSettings.provider
  const baseURL = normalizeBaseURL(source.baseURL || getProviderDefaultBaseURL(provider))
  return {
    ...defaultAiSettings,
    ...source,
    provider,
    baseURL,
    apiKey: source.apiKey || '',
    model: source.model || '',
    dailyPrompt: source.dailyPrompt || defaultDailyPrompt,
    weeklyPrompt: source.weeklyPrompt || defaultWeeklyPrompt,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : defaultAiSettings.temperature
  }
}

export function updateAiProvider (settings, provider) {
  const nextProvider = AI_PROVIDERS.some(item => item.id === provider) ? provider : 'custom'
  return normalizeAiSettings({
    ...settings,
    provider: nextProvider,
    baseURL: getProviderDefaultBaseURL(nextProvider) || settings?.baseURL || ''
  })
}

export function validateAiSettings (settings) {
  if (!settings?.apiKey?.trim()) return '请先在 AI 设置中配置 API Key'
  if (!settings?.model?.trim()) return '请先配置 AI 模型名'
  if (!settings?.baseURL?.trim()) return '请先配置 AI 服务地址'
  try {
    const url = new URL(normalizeBaseURL(settings.baseURL))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'AI 服务地址格式不正确'
  } catch {
    return 'AI 服务地址格式不正确'
  }
  return ''
}

export function buildWeeklyInput (startDate, endDate, records) {
  const sections = (records || [])
    .filter(item => item.date >= startDate && item.date <= endDate && item.content?.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => `${item.date}\n${item.content.trim()}`)

  return [
    `日期范围：${startDate} 至 ${endDate}`,
    '',
    ...sections.join('\n\n').split('\n')
  ].join('\n').trimEnd()
}
