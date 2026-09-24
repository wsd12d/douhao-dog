/* ==========================================================
   逗号宝宝生活日记 — 交互逻辑（云端共享版）
   所有记录存在云端，登录后所有人可见
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- 基础配置 ---------------- */
  var MEALS = [
    { key: 'breakfast', name: '早餐', icon: 'i-sun',  defTime: '09:30', hint: '早上吃得好，一天都有精神' },
    { key: 'lunch',     name: '午餐', icon: 'i-bowl', defTime: '12:10', hint: '中午这顿是最期待的' },
    { key: 'dinner',    name: '晚餐', icon: 'i-moon', defTime: '23:30', hint: '睡前最后一顿，吃完就睡觉觉' }
  ];
  var AMOUNTS = [
    { key: 'all',    label: '吃得干干净净' },
    { key: 'most',   label: '吃了一大半' },
    { key: 'little', label: '只吃了几口' },
    { key: 'none',   label: '今天没胃口' }
  ];
  var AMOUNT_SHORT = { all: '光盘', most: '大半', little: '几口', none: '没吃' };
  var AMOUNT_LABEL = {};
  AMOUNTS.forEach(function (a) { AMOUNT_LABEL[a.key] = a.label; });

  var MAX_PHOTOS = 5;

  var DEFAULT_SETTINGS = {
    meals: {
      breakfast: { time: '09:30', on: true },
      lunch:     { time: '12:10', on: true },
      dinner:    { time: '23:30', on: true }
    },
    notify: false,
    nickname: ''
  };

  var MEMORY = [
    { src: 'assets/photos/douhao-01.jpg', cap: '盯着零食盒，尾巴都要摇出残影了' },
    { src: 'assets/photos/douhao-02.jpg', cap: '坐得端端正正，就为了一口好吃的' },
    { src: 'assets/photos/douhao-03.jpg', cap: '穿上淡紫色小外套，在街边发呆' },
    { src: 'assets/photos/douhao-04.jpg', cap: '冰箱旁边的招牌笑容' },
    { src: 'assets/photos/douhao-05.jpg', cap: '傍晚的草坪，风把毛吹成一朵云' },
    { src: 'assets/photos/douhao-06.jpg', cap: '吃东西沾了一鼻子，还一脸无辜' },
    { src: 'assets/photos/douhao-07.jpg', cap: '抬眼看镜头：拍好了没呀？' },
    { src: 'assets/photos/douhao-08.jpg', cap: '今天也是可爱担当' }
  ];

  var QUOTES = [
    '今天也要好好吃饭饭哦～',
    '汪！我等你的照片等好久啦',
    '记得拍我把饭吃完的样子哦',
    '一日三餐，一顿都不能少',
    '吃好了才有力气陪你玩呀'
  ];

  /* ---------------- 状态 ---------------- */
  var state = {
    user: null,
    date: todayStr(),
    entries: [],        // 云端记录（全部人可见）
    urlMap: {},         // photo_path -> 临时访问链接
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    draft: {},
    editing: {},
    cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
    fired: {},
    pickTarget: null,
    pickDaily: false,
    pendingOtp: {},     // 各表单的验证码上下文
    bannerShown: '',
    loading: true,

    /* 日常随手拍（独立表，持久 + 共享） */
    daily: [],          // 全部日常照片记录
    myLikes: {},        // 'daily:12' -> true，我点过赞的
    likeCount: {},      // 'daily:12' -> 点赞数
    /* 回忆墙：三餐照片 + 日常照片混排 */
    wallTab: 'all'      // all | meal | daily
  };

  /* ---------------- 工具 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { return toDateStr(new Date()); }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function weekdayName(d) { return '周' + '日一二三四五六'[d.getDay()]; }
  function friendlyDate(s) {
    var t = todayStr();
    if (s === t) return '今天';
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (s === toDateStr(y)) return '昨天';
    var d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    var box = $('#toastBox');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'warn' ? ' warn' : '');
    el.innerHTML = '<svg><use href="#' + (type === 'warn' ? 'i-bell' : 'i-check') + '"></use></svg><span></span>';
    el.querySelector('span').textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = '.32s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(14px)';
      setTimeout(function () { el.remove(); }, 340);
    }, type === 'warn' ? 3600 : 2700);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mergeDeep(base, patch) {
    var out = JSON.parse(JSON.stringify(base));
    if (!patch) return out;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) &&
          out[k] && typeof out[k] === 'object') {
        out[k] = mergeDeep(out[k], patch[k]);
      } else if (patch[k] !== undefined) {
        out[k] = patch[k];
      }
    });
    return out;
  }

  function mealCfg(key) { return (state.settings.meals && state.settings.meals[key]) || { time: '09:30', on: true }; }
  function mealName(key) {
    for (var i = 0; i < MEALS.length; i++) if (MEALS[i].key === key) return MEALS[i].name;
    return '加餐';
  }

  /* ---- 记录读取 ---- */
  function findRec(date, key) {
    for (var i = 0; i < state.entries.length; i++) {
      var e = state.entries[i];
      if (e.date === date && e.meal === key) return e;
    }
    return null;
  }
  function dayRecs(date) {
    return state.entries.filter(function (e) { return e.date === date; });
  }
  function recPhotos(rec) {
    if (!rec) return [];
    var paths = rec.photoPaths || (rec.photoPath ? [rec.photoPath] : []);
    return paths.map(function (p) { return state.urlMap[p] || ''; }).filter(Boolean);
  }
  function recPaths(rec) {
    if (!rec) return [];
    return rec.photoPaths || (rec.photoPath ? [rec.photoPath] : []);
  }
  function mine(rec) {
    return !!(state.user && rec && rec.ownerId === state.user.id);
  }
  /** 记录展示用的归属者称呼 */
  function recOwner(rec) {
    if (!rec) return '';
    if (mine(rec)) return '我';
    if (rec.ownerName) return rec.ownerName;
    var id = String(rec.ownerId || '');
    return id ? '家人' + id.slice(-4) : '家人';
  }

  /* ---- 云端记录 → 界面模型 ---- */
  function normalize(row) {
    return {
      id: row.id,
      date: row.entry_date,
      meal: row.meal,
      food: row.food || '',
      amount: row.amount || '',
      note: row.note || '',
      photoPaths: row.photo_path ? [row.photo_path] : [],
      photoPath: row.photo_path || null,
      ownerId: row.owner_id,
      ownerName: row.owner_name || '',
      savedAt: row.saved_at ? new Date(row.saved_at).getTime() : null
    };
  }

  /* ================= 提醒音 ================= */
  function playChime() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx;
    try { ctx = new AC(); } catch (e) { return; }
    var base = ctx.currentTime + 0.02;
    [784, 1046.5, 1318.5].forEach(function (f, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      var t = base + i * 0.17;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.035);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.85);
    });
    setTimeout(function () { try { ctx.close(); } catch (e) {} }, 2200);
  }

  function notifySupported() { return 'Notification' in window; }

  function systemNotify(title, body) {
    if (!notifySupported() || Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body: body,
        icon: 'assets/photos/douhao-08.jpg',
        tag: 'douhao-remind'
      });
    } catch (e) {}
  }

  function refreshNotifyUI() {
    var el = $('#navStatus');
    var txt = $('#navStatusText');
    if (!el || !txt) return;
    if (!state.user) {
      el.className = 'nav-status off';
      txt.textContent = '未登录';
      return;
    }
    var on = notifySupported() && Notification.permission === 'granted';
    el.className = 'nav-status ' + (on ? 'on' : 'off');
    txt.textContent = on ? '提醒已开启' : '提醒未开启';
  }

  /* ================= 提醒检查 ================= */
  function checkReminders() {
    if (!state.user) return;
    var now = new Date();
    var hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var today = todayStr();
    var firedAny = false;

    MEALS.forEach(function (m) {
      var cfg = mealCfg(m.key);
      if (!cfg.on || cfg.time !== hhmm) return;
      var rec = findRec(today, m.key);
      if (rec && mine(rec)) return;    // 自己已记过才跳过
      var fk = today + '|' + m.key;
      if (state.fired[fk]) return;
      state.fired[fk] = 1;
      firedAny = true;

      playChime();
      systemNotify('该给逗号记录' + m.name + '啦 🐾', cfg.time + ' 到咯，拍张照片记一下吧');
      toast('到点啦！该给逗号记录' + m.name + '了', 'warn');
      renderMeals();
      var card = $('.meal[data-meal="' + m.key + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    if (firedAny) renderBanner();
  }

  function pendingMeals() {
    if (!state.user) return [];
    var now = new Date();
    var hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var today = todayStr();
    return MEALS.filter(function (m) {
      var cfg = mealCfg(m.key);
      if (!cfg.on) return false;
      var rec = findRec(today, m.key);
      if (rec && mine(rec)) return false;
      return cfg.time <= hhmm;
    });
  }

  function renderBanner() {
    var host = $('#bannerHost');
    if (!host) return;
    if (!state.user) { host.innerHTML = ''; return; }
    var list = pendingMeals();
    if (!list.length) { host.innerHTML = ''; state.bannerShown = ''; return; }
    var sig = list.map(function (m) { return m.key; }).join(',');
    if (state.bannerShown === sig && host.innerHTML) return;
    state.bannerShown = sig;

    var names = list.map(function (m) { return m.name; }).join('、');
    host.innerHTML =
      '<div class="remind-banner">' +
        '<div class="bell"><svg><use href="#i-bell"></use></svg></div>' +
        '<div class="rt">' +
          '<b>逗号的' + names + '还没记录哦</b>' +
          '<span>提醒时间已经过啦，现在补上也来得及～</span>' +
        '</div>' +
        '<button class="btn btn-main" id="bannerGo">马上记录</button>' +
      '</div>';
    var go = $('#bannerGo');
    if (go) go.addEventListener('click', function () {
      var card = $('.meal[data-meal="' + list[0].key + '"]');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }],
          { duration: 620, easing: 'ease-in-out' });
      }
    });
  }

  /* ================= Hero ================= */
  function renderHero() {
    var photos = 0;
    state.entries.forEach(function (e) { photos += recPaths(e).length; });
    var mineCount = state.entries.filter(mine).length;

    $('#statMeals').textContent = state.entries.length;
    $('#statPhotos').textContent = photos;
    $('#statStreak').textContent = calcStreak();

    var tag = $('#heroTag');
    if (tag) tag.textContent = state.entries.length
      ? '2 岁 · 共 ' + state.entries.length + ' 条记录'
      : '2 岁 · 白色小毛球';

    var q = $('#heroQuote');
    if (q) {
      var h = new Date().getHours();
      var idx = (new Date().getDate() + h) % QUOTES.length;
      var pre = h < 6 ? '夜深啦，' : h < 11 ? '早上好呀，' : h < 14 ? '中午好，' : h < 18 ? '下午好，' : '晚上好，';
      var mineTip = mineCount ? '（我记了 ' + mineCount + ' 条）' : '';
      q.textContent = pre + QUOTES[idx] + mineTip;
    }
  }

  function calcStreak() {
    var set = {};
    state.entries.forEach(function (e) { set[e.date] = (set[e.date] || 0) + 1; });
    var d = new Date();
    if (!set[toDateStr(d)]) d.setDate(d.getDate() - 1);
    var n = 0;
    while (set[toDateStr(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
      if (n > 3650) break;
    }
    return n;
  }

  /* ================= 每日打卡 ================= */
  function renderDateNav() {
    var d = parseDate(state.date);
    var isToday = state.date === todayStr();
    $('#dateText').innerHTML = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayName(d) +
      (isToday ? '<em>今天</em>' : '<em>' + friendlyDate(state.date) + '</em>');
    $('#nextDay').disabled = isToday;

    var done = dayRecs(state.date).length;
    var C = 2 * Math.PI * 18;
    var fg = $('#ringFg');
    if (fg) fg.setAttribute('stroke-dasharray', (C * Math.min(done, 3) / 3).toFixed(1) + ' ' + C.toFixed(1));
    $('#ringNum').textContent = Math.min(done, 3) + '/3';
  }

  function renderMeals() {
    var host = $('#meals');
    if (!host) return;
    host.innerHTML = MEALS.map(mealCardHTML).join('');
    renderDateNav();
    renderBanner();
  }

  function mealCardHTML(m) {
    var rec = findRec(state.date, m.key);
    var cfg = mealCfg(m.key);
    var isToday = state.date === todayStr();
    var now = new Date();
    var hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var cls = 'meal';
    var badge = '';
    var isMine = rec && mine(rec);

    if (rec) {
      cls += ' done';
      badge = '<span class="badge-state ok">' + (isMine ? '我记好了' : '已记录') + '</span>';
    } else if (isToday && cfg.on && cfg.time <= hhmm) {
      cls += ' due';
      badge = '<span class="badge-state wait">待打卡</span>';
    } else if (isToday) {
      badge = '<span class="badge-state">还没到点</span>';
    } else {
      badge = '<span class="badge-state">缺记录</span>';
    }

    var head =
      '<div class="meal-head">' +
        '<div class="meal-ico"><svg><use href="#' + m.icon + '"></use></svg></div>' +
        '<div>' +
          '<div class="meal-name">' + m.name + '</div>' +
          '<div class="meal-time">' + (cfg.on ? cfg.time + ' 提醒' : '提醒已关闭') + '</div>' +
        '</div>' +
        badge +
      '</div>';

    if (rec && !state.editing[m.key]) {
      return '<div class="' + cls + '" data-meal="' + m.key + '">' + head + doneBody(rec, m) + '</div>';
    }
    return '<div class="' + cls + '" data-meal="' + m.key + '">' + head + formBody(m, rec) + '</div>';
  }

  function photoGridHTML(photos, done) {
    var cells = photos.map(function (p, i) {
      var tools = done
        ? '<div class="photo-tools">' +
            '<button data-act="zoom" data-idx="' + i + '" title="看大图"><svg><use href="#i-image"></use></svg></button>' +
          '</div>'
        : '<div class="photo-tools">' +
            '<button data-act="zoom" data-idx="' + i + '" title="看大图"><svg><use href="#i-image"></use></svg></button>' +
            '<button data-act="rmp" data-idx="' + i + '" title="删除这张"><svg><use href="#i-trash"></use></svg></button>' +
          '</div>';
      return '<div class="photo-cell"><img src="' + p + '" alt="逗号今日照片">' + tools + '</div>';
    }).join('');

    if (!done && photos.length < MAX_PHOTOS) {
      cells += '<div class="photo-cell add" data-act="pick">' +
        '<div class="photo-empty"><svg><use href="#i-camera"></use></svg><p>' +
        (photos.length ? '再传一张 ' + photos.length + '/' + MAX_PHOTOS
                       : '点这里给逗号拍一张<br>最多 ' + MAX_PHOTOS + ' 张') +
        '</p></div></div>';
    }
    if (done && !photos.length) {
      cells = '<div class="photo-cell add" style="cursor:default">' +
        '<div class="photo-empty"><svg><use href="#i-camera"></use></svg><p>这一餐没传照片</p></div></div>';
    }

    var cnt = done ? '' :
      '<div class="photo-count">' + (photos.length ? '已传 ' + photos.length + '/' + MAX_PHOTOS + ' 张' : '还没传照片') + '</div>';
    return '<div class="photo-grid">' + cells + '</div>' + cnt;
  }

  function formBody(m, rec) {
    var d = state.draft[m.key] || {};
    var existing = rec && mine(rec) ? rec : null;   // 别人的记录不能改
    var photos = d.photos !== undefined ? d.photos : (existing ? recPhotos(existing) : []);
    var food = d.food !== undefined ? d.food : (existing && existing.food) || '';
    var amount = d.amount !== undefined ? d.amount : (existing && existing.amount) || '';
    var note = d.note !== undefined ? d.note : (existing && existing.note) || '';

    var chips = AMOUNTS.map(function (a) {
      return '<button class="chip" type="button" data-amount="' + a.key + '" aria-pressed="' +
        (amount === a.key ? 'true' : 'false') + '">' + a.label + '</button>';
    }).join('');

    var lockedTip = '';
    if (rec && !mine(rec)) {
      lockedTip = '<div class="locked-tip">这一餐是「' + esc(recOwner(rec)) +
        '」记的。你记的话会覆盖掉原来的内容哦</div>';
    }

    return lockedTip + photoGridHTML(photos, false) +
      '<div class="field"><label>吃的是什么</label>' +
        '<input class="input" data-f="food" placeholder="比如：鸡胸肉拌狗粮、半根磨牙棒" value="' + esc(food) + '">' +
      '</div>' +
      '<div class="field"><label>吃完了吗</label><div class="chips">' + chips + '</div></div>' +
      '<div class="field"><label>想说的话</label>' +
        '<textarea class="textarea" data-f="note" placeholder="今天乖乖的吗？有没有调皮？">' + esc(note) + '</textarea>' +
      '</div>' +
      '<div class="meal-foot">' +
        '<button class="btn btn-main" data-act="save">' +
          '<svg><use href="#i-check"></use></svg>' + (existing ? '保存修改' : '上传记录') +
        '</button>' +
        (rec ? '<button class="btn btn-ghost" data-act="cancel">取消</button>' : '') +
        (existing ? '<button class="btn btn-ghost btn-danger" data-act="del" title="删除这条记录"><svg><use href="#i-trash"></use></svg></button>' : '') +
      '</div>';
  }

  function doneBody(rec, m) {
    var rows = '';
    if (rec.food) rows += '<div class="done-row"><span class="k">吃了什么</span><span class="v">' + esc(rec.food) + '</span></div>';
    if (rec.amount) rows += '<div class="done-row"><span class="k">食量</span><span class="v">' + AMOUNT_LABEL[rec.amount] + '</span></div>';
    if (rec.note) rows += '<div class="done-row"><span class="k">想说的话</span><span class="v">' + esc(rec.note) + '</span></div>';
    if (!rows) rows = '<div class="done-row"><span class="v" style="color:var(--ink-3)">只记了照片～</span></div>';

    var t = rec.savedAt ? new Date(rec.savedAt) : null;
    var stamp = t ? pad(t.getHours()) + ':' + pad(t.getMinutes()) + ' 上传' : '已记录';
    var isMine = mine(rec);

    return photoGridHTML(recPhotos(rec), true) +
      '<div class="done-info">' + rows + '</div>' +
      '<div class="done-stamp">' +
        '<svg><use href="#i-bone"></use></svg>' + stamp + ' · ' + esc(recOwner(rec)) +
        (isMine ? ' · ' + friendlyDate(rec.date) : '') +
      '</div>' +
      '<div class="meal-foot">' +
        (isMine
          ? '<button class="btn btn-ghost btn-block" data-act="edit"><svg><use href="#i-pencil"></use></svg>编辑一下</button>'
          : '<button class="btn btn-ghost btn-block" data-act="edit"><svg><use href="#i-pencil"></use></svg>我来补一条</button>') +
      '</div>';
  }

  function renderOneMeal(key) {
    var m = null;
    MEALS.forEach(function (x) { if (x.key === key) m = x; });
    if (!m) return;
    var old = $('.meal[data-meal="' + key + '"]');
    if (!old) { renderMeals(); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = mealCardHTML(m);
    old.replaceWith(tmp.firstElementChild);
    renderDateNav();
    renderBanner();
  }

  function syncDraftFromCard(key) {
    var card = $('.meal[data-meal="' + key + '"]');
    if (!card) return;
    var d = state.draft[key] || (state.draft[key] = {});
    var food = card.querySelector('[data-f="food"]');
    var note = card.querySelector('[data-f="note"]');
    if (food) d.food = food.value;
    if (note) d.note = note.value;
  }

  /* ---- 上传照片到云端（先压缩，再传 Storage） ---- */
  function uploadPhotos(files, onProgress) {
    if (!state.user) return Promise.reject(new Error('请先登录再上传哦'));
    var list = Array.prototype.slice.call(files).slice(0, MAX_PHOTOS);
    var paths = [];
    var chain = Promise.resolve();
    list.forEach(function (file, i) {
      chain = chain.then(function () {
        onProgress && onProgress(i + 1, list.length);
        return Store.compress(file, 1280, 0.8).then(function (res) {
          if (res.blob.size > 3.5 * 1024 * 1024) throw new Error('照片太大了，换一张小一点的');
          return Store.uploadPhoto(res.blob, state.user.id).then(function (path) {
            URL.revokeObjectURL(res.previewUrl);
            paths.push(path);
          });
        });
      });
    });
    return chain.then(function () { return paths; });
  }

  /* ---- 保存打卡 ---- */
  function saveMeal(key) {
    syncDraftFromCard(key);
    var card = $('.meal[data-meal="' + key + '"]');
    var d = state.draft[key] || {};
    var existing = findRec(state.date, key);
    var existingMine = existing && mine(existing) ? existing : null;
    var pendingBlobs = d.blobs || [];

    if (!pendingBlobs.length && !(d.photoPaths || []).length && !existingMine &&
        !d.food && !d.amount && !d.note) {
      toast('先写点内容或者传张照片吧～', 'warn');
      return;
    }

    if (card) card.style.opacity = '.6';
    var btn = card && card.querySelector('[data-act="save"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spinner"></span> 上传中…'; }

    var uploadedPaths = [];

    /* 新选的照片先传上去 */
    var chain = Promise.resolve();
    if (pendingBlobs.length) {
      chain = (function () {
        var acc = [];
        var seq = Promise.resolve();
        pendingBlobs.forEach(function (blob, i) {
          seq = seq.then(function () {
            if (btn) btn.innerHTML = '<span class="auth-spinner"></span> 传照片 ' + (i + 1) + '/' + pendingBlobs.length + '…';
            if (blob.size > 3.5 * 1024 * 1024) throw new Error('照片太大了，换一张小一点的');
            return Store.uploadPhoto(blob, state.user.id).then(function (p) { acc.push(p); });
          });
        });
        return seq.then(function () { uploadedPaths = acc; });
      })();
    }

    chain.then(function () {
      var keepPaths = d.photoPaths !== undefined ? d.photoPaths : (existingMine ? recPaths(existingMine) : []);
      var allPaths = keepPaths.concat(uploadedPaths);
      if (!allPaths.length) throw new Error('还差一张逗号的照片哦');

      return Store.save({
        date: state.date,
        meal: key,
        food: d.food || '',
        amount: d.amount || '',
        note: d.note || '',
        photoPath: allPaths[0] || null,
        ownerName: state.settings.nickname || (state.user && state.user.email || '').split('@')[0] || '家人'
      });
    }).then(function () {
      /* 覆盖别人的记录时，把被替换掉的照片清掉（只清自己确实替换掉的） */
      if (existingMine) {
        var oldPaths = recPaths(existingMine);
        var keepNow = (d.photoPaths !== undefined ? d.photoPaths : oldPaths).concat(uploadedPaths);
        var orphan = oldPaths.filter(function (p) { return keepNow.indexOf(p) < 0; });
        if (orphan.length) Store.removePhotos(orphan);
      }
      state.draft[key] = {};
      state.editing[key] = false;
      state.bannerShown = '';
      toast('记录好啦，大家都能看到逗号的这一餐了～');
      return refresh({ quiet: true }).then(function () { renderOneMeal(key); });
    }).catch(function (e) {
      /* 失败时把已经传上去的孤立照片清掉，避免垃圾文件 */
      if (uploadedPaths.length) Store.removePhotos(uploadedPaths);
      toast(e && e.message ? e.message : '保存失败，稍后再试', 'warn');
      if (card) card.style.opacity = '';
      if (btn) { btn.disabled = false; }
      renderOneMeal(key);
    });
  }

  /* ---- 删除记录 ---- */
  function deleteMeal(key) {
    var rec = findRec(state.date, key);
    if (!rec) return;
    if (!mine(rec)) { toast('这条是「' + recOwner(rec) + '」记的，删不了哦', 'warn'); return; }
    if (!confirm('确定删掉「' + recOwner(rec) + '」记的这顿' + mealName(key) + '吗？删了就找不回来了。')) return;
    Store.remove(rec.id).then(function () {
      /* 顺带把这条记录的照片也清掉 */
      var paths = recPaths(rec);
      state.draft[key] = {};
      state.editing[key] = false;
      state.bannerShown = '';
      toast('这条记录删掉啦');
      return refresh({ quiet: true }).then(function () {
        renderOneMeal(key);
        if (paths.length) Store.removePhotos(paths);
      });
    }).catch(function (e) {
      toast(e && e.message ? e.message : '删除失败', 'warn');
    });
  }

  /* ================= 回忆墙（三餐照片 + 日常照片，都带简介和点赞） ================= */

  /** 把三餐记录和日常照片统一成「墙上的照片」模型 */
  function wallItems() {
    var items = [];

    /* 三餐照片 */
    state.entries.forEach(function (rec) {
      var urls = recPhotos(rec);
      urls.forEach(function (url, idx) {
        var parts = [];
        parts.push(friendlyDate(rec.date));
        parts.push(mealName(rec.meal));
        if (rec.food) parts.push(rec.food);
        items.push({
          kind: 'meal',
          ref: rec.id + '-' + idx,
          url: url,
          cap: parts.join(' · '),
          owner: recOwner(rec),
          isMine: mine(rec),
          date: rec.date,
          likes: 0,
          liked: false,
          canLike: false,
          sub: idx === 0 ? '三餐打卡' : ''
        });
      });
    });

    /* 日常随手拍 */
    state.daily.forEach(function (d) {
      var url = state.urlMap[d.photo_path];
      if (!url) return;
      var key = 'daily:' + d.id;
      var likes = state.likeCount[key] !== undefined ? state.likeCount[key] : (d.like_count || 0);
      items.push({
        kind: 'daily',
        ref: d.id,
        url: url,
        cap: d.caption || '',
        owner: ownerLabel(d.owner_id, d.owner_name),
        isMine: !!state.user && d.owner_id === state.user.id,
        date: d.photo_date,
        likes: likes,
        liked: !!state.myLikes[key],
        canLike: !!state.user,
        sub: '日常随手拍'
      });
    });

    return items;
  }

  /** 每日最萌照片：每天点赞最高的那一张 */
  function topOfDate(date) {
    var list = state.daily.filter(function (d) { return d.photo_date === date; });
    if (!list.length) return null;
    var best = null;
    list.forEach(function (d) {
      var key = 'daily:' + d.id;
      var n = state.likeCount[key] !== undefined ? state.likeCount[key] : (d.like_count || 0);
      if (!best || n > best.n) best = { id: d.id, n: n };
    });
    return best && best.n > 0 ? best.id : null;
  }

  function renderMemory() {
    var host = $('#memoryStrip');
    if (!host) return;

    var items = wallItems();

    /* 排序：最萌照片优先 → 日期倒序 */
    var bestId = topOfDate(todayStr());
    items.sort(function (a, b) {
      var aBest = a.kind === 'daily' && a.ref === bestId ? 1 : 0;
      var bBest = b.kind === 'daily' && b.ref === bestId ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      if (a.likes !== b.likes) return b.likes - a.likes;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return 0;
    });

    var desc = $('#memoryDesc');
    if (desc) {
      desc.textContent = items.length
        ? '一共 ' + items.length + ' 张 · 点照片看大图，点爱心给它投票'
        : '三餐照片和日常随手拍都会出现在这里';
    }

    if (!items.length) {
      host.innerHTML =
        '<div class="card empty-state">' +
          '<svg><use href="#i-image"></use></svg>' +
          '<p>' + (state.loading ? '正在加载照片…' : '还没有照片，快去给逗号拍第一张吧') + '</p>' +
          '<small>每个人上传的照片，这里都能看到</small>' +
        '</div>';
      return;
    }

    host.innerHTML = items.map(function (it) {
      var isBest = it.kind === 'daily' && it.ref === bestId && it.likes > 0;
      var canEdit = it.kind === 'daily' && it.isMine;
      return '<div class="memory' + (isBest ? ' is-best' : '') + '" data-src="' + it.url +
          '" data-cap="' + esc(memCaption(it)) + '">' +
        '<img src="' + it.url + '" alt="逗号" loading="lazy">' +
        (isBest ? '<span class="best-badge"><svg><use href="#i-crown"></use></svg>今日最萌</span>' : '') +
        '<div class="cap"' + (canEdit ? ' data-act="mcap" data-id="' + it.ref + '" title="点一下改简介"' : '') + '>' +
          (it.cap ? esc(it.cap) : '<span class="cap-empty">' + (canEdit ? '点这里写简介' : '还没写简介') + '</span>') +
        '</div>' +
        '<div class="mem-foot">' +
          '<span class="who' + (it.isMine ? ' mine' : '') + '">' + esc(it.owner) + '</span>' +
          likeBtnHTML(it) +
        '</div>' +
      '</div>';
    }).join('');
  }

  function memCaption(it) {
    var parts = [];
    if (it.cap) parts.push(it.cap);
    if (it.date) parts.push(friendlyDate(it.date));
    parts.push(it.owner);
    return parts.join(' · ');
  }

  function likeBtnHTML(it) {
    if (it.kind !== 'daily') {
      /* 三餐照片暂不支持点赞，留个占位保持排版整齐 */
      return '<span class="like-btn ghost"><svg><use href="#i-heart"></use></svg></span>';
    }
    return '<button class="like-btn' + (it.liked ? ' on' : '') + '" data-like="' + it.ref +
      '"' + (it.canLike ? '' : ' disabled') + ' title="' +
      (it.canLike ? (it.liked ? '取消赞' : '给这张投一票') : '登录后可以点赞') + '">' +
      '<svg><use href="#i-heart"></use></svg><b>' + it.likes + '</b></button>';
  }

  function ownerLabel(ownerId, ownerName) {
    if (state.user && ownerId === state.user.id) return '我';
    if (ownerName) return ownerName;
    return '家人' + String(ownerId || '').slice(-4);
  }

  /* ---- 给日常照片写 / 改简介 ---- */
  function editDailyCaption(id) {
    if (!state.user) { toast('登录后才能写简介哦', 'warn'); showAuth(true); return; }
    var cur = '';
    var hit = null;
    state.daily.forEach(function (d) { if (d.id === id) { cur = d.caption || ''; hit = d; } });
    if (!hit) { toast('这张照片找不到啦，刷新试试', 'warn'); return; }
    if (hit.owner_id !== state.user.id) { toast('这张是别人传的，改不了哦', 'warn'); return; }

    var txt = window.prompt('给这张照片写一句简介吧（留空就清掉）：', cur);
    if (txt === null) return;
    txt = txt.trim().slice(0, 60);
    if (txt === cur) return;

    Store.dailySetCaption(id, txt).then(function () {
      state.daily.forEach(function (d) { if (d.id === id) d.caption = txt; });
      toast(txt ? '简介写好啦～' : '简介清掉了');
      renderDaily();
      renderMemory();
    }).catch(function (err) {
      toast(err && err.message ? err.message : '简介没存上，再试一次', 'warn');
    });
  }

  /* ---- 点赞 / 取消赞（乐观更新，失败回滚） ---- */
  function toggleLike(btn) {
    if (!state.user) { toast('登录后就能点赞啦', 'warn'); showAuth(true); return; }
    var ref = btn.dataset.like;
    var key = 'daily:' + ref;
    var liked = !!state.myLikes[key];
    var n = state.likeCount[key];
    if (n === undefined) {
      var hit = null;
      state.daily.forEach(function (d) { if (String(d.id) === String(ref)) hit = d; });
      n = (hit && hit.like_count) || 0;
    }

    /* 先改界面 */
    var next = liked ? n - 1 : n + 1;
    btn.classList.toggle('on', !liked);
    var b = btn.querySelector('b');
    if (b) b.textContent = next;
    if (liked) delete state.myLikes[key]; else state.myLikes[key] = true;
    state.likeCount[key] = next;
    /* 带动同屏另一处相同的按钮（回忆墙 + 日常格子） */
    $$('[data-like="' + ref + '"]').forEach(function (other) {
      if (other === btn) return;
      other.classList.toggle('on', !liked);
      var ob = other.querySelector('b');
      if (ob) ob.textContent = next;
    });

    var revert = function () {
      btn.classList.toggle('on', liked);
      if (b) b.textContent = n;
      if (liked) state.myLikes[key] = true; else delete state.myLikes[key];
      state.likeCount[key] = n;
      $$('[data-like="' + ref + '"]').forEach(function (other) {
        if (other === btn) return;
        other.classList.toggle('on', liked);
        var ob = other.querySelector('b');
        if (ob) ob.textContent = n;
      });
    };

    var task = liked ? Store.unlike('daily', ref) : Store.like('daily', ref);
    task.then(function () {
      /* 票数变了，"今日最萌"可能换人，重画一遍排序 */
      renderMemory();
      renderDaily();
    }).catch(function (err) {
      revert();
      toast(err && err.message ? err.message : '操作没成功，再试一次', 'warn');
    });
  }

  function renderAlbum() {
    var host = $('#albumTimeline');
    if (!host) return;

    var byDate = {};
    state.entries.forEach(function (e) {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });
    var dates = Object.keys(byDate).sort().reverse();

    var desc = $('#albumCountDesc');
    if (desc) {
      desc.textContent = dates.length
        ? '一共记录了 ' + dates.length + ' 天 · ' + state.entries.length + ' 餐（所有人可见）'
        : '按日期倒序排列';
    }

    if (!dates.length) {
      host.innerHTML =
        '<div class="card empty-state">' +
          '<svg><use href="#i-image"></use></svg>' +
          '<p>' + (state.loading ? '正在加载云端相册…' : '还没有记录，快去给逗号拍第一张吧') + '</p>' +
          '<small>每个人上传的照片，这里都能看到</small>' +
        '</div>';
      return;
    }

    var order = MEALS.map(function (m) { return m.key; });

    host.innerHTML = dates.map(function (date) {
      var recs = byDate[date].slice().sort(function (a, b) {
        return order.indexOf(a.meal) - order.indexOf(b.meal);
      });
      var d = parseDate(date);
      var full = recs.length >= 3;

      var items = recs.map(function (r) {
        var photos = recPhotos(r);
        var isMine = mine(r);
        var ph = photos.length
          ? '<div class="ph" data-src="' + photos[0] + '" data-cap="' +
              esc(friendlyDate(date) + ' · ' + mealName(r.meal) + (r.food ? ' · ' + r.food : '') + ' · ' + recOwner(r)) +
              '"><img src="' + photos[0] + '" alt="逗号" loading="lazy">' +
              (photos.length > 1 ? '<span class="ph-more">+' + (photos.length - 1) + '</span>' : '') +
            '</div>'
          : '<div class="ph empty"><svg><use href="#i-camera"></use></svg></div>';

        return '<div class="album-item' + (isMine ? ' is-mine' : '') + '">' + ph +
          '<div class="meta">' +
            '<div class="meta-top">' +
              '<span class="mini-meal" data-meal="' + r.meal + '">' + mealName(r.meal) + '</span>' +
              '<span class="who' + (isMine ? ' mine' : '') + '">' + esc(recOwner(r)) + '</span>' +
              (r.amount ? '<span class="mini-amount' + (r.amount === 'none' ? ' none' : '') + '">' + AMOUNT_SHORT[r.amount] + '</span>' : '') +
            '</div>' +
            (r.food ? '<div class="food">' + esc(r.food) + '</div>'
                    : '<div class="food" style="color:var(--ink-3);font-weight:600">没写吃了什么</div>') +
            (r.note ? '<div class="note">' + esc(r.note) + '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="album-day">' +
        '<div class="album-day-head">' +
          '<span class="album-date">' + (d.getMonth() + 1) + '月' + d.getDate() + '日</span>' +
          '<span class="album-weekday">' + weekdayName(d) + ' · ' + friendlyDate(date) + '</span>' +
          '<span class="album-count' + (full ? '' : ' partial') + '">' + recs.length + '/3 餐</span>' +
        '</div>' +
        '<div class="album-grid">' + items + '</div>' +
      '</div>';
    }).join('');
  }

  /* ================= 日常随手拍（三餐之外，独立表存储） ================= */
  function dailyPhotos() {
    return state.daily.map(function (d) { return state.urlMap[d.photo_path] || ''; }).filter(Boolean);
  }

  function renderDaily() {
    var host = $('#dailyGrid');
    if (!host) return;

    var list = state.daily.slice();
    /* 按日期倒序；同一天点赞多的靠前 */
    list.sort(function (a, b) {
      var ka = state.likeCount['daily:' + a.id];
      var kb = state.likeCount['daily:' + b.id];
      var la = ka !== undefined ? ka : (a.like_count || 0);
      var lb = kb !== undefined ? kb : (b.like_count || 0);
      if (a.photo_date !== b.photo_date) return a.photo_date < b.photo_date ? 1 : -1;
      if (la !== lb) return lb - la;
      return a.id - b.id;
    });

    var bestId = topOfDate(todayStr());
    var meId = state.user ? state.user.id : '';

    var cells = list.map(function (d) {
      var url = state.urlMap[d.photo_path];
      if (!url) return '';
      var isMine = d.owner_id === meId;
      var key = 'daily:' + d.id;
      var n = state.likeCount[key] !== undefined ? state.likeCount[key] : (d.like_count || 0);
      var liked = !!state.myLikes[key];
      var isBest = d.id === bestId && n > 0;

      return '<div class="daily-cell' + (isBest ? ' is-best' : '') + '" data-src="' + url + '" data-cap="' + esc(memCaption({
          cap: d.caption, date: d.photo_date, owner: ownerLabel(d.owner_id, d.owner_name)
        })) + '">' +
        '<img src="' + url + '" alt="逗号的日常" loading="lazy">' +
        (isBest ? '<span class="best-badge sm"><svg><use href="#i-crown"></use></svg>最萌</span>' : '') +
        '<div class="photo-tools">' +
          (isMine ? '<button data-act="dcap" data-id="' + d.id + '" title="写简介"><svg><use href="#i-pencil-line"></use></svg></button>' : '') +
          (isMine ? '<button data-act="drm" data-id="' + d.id + '" data-path="' + d.photo_path + '" title="删除"><svg><use href="#i-trash"></use></svg></button>' : '') +
        '</div>' +
        '<div class="daily-foot">' +
          '<span class="daily-cap">' + (d.caption ? esc(d.caption) : '<i>还没写简介</i>') + '</span>' +
          '<button class="like-btn' + (liked ? ' on' : '') + '" data-like="' + d.id + '"' +
            (state.user ? '' : ' disabled') + '>' +
            '<svg><use href="#i-heart"></use></svg><b>' + n + '</b>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    if (state.user) {
      cells += '<div class="daily-cell add" data-act="dpick">' +
        '<div class="photo-empty"><svg><use href="#i-camera"></use></svg><p>随手拍一张<br>逗号的日常</p></div></div>';
    }

    host.innerHTML = cells;

    var desc = $('#dailyDesc');
    if (desc) {
      if (list.length) desc.textContent = '一共 ' + list.length + ' 张 · 会一直留着，大家都能看到';
      else if (state.user) desc.textContent = '三餐之外的照片都可以放这里，能写简介、能点赞';
      else desc.textContent = '登录后就能上传日常照片啦';
    }
  }

  /* ================= 日历 ================= */
  function renderCalendar() {
    var grid = $('#calGrid');
    if (!grid) return;
    var y = state.cal.y, m = state.cal.m;
    $('#calMonth').textContent = y + ' 年 ' + (m + 1) + ' 月';

    var first = new Date(y, m, 1);
    var startIdx = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var today = todayStr();
    var html = '';
    var fullDays = 0, monthTotal = 0;

    for (var i = 0; i < startIdx; i++) html += '<div class="cal-cell blank"></div>';

    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d);
      var recs = dayRecs(ds);
      var n = recs.length;
      monthTotal += n;
      var cls = 'cal-cell';
      if (n >= 3) { cls += ' full'; fullDays++; }
      else if (n > 0) { cls += ' partly'; }
      if (ds === today) cls += ' is-today';
      if (ds === state.date) cls += ' selected';

      var dots = '';
      for (var j = 0; j < 3; j++) dots += '<i class="' + (j < n ? 'on' : '') + '"></i>';

      html += '<div class="' + cls + '" data-date="' + ds + '">' +
        '<span class="d">' + d + '</span><span class="dots">' + dots + '</span></div>';
    }
    grid.innerHTML = html;

    var sum = $('#calSummary');
    if (sum) sum.textContent = '本月 ' + monthTotal + ' 餐 · 满勤 ' + fullDays + ' 天';
  }

  /* ================= 设置 ================= */
  function renderSettings() {
    var host = $('#remindRows');
    if (!host) return;
    host.innerHTML = MEALS.map(function (m) {
      var cfg = mealCfg(m.key);
      return '<div class="remind-row">' +
        '<div class="ico"><svg><use href="#' + m.icon + '"></use></svg></div>' +
        '<div>' +
          '<div class="rl">' + m.name + '提醒</div>' +
          '<div class="rs">' + m.hint + '</div>' +
        '</div>' +
        '<input type="time" data-time="' + m.key + '" value="' + cfg.time + '">' +
        '<label class="switch">' +
          '<input type="checkbox" data-on="' + m.key + '"' + (cfg.on ? ' checked' : '') + '>' +
          '<span class="slider"></span>' +
        '</label>' +
      '</div>';
    }).join('');

    var nick = $('#nickInput');
    if (nick) {
      nick.value = state.settings.nickname || '';
      nick.disabled = !state.user;
      var nickCard = nick.closest('.set-card');
      if (nickCard) {
        nickCard.style.opacity = state.user ? '' : '.5';
        nickCard.style.pointerEvents = state.user ? '' : 'none';
      }
    }
  }

  function renderStorage() {
    var txt = $('#storageText');
    var fill = $('#storageFill');
    var photos = 0;
    state.entries.forEach(function (e) { photos += recPaths(e).length; });
    photos += state.daily.filter(function (d) { return state.urlMap[d.photo_path]; }).length;

    if (fill) fill.style.width = Math.min(100, (photos / 200) * 100).toFixed(1) + '%';
    if (txt) {
      txt.textContent = '云端共 ' + state.entries.length + ' 条记录 · ' + photos +
        ' 张照片 · 我记了 ' + state.entries.filter(mine).length + ' 条';
    }
  }

  function saveSettings() {
    return Store.saveSettings(state.settings).catch(function () {});
  }

  /* ================= Lightbox ================= */
  function openLightbox(src, cap) {
    var lb = $('#lightbox');
    if (!lb) return;
    $('#lbImg').src = src;
    $('#lbCap').textContent = cap || '';
    lb.classList.add('show');
  }
  function closeLightbox() {
    var lb = $('#lightbox');
    if (lb) lb.classList.remove('show');
  }

  /* ================= 登录界面 ================= */
  function showAuth(show) {
    var w = $('#authWrap');
    if (!w) return;
    if (show) w.classList.add('show');
    else w.classList.remove('show');
  }

  function authMsg(text, kind) {
    var el = $('#authMsg');
    if (!el) return;
    el.className = 'auth-msg' + (text ? ' show ' + (kind || 'info') : '');
    el.textContent = text || '';
  }

  function switchAuthTab(tab) {
    $$('.auth-tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    $$('.auth-pane').forEach(function (p) {
      p.classList.toggle('on', p.dataset.pane === tab);
    });
    authMsg('');
  }

  function renderUser() {
    var box = $('#userBox');
    if (!box) return;
    if (!state.user) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    var label = state.settings.nickname || (state.user && state.user.email || '').split('@')[0] || '我';
    box.innerHTML =
      '<div class="user-chip">' +
        '<span class="avatar-dot">' + esc(label.slice(0, 1).toUpperCase()) + '</span>' +
        '<span class="uname">' + esc(label) + '</span>' +
        '<button class="out" id="btnSignOut" title="退出登录"><svg><use href="#i-x"></use></svg></button>' +
      '</div>';
    var out = $('#btnSignOut');
    if (out) out.addEventListener('click', function () {
      if (!confirm('退出登录吗？退出后就不能打卡了（记录不会丢）。')) return;
      Store.signOut().then(function () {
        state.user = null;
        state.entries = [];
        state.urlMap = {};
        toast('已退出登录');
        enterLoggedOut();
      });
    });
  }

  /* ---- 倒计时按钮 ---- */
  function startCountdown(btn, sec) {
    var n = sec;
    btn.disabled = true;
    btn.textContent = n + 's';
    var t = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(t);
        btn.disabled = false;
        btn.textContent = '重新获取';
      } else {
        btn.textContent = n + 's';
      }
    }, 1000);
  }

  function busy(btn, on, text) {
    if (!btn) return;
    if (on) {
      btn.dataset.old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="auth-spinner"></span> ' + (text || '处理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset.old) btn.innerHTML = btn.dataset.old;
    }
  }

  /* ================= 数据刷新 ================= */
  function refresh(opts) {
    opts = opts || {};
    if (!state.user) return Promise.resolve();
    if (!opts.quiet) state.loading = true;

    return Promise.all([
      Store.all(),
      Store.dailyAll(),
      Store.likesAll()
    ]).then(function (r) {
      state.entries = (r[0] || []).map(normalize);
      state.daily = r[1] || [];

      /* 点赞：统计每张的票数 + 记下我点过哪些 */
      var likes = r[2] || [];
      var counts = {};
      var mineMap = {};
      var meId = state.user.id;
      likes.forEach(function (l) {
        var k = l.photo_kind + ':' + l.photo_ref;
        counts[k] = (counts[k] || 0) + 1;
        if (l.liker_id === meId) mineMap[k] = true;
      });
      state.likeCount = counts;
      state.myLikes = mineMap;

      /* 收集所有需要换临时链接的照片路径 */
      var paths = [];
      var push = function (p) { if (p && paths.indexOf(p) < 0) paths.push(p); };
      state.entries.forEach(function (e) {
        recPaths(e).forEach(push);
      });
      state.daily.forEach(function (d) { push(d.photo_path); });

      return Store.signedUrls(paths, 3600);
    }).then(function (map) {
      Object.keys(map).forEach(function (k) { state.urlMap[k] = map[k]; });
      state.loading = false;
      renderMeals();
      renderHero();
      renderMemory();
      renderAlbum();
      renderDaily();
      renderCalendar();
      renderStorage();
      renderSettings();
      renderUser();
    }).catch(function (e) {
      state.loading = false;
      toast(e && e.message ? e.message : '读取云端数据失败', 'warn');
      renderMemory();
      renderAlbum();
      renderDaily();
    });
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {

    /* ---------- 登录相关 ---------- */
    $$('.auth-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { switchAuthTab(b.dataset.tab); });
    });
    var gf = $('#goForgot');
    if (gf) gf.addEventListener('click', function () { switchAuthTab('forgot'); });
    var bl = $('#backLogin');
    if (bl) bl.addEventListener('click', function () { switchAuthTab('pwd'); });

    /* 密码登录 */
    var formPwd = $('#formPwd');
    if (formPwd) formPwd.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#pwdEmail').value.trim();
      var pass = $('#pwdPass').value;
      if (!email || !pass) { authMsg('邮箱和密码都要填哦', 'err'); return; }
      var btn = $('#btnPwdLogin');
      busy(btn, true, '登录中…');
      authMsg('');
      Store.signInWithPassword(email, pass).then(function () {
        busy(btn, false);
        authMsg('登录成功，正在加载…', 'ok');
        return afterLogin();
      }).catch(function (err) {
        busy(btn, false);
        authMsg(err.message || '登录失败', 'err');
      });
    });

    /* 验证码登录 */
    var btnSendCode = $('#btnSendCode');
    if (btnSendCode) btnSendCode.addEventListener('click', function () {
      var email = $('#otpEmail').value.trim();
      if (!email) { authMsg('先填邮箱哦', 'err'); return; }
      busy(btnSendCode, true, '发送中…');
      authMsg('');
      Store.sendEmailOtp(email).then(function (pending) {
        state.pendingOtp.otp = pending;
        btnSendCode.disabled = false;
        if (btnSendCode.dataset.old) btnSendCode.innerHTML = btnSendCode.dataset.old;
        authMsg('验证码已经发到 ' + email + ' 了，去邮箱看看（有时会在垃圾箱）', 'ok');
        startCountdown(btnSendCode, 60);
      }).catch(function (err) {
        busy(btnSendCode, false);
        authMsg(err.message || '验证码发送失败', 'err');
      });
    });

    var formOtp = $('#formOtp');
    if (formOtp) formOtp.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('#otpCode').value.trim();
      var pending = state.pendingOtp.otp;
      if (!pending) { authMsg('请先点「获取验证码」', 'err'); return; }
      if (!code) { authMsg('填一下收到的验证码', 'err'); return; }
      var btn = $('#btnOtpLogin');
      busy(btn, true, '登录中…');
      authMsg('');
      /* 验证码登录：老用户不需要密码；若是新邮箱，引导去注册填密码 */
      Store.verifyEmailOtp(pending, code, 'douhao' + Date.now()).then(function () {
        busy(btn, false);
        state.pendingOtp.otp = null;
        authMsg('登录成功，正在加载…', 'ok');
        return afterLogin();
      }).catch(function (err) {
        busy(btn, false);
        authMsg(err.message || '验证码不对', 'err');
      });
    });

    /* 注册 */
    var btnRegCode = $('#btnRegCode');
    if (btnRegCode) btnRegCode.addEventListener('click', function () {
      var email = $('#regEmail').value.trim();
      if (!email) { authMsg('先填邮箱哦', 'err'); return; }
      busy(btnRegCode, true, '发送中…');
      authMsg('');
      Store.sendEmailOtp(email).then(function (pending) {
        state.pendingOtp.reg = pending;
        btnRegCode.disabled = false;
        if (btnRegCode.dataset.old) btnRegCode.innerHTML = btnRegCode.dataset.old;
        authMsg(pending.isExistingUser
          ? '这个邮箱已经注册过啦，验证码已发送，验证后会直接登录'
          : '验证码已经发到 ' + email + ' 了，去邮箱看看（有时会在垃圾箱）', 'ok');
        startCountdown(btnRegCode, 60);
      }).catch(function (err) {
        busy(btnRegCode, false);
        authMsg(err.message || '验证码发送失败', 'err');
      });
    });

    var formReg = $('#formReg');
    if (formReg) formReg.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('#regCode').value.trim();
      var pass = $('#regPass').value;
      var pending = state.pendingOtp.reg;
      if (!pending) { authMsg('请先点「获取验证码」', 'err'); return; }
      if (!code) { authMsg('填一下收到的验证码', 'err'); return; }
      if (!pending.isExistingUser && (!pass || pass.length < 6)) {
        authMsg('密码至少 6 位哦', 'err'); return;
      }
      var btn = $('#btnRegSubmit');
      busy(btn, true, '注册中…');
      authMsg('');
      Store.verifyEmailOtp(pending, code, pass).then(function () {
        var nick = $('#regName').value.trim();
        if (nick) { state.settings.nickname = nick; }
        busy(btn, false);
        state.pendingOtp.reg = null;
        authMsg('注册成功，正在加载…', 'ok');
        return afterLogin();
      }).catch(function (err) {
        busy(btn, false);
        authMsg(err.message || '注册失败', 'err');
      });
    });

    /* 忘记密码 */
    var btnFpCode = $('#btnFpCode');
    if (btnFpCode) btnFpCode.addEventListener('click', function () {
      var email = $('#fpEmail').value.trim();
      if (!email) { authMsg('先填邮箱哦', 'err'); return; }
      busy(btnFpCode, true, '发送中…');
      authMsg('');
      Store.resetPasswordForEmail(email).then(function (challenge) {
        state.pendingOtp.forgot = challenge;
        btnFpCode.disabled = false;
        if (btnFpCode.dataset.old) btnFpCode.innerHTML = btnFpCode.dataset.old;
        authMsg('重置验证码已发到 ' + email + '，填进来就能设新密码', 'ok');
        startCountdown(btnFpCode, 60);
      }).catch(function (err) {
        busy(btnFpCode, false);
        authMsg(err.message || '发送失败', 'err');
      });
    });

    var formForgot = $('#formForgot');
    if (formForgot) formForgot.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('#fpCode').value.trim();
      var pass = $('#fpPass').value;
      var challenge = state.pendingOtp.forgot;
      if (!challenge) { authMsg('请先点「获取验证码」', 'err'); return; }
      if (!pass || pass.length < 6) { authMsg('新密码至少 6 位', 'err'); return; }
      var btn = $('#btnFpSubmit');
      busy(btn, true, '提交中…');
      authMsg('');
      challenge.updateUser({ nonce: code, password: pass }).then(function (res) {
        busy(btn, false);
        if (res && res.error) throw new Error(res.error.message || '验证码不对');
        state.pendingOtp.forgot = null;
        authMsg('密码已经重设好了，正在进入…', 'ok');
        return afterLogin();
      }).catch(function (err) {
        busy(btn, false);
        authMsg(err.message || '重设失败', 'err');
      });
    });

    /* ---------- 餐卡区域 ---------- */
    $('#meals').addEventListener('click', function (e) {
      var card = e.target.closest('.meal');
      if (!card) return;
      var key = card.dataset.meal;
      var actEl = e.target.closest('[data-act]');
      var act = actEl ? actEl.dataset.act : null;

      if (act === 'pick') {
        state.pickTarget = key;
        state.pickDaily = false;
        var fp = $('#filePicker');
        fp.value = '';
        fp.click();
        return;
      }
      if (act === 'zoom') {
        var idx = +actEl.dataset.idx || 0;
        var rec = findRec(state.date, key);
        var photos = recPhotos(rec);
        if (photos[idx]) {
          openLightbox(photos[idx], '逗号的' + mealName(key) + (rec ? ' · ' + recOwner(rec) : ''));
        }
        return;
      }
      if (act === 'rmp') {
        var i2 = +actEl.dataset.idx;
        var d = state.draft[key] || (state.draft[key] = {});
        var existing = findRec(state.date, key);
        var existingMine = existing && mine(existing) ? existing : null;
        var list = d.photoPaths !== undefined ? d.photoPaths.slice() : (existingMine ? recPaths(existingMine) : []);
        var blobs = d.blobs ? d.blobs.slice() : [];
        /* 新传的 blob 优先删，否则删已有路径 */
        if (blobs.length) blobs.splice(i2 - list.length, 1);
        else list.splice(i2, 1);
        d.photoPaths = list;
        d.blobs = blobs.filter(Boolean);
        d.photos = list.map(function (p) { return state.urlMap[p] || ''; }).filter(Boolean);
        renderOneMeal(key);
        return;
      }
      if (act === 'save') { saveMeal(key); return; }
      if (act === 'del') { deleteMeal(key); return; }
      if (act === 'edit') {
        state.editing[key] = true;
        renderOneMeal(key);
        return;
      }
      if (act === 'cancel') {
        state.editing[key] = false;
        state.draft[key] = {};
        renderOneMeal(key);
        return;
      }

      var chip = e.target.closest('.chip');
      if (chip) {
        var d2 = state.draft[key] || (state.draft[key] = {});
        var val = chip.dataset.amount;
        d2.amount = (d2.amount === val) ? '' : val;
        $$('.chip', card).forEach(function (c) {
          c.setAttribute('aria-pressed', c.dataset.amount === d2.amount ? 'true' : 'false');
        });
      }
    });

    $('#meals').addEventListener('input', function (e) {
      var f = e.target.closest('[data-f]');
      if (!f) return;
      var card = e.target.closest('.meal');
      if (!card) return;
      var d = state.draft[card.dataset.meal] || (state.draft[card.dataset.meal] = {});
      d[f.dataset.f] = f.value;
    });

    /* ---------- 照片选择 ---------- */
    $('#filePicker').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!files.length) return;
      var key = state.pickTarget;
      e.target.value = '';
      if (!key) return;

      var card = $('.meal[data-meal="' + key + '"]');
      var d = state.draft[key] || (state.draft[key] = {});
      var existing = findRec(state.date, key);
      var existingMine = existing && mine(existing) ? existing : null;
      var has = (d.photoPaths !== undefined ? d.photoPaths.length : (existingMine ? recPaths(existingMine).length : 0)) +
                (d.blobs ? d.blobs.length : 0);
      var room = MAX_PHOTOS - has;
      if (room <= 0) { toast('这一餐最多 ' + MAX_PHOTOS + ' 张啦', 'warn'); return; }

      var picked = files.slice(0, room);
      if (card) card.style.opacity = '.6';

      var blobs = d.blobs ? d.blobs.slice() : [];
      var previews = d.photos ? d.photos.slice() : [];
      var seq = Promise.resolve();
      picked.forEach(function (file) {
        seq = seq.then(function () {
          return Store.compress(file, 1280, 0.8).then(function (res) {
            blobs.push(res.blob);
            previews.push(res.previewUrl);
          });
        });
      });
      seq.then(function () {
        d.blobs = blobs;
        d.photos = previews;
        d.photoPaths = d.photoPaths !== undefined ? d.photoPaths
                     : (existingMine ? recPaths(existingMine) : []);
        renderOneMeal(key);
        toast('照片选好了，记得点上传');
      }).catch(function (err) {
        toast(err && err.message ? err.message : '照片处理失败', 'warn');
      }).then(function () {
        if (card) card.style.opacity = '';
      });
    });

    /* ---------- 日常随手拍 ---------- */
    var btnDaily = $('#btnDailyUpload');
    if (btnDaily) btnDaily.addEventListener('click', function () {
      state.pickDaily = true;
      var fp = $('#dailyPicker');
      fp.value = '';
      fp.click();
    });
    $('#dailyPicker').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      if (!state.user) { toast('先登录才能上传哦', 'warn'); showAuth(true); return; }

      toast('正在上传 ' + files.length + ' 张…');
      var seq = Promise.resolve();
      var added = [];      /* 已上传的路径，失败时回滚 */
      var rows = [];       /* 已入库的记录 */
      files.forEach(function (file) {
        var caption = '';
        seq = seq.then(function () {
          return Store.compress(file, 1280, 0.8).then(function (res) {
            return Store.uploadPhoto(res.blob, state.user.id).then(function (p) {
              URL.revokeObjectURL(res.previewUrl);
              added.push(p);
              return Store.dailyAdd({
                photoPath: p,
                date: state.date,
                ownerName: myName(),
                caption: caption
              }).then(function (row) { rows.push(row); });
            });
          });
        });
      });
      seq.then(function () {
        toast(files.length > 1
          ? '上传好了，' + files.length + ' 张都存到云端啦～'
          : '上传好了，大家都看到啦～');
        return refresh({ quiet: true });
      }).catch(function (err) {
        /* 入库失败的，把已经传上去的孤立文件清掉 */
        var kept = {};
        rows.forEach(function (r) { if (r && r.photo_path) kept[r.photo_path] = true; });
        var orphans = added.filter(function (p) { return !kept[p]; });
        if (orphans.length) Store.removePhotos(orphans);
        toast(err && err.message ? err.message : '上传失败', 'warn');
        return refresh({ quiet: true }).catch(function () {});
      });
    });

    var dailyGrid = $('#dailyGrid');
    if (dailyGrid) dailyGrid.addEventListener('click', function (e) {
      /* 删除（只能删自己传的） */
      var rm = e.target.closest('[data-act="drm"]');
      if (rm) {
        var id = Number(rm.dataset.id);
        var path = rm.dataset.path;
        if (!confirm('删掉这张照片吗？删了就找不回来了。')) return;
        Store.dailyRemove(id).then(function () {
          if (path) Store.removePhotos([path]);
          /* 本地先摘掉，界面立刻有反馈 */
          state.daily = state.daily.filter(function (d) { return d.id !== id; });
          toast('照片删掉啦');
          return refresh({ quiet: true });
        }).catch(function (err) {
          toast(err && err.message ? err.message : '删除失败', 'warn');
        });
        return;
      }
      /* 写 / 改简介（只能改自己传的） */
      var cp = e.target.closest('[data-act="dcap"]');
      if (cp) {
        editDailyCaption(Number(cp.dataset.id));
        return;
      }
      /* 上传入口 */
      if (e.target.closest('[data-act="dpick"]')) {
        state.pickDaily = true;
        var fp2 = $('#dailyPicker');
        fp2.value = '';
        fp2.click();
      }
    });

    /* ---------- 回忆墙：点赞 / 取消赞 / 改简介 ---------- */
    var memStrip = $('#memoryStrip');
    if (memStrip) memStrip.addEventListener('click', function (e) {
      var likeBtn = e.target.closest('[data-like]');
      if (likeBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleLike(likeBtn);
        return;
      }
      var capEl = e.target.closest('[data-act="mcap"]');
      if (capEl) {
        e.preventDefault();
        e.stopPropagation();
        editDailyCaption(Number(capEl.dataset.id));
      }
    });

    /* ---------- Lightbox ---------- */
    document.addEventListener('click', function (e) {
      var z = e.target.closest('[data-src]');
      if (z && !z.classList.contains('empty')) {
        openLightbox(z.dataset.src, z.dataset.cap || '');
      }
    });
    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lightbox').addEventListener('click', function (e) {
      if (e.target.id === 'lightbox') closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });

    /* ---------- 日期切换 ---------- */
    $('#prevDay').addEventListener('click', function () {
      var d = parseDate(state.date);
      d.setDate(d.getDate() - 1);
      state.date = toDateStr(d);
      state.draft = {}; state.editing = {};
      renderMeals();
    });
    $('#nextDay').addEventListener('click', function () {
      if (state.date === todayStr()) return;
      var d = parseDate(state.date);
      d.setDate(d.getDate() + 1);
      state.date = toDateStr(d);
      state.draft = {}; state.editing = {};
      renderMeals();
    });
    $('#todayBtn').addEventListener('click', function () {
      state.date = todayStr();
      state.draft = {}; state.editing = {};
      renderMeals();
      document.getElementById('today').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ---------- 日历 ---------- */
    $('#calPrev').addEventListener('click', function () {
      state.cal.m--;
      if (state.cal.m < 0) { state.cal.m = 11; state.cal.y--; }
      renderCalendar();
    });
    $('#calNext').addEventListener('click', function () {
      state.cal.m++;
      if (state.cal.m > 11) { state.cal.m = 0; state.cal.y++; }
      renderCalendar();
    });
    $('#calToday').addEventListener('click', function () {
      var n = new Date();
      state.cal = { y: n.getFullYear(), m: n.getMonth() };
      renderCalendar();
    });
    $('#calGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('.cal-cell[data-date]');
      if (!cell) return;
      state.date = cell.dataset.date;
      state.draft = {}; state.editing = {};
      renderMeals();
      document.getElementById('today').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('已切换到 ' + friendlyDate(state.date));
    });

    /* ---------- 提醒设置 ---------- */
    $('#remindRows').addEventListener('change', function (e) {
      var t = e.target.closest('[data-time]');
      if (t) {
        var k = t.dataset.time;
        state.settings.meals[k].time = t.value || '09:30';
        saveSettings();
        renderMeals();
        toast(mealName(k) + '提醒已改到 ' + state.settings.meals[k].time);
        return;
      }
      var c = e.target.closest('[data-on]');
      if (c) {
        var k2 = c.dataset.on;
        state.settings.meals[k2].on = c.checked;
        saveSettings();
        renderMeals();
        toast(mealName(k2) + '提醒已' + (c.checked ? '开启' : '关闭'));
      }
    });

    var nickInput = $('#nickInput');
    if (nickInput) nickInput.addEventListener('change', function () {
      state.settings.nickname = nickInput.value.trim();
      saveSettings();
      renderUser();
      toast('称呼改好啦，以后记录会显示这个名字');
    });

    $('#btnNotify').addEventListener('click', function () {
      if (!notifySupported()) { toast('这个浏览器不支持系统通知', 'warn'); return; }
      if (Notification.permission === 'granted') {
        toast('系统通知已经开好啦');
        systemNotify('逗号的生活日记 🐾', '通知测试成功，到点我就会喊你');
        return;
      }
      Notification.requestPermission().then(function (p) {
        refreshNotifyUI();
        if (p === 'granted') {
          toast('系统通知开启成功');
          systemNotify('逗号的生活日记 🐾', '通知开启成功，到点我会准时喊你');
        } else {
          toast('没拿到通知权限，只能用页面提醒了', 'warn');
        }
      });
    });

    $('#btnTestSound').addEventListener('click', function () {
      playChime();
      toast('这就是到点时的提醒音');
    });

    var btnRefresh = $('#btnRefresh');
    if (btnRefresh) btnRefresh.addEventListener('click', function () {
      btnRefresh.classList.add('spin');
      refresh({ quiet: true }).then(function () {
        toast('已经是最新的啦');
      }).catch(function () {}).then(function () {
        setTimeout(function () { btnRefresh.classList.remove('spin'); }, 500);
      });
    });

    /* ---------- 退出登录（设置区） ---------- */
    var btnLogout2 = $('#btnLogout2');
    if (btnLogout2) btnLogout2.addEventListener('click', function () {
      if (!confirm('退出登录吗？（记录不会丢，重新登录还能看到）')) return;
      Store.signOut().then(function () {
        state.user = null;
        state.entries = [];
        state.urlMap = {};
        enterLoggedOut();
        toast('已退出登录');
      });
    });

    /* ---------- 页面回到前台时刷新 ---------- */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.user) {
        state.bannerShown = '';
        checkReminders();
        refresh({ quiet: true });
      }
    });
  }

  /* ---- 我的显示名（上传照片时记下来，方便别人认出是谁拍的） ---- */
  function myName() {
    if (state.settings && state.settings.nickname) return state.settings.nickname;
    var email = state.user && state.user.email ? state.user.email : '';
    var prefix = email.split('@')[0];
    return prefix || '家人';
  }

  /* ================= 登录 / 登出流程 ================= */
  function enterLoggedIn() {
    showAuth(false);
    renderUser();
    refreshNotifyUI();
    return refresh();
  }

  function enterLoggedOut() {
    showAuth(true);
    renderMeals();
    renderHero();
    renderAlbum();
    renderCalendar();
    renderDaily();
    renderStorage();
    renderSettings();
    renderUser();
    refreshNotifyUI();
  }

  function afterLogin() {
    return Store.currentUser().then(function (user) {
      state.user = user;
      if (!state.user) throw new Error('登录状态没建立起来，再试一次');
      /* 读回该用户的设置（日常照片走 refresh 统一拉取） */
      return Store.getSettings().then(function (s) {
        state.settings = mergeDeep(DEFAULT_SETTINGS, s || {});
        return enterLoggedIn();
      });
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    renderMemory();
    renderMemory0();
    bindEvents();

    var vEl = $('#footVersion');
    if (vEl) vEl.textContent = 'v2.1';

    try {
      Store.init();
    } catch (e) {
      toast('云端组件加载失败，刷新一下页面试试', 'warn');
      showAuth(true);
      authMsg('页面组件没加载完，请刷新重试', 'err');
      return;
    }

    /* 登录态监听 */
    Store.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        state.user = null;
        state.entries = [];
        enterLoggedOut();
      }
    });

    /* 判断当前是否已登录 */
    Store.currentUser().then(function (user) {
      if (!user) { enterLoggedOut(); return; }
      state.user = user;
      return Store.getSettings().then(function (s) {
        state.settings = mergeDeep(DEFAULT_SETTINGS, s || {});
        return enterLoggedIn();
      });
    }).catch(function (e) {
      console.warn(e);
      enterLoggedOut();
      authMsg('云端连接有点问题，先登录试试', 'err');
    });

    /* 提醒循环 */
    setInterval(checkReminders, 20000);

    /* 跨零点 */
    var lastDay = todayStr();
    setInterval(function () {
      var t = todayStr();
      if (t !== lastDay) {
        lastDay = t;
        state.fired = {};
        state.date = t;
        state.draft = {}; state.editing = {};
        state.bannerShown = '';
        refresh();
      }
    }, 30000);
  }

  /* 兼容旧调用的占位 */
  function renderMemory0() {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
