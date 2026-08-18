// scoreEngine.js —— 配置驱动的计分引擎
// 纯函数、零 wx 依赖；所有引擎操作函数均返回新对象，不修改传入对象（不可变性）

// ================= 内部工具 =================

// 生成简短唯一 id
function genId(prefix) {
  return (prefix || 'id') + '_' +
    Date.now().toString(36) + '_' +
    Math.floor(Math.random() * 1e8).toString(36);
}

// 深克隆（数据均为纯 JSON 结构）
function clone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

// deltas 对象求和
function sumDeltas(deltas) {
  var s = 0;
  for (var k in deltas) {
    if (Object.prototype.hasOwnProperty.call(deltas, k)) {
      s += Number(deltas[k]) || 0;
    }
  }
  return s;
}

// 判断输入是否为有效数字（非空、可转换）
function isValidNumber(v) {
  if (v === undefined || v === null || v === '') return false;
  return !isNaN(Number(v));
}

// ================= 零和工具 =================

// zeroSumComplete(已录入 deltas, playerIds)：
// 前 n-1 人取已录入值，最后一人自动补全为 -Σ(已录入)，返回完整 deltas
function zeroSumComplete(entered, playerIds) {
  var deltas = {};
  var sum = 0;
  for (var i = 0; i < playerIds.length - 1; i++) {
    var id = playerIds[i];
    var v = Number(entered[id]) || 0;
    deltas[id] = v;
    sum += v;
  }
  var lastId = playerIds[playerIds.length - 1];
  deltas[lastId] = -sum;
  return deltas;
}

// checkBalance(deltas)：校验 Σ===0（带浮点容差）
function checkBalance(deltas) {
  return Math.abs(sumDeltas(deltas)) < 1e-9;
}

// ================= MODES 注册表 =================
// 每个模式为声明式对象：
// { id, name, desc, playerCount:[min,max], isZeroSum,
//   ascending?,        可选，true 表示低分获胜（缺省视为 false）
//   hasTargetScore?,   可选，需要开局配置目标分
//   defaultTarget?,    可选，目标分默认值
//   allowZeroSumAssist?, 可选，false 表示录入域受限（如仅允许非负罚分），
//                        禁用零和补全输入形态与平衡校验（缺省视为 true）
//   fields:[输入字段定义],
//   validate(inputs, game) -> 错误信息 | null,
//   settle(inputs, game)   -> { playerId: delta },
//   isOver(game)           -> bool }

var MODES = {

  // ---------- 1. free 通用累分 ----------
  free: {
    id: 'free',
    name: '通用累分',
    desc: '每人每轮任意加减分，无约束',
    playerCount: [2, 8],
    isZeroSum: false,
    fields: [
      { key: 'scores', label: '本轮积分', type: 'perPlayerSigned', hint: '逐位录入本轮积分变化，可为负' }
    ],
    validate: function (inputs, game) {
      var scores = (inputs && inputs.scores) || {};
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        if (!isValidNumber(scores[p.id])) {
          return '请填写「' + p.name + '」的本轮积分';
        }
      }
      return null;
    },
    settle: function (inputs, game) {
      var deltas = {};
      game.players.forEach(function (p) {
        deltas[p.id] = Number(inputs.scores[p.id]) || 0;
      });
      return deltas;
    },
    isOver: function () {
      return false;
    }
  },

  // ---------- 2. zeroSum 零和局 ----------
  zeroSum: {
    id: 'zeroSum',
    name: '零和局',
    desc: '前 N-1 人录入，最后一人自动补全，总和恒为 0',
    playerCount: [2, 8],
    isZeroSum: true,
    fields: [
      { key: 'scores', label: '本轮积分', type: 'perPlayerSigned', autoLast: true, hint: '录入前 N-1 位，末位自动补全' }
    ],
    validate: function (inputs, game) {
      var scores = (inputs && inputs.scores) || {};
      // 前 n-1 人必须为有效数字，最后一人由引擎补全
      for (var i = 0; i < game.players.length - 1; i++) {
        var p = game.players[i];
        if (!isValidNumber(scores[p.id])) {
          return '请填写「' + p.name + '」的本轮积分';
        }
      }
      return null;
    },
    settle: function (inputs, game) {
      var ids = game.players.map(function (p) { return p.id; });
      return zeroSumComplete((inputs && inputs.scores) || {}, ids);
    },
    isOver: function () {
      return false;
    }
  },

  // ---------- 3. landlord 斗地主 ----------
  landlord: {
    id: 'landlord',
    name: '斗地主',
    desc: '固定 3 人，底分×倍数连乘，严格零和',
    playerCount: [3, 3],
    isZeroSum: true,
    fields: [
      { key: 'base', label: '底分', type: 'positive' },
      { key: 'landlordId', label: '选择地主', type: 'playerPick' },
      { key: 'landlordWin', label: '地主胜负', type: 'winLose' },
      { key: 'multipliers', label: '倍数事件', type: 'multiplierToggles', events: ['bomb', 'rocket', 'spring'], factor: 2 }
    ],
    validate: function (inputs, game) {
      var base = Number(inputs && inputs.base);
      if (!(base > 0)) return '底分必须大于 0';
      if (!inputs.landlordId) return '请选择地主';
      var found = false;
      for (var i = 0; i < game.players.length; i++) {
        if (game.players[i].id === inputs.landlordId) { found = true; break; }
      }
      if (!found) return '地主必须是本局玩家';
      return null;
    },
    settle: function (inputs, game) {
      var base = Number(inputs.base);
      var ev = inputs.multipliers || {};
      // 每个开启的倍数事件各 ×2 连乘
      var mult = 1;
      if (ev.bomb) mult *= 2;
      if (ev.rocket) mult *= 2;
      if (ev.spring) mult *= 2;
      var S = base * mult;
      var deltas = {};
      var win = !!inputs.landlordWin;
      game.players.forEach(function (p) {
        if (p.id === inputs.landlordId) {
          // 地主：胜 +2S，败 -2S
          deltas[p.id] = win ? 2 * S : -2 * S;
        } else {
          // 农民：地主胜则各 -S，地主败则各 +S
          deltas[p.id] = win ? -S : S;
        }
      });
      // 引擎内部零和断言
      if (!checkBalance(deltas)) {
        throw new Error('斗地主结算零和断言失败');
      }
      return deltas;
    },
    isOver: function () {
      return false;
    }
  },

  // ---------- 4. paodekuai 跑得快 ----------
  paodekuai: {
    id: 'paodekuai',
    name: '跑得快',
    desc: '剩余牌数×底分计负分，扣分全部分给先出完者，严格零和',
    playerCount: [2, 4],
    isZeroSum: true,
    fields: [
      { key: 'base', label: '底分', type: 'positive' },
      { key: 'remaining', label: '剩余牌数', type: 'perPlayerNonneg', hint: '出完牌者记 0' }
    ],
    validate: function (inputs, game) {
      var base = Number(inputs && inputs.base);
      if (!(base > 0)) return '底分必须大于 0';
      var rem = (inputs && inputs.remaining) || {};
      var finished = 0;
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        var v = rem[p.id];
        if (!isValidNumber(v)) return '请填写「' + p.name + '」的剩余牌数';
        var n = Number(v);
        if (n < 0 || Math.floor(n) !== n) return '「' + p.name + '」的剩余牌数须为非负整数';
        if (n === 0) finished++;
      }
      if (finished === 0) return '至少需要一位玩家出完牌（剩余 0 张）';
      return null;
    },
    settle: function (inputs, game) {
      var base = Number(inputs.base);
      var rem = inputs.remaining || {};
      var deltas = {};
      var pool = 0;      // 全部扣分池
      var winners = [];  // 出完牌的玩家 id（按 players 顺序，作为"先出完"判定依据）
      game.players.forEach(function (p) {
        var n = Number(rem[p.id]) || 0;
        if (n === 0) {
          winners.push(p.id);
          deltas[p.id] = 0;
        } else {
          var lose = n * base;
          deltas[p.id] = -lose;
          pool += lose;
        }
      });
      // 扣分池分配：单人出完全归他；多人出完均分，
      // 向下取整后的残差归第一位出完者，确保严格零和
      var w = winners.length;
      if (w === 1) {
        deltas[winners[0]] += pool;
      } else if (w > 1) {
        var share = Math.floor(pool / w);
        var residue = pool - share * w;
        winners.forEach(function (id, idx) {
          deltas[id] += share + (idx === 0 ? residue : 0);
        });
      }
      // 引擎内部零和断言
      if (!checkBalance(deltas)) {
        throw new Error('跑得快结算零和断言失败');
      }
      return deltas;
    },
    isOver: function () {
      return false;
    }
  },

  // ---------- 5. target 目标分 ----------
  target: {
    id: 'target',
    name: '目标分',
    desc: '通用累分，有人总分达到目标分即终局',
    playerCount: [2, 8],
    isZeroSum: false,
    hasTargetScore: true,
    defaultTarget: 500,
    fields: [
      { key: 'scores', label: '本轮积分', type: 'perPlayerSigned', hint: '累分至目标分即终局' }
    ],
    validate: function (inputs, game) {
      var scores = (inputs && inputs.scores) || {};
      for (var i = 0; i < game.players.length; i++) {
        var p = game.players[i];
        if (!isValidNumber(scores[p.id])) {
          return '请填写「' + p.name + '」的本轮积分';
        }
      }
      return null;
    },
    settle: function (inputs, game) {
      var deltas = {};
      game.players.forEach(function (p) {
        deltas[p.id] = Number(inputs.scores[p.id]) || 0;
      });
      return deltas;
    },
    isOver: function (game) {
      var t = game.targetScore || 500;
      var totals = computeTotals(game);
      for (var i = 0; i < game.players.length; i++) {
        if ((totals[game.players[i].id] || 0) >= t) return true;
      }
      return false;
    }
  }
};

// ---------- 目标类模式方向感知终局判定（供新增目标类模式复用） ----------
// desc 方向（默认）：有人总分 >= 目标分终局；
// asc 方向（罚分类）：有人罚分累计达到上限（>= targetScore）终局，最低分获胜
function targetStyleIsOver(game) {
  var mode = getMode(game.modeId);
  var t = game.targetScore || (mode && mode.defaultTarget) || 500;
  var totals = computeTotals(game);
  for (var i = 0; i < game.players.length; i++) {
    var total = totals[game.players[i].id] || 0;
    if (total >= t) return true;
  }
  return false;
}

// ---------- 6. guandan 掼蛋·攒分升级 ----------
// fields/validate/settle 直接复用 target 同款函数引用
MODES.guandan = {
  id: 'guandan',
  name: '掼蛋·攒分升级',
  desc: '2v2 组队场景按人录入，队伍合计可并入同队一人；先达目标分终局',
  playerCount: [4, 4],
  isZeroSum: false,
  ascending: false,
  hasTargetScore: true,
  defaultTarget: 1000,
  fields: MODES.target.fields,
  validate: MODES.target.validate,
  settle: MODES.target.settle,
  isOver: targetStyleIsOver
};

// ---------- 7. uno UNO·派对罚分 ----------
// ascending：低分获胜；罚分达上限（defaultTarget）终局
MODES.uno = {
  id: 'uno',
  name: 'UNO·派对罚分',
  desc: '罚分累计，达到上限即终局，最低分获胜',
  playerCount: [2, 8],
  isZeroSum: false,
  ascending: true,
  hasTargetScore: true,
  defaultTarget: 500,
  // 罚分仅允许非负录入：零和补全会产生负值，与该模式录入域冲突，
  // 故禁用零和补全输入形态与平衡校验（页面据此隐藏校验开关 chip）
  allowZeroSumAssist: false,
  fields: [
    { key: 'scores', label: '本轮罚分', type: 'perPlayerSigned', hint: '逐位录入本轮新增罚分，不可为负' }
  ],
  // 在通用逐人校验基础上额外限制罚分非负
  validate: function (inputs, game) {
    var scores = (inputs && inputs.scores) || {};
    for (var i = 0; i < game.players.length; i++) {
      var p = game.players[i];
      var v = scores[p.id];
      if (!isValidNumber(v)) {
        return '请填写「' + p.name + '」的本轮罚分';
      }
      if (Number(v) < 0) {
        return '「' + p.name + '」的罚分不能为负';
      }
    }
    return null;
  },
  settle: MODES.target.settle,
  isOver: targetStyleIsOver
};

// ---------- 8. texas 德州扑克记分 ----------
// fields/validate/settle 直接复用 zeroSum 函数引用（末位自动补全，页面提交时 checkBalance 断言）
// 文案口径：仅使用"每手积分变化/积分"
MODES.texas = {
  id: 'texas',
  name: '德州扑克记分',
  desc: '录入前 N-1 人每手积分变化，末位自动补全，总和恒为 0',
  // 上限与开局人数模板（2~8）及 8 色玩家色板保持一致
  playerCount: [2, 8],
  isZeroSum: true,
  fields: MODES.zeroSum.fields,
  validate: MODES.zeroSum.validate,
  settle: MODES.zeroSum.settle,
  isOver: function () {
    return false;
  }
};

// 模式展示顺序（驱动 UI 渲染）：既有顺序不变，末尾追加新模式
var MODE_ORDER = ['free', 'zeroSum', 'landlord', 'paodekuai', 'target', 'guandan', 'uno', 'texas'];

function getMode(id) {
  return MODES[id] || null;
}

function listModes() {
  return MODE_ORDER.map(function (id) { return MODES[id]; });
}

// ================= 引擎操作（全部不可变） =================

// createGame(modeId, players, options) -> Game
// players: [{id,name,color}]；options: { targetScore, strictZeroSum }
// strictZeroSum 未传时落库字段值为 true（默认开启零和校验）
function createGame(modeId, players, options) {
  var mode = getMode(modeId);
  if (!mode) throw new Error('未知模式：' + modeId);
  options = options || {};
  var game = {
    id: genId('game'),
    modeId: modeId,
    players: players.map(function (p) {
      return { id: p.id, name: p.name, color: p.color };
    }),
    rounds: [],
    status: 'active',
    createdAt: Date.now(),
    endedAt: null
  };
  if (options.targetScore !== undefined && options.targetScore !== null) {
    game.targetScore = Number(options.targetScore) || 500;
  } else if (modeId === 'target') {
    game.targetScore = 500; // 默认目标分
  } else if (mode.hasTargetScore) {
    // 其余目标类模式（guandan/uno）未传时取模式默认目标分
    game.targetScore = mode.defaultTarget || 500;
  }
  // 零和严格校验开关：未传默认开启
  // 录入域受限模式（allowZeroSumAssist: false，如 uno 非负罚分）恒关，避免与补全/平衡校验冲突
  game.strictZeroSum = (mode.allowZeroSumAssist === false)
    ? false
    : ((options.strictZeroSum === undefined) ? true : !!options.strictZeroSum);
  return game;
}

// appendRound(game, deltas) -> 新 Game（追加一个 valid 回合）
function appendRound(game, deltas) {
  var round = {
    id: genId('round'),
    ts: Date.now(),
    status: 'valid',
    deltas: clone(deltas)
  };
  var next = clone(game);
  next.rounds.push(round);
  return next;
}

// undoLastRound(game) -> 新 Game（弹栈末尾回合，无限撤销）
function undoLastRound(game) {
  var next = clone(game);
  if (next.rounds.length > 0) {
    next.rounds.pop();
  }
  return next;
}

// voidRound(game, roundId) -> 新 Game（指定回合标记废弃，保留记录不计分）
function voidRound(game, roundId) {
  var next = clone(game);
  for (var i = 0; i < next.rounds.length; i++) {
    if (next.rounds[i].id === roundId) {
      next.rounds[i].status = 'void';
      break;
    }
  }
  return next;
}

// archiveGame(game) -> 新 Game（归档并记录结束时间）
function archiveGame(game) {
  var next = clone(game);
  next.status = 'archived';
  next.endedAt = Date.now();
  return next;
}

// ================= 重算（总分永不落库） =================

// computeTotals(game) -> { playerId: 总分 }，跳过 void 轮
function computeTotals(game) {
  var totals = {};
  game.players.forEach(function (p) { totals[p.id] = 0; });
  game.rounds.forEach(function (r) {
    if (r.status !== 'valid') return; // 废弃轮不计分
    for (var pid in r.deltas) {
      if (Object.prototype.hasOwnProperty.call(r.deltas, pid) &&
          totals[pid] !== undefined) {
        totals[pid] += Number(r.deltas[pid]) || 0;
      }
    }
  });
  return totals;
}

// computeRanking(game) -> [{ playerId, name, color, total, rank }]
// 默认（desc）总分降序；ascending 模式升序（低分在前）
// 并列同分取相同名次（下一名次跳过，如 1,2,2,4）
function computeRanking(game) {
  var mode = getMode(game.modeId);
  var asc = !!(mode && mode.ascending);
  var totals = computeTotals(game);
  var arr = game.players.map(function (p) {
    return {
      playerId: p.id,
      name: p.name,
      color: p.color,
      total: totals[p.id] || 0
    };
  });
  arr.sort(asc
    ? function (a, b) { return a.total - b.total; }
    : function (a, b) { return b.total - a.total; });
  var rank = 0;
  var prev = null;
  arr.forEach(function (item, idx) {
    if (item.total !== prev) {
      rank = idx + 1;
      prev = item.total;
    }
    item.rank = rank;
  });
  return arr;
}

// computeBigWinner(game) -> 大赢家 playerId；无回合或全员总分为 0 时返回 null
// 默认（desc）取最高分者；ascending 模式取最低分者
function computeBigWinner(game) {
  if (!game.rounds || game.rounds.length === 0) return null;
  var mode = getMode(game.modeId);
  var asc = !!(mode && mode.ascending);
  var totals = computeTotals(game);
  var bestId = null;
  var best = asc ? Infinity : -Infinity;
  var allZero = true;
  game.players.forEach(function (p) {
    var t = totals[p.id] || 0;
    if (t !== 0) allZero = false;
    if (asc ? (t < best) : (t > best)) {
      best = t;
      bestId = p.id;
    }
  });
  if (allZero) return null;
  return bestId;
}

// isGameOver(game) -> bool，委托当前模式的 isOver
function isGameOver(game) {
  var mode = getMode(game.modeId);
  if (!mode) return false;
  return !!mode.isOver(game);
}

// ================= 导出 =================

module.exports = {
  MODES: MODES,
  getMode: getMode,
  listModes: listModes,
  zeroSumComplete: zeroSumComplete,
  checkBalance: checkBalance,
  createGame: createGame,
  appendRound: appendRound,
  undoLastRound: undoLastRound,
  voidRound: voidRound,
  archiveGame: archiveGame,
  computeTotals: computeTotals,
  computeRanking: computeRanking,
  computeBigWinner: computeBigWinner,
  isGameOver: isGameOver
};
