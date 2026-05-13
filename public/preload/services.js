const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const DEFAULT_BASE_URL = 'https://api.openai.com'
const DEFAULT_DAILY_PROMPT = '请优化以下日报，保留事实，不新增未提及内容，使表达更清晰、适合发送给团队，不要MD格式。'
const DEFAULT_WEEKLY_PROMPT = '请基于以下日报总结周报，按本周完成、重点进展、问题与风险、下周计划输出，不要MD格式。'

function normalizeBaseURL (baseURL) {
  return String(baseURL || '').trim().replace(/\/+$/, '')
}

function normalizeAiConfig (config) {
  const source = config || {}
  const temperature = Number(source.temperature)
  return {
    provider: source.provider || 'openai',
    baseURL: normalizeBaseURL(source.baseURL || DEFAULT_BASE_URL),
    apiKey: source.apiKey || '',
    model: source.model || '',
    dailyPrompt: source.dailyPrompt || DEFAULT_DAILY_PROMPT,
    weeklyPrompt: source.weeklyPrompt || DEFAULT_WEEKLY_PROMPT,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.3
  }
}

function getChatCompletionText (response) {
  return response?.choices?.map(choice => choice?.message?.content || '').filter(Boolean).join('\n').trim() || ''
}

function createAIError (statusCode, body) {
  if (statusCode === 401 || statusCode === 403) return new Error('AI 鉴权失败，请检查 API Key')
  const message = body?.error?.message || body?.message
  if (message) return new Error(`AI 请求失败：${message}`)
  return new Error('请求 AI 服务失败，请稍后重试')
}

function parseServiceURL (baseURL) {
  if (!baseURL) throw new Error('请先配置 AI 服务地址')
  let url
  try {
    url = new URL(baseURL)
  } catch {
    throw new Error('AI 服务地址格式不正确')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('AI 服务地址格式不正确')
  return url
}

function postChatCompletion (config, payload) {
  const serviceURL = parseServiceURL(config.baseURL)
  const requestPath = `${serviceURL.pathname.replace(/\/+$/, '')}/v1/chat/completions`.replace(/^\/?/, '/')
  const body = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const client = serviceURL.protocol === 'http:' ? require('node:http') : https
    const req = client.request({
      hostname: serviceURL.hostname,
      port: serviceURL.port || undefined,
      path: requestPath,
      method: 'POST',
      headers: {
        'authorization': `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        responseBody += chunk
      })
      res.on('end', () => {
        let parsed = null
        try {
          parsed = responseBody ? JSON.parse(responseBody) : null
        } catch {
          parsed = null
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(createAIError(res.statusCode, parsed))
          return
        }
        resolve(parsed)
      })
    })
    req.on('error', () => reject(new Error('请求 AI 服务失败，请稍后重试')))
    req.write(body)
    req.end()
  })
}

function buildWeeklyInput (startDate, endDate, dailyRecords) {
  const sections = (dailyRecords || [])
    .filter(item => item.date >= startDate && item.date <= endDate && item.content?.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => `${item.date}\n${item.content.trim()}`)

  return [
    `日期范围：${startDate} 至 ${endDate}`,
    '',
    ...sections.join('\n\n').split('\n')
  ].join('\n').trimEnd()
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  // 文本写入到下载目录
  writeTextFile (text, filename) {
    const filePath = path.join(window.utools.getPath('downloads'), filename || (Date.now().toString() + '.txt'))
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  exportDailyReport (date, text, ext = 'txt') {
    const safeExt = ext === 'md' ? 'md' : 'txt'
    return this.writeTextFile(text, `我的日报${date}.${safeExt}`)
  },
  exportWeeklyReport (startDate, endDate, text, ext = 'txt') {
    const safeExt = ext === 'md' ? 'md' : 'txt'
    return this.writeTextFile(text, `我的周报${startDate}至${endDate}.${safeExt}`)
  },
  fetchRichCalendar (year, month) {
    const url = `https://cn.bing.com/richcalendar/fetch?year=${year}&month=${month}&day=1`
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'user-agent': 'Mozilla/5.0'
        }
      }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => resolve(body))
      }).on('error', reject)
    })
  },
  async callOpenAI (config, messages) {
    const aiConfig = normalizeAiConfig(config)
    if (!aiConfig.apiKey.trim()) throw new Error('请先在 AI 设置中配置 API Key')
    if (!aiConfig.model.trim()) throw new Error('请先配置 AI 模型名')
    parseServiceURL(aiConfig.baseURL)

    const response = await postChatCompletion(aiConfig, {
      model: aiConfig.model,
      messages,
      temperature: aiConfig.temperature
    })
    const text = getChatCompletionText(response)
    if (!text) throw new Error('AI 未返回可用内容')
    return text
  },
  optimizeDailyReport (config, content) {
    const aiConfig = normalizeAiConfig(config)
    const body = content?.trim()
    if (!body) return Promise.reject(new Error('当前日报为空，无法优化'))
    return this.callOpenAI(aiConfig, [
      {
        role: 'system',
        content: aiConfig.dailyPrompt
      },
      {
        role: 'user',
        content: body
      }
    ])
  },
  summarizeWeeklyReport (config, startDate, endDate, dailyRecords) {
    const aiConfig = normalizeAiConfig(config)
    const body = buildWeeklyInput(startDate, endDate, dailyRecords)
    if (!dailyRecords?.some(item => item.date >= startDate && item.date <= endDate && item.content?.trim())) {
      return Promise.reject(new Error('所选日期范围内没有日报内容'))
    }
    return this.callOpenAI(aiConfig, [
      {
        role: 'system',
        content: aiConfig.weeklyPrompt
      },
      {
        role: 'user',
        content: body
      }
    ])
  },
  // 图片写入到下载目录
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  }
}
