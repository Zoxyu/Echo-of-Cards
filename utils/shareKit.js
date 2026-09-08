// shareKit.js —— 微信原生分享文案统一出口
// 纯函数、零 wx 依赖：三个页面的 onShareAppMessage / onShareTimeline 均从此取文案，保证品牌口径一致
// 发送给朋友：落地路径统一为首页（纯本地应用，对局数据不随链接转移）；
// 分享到朋友圈：微信规则为单页模式打开"分享时的当前页"，各页已保证可独立落地
// （round 页单页模式且缺对局时展示品牌落地卡片，见 pages/round/round.js onLoad）

// 品牌主文案（首页 / 历史页默认标题）
var BRAND_TITLE = '声声入册 · 线下记分小簿，打开即用';

// 发送给朋友：{ title, path }
function appMessage(title) {
  return {
    title: title || BRAND_TITLE,
    path: '/pages/index/index'
  };
}

// 分享到朋友圈：{ title, query }（query 留空：纯本地应用无跨用户参数可带）
function timeline(title) {
  return {
    title: title || BRAND_TITLE,
    query: ''
  };
}

module.exports = {
  BRAND_TITLE: BRAND_TITLE,
  appMessage: appMessage,
  timeline: timeline
};
