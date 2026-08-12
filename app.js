// app.js —— 全局入口：启动时恢复本地数据 + 计算自定义导航度量，不放业务逻辑
var storageKit = require('./utils/storageKit');
var navKit = require('./utils/navKit');

App({
  globalData: {
    // 根数据结构：{ schemaVersion:1, active:[Game], archive:[Game] }
    root: null,
    // 导航度量：{ statusBarHeight, navBarHeight, navPad, menuRight, menuWidth }
    nav: null,
    // 主题偏好：'system' | 'light' | 'dark'（custom-nav 切换时同步更新）
    themePref: 'system'
  },

  onLaunch: function () {
    // 经 storageKit 统一读取本地存储，失败时自动兜底默认结构
    this.globalData.root = storageKit.loadData();
    // 自定义沉浸式导航度量（全部 try-catch 保底）
    this.globalData.nav = navKit.computeNav();
    // 主题偏好：缺失/非法兜底 'system'（跟随系统，走 @media 逻辑）
    this.globalData.themePref = storageKit.getThemePref();
  },

  // 主题偏好 → 页面根节点类名；'system' 返回空串，不加类、走原 @media 系统跟随
  themeClassFor: function (pref) {
    if (pref === 'light') return 'theme-light';
    if (pref === 'dark') return 'theme-dark';
    return '';
  }
});
