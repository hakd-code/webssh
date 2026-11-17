// /api/admin/users 用户管理
const express = require('express')
const bcrypt = require('bcryptjs')
const { z } = require('zod')
const prisma = require('../../db')
const { audit } = require('../../services/audit')
const { getIp, randomPassword } = require('../../utils')

const router = express.Router()

const patchSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  email: z.string().email('邮箱格式不正确').max(255).optional(),
  password: z.string().min(8, '密码至少 8 位').max(72).optional(),
})

/** 用户列表:分页 + 搜索(用户名/邮箱) */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10))
    const search = String(req.query.search || '').trim()
    const where = search
      ? {
          OR: [
            { username: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { profiles: true } } },
      }),
    ])
    res.json({
      total,
      page,
      pageSize,
      items: rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        status: u.status,
        theme: u.theme,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        profileCount: u._count.profiles,
      })),
    })
  } catch (err) {
    next(err)
  }
})

async function countOtherAdmins(excludeId) {
  return prisma.user.count({ where: { role: 'admin', id: { not: excludeId } } })
}

router.patch('/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ message: '用户不存在' })
    const body = patchSchema.parse(req.body)
    const isSelf = target.id === req.user.id

    if (body.email && body.email.toLowerCase() !== target.email) {
      const dup = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
      if (dup) return res.status(409).json({ message: '该邮箱已被使用' })
    }
    // 不可对自己降权 / 禁用
    if (isSelf && body.role === 'user' && target.role === 'admin') {
      return res.status(400).json({ message: '不能对自己降权,请由其他管理员操作' })
    }
    if (isSelf && body.status === 'disabled') {
      return res.status(400).json({ message: '不能禁用自己的账户' })
    }
    // 防止把最后一个管理员降权/禁用
    if (
      target.role === 'admin' &&
      ((body.role === 'user' || body.status === 'disabled') &&
        (await countOtherAdmins(target.id)) === 0)
    ) {
      return res.status(400).json({ message: '不能停用/降级最后一个管理员' })
    }

    const data = {}
    if (body.role !== undefined) data.role = body.role
    if (body.status !== undefined) data.status = body.status
    if (body.email !== undefined) data.email = body.email.toLowerCase()
    let resetPasswordPlain = null
    if (body.password !== undefined) {
      data.passwordHash = bcrypt.hashSync(body.password, 10)
      data.tokenVersion = { increment: 1 } // 使该用户全部旧 JWT 失效
      resetPasswordPlain = body.password
    }

    const updated = await prisma.user.update({ where: { id: target.id }, data })
    const changes = []
    if (body.role !== undefined) changes.push(`角色→${body.role}`)
    if (body.status !== undefined) changes.push(`状态→${body.status}`)
    if (body.email !== undefined) changes.push('邮箱变更')
    if (body.password !== undefined) changes.push('重置密码')
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_UPDATE_USER',
      detail: `编辑用户「${target.username}」:${changes.join(', ')}`,
      ip: getIp(req),
    })
    res.json({
      item: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        theme: updated.theme,
        createdAt: updated.createdAt,
        lastLoginAt: updated.lastLoginAt,
      },
      ...(resetPasswordPlain ? { generatedPassword: resetPasswordPlain } : {}),
      message: body.password !== undefined ? '已重置密码,该用户所有登录已失效' : '保存成功',
    })
  } catch (err) {
    next(err)
  }
})

/** 重置密码(生成随机密码) */
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ message: '用户不存在' })
    const pwd = randomPassword(14)
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: bcrypt.hashSync(pwd, 10), tokenVersion: { increment: 1 } },
    })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_RESET_PASSWORD',
      detail: `重置用户「${target.username}」的密码(随机生成)`,
      ip: getIp(req),
    })
    res.json({
      message: `已为「${target.username}」生成随机密码,该用户所有登录已失效`,
      password: pwd,
    })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { profiles: true } } },
    })
    if (!target) return res.status(404).json({ message: '用户不存在' })
    if (target.id === req.user.id) {
      return res.status(400).json({ message: '不能删除自己的账户' })
    }
    if (target.role === 'admin' && (await countOtherAdmins(target.id)) === 0) {
      return res.status(400).json({ message: '不能删除最后一个管理员' })
    }
    await prisma.user.delete({ where: { id: target.id } })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_DELETE_USER',
      detail: `删除用户「${target.username}」,级联删除其 ${target._count.profiles} 个档案`,
      ip: getIp(req),
    })
    res.json({ message: `已删除用户「${target.username}」及其 ${target._count.profiles} 个档案` })
  } catch (err) {
    next(err)
  }
})

module.exports = router
