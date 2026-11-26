// Starlight 通过 Vite 虚拟模块暴露解析后的用户配置，供覆盖组件读取。
declare module 'virtual:starlight/user-config' {
  import type { StarlightConfig } from '@astrojs/starlight/types'

  const config: StarlightConfig
  export default config
}
