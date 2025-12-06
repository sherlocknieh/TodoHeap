<template>
  <div class="default-layout">
    <nav class="navbar">
      <div class="logo-section">
        <span class="logo">📝</span>
        <h1>TodoHeap</h1>
      </div>
      <button @click="handleSignOut">退出登录</button>
    </nav>
    <main class="content">
      <RouterView />
    </main>
    <footer>© 2024 TodoHeap</footer>
  </div>
</template>