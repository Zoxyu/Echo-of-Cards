// components/custom-nav/custom-nav.js —— 自定义沉浸式导航栏
// 度量取自 getApp().globalData.nav（app.js onLaunch 经 navKit 计算）
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
    padRight: 96         // 右侧避让胶囊的留白 px
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
  },

  methods: {
    onBack: function () {
      wx.navigateBack({
        fail: function () {
          wx.redirectTo({ url: '/pages/index/index' });
        }
      });
    }
  }
});
