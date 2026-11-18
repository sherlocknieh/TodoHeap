import { defineCollection } from 'astro:content'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

// Starlight 的内容集合：所有页面来自 src/content/docs
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
