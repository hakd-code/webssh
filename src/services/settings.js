// 站点设置读写服务
const prisma = require('../db')

/** 读取全部站点设置为对象 */
async function getAllSettings() {
  const rows = await prisma.siteSetting.findMany()
  const map = {}
  for (const row of rows) map[row.key] = row.value
  return map
}

/** 读取单个设置 */
async function getSetting(key) {
  const row = await prisma.siteSetting.findUnique({ where: { key } })
  return row ? row.value : null
}

/** 批量 upsert 设置 */
async function saveSettings(entries) {
  const ops = Object.entries(entries).map(([key, value]) =>
    prisma.siteSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    })
  )
  await prisma.$transaction(ops)
}

module.exports = { getAllSettings, getSetting, saveSettings }
