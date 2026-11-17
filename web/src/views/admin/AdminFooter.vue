<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()
const loading = ref(true)
const saving = ref(false)
const form = reactive({
  html: '',
  copyright: '',
  icp: '',
})

onMounted(async () => {
  try {
    const { data } = await http.get('/admin/footer', { silent: true })
    Object.assign(form, data)
  } finally {
    loading.value = false
  }
})

async function onSave() {
  saving.value = true
  try {
    const { data } = await http.patch('/admin/footer', form)
    ElMessage.success('页脚已保存')
    site.invalidate()
    site.fetchSite(true)
    form.html = data.html || form.html
  } catch {
    /* 拦截器提示 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="section-title"><el-icon><Document /></el-icon>页脚管理</h2>

    <div v-if="loading"><el-skeleton :rows="6" animated /></div>
    <template v-else>
      <div class="ws-card">
        <el-form label-position="top">
          <el-form-item label="页脚内容(支持简单 HTML)">
            <el-input
              v-model="form.html"
              type="textarea"
              :rows="6"
              placeholder="<p>支持 &lt;a&gt; &lt;p&gt; &lt;br&gt; &lt;span&gt; &lt;b&gt; &lt;i&gt; &lt;strong&gt; &lt;em&gt; &lt;ul&gt; &lt;ol&gt; &lt;li&gt;</p>"
            />
            <div class="field-tip">
              服务端使用 sanitize-html 白名单过滤:允许 a / p / br / span / b / i / strong / em / ul / ol / li,
              自动剔除 script 与所有事件属性,防止 XSS。
            </div>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="版权信息">
                <el-input v-model="form.copyright" placeholder="© 2026 WebSSH Platform" maxlength="200" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="备案号">
                <el-input v-model="form.icp" placeholder="如:京ICP备XXXXXXXX号" maxlength="200" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-button type="primary" :loading="saving" @click="onSave">保存页脚</el-button>
        </el-form>
      </div>

      <!-- 预览 -->
      <div class="ws-card" style="margin-top: 20px">
        <h3 class="preview-title">实时预览(按白名单过滤前的原始输入)</h3>
        <div class="footer-preview ws-footer" style="border: 1px dashed var(--el-border-color); border-radius: 8px">
          <div v-html="form.html"></div>
          <div class="footer-meta">
            <span v-if="form.copyright">{{ form.copyright }}</span>
            <span v-if="form.icp" style="margin-left: 12px">{{ form.icp }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.field-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
  line-height: 1.6;
}

.preview-title {
  margin: 0 0 12px;
  font-size: 15px;
}

.footer-preview {
  padding: 16px;
}
</style>
