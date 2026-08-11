// storageKit.js —— 全项目唯一接触 wx 本地存储的模块
// 全部为同步 API；存储键带 schema 版本号，预留 migrate() 空钩子

var STORAGE_KEY = 'echo_cards_data_v1';
var SCHEMA_VERSION = 1;

// 默认根结构：{ schemaVersion, active:[Game], archive:[Game] }
function defaultRoot() {
  return {
    schemaVersion: SCHEMA_VERSION,
    active: [],
    archive: []
  };
}

// 结构归一化：确保两个列表字段始终为数组
function normalize(root) {
  return {
    schemaVersion: SCHEMA_VERSION,
    active: Array.isArray(root.active) ? root.active : [],
    archive: Array.isArray(root.archive) ? root.archive : []
  };
}

// 预留迁移钩子：未来 schemaVersion 升级时在此编写旧数据转换逻辑
// 入参为旧版本根结构，返回值需满足新版本 schemaVersion
function migrate(root) {
  return root;
}

// 读取根结构；解析失败 / schemaVersion 不匹配时兜底默认结构
function loadData() {
  var raw = null;
  try {
    raw = wx.getStorageSync(STORAGE_KEY);
  } catch (e) {
    return defaultRoot();
  }
  if (!raw || typeof raw !== 'object') {
    return defaultRoot();
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    var migrated = null;
    try {
      migrated = migrate(raw);
    } catch (e) {
      migrated = null;
    }
    if (migrated && migrated.schemaVersion === SCHEMA_VERSION) {
      return normalize(migrated);
    }
    return defaultRoot();
  }
  return normalize(raw);
}

// 写入根结构；失败返回 false
function saveData(root) {
  try {
    wx.setStorageSync(STORAGE_KEY, root);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- 针对 active / archive 的便捷读写 ----------

function getActive() {
  return loadData().active;
}

function saveActive(list) {
  var root = loadData();
  root.active = Array.isArray(list) ? list : [];
  return saveData(root);
}

function getArchive() {
  return loadData().archive;
}

function saveArchive(list) {
  var root = loadData();
  root.archive = Array.isArray(list) ? list : [];
  return saveData(root);
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  SCHEMA_VERSION: SCHEMA_VERSION,
  loadData: loadData,
  saveData: saveData,
  getActive: getActive,
  saveActive: saveActive,
  getArchive: getArchive,
  saveArchive: saveArchive,
  migrate: migrate
};
