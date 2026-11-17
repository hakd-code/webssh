// 凭据加密:AES-256-GCM,密文格式 iv:tag:ciphertext(base64)
const crypto = require('crypto')
const { config } = require('../config')

function getKey() {
  return Buffer.from(config.encryptionKey, 'hex') // 64 hex chars -> 32 bytes
}

/** 加密明文,返回 "iv:tag:ciphertext"(各段 base64);空值原样返回 */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/** 解密密文;失败抛出错误(密钥不匹配/数据损坏) */
function decrypt(payload) {
  if (!payload) return null
  const parts = String(payload).split(':')
  if (parts.length !== 3) throw new Error('密文格式不正确')
  const [ivB64, tagB64, ctB64] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return plain
}

/** 安全解密:失败返回 null(用于连接时降级处理) */
function tryDecrypt(payload) {
  try {
    return decrypt(payload)
  } catch {
    return null
  }
}

module.exports = { encrypt, decrypt, tryDecrypt }
