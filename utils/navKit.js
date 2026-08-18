// navKit.js —— 自定义沉浸式导航度量计算
// 全部 try-catch 保底，永不抛错；单位均为 px

// computeNav() -> { statusBarHeight, navBarHeight, navPad, menuRight, menuWidth, themeGap }
//   statusBarHeight 状态栏高度
//   navBarHeight    导航内容区高度 = 胶囊高 + 2×(胶囊顶距 - 状态栏高)
//   navPad          页面顶部总避让 = statusBarHeight + navBarHeight
//   menuRight       胶囊右缘到屏幕右缘的距离
//   menuWidth       胶囊宽度（供组件右侧留白避让，附加字段）
//   themeGap        主题切换键与胶囊的间距：iOS 视觉正常取 12，安卓胶囊观感紧凑加大到 22
function computeNav() {
  // 兜底默认值（常见机型经验值）
  var statusBarHeight = 20;
  var screenWidth = 375;
  var navBarHeight = 44;
  var menuRight = 8;
  var menuWidth = 87;
  var themeGap = 12;

  // 窗口信息：优先 getWindowInfo，失败回落 getSystemInfoSync
  try {
    var info = wx.getWindowInfo();
    statusBarHeight = info.statusBarHeight || statusBarHeight;
    screenWidth = info.windowWidth || info.screenWidth || screenWidth;
  } catch (e) {
    try {
      var sys = wx.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight || statusBarHeight;
      screenWidth = sys.windowWidth || sys.screenWidth || screenWidth;
    } catch (e2) {
      // 保持默认值
    }
  }

  // 胶囊按钮度量：失败时导航高度回落 44
  try {
    var capsule = wx.getMenuButtonBoundingClientRect();
    if (capsule && capsule.height && capsule.top) {
      navBarHeight = capsule.height + 2 * (capsule.top - statusBarHeight);
      menuRight = Math.max(0, screenWidth - capsule.right);
      menuWidth = capsule.width || menuWidth;
    }
  } catch (e) {
    navBarHeight = 44;
  }

  // 平台判断：安卓上主题切换键与胶囊间距加大，避免视觉拥挤
  try {
    var device = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    if (device && device.platform === 'android') {
      themeGap = 22;
    }
  } catch (e3) {
    // 保持默认间距
  }

  return {
    statusBarHeight: statusBarHeight,
    navBarHeight: navBarHeight,
    navPad: statusBarHeight + navBarHeight,
    menuRight: menuRight,
    menuWidth: menuWidth,
    themeGap: themeGap
  };
}

module.exports = {
  computeNav: computeNav
};
