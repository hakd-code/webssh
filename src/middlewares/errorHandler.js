// 统一错误处理
const { ZodError } = require('zod')
const logger = require('../logger')

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const first = err.issues && err.issues[0]
    const message = first ? `${first.path.join('.') || '参数'}: ${first.message}` : '参数校验失败'
    return res.status(400).json({ message: `参数不合法 - ${message}` })
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: '请求体不是合法的 JSON' })
  }
  const status = err.status || err.statusCode || 500
  if (status >= 500) {
    logger.error({ err: err.stack || err.message, path: req.path }, '服务器内部错误')
  }
  return res.status(status).json({
    message: status >= 500 ? '服务器内部错误,请稍后重试' : err.message || '请求失败',
  })
}

module.exports = { errorHandler }
