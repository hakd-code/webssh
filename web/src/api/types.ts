// 全局类型定义
export type Role = 'user' | 'admin'
export type UserStatus = 'active' | 'disabled'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserInfo {
  id: string
  username: string
  email: string
  role: Role
  status: UserStatus
  theme?: ThemeMode | null
  createdAt: string
  lastLoginAt?: string | null
}

export interface NavItem {
  id: string
  label: string
  url: string
  newWindow: boolean
}

export interface SiteFooter {
  html: string
  copyright: string
  icp: string
}

export interface SiteInfo {
  siteName: string
  subtitle: string
  logo: string
  loginWelcome: string
  allowRegister: boolean
  allowGuestSsh: boolean
  notice: string
  navs: NavItem[]
  footer: SiteFooter
}

export type AuthType = 'password' | 'privateKey'

export interface Profile {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  note?: string | null
  lastUsedAt?: string | null
  createdAt: string
  updatedAt?: string
  hasPassword: boolean
  hasPrivateKey: boolean
  hasPassphrase: boolean
  hasCredential: boolean
}

export interface AdminUser {
  id: string
  username: string
  email: string
  role: Role
  status: UserStatus
  theme?: string | null
  createdAt: string
  lastLoginAt?: string | null
  profileCount: number
}

export interface TempSshParams {
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  privateKey?: string
  passphrase?: string
}

export type TermStatus = 'connecting' | 'connected' | 'closed' | 'error'

export interface AuditLogItem {
  id: string
  userId?: string | null
  username?: string | null
  action: string
  detail?: string | null
  ip?: string | null
  createdAt: string
}

export interface AdminStats {
  users: number
  profiles: number
  navs: number
  todayLogins: number
  totalLogins: number
  recentAudits: AuditLogItem[]
}
