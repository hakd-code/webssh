// /api/profiles/* 档案管理(用户私有)
const express = require('express')
const { z } = require('zod')
const prisma = require('../db')
const { requireAuth } = require('../middlewares/auth')
const { audit } = require('../services/audit')
const { encrypt } = require('../services/crypto')
const { getIp } = require('../utils')

const router = express.Router()
router.use(requireAuth)

const credential = z.string().max(16384)
const createSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(64),
  host: z.string().min(1, '主机不能为空').max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1, '登录用户不能为空').max(64).default('root'),
  authType: z.enum(['password', 'privateKey']).default('password'),
  password: credential.optional(),
  privateKey: credential.optional(),
  passphrase: credential.optional(),
  note: z.string().max(2000).optional().nullable(),
})
// 编辑:凭据字段 undefined = 保留不修改;null = 清除
const updateSchema = createSchema.partial()

function serialize(profile) {
  const hasPassword = Boolean(profile.password)
  const hasPrivateKey = Boolean(profile.privateKey)
  const hasPassphrase = Boolean(profile.passphrase)
  return {
    id: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authType: profile.authType,
    note: profile.note,
    lastUsedAt: profile.lastUsedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    hasPassword,
    hasPrivateKey,
    hasPassphrase,
    hasCredential: hasPassword || hasPrivateKey,
  }
}

function buildCredentialData(body) {
  const data = {}
  if (body.password !== undefined) {
    data.password = body.password === null ? null : encrypt(body.password)
  }
  if (body.privateKey !== undefined) {
    data.privateKey = body.privateKey === null ? null : encrypt(body.privateKey)
  }
  if (body.passphrase !== undefined) {
    data.passphrase = body.passphrase === null ? null : encrypt(body.passphrase)
  }
  if (body.authType === 'privateKey' && body.privateKey !== undefined) {
    // 切换为密钥登录时清掉密码,避免残留
    data.password = null
  }
  if (body.authType === 'password' && body.password !== undefined) {
    data.privateKey = null
    data.passphrase = null
  }
  return data
}

/** 列表:支持搜索与排序(name|recent|created) */
router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim()
    const sort = String(req.query.sort || 'recent')
    const orderBy =
      sort === 'name'
        ? { name: 'asc' }
        : sort === 'created'
          ? { createdAt: 'desc' }
          : [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }]
    const profiles = await prisma.profile.findMany({
      where: {
        userId: req.user.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { host: { contains: search } },
                { note: { contains: search } },
                { username: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy,
    })
    res.json({ items: profiles.map(serialize) })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const profile = await prisma.profile.create({
      data: {
        userId: req.user.id,
        name: body.name,
        host: body.host.trim(),
        port: body.port,
        username: body.username,
        authType: body.authType,
        ...buildCredentialData(body),
        note: body.note ?? null,
      },
    })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_PROFILE',
      detail: `创建档案「${profile.name}」(${profile.host}:${profile.port})`,
      ip: getIp(req),
    })
    res.status(201).json({ item: serialize(profile) })
  } catch (err) {
    next(err)
  }
})

/** 按 id 查找本人档案 */
async function findOwned(req, id) {
  const profile = await prisma.profile.findUnique({ where: { id } })
  if (!profile || profile.userId !== req.user.id) return null
  return profile
}

router.patch('/:id', async (req, res, next) => {
  try {
    const profile = await findOwned(req, req.params.id)
    if (!profile) return res.status(404).json({ message: '档案不存在或无权访问' })
    const body = updateSchema.parse(req.body)
    const data = {}
    if (body.name !== undefined) data.name = body.name
    if (body.host !== undefined) data.host = body.host.trim()
    if (body.port !== undefined) data.port = body.port
    if (body.username !== undefined) data.username = body.username
    if (body.authType !== undefined) data.authType = body.authType
    if (body.note !== undefined) data.note = body.note
    Object.assign(data, buildCredentialData(body))
    const updated = await prisma.profile.update({ where: { id: profile.id }, data })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE_PROFILE',
      detail: `编辑档案「${updated.name}」`,
      ip: getIp(req),
    })
    res.json({ item: serialize(updated) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const profile = await findOwned(req, req.params.id)
    if (!profile) return res.status(404).json({ message: '档案不存在或无权访问' })
    await prisma.profile.delete({ where: { id: profile.id } })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELETE_PROFILE',
      detail: `删除档案「${profile.name}」(${profile.host}:${profile.port})`,
      ip: getIp(req),
    })
    res.json({ message: '删除成功' })
  } catch (err) {
    next(err)
  }
})

/** 更新最近使用时间 */
router.post('/:id/touch', async (req, res, next) => {
  try {
    const profile = await findOwned(req, req.params.id)
    if (!profile) return res.status(404).json({ message: '档案不存在或无权访问' })
    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: { lastUsedAt: new Date() },
    })
    res.json({ item: serialize(updated) })
  } catch (err) {
    next(err)
  }
})

/** 复制档案(密文直接复制,不回传明文) */
router.post('/:id/copy', async (req, res, next) => {
  try {
    const profile = await findOwned(req, req.params.id)
    if (!profile) return res.status(404).json({ message: '档案不存在或无权访问' })
    const copy = await prisma.profile.create({
      data: {
        userId: req.user.id,
        name: `${profile.name} (副本)`.slice(0, 64),
        host: profile.host,
        port: profile.port,
        username: profile.username,
        authType: profile.authType,
        password: profile.password,
        privateKey: profile.privateKey,
        passphrase: profile.passphrase,
        note: profile.note,
      },
    })
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'COPY_PROFILE',
      detail: `复制档案「${profile.name}」为「${copy.name}」`,
      ip: getIp(req),
    })
    res.status(201).json({ item: serialize(copy) })
  } catch (err) {
    next(err)
  }
})

module.exports = router
