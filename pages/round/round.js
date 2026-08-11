// pages/round/round.js —— 计分局核心页
// 页面 JS 不做任何分数计算：收集输入 → 调引擎 → setData
var engine = require('../../utils/scoreEngine');
var storageKit = require('../../utils/storageKit');
var feedback = require('../../utils/feedbackKit');

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
    ascending: false,       // 低分获胜方向（供后续任务 wxml 绑定）
    winnerLabel: '大赢家',  // asc 时"最优者"，否则"大赢家"（供后续任务 wxml 绑定）

    // ---------- 零和平衡校验开关 ----------
    zsInput: false,         // 零和输入形态：内置零和模式 或 strictZeroSum 开启（旧对局缺字段视为开）
    strictOn: true,         // 当前校验是否开启（展示用）
    strictFixed: false,     // 内置零和模式：校验恒开不可切换
    strictChipText: '校验：开',
    strictHintText: '',

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
    targetInfo: null,  // {target,targetLabel,leaderName,leaderTotal,percent}
    canUndo: false,
    navPad: 0,         // 自定义导航避让高度 px（来自 globalData.nav）

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
  _swipe: null,    // 左滑手势状态 { idx, startX, startY, baseTx, locked }
  _txPending: false, // 帧级节流标志：setData 未回调前丢弃新 touchmove
  _btnWpx: 80,     // 废弃按钮宽 160rpx 换算的 px 值

  onLoad: function (options) {
    // 自定义导航避让高度：读入 globalData.nav.navPad
    var nav = (getApp().globalData && getApp().globalData.nav) || {};
    this.setData({ navPad: nav.navPad || 64 });

    // 废弃按钮宽 160rpx 换算 px（供左滑 clamp/吸附阈值使用）
    var winW = 375;
    try { winW = wx.getWindowInfo().windowWidth || 375; } catch (e) {
      try { winW = wx.getSystemInfoSync().windowWidth || 375; } catch (e2) {}
    }
    this._btnWpx = Math.round(winW / 750 * 160) || 80;

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
    var ascending = !!(mode && mode.ascending);
    var kind = game.modeId === 'landlord' ? 'landlord'
      : (game.modeId === 'paodekuai' ? 'paodekuai' : 'perPlayer');

    // 按当前模式 + 校验开关构建输入形态（槽位/末位自动补全）
    var form = this.buildInputForm(game, kind);
    this._raw = form.slots.map(function () { return ''; });

    // 常亮屏幕
    wx.setKeepScreenOn({ keepScreenOn: true });

    this.setData({
      gameId: game.id,
      modeName: mode ? mode.name : '',
      inputKind: kind,
      isZeroSum: !!mode.isZeroSum,
      ascending: ascending,
      winnerLabel: ascending ? '最优者' : '大赢家',
      strictFixed: !!mode.isZeroSum,
      zsInput: form.zsInput,
      slots: form.slots,
      values: this._raw.slice(),
      focusIndex: 0,
      focusSigned: form.slots.length ? !!form.slots[0].signed : false,
      autoSlot: form.autoSlot,
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

  // 输入形态：内置零和模式 或 strictZeroSum !== false（旧对局缺字段视为 true）时，
  // perPlayer 走零和形态：前 n-1 人录入、末位自动补全
  buildInputForm: function (game, kind) {
    var mode = engine.getMode(game.modeId);
    var zsInput = kind === 'perPlayer' &&
      (!!mode.isZeroSum || game.strictZeroSum !== false);
    var slots = this.buildSlots(game, kind, zsInput);
    var autoSlot = null;
    if (zsInput) {
      var last = game.players[game.players.length - 1];
      autoSlot = { name: last.name, color: last.color, valueText: '' };
    }
    return { slots: slots, autoSlot: autoSlot, zsInput: zsInput };
  },

  buildSlots: function (game, kind, zsInput) {
    var slots = [];
    if (kind === 'landlord') {
      slots.push({ label: '底分', color: '', signed: false });
    } else if (kind === 'paodekuai') {
      slots.push({ label: '底分', color: '', signed: false });
      game.players.forEach(function (p) {
        slots.push({ label: p.name + '·剩余牌数', name: p.name, color: p.color, signed: false });
      });
    } else {
      // 通用累分 / 目标分：全部玩家；零和形态：前 n-1 人
      var count = zsInput ? game.players.length - 1 : game.players.length;
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
    feedback.tap(); // 按键轻反馈（150ms 闸门节流）
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
    if (this.data.zsInput && this.data.inputKind === 'perPlayer') {
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
    // perPlayer（free / zeroSum / target / guandan / uno / texas）
    var scores = {};
    var fillCount = this.data.zsInput ? players.length - 1 : players.length;
    for (var i = 0; i < fillCount; i++) {
      scores[players[i].id] = this._raw[i];
    }
    // 零和形态：末位自动补全为 -Σ（同时满足 free 类模式的全员数字校验）
    if (this.data.zsInput) {
      var sum = 0;
      for (var j = 0; j < fillCount; j++) {
        sum += Number(this._raw[j]) || 0;
      }
      scores[players[players.length - 1].id] = String(-sum);
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
      feedback.impact();
      return;
    }
    // 2. 结算
    var deltas = mode.settle(inputs, game);
    // 3. 平衡校验：内置零和模式恒校；其余模式 strictZeroSum 开启（旧对局缺字段视为开）时校验
    var needCheck = !!mode.isZeroSum || game.strictZeroSum !== false;
    if (needCheck && !engine.checkBalance(deltas)) {
      var sum = 0;
      for (var k in deltas) {
        if (deltas.hasOwnProperty(k)) sum += Number(deltas[k]) || 0;
      }
      wx.showToast({ title: '本轮合计 ' + fmtSigned(Math.round(sum * 100) / 100) + '，不平衡', icon: 'none' });
      feedback.impact();
      return;
    }
    // 4. 追加回合并落库
    var next = engine.appendRound(game, deltas);
    this.persist(next);
    this.resetInputs();
    // 5. 一次 setData 批量更新视图（refreshView 重建行会统一收起已展开的左滑行）
    this.refreshView();
    feedback.impact(); // 提交成功重反馈
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
        cells: cells,
        tx: 0,          // 左滑位移 px，重建行一律归零（含提交新轮次后收起展开行）
        swipeAnim: false
      });
    }

    // 目标分进度（凡带 targetScore 的对局均展示，覆盖 target/guandan/uno）
    var targetInfo = null;
    if (game.targetScore !== undefined && ranking.length) {
      var t = game.targetScore || 500;
      var asc = this.data.ascending;
      // desc：领先者向目标分进度；asc：罚分最高者向上限逼近
      var lead = asc ? ranking[ranking.length - 1] : ranking[0];
      var pct = Math.max(0, Math.min(100, Math.round(lead.total / t * 100)));
      targetInfo = {
        target: t,
        targetLabel: asc ? '罚分上限' : '目标分',
        leaderName: lead.name,
        leaderTotal: fmtSigned(lead.total),
        percent: pct
      };
    }

    // 校验开关状态文案（内置零和模式恒为"常开"）
    var strictOn = game.strictZeroSum !== false;
    var chipText, hintText;
    if (this.data.strictFixed) {
      chipText = '校验：常开';
      hintText = '内置零和模式 · 每轮全场合计恒为 0';
    } else if (strictOn) {
      chipText = '校验：开';
      hintText = '平衡校验：开 · 每轮全场输赢合计必须为 0';
    } else {
      chipText = '校验：关';
      hintText = '平衡校验：关 · 全员自由录入';
    }

    // 一次 setData 批量更新
    var patch = {
      ranking: ranking,
      roundRows: rows,
      hasRounds: rows.length > 0,
      canUndo: game.rounds.length > 0,
      targetInfo: targetInfo,
      strictOn: strictOn,
      strictChipText: chipText,
      strictHintText: hintText
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
    feedback.tap();
    var next = engine.undoLastRound(this._game);
    this.persist(next);
    this._ignoreOver = false;
    this.setData({ showSettle: false });
    this.refreshView();
  },

  // ---------- 回合行左滑废弃 ----------

  // 方向锁：首个超过 8px 的位移判主导方向；纵向（|dy| >= |dx|/1.5）放弃接管，
  // 因用 bindtouchmove（不 catch）自然交还页面滚动
  onRowTouchStart: function (e) {
    var idx = e.currentTarget.dataset.index;
    this._swipe = {
      idx: idx,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      baseTx: this.data.roundRows[idx].tx || 0,
      locked: false
    };
  },

  onRowTouchMove: function (e) {
    var s = this._swipe;
    if (!s || s.idx < 0) return;
    var dx = e.touches[0].clientX - s.startX;
    var dy = e.touches[0].clientY - s.startY;
    if (!s.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx) / 1.5) {
        s.idx = -1; // 纵向主导 → 放弃接管
        return;
      }
      s.locked = true;
      this.collapseOtherRows(s.idx); // 全表最多一行展开
    }
    if (this._txPending) return; // 帧级节流：pending 期间丢弃
    var btnW = this._btnWpx;
    var raw = s.baseTx + dx;
    var tx = raw;
    if (tx > 0) tx = raw / 2;                       // 越右界阻尼减半
    if (tx < -btnW) tx = -btnW + (raw + btnW) / 2;  // 越左界阻尼减半
    this._txPending = true;
    var patch = {};
    patch['roundRows[' + s.idx + '].tx'] = tx;
    patch['roundRows[' + s.idx + '].swipeAnim'] = false; // 拖动中关 transition 保跟手
    var self = this;
    this.setData(patch, function () { self._txPending = false; });
  },

  onRowTouchEnd: function () {
    var s = this._swipe;
    this._swipe = null;
    if (!s || s.idx < 0 || !s.locked) return;
    var idx = s.idx;
    var tx = this.data.roundRows[idx].tx || 0;
    var btnW = this._btnWpx;
    // 超过按钮宽一半吸附展开，否则回弹关闭
    var target = tx < -btnW / 2 ? -btnW : 0;
    var patch = {};
    patch['roundRows[' + idx + '].tx'] = target;
    patch['roundRows[' + idx + '].swipeAnim'] = true;
    this.setData(patch);
  },

  // 收起除 keepIdx 外所有已展开行
  collapseOtherRows: function (keepIdx) {
    var patch = {};
    var changed = false;
    for (var i = 0; i < this.data.roundRows.length; i++) {
      if (i === keepIdx) continue;
      if (this.data.roundRows[i].tx) {
        patch['roundRows[' + i + '].tx'] = 0;
        patch['roundRows[' + i + '].swipeAnim'] = true;
        changed = true;
      }
    }
    if (changed) this.setData(patch);
  },

  // 左滑露出的废弃按钮 → 二次确认后废弃（不可逆，复用 showModal 确认流程）
  onVoidTap: function (e) {
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
        self.refreshView(); // 重建行重置 tx，收起全部左滑行
        feedback.impact();  // 不可逆操作重反馈
      }
    });
  },

  // ---------- 校验开关 ----------

  // topbar chip 切换 strictZeroSum（内置零和模式不可切换）
  onToggleStrict: function () {
    if (this.data.strictFixed) return;
    var game = this._game;
    var nextVal = game.strictZeroSum !== false ? false : true;
    var g2 = {};
    for (var k in game) {
      if (game.hasOwnProperty(k)) g2[k] = game[k];
    }
    g2.strictZeroSum = nextVal;
    this.persist(g2);
    // 输入形态随开关变化：重建槽位与末位自动补全，清空已录入
    var form = this.buildInputForm(g2, this.data.inputKind);
    this._raw = form.slots.map(function () { return ''; });
    this.setData({
      zsInput: form.zsInput,
      slots: form.slots,
      values: this._raw.slice(),
      focusIndex: 0,
      focusSigned: form.slots.length ? !!form.slots[0].signed : false,
      autoSlot: form.autoSlot
    });
    this.refreshView();
  },

  // ---------- 终局 / 归档 ----------

  onSettleContinue: function () {
    this._ignoreOver = true;
    this.setData({ showSettle: false });
  },

  onSettleArchive: function () {
    feedback.impact();
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
        if (!res.confirm) return;
        feedback.impact(); // 归档确认重反馈
        self.doArchive();
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
