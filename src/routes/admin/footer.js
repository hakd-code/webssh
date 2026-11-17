// /api/admin/footer 页脚管理(HTML 白名单过滤后存储)
const express = require('express')
const { z } = require('zod')
const sanitizeHtml = require('sanitize-html')
const { audit } = require('../../services/audit')
const { getAllSettings, saveSettings } = require('../../services/settings')
const { getIp } = require('../../utils')

const router = express.Router()

const ALLOWED_TAGS = ['a', 'p', 'br', 'span', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li']

const patchSchema = z.object({
  html: z.string().max(20000).optional(),
  copyright: z.string().max(200).optional(),
  icp: z.string().max(200).optional(),
})

router.get('/', async (req, res, next) => {
  try {
    const s = await getAllSettings()
    res.json({
      html: s.footerHtml || '',
      copyright: s.footerCopyright || '',
      icp: s.footerIcp || '',
    })
  } catch (err) {
    next(err)
  }
})

router.patch('/', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body)
    const entries = {}
    if (body.html !== undefined) {
      entries.footerHtml = sanitizeHtml(body.html, {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: {
          a: ['href', 'title', 'target'],
          span: ['style'],
          p: ['style'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
          a: (tagName, attribs) => ({
            tagName: 'a',
            attribs: { ...attribs, rel: 'noopener noreferrer nofollow' },
          }),
        },
      })
    }
    if (body.copyright !== undefined) entries.footerCopyright = body.copyright
    if (body.icp !== undefined) entries.footerIcp = body.icp
    if (Object.keys(entries).length > 0) await saveSettings(entries)
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_UPDATE_FOOTER',
      detail: `更新页脚设置:${Object.keys(entries).join(', ')}`,
      ip: getIp(req),
    })
    const s = await getAllSettings()
    res.json({
      html: s.footerHtml || '',
      copyright: s.footerCopyright || '',
      icp: s.footerIcp || '',
      message: '保存成功',
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
