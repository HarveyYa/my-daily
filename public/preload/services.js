const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
    // 读文件
    readFile(file) {
        return fs.readFileSync(file, {encoding: 'utf-8'})
    },
    // 文本写入到下载目录
    writeTextFile(text, filename) {
        const filePath = path.join(window.utools.getPath('downloads'), filename || (Date.now().toString() + '.txt'))
        fs.writeFileSync(filePath, text, {encoding: 'utf-8'})
        return filePath
    },
    exportDailyReport(date, text, ext = 'txt') {
        const safeExt = ext === 'md' ? 'md' : 'txt'
        return this.writeTextFile(text, `我的日报${date}.${safeExt}`)
    },
    exportWeeklyReport(startDate, endDate, text, ext = 'txt') {
        const safeExt = ext === 'md' ? 'md' : 'txt'
        return this.writeTextFile(text, `我的周报${startDate}至${endDate}.${safeExt}`)
    },
    fetchRichCalendar(year, month) {
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
    // 图片写入到下载目录
    writeImageFile(base64Url) {
        const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
        if (!matchs) return
        const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
        fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), {encoding: 'base64'})
        return filePath
    }
}
