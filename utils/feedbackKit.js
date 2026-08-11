// utils/feedbackKit.js —— 触感反馈工具
// tap()：轻反馈（light），最小间隔 150ms；impact()：重反馈（medium），最小间隔 300ms
// Date.now() 闸门节流；wx.vibrateShort 全 try/catch + fail 静默（PC 端不报错）

var _lastTap = 0;
var _lastImpact = 0;

// 内部：安全触发短振动，任何失败静默
function vibrate(type) {
  try {
    wx.vibrateShort({
      type: type,
      fail: function () {}
    });
  } catch (e) { /* PC 端等不支持环境静默忽略 */ }
}

// 轻反馈：按键等高频交互
function tap() {
  var now = Date.now();
  if (now - _lastTap < 150) return; // 闸门节流
  _lastTap = now;
  vibrate('light');
}

// 重反馈：提交成功 / 校验失败 / 不可逆确认等关键节点
function impact() {
  var now = Date.now();
  if (now - _lastImpact < 300) return; // 闸门节流
  _lastImpact = now;
  vibrate('medium');
}

module.exports = {
  tap: tap,
  impact: impact
};
