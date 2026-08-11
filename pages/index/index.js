// pages/index/index.js —— 首页：开局配置 + 进行中对局列表
// 页面 JS 不做任何分数计算：收集输入 → 调引擎 → setData
var engine = require('../../utils/scoreEngine');
var storageKit = require('../../utils/storageKit');

// 8 色玩家色板（与 app.wxss 的 --pc0~--pc7 保持一致）
var COLORS = ['#f5b942', '#4cc3ff', '#4cd97b', '#ff6b5e', '#b48cff', '#ff9f43', '#3ee0c8', '#ff7ab8'];

// 生成玩家 id
function genPlayerId(idx) {
  return 'p' + Date.now().toString(36) + '_' + idx + '_' +
    Math.floor(Math.random() * 1e4).toString(36);
}

// 时间格式化：MM-DD HH:mm
function fmtTime(ts) {
  var d = new Date(ts);
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 积分展示：正数带 + 号
function fmtSigned(v) {
  if (v > 0) return '+' + v;
  return '' + v;
}

Page({
  data: {
    modes: [],             // 模式卡片数据（由 listModes 驱动）
    selectedModeId: 'free',
    isTargetMode: false,   // target 模式选中后显示目标分输入
    targetScore: '500',
    counts: [2, 3, 4, 5, 6, 7, 8],
    playerCount: 4,
    countDisabled: false,  // 斗地主固定 3 人时禁用人数选择
    players: [],           // [{id,name,short,color}]
    activeRows: [],        // 进行中对局展示数据（JS 预计算）
    hasActive: false
  },

  onLoad: function () {
    // 模式卡片数据驱动渲染
    var modes = engine.listModes().map(function (m) {
      return {
        id: m.id,
        name: m.name,
        desc: m.desc,
        countText: m.playerCount[0] === m.playerCount[1]
          ? '固定 ' + m.playerCount[0] + ' 人'
          : m.playerCount[0] + '~' + m.playerCount[1] + ' 人'
      };
    });
    this.setData({ modes: modes });
    this.setData({ players: this.buildPlayers(this.data.playerCount, []) });
  },

  onShow: function () {
    this.refreshActive();
  },

  // ---------- 玩家构建 ----------

  // 按人数重建玩家列表，保留已有昵称与颜色
  buildPlayers: function (n, old) {
    var players = [];
    for (var i = 0; i < n; i++) {
      if (old[i]) {
        players.push(old[i]);
      } else {
        var name = '玩家' + (i + 1);
        players.push({
          id: genPlayerId(i),
          name: name,
          short: name.charAt(0),
          color: COLORS[i % COLORS.length]
        });
      }
    }
    return players;
  },

  // ---------- 事件 ----------

  onSelectMode: function (e) {
    var id = e.currentTarget.dataset.id;
    var isLandlord = id === 'landlord';
    var n = isLandlord ? 3 : this.data.playerCount;
    this.setData({
      selectedModeId: id,
      isTargetMode: id === 'target',
      countDisabled: isLandlord,
      playerCount: n,
      players: this.buildPlayers(n, this.data.players)
    });
  },

  onSelectCount: function (e) {
    if (this.data.countDisabled) return;
    var n = Number(e.currentTarget.dataset.n);
    this.setData({
      playerCount: n,
      players: this.buildPlayers(n, this.data.players)
    });
  },

  onNameInput: function (e) {
    var idx = e.currentTarget.dataset.index;
    var value = e.detail.value;
    // 批量局部更新：昵称 + 头像首字
    var patch = {};
    patch['players[' + idx + '].name'] = value;
    patch['players[' + idx + '].short'] = (value || '玩').charAt(0);
    this.setData(patch);
  },

  // 点击头像色块循环换色
  onColorTap: function (e) {
    var idx = e.currentTarget.dataset.index;
    var cur = this.data.players[idx].color;
    var ci = COLORS.indexOf(cur);
    var next = COLORS[(ci + 1) % COLORS.length];
    this.setData({ ['players[' + idx + '].color']: next });
  },

  onTargetInput: function (e) {
    this.setData({ targetScore: e.detail.value });
  },

  // ---------- 开局 ----------

  onStartGame: function () {
    var mode = engine.getMode(this.data.selectedModeId);
    if (!mode) return;
    var players = this.data.players;
    if (players.length < mode.playerCount[0] || players.length > mode.playerCount[1]) {
      wx.showToast({ title: '该模式需要 ' + mode.playerCount[0] + '~' + mode.playerCount[1] + ' 人', icon: 'none' });
      return;
    }
    // 昵称兜底
    var cleanPlayers = players.map(function (p, i) {
      var name = (p.name || '').trim() || ('玩家' + (i + 1));
      return { id: p.id, name: name, color: p.color };
    });
    var options = {};
    if (this.data.selectedModeId === 'target') {
      options.targetScore = Number(this.data.targetScore) || 500;
    }
    var game = engine.createGame(mode.id, cleanPlayers, options);
    var root = storageKit.loadData();
    root.active.push(game);
    if (!storageKit.saveData(root)) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/round/round?id=' + game.id });
  },

  // ---------- 进行中对局 ----------

  // 从存储重算进行中对局展示数据（领先者等全部在 JS 预计算）
  refreshActive: function () {
    var active = storageKit.getActive();
    var rows = active.map(function (g) {
      var mode = engine.getMode(g.modeId);
      var ranking = engine.computeRanking(g);
      var leader = ranking.length ? ranking[0] : null;
      return {
        id: g.id,
        createdAt: g.createdAt,
        createdAtText: fmtTime(g.createdAt),
        modeName: mode ? mode.name : '未知模式',
        playerCount: g.players.length,
        roundCount: g.rounds.length,
        leaderName: leader ? leader.name : '暂无',
        leaderShort: leader ? leader.name.charAt(0) : '—',
        leaderColor: leader ? leader.color : '#5c6470',
        leaderTotalText: leader ? fmtSigned(leader.total) + ' 分' : ''
      };
    });
    // 创建时间倒序（JS 内排序，WXML 直接渲染）
    rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
    this.setData({ activeRows: rows, hasActive: rows.length > 0 });
  },

  onGoRound: function (e) {
    wx.navigateTo({ url: '/pages/round/round?id=' + e.currentTarget.dataset.id });
  },

  onGoHistory: function () {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});
