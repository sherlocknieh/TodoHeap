<template>
  <nav class="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo -->
        <div class="flex items-center gap-3">
          <div class="text-2xl font-bold text-emerald-600">📝</div>
          <h1 class="text-xl font-bold text-slate-900">TodoHeap</h1>
        </div>

        <!-- Navigation Links (可选) -->
        <div class="hidden md:flex items-center gap-6">
          <a href="#" class="text-slate-600 hover:text-slate-900 transition">功能</a>
          <a href="#" class="text-slate-600 hover:text-slate-900 transition">文档</a>
        </div>

        <!-- User Menu -->
        <div class="flex items-center gap-4">
          <slot name="user-menu"></slot>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup></script>
