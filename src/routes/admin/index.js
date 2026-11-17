// /api/admin/* 管理端路由聚合
const express = require('express')
const prisma = require('../../db')
const { requireAuth, requireAdmin } = require('../../middlewares/auth')

const settingsRouter = require('./settings')
const navsRouter = require('./navs')
const footerRouter = require('./footer')
const usersRouter = require('./users')

const router = express.Router()
router.use(requireAuth, requireAdmin)

// 概览统计
router.get('/stats', async (req, res, next) => {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const [users, profiles, navs, todayLogins, totalLogins, recentAudits] = await Promise.all([
      prisma.user.count(),
      prisma.profile.count(),
      prisma.navItem.count(),
      prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: startOfDay } } }),
      prisma.auditLog.count({ where: { action: 'LOGIN' } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ])
    res.json({
      users,
      profiles,
      navs,
      todayLogins,
      totalLogins,
      recentAudits,
    })
  } catch (err) {
    next(err)
  }
})

router.use('/settings', settingsRouter)
router.use('/navs', navsRouter)
router.use('/footer', footerRouter)
router.use('/users', usersRouter)

module.exports = router
