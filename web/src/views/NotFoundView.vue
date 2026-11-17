<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="page" style="display: flex; align-items: center; justify-content: center; flex: 1">
    <el-result icon="warning" title="404" sub-title="抱歉,你访问的页面不存在或已被移除">
      <template #extra>
        <el-button type="primary" @click="router.push('/')">返回首页</el-button>
        <el-button @click="router.back()">返回上一页</el-button>
      </template>
    </el-result>
  </div>
</template>
