// components/custom-nav/custom-nav.js —— 自定义沉浸式导航栏
// 度量取自 getApp().globalData.nav（app.js onLaunch 经 navKit 计算）
// 内置白夜模式手动切换键：三态循环 跟随系统 → 浅色 → 深色，偏好经 storageKit 持久化
var storageKit = require('../../utils/storageKit');
var feedback = require('../../utils/feedbackKit');

// 三态循环顺序（“跟随系统”始终可达）
var THEME_ORDER = ['system', 'light', 'dark'];

// 各态图标：◐ 跟随系统（自动） / ☀ 浅色 / ☾ 深色
var THEME_ICON = {
  system: '◐',
  light: '☀',
  dark: '☾'
};

Component({
  properties: {
    // 导航标题
    title: { type: String, value: '' },
    // 是否显示返回箭头
    back: { type: Boolean, value: false }
  },

  data: {
    statusBarHeight: 20, // 状态栏占位高度 px
    navBarHeight: 44,    // 标题行高度 px
    padRight: 96,        // 右侧避让胶囊的留白 px
    themeIcon: '◐'       // 主题切换键图标（跟随当前偏好）
  },

  attached: function () {
    var app = getApp();
    var nav = (app && app.globalData && app.globalData.nav) || {};
    var statusBarHeight = nav.statusBarHeight || 20;
    var navBarHeight = nav.navBarHeight || 44;
    var menuRight = nav.menuRight || 8;
    var menuWidth = nav.menuWidth || 87;
    this.setData({
      statusBarHeight: statusBarHeight,
      navBarHeight: navBarHeight,
      // 右侧留白 = menuRight + 胶囊宽 + 间距，确保不与原生胶囊重叠
      padRight: menuRight + menuWidth + 12
    });
    this.syncTheme();
  },

  // 页面重新可见时同步图标（可能在其它页面实例切换过偏好）
  pageLifetimes: {
    show: function () {
      this.syncTheme();
    }
  },

  methods: {
    onBack: function () {
      wx.navigateBack({
        fail: function () {
          wx.redirectTo({ url: '/pages/index/index' });
        }
      });
    },

    // 从全局偏好同步切换键图标
    syncTheme: function () {
      var app = getApp();
      var pref = (app && app.globalData && app.globalData.themePref) || 'system';
      this.setData({ themeIcon: THEME_ICON[pref] || '◐' });
    },

    // 主题切换：三态循环，即时生效（当前页 setData themeClass）+ 持久化 + 触感反馈
    onThemeTap: function () {
      feedback.tap(); // 切换轻反馈（150ms 闸门节流）
      var app = getApp();
      var gd = (app && app.globalData) || {};
      var cur = gd.themePref || 'system';
      var idx = THEME_ORDER.indexOf(cur);
      var next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      // 偏好持久化：经 storageKit 唯一存储出口，失败需提示（防静默丢失）
      if (!storageKit.saveThemePref(next)) {
        wx.showToast({ title: '主题偏好保存失败', icon: 'none' });
        return;
      }
      gd.themePref = next;
      this.setData({ themeIcon: THEME_ICON[next] });
      // 同步当前页面根节点类名：'system' 加空串，回退 @media 系统跟随
      var pages = getCurrentPages();
      var page = pages && pages.length ? pages[pages.length - 1] : null;
      if (page && page.setData && app.themeClassFor) {
        page.setData({ themeClass: app.themeClassFor(next) });
      }
    }
  }
});
