// pages/history/history.js —— 历史战绩页
// 归档对局倒序列表 + 展开全量回合流水 + 整局删除 + 再来一局
var engine = require('../../utils/scoreEngine');
var storageKit = require('../../utils/storageKit');
var feedback = require('../../utils/feedbackKit');

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// 时间格式化：YYYY-MM-DD HH:mm
function fmtDateTime(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 积分展示：正数带 + 号
function fmtSigned(v) {
  if (v > 0) return '+' + v;
  return '' + v;
}

Page({
  data: {
    rows: [],      // 归档对局展示数据（JS 预计算，时间倒序）
    hasRows: false,
    navPad: 0,     // 自定义导航避让高度 px（来自 globalData.nav）
    themeClass: '' // 手动主题偏好根节点类名（theme-light / theme-dark，空为跟随系统）
  },

  onLoad: function () {
    // 自定义导航避让高度：读入 globalData.nav.navPad
    var nav = (getApp().globalData && getApp().globalData.nav) || {};
    this.setData({ navPad: nav.navPad || 64 });
    this.syncThemeClass();
  },

  onShow: function () {
    this.syncThemeClass(); // 可能在他页切换过主题，重新可见时同步
    this.refresh();
  },

  // 手动主题偏好 → 根节点类名（'system' 为空串，走 @media 系统跟随）
  syncThemeClass: function () {
    var app = getApp();
    var pref = (app.globalData && app.globalData.themePref) || 'system';
    this.setData({ themeClass: app.themeClassFor(pref) });
  },

  // 从存储重算全部展示数据
  refresh: function () {
    var archive = storageKit.getArchive();
    var rows = archive.map(function (g) {
      var mode = engine.getMode(g.modeId);
      var winnerId = engine.computeBigWinner(g);
      var winner = null;
      for (var i = 0; i < g.players.length; i++) {
        if (g.players[i].id === winnerId) { winner = g.players[i]; break; }
      }
      // 全量回合流水（含 void 轮，展示时灰显）
      var roundRows = g.rounds.map(function (r, idx) {
        var cells = g.players.map(function (p) {
          var d = Number(r.deltas[p.id]) || 0;
          return {
            name: p.name,
            color: p.color,
            text: fmtSigned(d),
            cls: d > 0 ? 'pos' : (d < 0 ? 'neg' : 'faint')
          };
        });
        return {
          id: r.id,
          seq: idx + 1,
          timeText: fmtDateTime(r.ts),
          voided: r.status === 'void',
          cells: cells
        };
      });
      return {
        id: g.id,
        endedAt: g.endedAt || g.createdAt || 0,
        endedAtText: fmtDateTime(g.endedAt || g.createdAt),
        modeName: mode ? mode.name : '未知模式',
        playerCount: g.players.length,
        roundCount: g.rounds.length,
        // 获胜者文案按模式方向派生：asc → "最优者"，WXML 只绑变量
        winnerLabel: (mode && mode.ascending) ? '最优者' : '大赢家',
        winnerName: winner ? winner.name : '—',
        winnerShort: winner ? winner.name.charAt(0) : '—',
        winnerColor: winner ? winner.color : '#5c6470',
        targetText: g.targetScore ? '目标 ' + g.targetScore + ' 分' : '',
        expanded: false,
        roundRows: roundRows
      };
    });
    // 归档时间倒序（JS 内排序，WXML 直接渲染）
    rows.sort(function (a, b) { return b.endedAt - a.endedAt; });
    this.setData({ rows: rows, hasRows: rows.length > 0 });
  },

  // 点击卡片头展开/收起回合流水
  onToggle: function (e) {
    var idx = e.currentTarget.dataset.index;
    var cur = this.data.rows[idx].expanded;
    var patch = {};
    patch['rows[' + idx + '].expanded'] = !cur;
    this.setData(patch);
  },

  // 整局删除（确认后从 archive 移除）
  onDelete: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除战绩',
      content: '删除后该局全部回合流水将无法恢复，确认删除？',
      confirmText: '删除',
      success: function (res) {
        if (!res.confirm) return;
        feedback.tap(); // 删除确认轻反馈
        var archive = storageKit.getArchive();
        var rest = [];
        for (var i = 0; i < archive.length; i++) {
          if (archive[i].id !== id) rest.push(archive[i]);
        }
        storageKit.saveArchive(rest);
        self.refresh();
      }
    });
  },

  // 再来一局：复制玩家与模式配置新建对局，跳转计分局
  onReplay: function (e) {
    var id = e.currentTarget.dataset.id;
    var archive = storageKit.getArchive();
    var src = null;
    for (var i = 0; i < archive.length; i++) {
      if (archive[i].id === id) { src = archive[i]; break; }
    }
    if (!src) return;
    feedback.tap(); // 再来一局轻反馈
    var options = {};
    if (src.targetScore) options.targetScore = src.targetScore;
    // 继承源对局校验开关（旧对局缺字段视为开）
    if (src.strictZeroSum === false) options.strictZeroSum = false;
    var game = engine.createGame(src.modeId, src.players, options);
    var root = storageKit.loadData();
    root.active.push(game);
    if (!storageKit.saveData(root)) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/round/round?id=' + game.id });
  }
});
