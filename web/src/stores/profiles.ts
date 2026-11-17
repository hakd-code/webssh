import { defineStore } from 'pinia'
import http from '@/api/http'
import type { Profile, AuthType } from '@/api/types'

export interface ProfilePayload {
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  note?: string | null
  password?: string | null
  privateKey?: string | null
  passphrase?: string | null
}

export const useProfilesStore = defineStore('profiles', {
  state: () => ({
    items: [] as Profile[],
    loading: false,
    loaded: false,
  }),
  actions: {
    async fetch(search = '', sort = 'recent') {
      this.loading = true
      try {
        const { data } = await http.get('/profiles', {
          params: { search: search || undefined, sort },
          silent: true,
        })
        this.items = data.items
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    async create(payload: ProfilePayload) {
      const { data } = await http.post('/profiles', payload)
      await this.fetch()
      return data.item as Profile
    },
    async update(id: string, payload: Partial<ProfilePayload>) {
      const { data } = await http.patch(`/profiles/${id}`, payload)
      await this.fetch()
      return data.item as Profile
    },
    async remove(id: string) {
      await http.delete(`/profiles/${id}`)
      this.items = this.items.filter((p) => p.id !== id)
    },
    async copy(id: string) {
      const { data } = await http.post(`/profiles/${id}/copy`)
      await this.fetch()
      return data.item as Profile
    },
    async touch(id: string) {
      try {
        await http.post(`/profiles/${id}/touch`)
      } catch {
        /* 非关键 */
      }
    },
  },
})
