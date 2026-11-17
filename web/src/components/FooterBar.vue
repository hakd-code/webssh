<script setup lang="ts">
import { computed } from 'vue'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()

const hasFooter = computed(() => {
  const f = site.info.footer
  return Boolean(f && (f.html || f.copyright || f.icp))
})
</script>

<template>
  <footer v-if="hasFooter" class="ws-footer">
    <div class="footer-html" v-html="site.info.footer.html"></div>
    <div class="footer-meta">
      <span v-if="site.info.footer.copyright">{{ site.info.footer.copyright }}</span>
      <span v-if="site.info.footer.icp" style="margin-left: 12px">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          {{ site.info.footer.icp }}
        </a>
      </span>
      <span style="margin-left: 12px" class="footer-power">Powered by WebSSH Platform</span>
    </div>
  </footer>
  <footer v-else class="ws-footer">
    <div class="footer-meta">Powered by WebSSH Platform</div>
  </footer>
</template>

<style scoped>
.footer-html {
  line-height: 1.6;
}

.footer-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.footer-meta a {
  color: var(--el-text-color-secondary);
  text-decoration: none;
}

.footer-power {
  opacity: 0.75;
}
</style>
