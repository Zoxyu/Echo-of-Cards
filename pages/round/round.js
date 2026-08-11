// pages/round/round.js —— 计分局核心页
// 页面 JS 不做任何分数计算：收集输入 → 调引擎 → setData
var engine = require('../../utils/scoreEngine');
var storageKit = require('../../utils/storageKit');

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// 回合时间：HH:mm
function fmtClock(ts) {
  var d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 积分展示：正数带 + 号
function fmtSigned(v) {
  if (v > 0) return '+' + v;
  return '' + v;
}

Page({
  data: {
    gameId: '',
    modeName: '',
    inputKind: 'perPlayer', // perPlayer | landlord | paodekuai
    isZeroSum: false,

    // ---------- 输入区 ----------
    slots: [],        // [{label,name,color,signed}] 按模式 fields 动态生成
    values: [],       // 各槽位展示值
    focusIndex: 0,
    focusSigned: true,
    autoSlot: null,   // 零和模式末位自动补全展示 {name,color,valueText}
    playerList: [],   // 斗地主地主选择
    landlordIndex: 0,
    landlordWin: true,
    bombOn: false,
    rocketOn: false,
    springOn: false,
    keypadRows: [
      { id: 'r1', keys: [{ k: '7', label: '7' }, { k: '8', label: '8' }, { k: '9', label: '9' }, { k: 'del', label: '⌫' }] },
      { id: 'r2', keys: [{ k: '4', label: '4' }, { k: '5', label: '5' }, { k: '6', label: '6' }, { k: 'clear', label: '清空' }] },
      { id: 'r3', keys: [{ k: '1', label: '1' }, { k: '2', label: '2' }, { k: '3', label: '3' }, { k: 'sign', label: '±' }] },
      { id: 'r4', keys: [{ k: '0', label: '0' }, { k: 'next', label: '下一项', wide: true }] }
    ],

    // ---------- 战况仪表盘 ----------
    ranking: [],       // [{playerId,name,short,color,totalText,rank,isBig}]
    targetInfo: null,  // {target,leaderName,leaderTotal,percent}
    canUndo: false,

    // ---------- 回合流水 ----------
    roundRows: [],     // 倒序（最新在前），JS 预计算
    hasRounds: false,

    // ---------- 终局结算 ----------
    showSettle: false,
    finalRanking: [],
    finalWinnerName: '',
    finalWinnerShort: '',
    finalWinnerColor: ''
  },

  // ---------- 内存变量（键盘输入过程不 setData） ----------
  _raw: [],        // 各槽位原始输入字符串
  _game: null,     // 当前对局对象
  _ignoreOver: false, // 终局后选择"继续记录"

  onLoad: function (options) {
    var id = options && options.id;
    var active = storageKit.getActive();
    var game = null;
    for (var i = 0; i < active.length; i++) {
      if (active[i].id === id) { game = active[i]; break; }
    }
    if (!game) {
      wx.showToast({ title: '对局不存在或已归档', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    this._game = game;
    var mode = engine.getMode(game.modeId);
    var kind = game.modeId === 'landlord' ? 'landlord'
      : (game.modeId === 'paodekuai' ? 'paodekuai' : 'perPlayer');

    // 按当前模式 fields 配置构建输入槽位
    var slots = this.buildSlots(game, kind);
    this._raw = slots.map(function () { return ''; });

    // 常亮屏幕
    wx.setKeepScreenOn({ keepScreenOn: true });

    var autoSlot = null;
    if (kind === 'perPlayer' && mode.isZeroSum) {
      var last = game.players[game.players.length - 1];
      autoSlot = { name: last.name, color: last.color, valueText: '' };
    }

    this.setData({
      gameId: game.id,
      modeName: mode ? mode.name : '',
      inputKind: kind,
      isZeroSum: !!mode.isZeroSum,
      slots: slots,
      values: this._raw.slice(),
      focusIndex: 0,
      focusSigned: slots.length ? !!slots[0].signed : false,
      autoSlot: autoSlot,
      playerList: game.players.map(function (p) {
        return { id: p.id, name: p.name, color: p.color };
      })
    });
    this.refreshView();
  },

  onUnload: function () {
    // 离开页面关闭常亮
    wx.setKeepScreenOn({ keepScreenOn: false });
  },

  // ---------- 槽位构建 ----------

  buildSlots: function (game, kind) {
    var slots = [];
    if (kind === 'landlord') {
      slots.push({ label: '底分', color: '', signed: false });
    } else if (kind === 'paodekuai') {
      slots.push({ label: '底分', color: '', signed: false });
      game.players.forEach(function (p) {
        slots.push({ label: p.name + '·剩余牌数', name: p.name, color: p.color, signed: false });
      });
    } else {
      // 通用累分 / 目标分：全部玩家；零和局：前 n-1 人
      var count = engine.getMode(game.modeId).isZeroSum
        ? game.players.length - 1
        : game.players.length;
      for (var i = 0; i < count; i++) {
        var p = game.players[i];
        slots.push({ label: p.name, name: p.name, color: p.color, signed: true });
      }
    }
    return slots;
  },

  // ---------- 键盘 ----------

  // 单字符编辑规则（纯内存计算）
  applyKey: function (raw, k, signed) {
    if (k === 'del') return raw.slice(0, -1);
    if (k === 'clear') return '';
    if (k === 'sign') {
      if (!signed) return raw;
      if (!raw) return '-';
      if (raw.charAt(0) === '-') return raw.slice(1);
      return '-' + raw;
    }
    // 数字键
    var body = raw.charAt(0) === '-' ? raw.slice(1) : raw;
    if (body.length >= 5) return raw; // 位数保护
    if (body === '0') return (raw.charAt(0) === '-' ? '-' : '') + k;
    return raw + k;
  },

  onKey: function (e) {
    var k = e.currentTarget.dataset.k;
    if (k === 'next') {
      var n = this.data.slots.length;
      if (n > 1) {
        var next = (this.data.focusIndex + 1) % n;
        this.setData({ focusIndex: next, focusSigned: !!this.data.slots[next].signed });
      }
      return;
    }
    var i = this.data.focusIndex;
    var slot = this.data.slots[i];
    if (!slot) return;
    var nextRaw = this.applyKey(this._raw[i] || '', k, !!slot.signed);
    if (nextRaw === (this._raw[i] || '')) return;
    this._raw[i] = nextRaw;
    // 确认区单独局部更新，仅改当前槽位
    var patch = {};
    patch['values[' + i + ']'] = nextRaw;
    if (this.data.isZeroSum && this.data.inputKind === 'perPlayer') {
      patch['autoSlot.valueText'] = this.computeAutoText();
    }
    this.setData(patch);
  },

  onSlotTap: function (e) {
    var idx = e.currentTarget.dataset.index;
    this.setData({ focusIndex: idx, focusSigned: !!this.data.slots[idx].signed });
  },

  // 零和末位自动补全展示值
  computeAutoText: function () {
    var sum = 0;
    var hasInput = false;
    for (var i = 0; i < this._raw.length; i++) {
      var r = this._raw[i];
      if (r !== '' && r !== '-') {
        hasInput = true;
        sum += Number(r) || 0;
      }
    }
    if (!hasInput) return '';
    var auto = -sum;
    return fmtSigned(auto);
  },

  // ---------- 斗地主控件 ----------

  onPickLandlord: function (e) {
    this.setData({ landlordIndex: e.currentTarget.dataset.index });
  },

  onSetWin: function (e) {
    this.setData({ landlordWin: e.currentTarget.dataset.win === 'win' });
  },

  onToggleMul: function (e) {
    var key = e.currentTarget.dataset.key;
    var patch = {};
    patch[key] = !this.data[key];
    this.setData(patch);
  },

  // ---------- 提交记一轮 ----------

  // 按模式收集输入（不含任何计算）
  collectInputs: function () {
    var game = this._game;
    var players = game.players;
    if (this.data.inputKind === 'landlord') {
      return {
        base: this._raw[0],
        landlordId: players[this.data.landlordIndex].id,
        landlordWin: this.data.landlordWin,
        multipliers: {
          bomb: this.data.bombOn,
          rocket: this.data.rocketOn,
          spring: this.data.springOn
        }
      };
    }
    if (this.data.inputKind === 'paodekuai') {
      var remaining = {};
      players.forEach(function (p, i) {
        remaining[p.id] = this._raw[i + 1];
      }, this);
      return { base: this._raw[0], remaining: remaining };
    }
    // perPlayer（free / zeroSum / target）
    var scores = {};
    var fillCount = this.data.isZeroSum ? players.length - 1 : players.length;
    for (var i = 0; i < fillCount; i++) {
      scores[players[i].id] = this._raw[i];
    }
    return { scores: scores };
  },

  onSubmit: function () {
    var game = this._game;
    var mode = engine.getMode(game.modeId);
    if (!mode) return;
    var inputs = this.collectInputs();

    // 1. 模式校验
    var err = mode.validate(inputs, game);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      wx.vibrateShort({});
      return;
    }
    // 2. 结算
    var deltas = mode.settle(inputs, game);
    // 3. 零和类二次校验
    if (mode.isZeroSum && !engine.checkBalance(deltas)) {
      wx.showToast({ title: '零和校验失败，请检查输入', icon: 'none' });
      wx.vibrateShort({});
      return;
    }
    // 4. 追加回合并落库
    var next = engine.appendRound(game, deltas);
    this.persist(next);
    this.resetInputs();
    // 5. 一次 setData 批量更新视图
    this.refreshView();
  },

  // 提交成功后清空输入区
  resetInputs: function () {
    this._raw = this.data.slots.map(function () { return ''; });
    var patch = {
      values: this._raw.slice(),
      focusIndex: 0,
      focusSigned: this.data.slots.length ? !!this.data.slots[0].signed : false
    };
    if (this.data.autoSlot) patch['autoSlot.valueText'] = '';
    if (this.data.inputKind === 'landlord') {
      patch.bombOn = false;
      patch.rocketOn = false;
      patch.springOn = false;
    }
    this.setData(patch);
  },

  // ---------- 持久化 ----------

  // 把新对局对象写回 active 列表
  persist: function (nextGame) {
    this._game = nextGame;
    var root = storageKit.loadData();
    var replaced = false;
    for (var i = 0; i < root.active.length; i++) {
      if (root.active[i].id === nextGame.id) {
        root.active[i] = nextGame;
        replaced = true;
        break;
      }
    }
    if (!replaced) root.active.push(nextGame);
    storageKit.saveData(root);
  },

  // ---------- 视图重算（总分/排名/流水全部实时重算） ----------

  refreshView: function () {
    var game = this._game;
    var players = game.players;

    // 排名条
    var bigId = engine.computeBigWinner(game) || '';
    var ranking = engine.computeRanking(game).map(function (r) {
      return {
        playerId: r.playerId,
        name: r.name,
        short: r.name.charAt(0),
        color: r.color,
        total: r.total,
        totalText: fmtSigned(r.total),
        rank: r.rank,
        isBig: r.playerId === bigId
      };
    });

    // 回合流水（最新在前，JS 内完成排序与格式化）
    var rows = [];
    for (var i = game.rounds.length - 1; i >= 0; i--) {
      var r = game.rounds[i];
      var cells = players.map(function (p) {
        var d = Number(r.deltas[p.id]) || 0;
        return {
          name: p.name,
          color: p.color,
          text: fmtSigned(d),
          cls: d > 0 ? 'pos' : (d < 0 ? 'neg' : 'faint')
        };
      });
      rows.push({
        id: r.id,
        seq: i + 1,
        timeText: fmtClock(r.ts),
        voided: r.status === 'void',
        cells: cells
      });
    }

    // 目标分进度
    var targetInfo = null;
    if (game.modeId === 'target' && ranking.length) {
      var t = game.targetScore || 500;
      var lead = ranking[0];
      var pct = Math.max(0, Math.min(100, Math.round(lead.total / t * 100)));
      targetInfo = {
        target: t,
        leaderName: lead.name,
        leaderTotal: fmtSigned(lead.total),
        percent: pct
      };
    }

    // 一次 setData 批量更新
    var patch = {
      ranking: ranking,
      roundRows: rows,
      hasRounds: rows.length > 0,
      canUndo: game.rounds.length > 0,
      targetInfo: targetInfo
    };

    // 终局判定（委托引擎）
    if (engine.isGameOver(game) && !this._ignoreOver && !this.data.showSettle) {
      var winner = null;
      for (var j = 0; j < players.length; j++) {
        if (players[j].id === bigId) { winner = players[j]; break; }
      }
      patch.showSettle = true;
      patch.finalRanking = ranking;
      patch.finalWinnerName = winner ? winner.name : '';
      patch.finalWinnerShort = winner ? winner.name.charAt(0) : '';
      patch.finalWinnerColor = winner ? winner.color : '';
    }
    this.setData(patch);
  },

  // ---------- 撤销 / 废弃 ----------

  onUndo: function () {
    if (!this._game.rounds.length) return;
    var next = engine.undoLastRound(this._game);
    this.persist(next);
    this._ignoreOver = false;
    this.setData({ showSettle: false });
    this.refreshView();
  },

  // 长按回合 → 确认后废弃
  onRoundLongPress: function (e) {
    var roundId = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '废弃该轮',
      content: '废弃后该轮积分不再计入总分，记录仍会保留。确认废弃？',
      confirmText: '废弃',
      success: function (res) {
        if (!res.confirm) return;
        var next = engine.voidRound(self._game, roundId);
        self.persist(next);
        self.refreshView();
      }
    });
  },

  // ---------- 终局 / 归档 ----------

  onSettleContinue: function () {
    this._ignoreOver = true;
    this.setData({ showSettle: false });
  },

  onSettleArchive: function () {
    this.doArchive();
  },

  // 结束对局：随时可归档
  onFinish: function () {
    var self = this;
    wx.showModal({
      title: '结束对局',
      content: '结束后本局将归档至历史战绩，确认结束？',
      confirmText: '结束',
      success: function (res) {
        if (res.confirm) self.doArchive();
      }
    });
  },

  doArchive: function () {
    var archived = engine.archiveGame(this._game);
    var root = storageKit.loadData();
    var rest = [];
    for (var i = 0; i < root.active.length; i++) {
      if (root.active[i].id !== archived.id) rest.push(root.active[i]);
    }
    root.active = rest;
    root.archive.push(archived);
    storageKit.saveData(root);
    wx.navigateBack({
      fail: function () {
        wx.redirectTo({ url: '/pages/index/index' });
      }
    });
  }
});
