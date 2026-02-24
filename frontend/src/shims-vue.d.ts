// JS迁移到TS过程中的临时配置文件
// 所有.vue文件含有 <script setup lang="ts"> 后可以删除
declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}