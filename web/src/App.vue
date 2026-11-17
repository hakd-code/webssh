<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import NavBar from '@/components/NavBar.vue'
import FooterBar from '@/components/FooterBar.vue'

const route = useRoute()
const site = useSiteStore()
const theme = useThemeStore()
const auth = useAuthStore()

onMounted(() => {
  theme.init()
  site.fetchSite()
  if (auth.token) auth.fetchMe()
})
</script>

<template>
  <el-config-provider>
    <div class="app-shell">
      <NavBar />
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </main>
      <FooterBar />
    </div>
  </el-config-provider>
</template>
