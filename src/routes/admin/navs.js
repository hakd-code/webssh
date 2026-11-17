// /api/admin/navs 导航管理
const express = require('express')
const { z } = require('zod')
const prisma = require('../../db')
const { audit } = require('../../services/audit')
const { getIp } = require('../../utils')

const router = express.Router()

const navSchema = z.object({
  label: z.string().min(1, '名称不能为空').max(32),
  url: z.string().min(1, '链接不能为空').max(500),
  sort: z.number().int().min(0).max(9999).optional(),
  enabled: z.boolean().default(true),
  newWindow: z.boolean().default(false),
})
const navPatchSchema = navSchema.partial()

router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.navItem.findMany({ orderBy: { sort: 'asc' } })
    res.json({ items })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const body = navSchema.parse(req.body)
    const max = await prisma.navItem.aggregate({ _max: { sort: true } })
    const item = await prisma.navItem.create({
      data: {
        label: body.label,
        url: body.url.trim(),
        enabled: body.enabled,
        newWindow: body.newWindow,
        sort: body.sort ?? ((max._max.sort || 0) + 1),
      },
    })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_CREATE_NAV',
      detail: `新增导航「${item.label}」→ ${item.url}`,
      ip: getIp(req),
    })
    res.status(201).json({ item })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const item = await prisma.navItem.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ message: '导航项不存在' })
    const body = navPatchSchema.parse(req.body)
    const updated = await prisma.navItem.update({
      where: { id: item.id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.url !== undefined ? { url: body.url.trim() } : {}),
        ...(body.sort !== undefined ? { sort: body.sort } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.newWindow !== undefined ? { newWindow: body.newWindow } : {}),
      },
    })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_UPDATE_NAV',
      detail: `编辑导航「${updated.label}」`,
      ip: getIp(req),
    })
    res.json({ item: updated })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const item = await prisma.navItem.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ message: '导航项不存在' })
    await prisma.navItem.delete({ where: { id: item.id } })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_DELETE_NAV',
      detail: `删除导航「${item.label}」`,
      ip: getIp(req),
    })
    res.json({ message: '删除成功' })
  } catch (err) {
    next(err)
  }
})

/** 上移 / 下移 */
router.post('/:id/move', async (req, res, next) => {
  try {
    const direction = z.enum(['up', 'down']).parse((req.body || {}).direction)
    const item = await prisma.navItem.findUnique({ where: { id: req.params.id } })
    if (!item) return res.status(404).json({ message: '导航项不存在' })
    const neighbor =
      direction === 'up'
        ? await prisma.navItem.findFirst({
            where: { sort: { lt: item.sort } },
            orderBy: { sort: 'desc' },
          })
        : await prisma.navItem.findFirst({
            where: { sort: { gt: item.sort } },
            orderBy: { sort: 'asc' },
          })
    if (!neighbor) {
      return res.status(400).json({ message: direction === 'up' ? '已经在最顶部' : '已经在最底部' })
    }
    await prisma.$transaction([
      prisma.navItem.update({ where: { id: item.id }, data: { sort: neighbor.sort } }),
      prisma.navItem.update({ where: { id: neighbor.id }, data: { sort: item.sort } }),
    ])
    res.json({ message: '排序已更新' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
