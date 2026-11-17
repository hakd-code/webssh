import { defineStore } from 'pinia'
import type { TempSshParams } from '@/api/types'

export interface TermTab {
  id: string
  title: string
  kind: 'profile' | 'temp'
  profileId?: string
  tempParams?: TempSshParams
}

let seq = 0
function nextId() {
  seq += 1
  return `tab-${Date.now()}-${seq}`
}

/** 多标签终端工作台状态 */
export const useTabsStore = defineStore('tabs', {
  state: () => ({
    tabs: [] as TermTab[],
    activeId: '' as string,
  }),
  actions: {
    openProfile(id: string, title: string): string {
      const existing = this.tabs.find((t) => t.kind === 'profile' && t.profileId === id)
      if (existing) {
        this.activeId = existing.id
        return existing.id
      }
      const tab: TermTab = { id: nextId(), title, kind: 'profile', profileId: id }
      this.tabs.push(tab)
      this.activeId = tab.id
      return tab.id
    },
    openTemp(params: TempSshParams, title?: string): string {
      const tab: TermTab = {
        id: nextId(),
        title: title || `${params.host}:${params.port}`,
        kind: 'temp',
        tempParams: params,
      }
      this.tabs.push(tab)
      this.activeId = tab.id
      return tab.id
    },
    close(id: string) {
      const idx = this.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return
      this.tabs.splice(idx, 1)
      if (this.activeId === id) {
        const next = this.tabs[idx] || this.tabs[idx - 1]
        this.activeId = next ? next.id : ''
      }
    },
    rename(id: string, title: string) {
      const tab = this.tabs.find((t) => t.id === id)
      if (tab) tab.title = title
    },
  },
})
