// app.js —— 全局入口：仅负责启动时恢复本地数据，不放任何业务逻辑
var storageKit = require('./utils/storageKit');

App({
  globalData: {
    // 根数据结构：{ schemaVersion:1, active:[Game], archive:[Game] }
    root: null
  },

  onLaunch: function () {
    // 经 storageKit 统一读取本地存储，失败时自动兜底默认结构
    this.globalData.root = storageKit.loadData();
  }
});
