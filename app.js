// app.js —— 全局入口：启动时恢复本地数据 + 计算自定义导航度量，不放业务逻辑
var storageKit = require('./utils/storageKit');
var navKit = require('./utils/navKit');

App({
  globalData: {
    // 根数据结构：{ schemaVersion:1, active:[Game], archive:[Game] }
    root: null,
    // 导航度量：{ statusBarHeight, navBarHeight, navPad, menuRight, menuWidth }
    nav: null
  },

  onLaunch: function () {
    // 经 storageKit 统一读取本地存储，失败时自动兜底默认结构
    this.globalData.root = storageKit.loadData();
    // 自定义沉浸式导航度量（全部 try-catch 保底）
    this.globalData.nav = navKit.computeNav();
  }
});
