export function getDailyAiResultId (date) {
  return `ai/daily/${date}`
}

export function getWeeklyAiResultId (startDate, endDate) {
  return `ai/weekly/${startDate}/${endDate}`
}

export function createDailyAiResultDoc ({ date, content, sourceContent, aiSettings, oldDoc, now = Date.now() }) {
  return {
    ...(oldDoc || {}),
    _id: getDailyAiResultId(date),
    type: 'daily',
    date,
    content,
    sourceContent,
    provider: aiSettings?.provider || '',
    model: aiSettings?.model || '',
    createdAt: oldDoc?.createdAt || now,
    updatedAt: now
  }
}

export function createWeeklyAiResultDoc ({
  startDate,
  endDate,
  content,
  sourceContent,
  aiSettings,
  oldDoc,
  now = Date.now()
}) {
  return {
    ...(oldDoc || {}),
    _id: getWeeklyAiResultId(startDate, endDate),
    type: 'weekly',
    startDate,
    endDate,
    content,
    sourceContent,
    provider: aiSettings?.provider || '',
    model: aiSettings?.model || '',
    createdAt: oldDoc?.createdAt || now,
    updatedAt: now
  }
}
