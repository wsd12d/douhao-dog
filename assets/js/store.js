/* ==========================================================
   逗号宝宝生活日记 — 云端数据层
   WorkBuddy Cloud Service：Database(记录) + Storage(照片) + Auth(登录)
   所有人可读，只有记录本人能改删
   ========================================================== */
(function (global) {
  'use strict';

  /* publicConfig —— 由云服务开通时下发，必须原样使用 */
  var PUBLIC_CONFIG = {
    endpoint: 'https://douhao-diary.app.workbuddy.host',
    publishableKey: 'wbpk_SaI8F5nyCc70mFoga4DZm3_sFuQkf1KWL0oKyfWU3UzoqHfS3PvuihM'
  };

  var TABLE = 'diary_entries';
  var TABLE_SETTINGS = 'diary_settings';
  var TABLE_DAILY = 'diary_daily';
  var TABLE_LIKES = 'diary_likes';
  var MAX_EDGE = 1280;
  var QUALITY = 0.8;

  var cloud = null;

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (cloud) return cloud;
    if (!global.WorkBuddyCloud || typeof global.WorkBuddyCloud.createWorkBuddyCloud !== 'function') {
      throw new Error('SDK 还没加载好，刷新一下页面');
    }
    cloud = global.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: PUBLIC_CONFIG.endpoint,
      publishableKey: PUBLIC_CONFIG.publishableKey
    });
    return cloud;
  }

  function client() {
    if (!cloud) init();
    return cloud;
  }

  /* ---------------- 工具 ---------------- */
  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function errText(error, fallback) {
    if (!error) return fallback || '操作失败，请稍后重试';
    var m = error.message || error.error_description || String(error);
    if (/Failed to fetch|NetworkError|network error/i.test(m)) return '网络连接不上，检查一下网络再试';
    if (/Invalid login credentials|invalid_grant|wrong account|invalid password/i.test(m)) return '邮箱或密码不对';
    if (/already registered|already exists|23505/i.test(m)) return '这个邮箱已经注册过了，直接登录就行';
    if (/rate limit|429|too many/i.test(m)) return '操作太频繁啦，等一会儿再试';
    if (/expired|invalid.*(token|otp)|incorrect.*code/i.test(m)) return '验证码过期或不对，重新获取一个';
    if (/23503|foreign key/i.test(m)) return '这条记录关联的数据不存在了';
    if (/42501|permission|policy/i.test(m)) return '没有权限，可能是登录状态过期了，重新登录试试';
    return m;
  }

  /* ---------------- 压缩图片 ---------------- */
  function compress(file, maxEdge, quality) {
    maxEdge = maxEdge || MAX_EDGE;
    quality = quality || QUALITY;
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('没有选择图片')); return; }
      if (!/^image\//.test(file.type || '')) { reject(new Error('只能上传图片哦')); return; }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('这张图片读不出来，换一张试试')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('这张图片打不开，换一张试试')); };
        img.onload = function () {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));

          var c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          c.toBlob(function (blob) {
            if (!blob) { reject(new Error('图片处理失败，换一张试试')); return; }
            resolve({ blob: blob, previewUrl: URL.createObjectURL(blob), width: w, height: h });
          }, 'image/jpeg', quality);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ================= Auth ================= */
  var Auth = {
    /** 当前登录用户，未登录返回 null */
    current: function () {
      return client().auth.getSession().then(function (res) {
        if (res.error) return null;
        return (res.data && res.data.user) || null;
      }).catch(function () { return null; });
    },

    onAuthStateChange: function (cb) {
      return client().auth.onAuthStateChange(cb);
    },

    /** 邮箱 + 密码登录 */
    signInWithPassword: function (email, password) {
      return client().auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error));
          return res.data;
        });
    },

    /** 发送邮箱验证码，返回待验证状态 */
    sendEmailOtp: function (email) {
      return client().auth.sendOtp({ email: email }).then(function (res) {
        if (res.error) throw new Error(errText(res.error));
        return {
          email: email,
          verificationId: res.data.verificationId,
          isExistingUser: res.data.isExistingUser
        };
      });
    },

    /** 提交验证码；新用户必须同时带密码（邮箱注册密码必填） */
    verifyEmailOtp: function (pending, code, password) {
      if (!pending) return Promise.reject(new Error('请先获取验证码'));
      var payload = {
        email: pending.email,
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: code
      };
      if (!pending.isExistingUser) payload.password = password;
      return client().auth.verifyOtp(payload).then(function (res) {
        if (res.error) throw new Error(errText(res.error));
        return res.data;
      });
    },

    /** 忘记密码：发送重置验证码 */
    resetPasswordForEmail: function (email) {
      return client().auth.resetPasswordForEmail(email).then(function (res) {
        if (res.error) throw new Error(errText(res.error));
        return res.data;
      });
    },

    signOut: function () {
      return client().auth.signOut();
    }
  };

  /* ================= Storage ================= */
  var Storage = {
    /** 上传照片到 shared/<uid>/ —— 所有登录用户都能读，符合"信息互通" */
    uploadPhoto: function (blob, userId) {
      var path = client().storage.sharedPath(userId, 'photos/' + uid() + '.jpg');
      return client().storage.upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false
      }).then(function (res) {
        if (res.error) throw new Error(errText(res.error, '照片上传失败'));
        return path;
      });
    },

    /** 把照片路径批量换成可访问的临时链接 */
    signedUrls: function (paths, ttl) {
      var list = (paths || []).filter(Boolean);
      if (!list.length) return Promise.resolve({});
      return client().storage.createSignedUrls(list, ttl || 3600).then(function (res) {
        var map = {};
        if (res.error) return map;
        var arr = res.data || [];
        arr.forEach(function (item, i) {
          if (!item) return;
          if (typeof item === 'string') { map[list[i]] = item; return; }
          var key = item.path || list[i];
          var url = item.signedUrl || item.signedURL || item.url;
          if (key && url) map[key] = url;
        });
        return map;
      }).catch(function () { return {}; });
    },

    remove: function (paths) {
      var list = (paths || []).filter(Boolean);
      if (!list.length) return Promise.resolve();
      return client().storage.remove(list).catch(function () {});
    }
  };

  /* ================= 个人设置 / 日常照片 ================= */
  var Prefs = {
    /** 读自己的设置（昵称、提醒时间、日常照片清单） */
    get: function () {
      return client().database
        .from(TABLE_SETTINGS)
        .select('nickname, meals, daily_paths')
        .maybeSingle()
        .then(function (res) {
          if (res.error) return null;
          return res.data || null;
        }).catch(function () { return null; });
    },

    /** 写入自己的设置（同一用户只有一行，靠唯一约束 upsert） */
    set: function (patch) {
      var payload = { updated_at: new Date().toISOString() };
      if (patch.nickname !== undefined) payload.nickname = patch.nickname;
      if (patch.meals !== undefined) payload.meals = patch.meals;
      if (patch.dailyPaths !== undefined) payload.daily_paths = patch.dailyPaths;

      return client().database
        .from(TABLE_SETTINGS)
        .upsert(payload, { onConflict: 'owner_id' })
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '设置保存失败'));
          return (res.data || [])[0] || null;
        });
    }
  };

  /* ================= Database ================= */
  var DB = {
    /** 拉取全部记录（所有人可见） */
    all: function () {
      return client().database
        .from(TABLE)
        .select('id, owner_id, owner_name, entry_date, meal, food, amount, note, photo_path, saved_at')
        .order('entry_date', { ascending: false })
        .order('meal', { ascending: true })
        .limit(1000)
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '读取记录失败'));
          return res.data || [];
        });
    },

    /** 新增或更新（同一天同一餐唯一，靠唯一约束触发 upsert） */
    save: function (rec) {
      var row = {
        entry_date: rec.date,
        meal: rec.meal,
        food: rec.food || null,
        amount: rec.amount || null,
        note: rec.note || null,
        photo_path: rec.photoPath || null,
        owner_name: rec.ownerName || null,
        saved_at: new Date().toISOString()
      };
      return client().database
        .from(TABLE)
        .upsert(row, { onConflict: 'entry_date,meal' })
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '保存失败'));
          var rows = res.data || [];
          if (!rows.length) throw new Error('没保存成功，可能是这条记录属于别人');
          return rows[0];
        });
    },

    remove: function (id) {
      return client().database
        .from(TABLE)
        .delete()
        .eq('id', id)
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '删除失败'));
          var rows = res.data || [];
          if (!rows.length) throw new Error('这条记录不是自己传的，删不了哦');
          return true;
        });
    }
  };

  /* ================= 日常随手拍（独立表，持久 + 共享） ================= */
  var Daily = {
    /** 拉全部日常照片（所有人可见），按日期倒序、点赞降序 */
    all: function () {
      return client().database
        .from(TABLE_DAILY)
        .select('id, owner_id, owner_name, photo_date, caption, photo_path, like_count, saved_at')
        .order('photo_date', { ascending: false })
        .order('like_count', { ascending: false })
        .order('id', { ascending: true })
        .limit(1000)
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '读取日常照片失败'));
          return res.data || [];
        });
    },

    /** 新增一张日常照片 */
    add: function (rec) {
      var row = {
        owner_name: rec.ownerName || null,
        photo_date: rec.date || null,
        caption: rec.caption || null,
        photo_path: rec.photoPath || null,
        saved_at: new Date().toISOString()
      };
      return client().database
        .from(TABLE_DAILY)
        .insert(row)
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '保存日常照片失败'));
          var rows = res.data || [];
          if (!rows.length) throw new Error('没保存成功，可能是登录状态过期了');
          return rows[0];
        });
    },

    /** 改简介（只有本人能改，RLS 会兜底） */
    setCaption: function (id, caption) {
      return client().database
        .from(TABLE_DAILY)
        .update({ caption: caption || null })
        .eq('id', id)
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '改简介失败'));
          var rows = res.data || [];
          if (!rows.length) throw new Error('这张不是自己传的，改不了哦');
          return rows[0];
        });
    },

    /** 删一张日常照片 */
    remove: function (id) {
      return client().database
        .from(TABLE_DAILY)
        .delete()
        .eq('id', id)
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '删除失败'));
          var rows = res.data || [];
          if (!rows.length) throw new Error('这张不是自己传的，删不了哦');
          return true;
        });
    }
  };

  /* ================= 点赞 ================= */
  var Likes = {
    /** 拉全部点赞记录（用来判断"我点没点过"） */
    all: function () {
      return client().database
        .from(TABLE_LIKES)
        .select('id, liker_id, photo_kind, photo_ref')
        .limit(2000)
        .then(function (res) {
          if (res.error) return [];
          return res.data || [];
        }).catch(function () { return []; });
    },

    /** 点赞（每人每张只能点一次，靠唯一索引兜底） */
    like: function (kind, ref) {
      return client().database
        .from(TABLE_LIKES)
        .insert({ photo_kind: kind, photo_ref: ref })
        .select()
        .then(function (res) {
          if (res.error) {
            /* 已点过 → 当成成功，幂等处理 */
            if (/23505|duplicate|unique/i.test(JSON.stringify(res.error))) return null;
            throw new Error(errText(res.error, '点赞失败'));
          }
          return (res.data || [])[0] || null;
        });
    },

    /** 取消点赞 */
    unlike: function (kind, ref) {
      return client().database
        .from(TABLE_LIKES)
        .delete()
        .eq('photo_kind', kind)
        .eq('photo_ref', ref)
        .select()
        .then(function (res) {
          if (res.error) throw new Error(errText(res.error, '取消点赞失败'));
          return true;
        });
    }
  };

  /* ================= 对外接口 ================= */
  var Store = {
    init: init,
    publicConfig: PUBLIC_CONFIG,

    /* ---- 登录态 ---- */
    currentUser: function () { return Auth.current(); },
    onAuthStateChange: function (cb) { return Auth.onAuthStateChange(cb); },
    signInWithPassword: function (e, p) { return Auth.signInWithPassword(e, p); },
    sendEmailOtp: function (e) { return Auth.sendEmailOtp(e); },
    verifyEmailOtp: function (pending, code, pwd) { return Auth.verifyEmailOtp(pending, code, pwd); },
    resetPasswordForEmail: function (e) { return Auth.resetPasswordForEmail(e); },
    signOut: function () { return Auth.signOut(); },

    /* ---- 记录 ---- */
    all: function () { return DB.all(); },
    save: function (rec) { return DB.save(rec); },
    remove: function (id) { return DB.remove(id); },

    /* ---- 照片 ---- */
    compress: compress,
    uploadPhoto: function (blob, userId) { return Storage.uploadPhoto(blob, userId); },
    signedUrls: function (paths, ttl) { return Storage.signedUrls(paths, ttl); },
    removePhotos: function (paths) { return Storage.remove(paths); },

    /* ---- 个人设置（昵称 / 提醒时间） ---- */
    getSettings: function () {
      return Prefs.get().then(function (row) {
        if (!row) return null;
        return { nickname: row.nickname || '', meals: row.meals || undefined };
      });
    },
    saveSettings: function (settings) {
      return Prefs.set({
        nickname: settings.nickname || '',
        meals: settings.meals || undefined
      });
    },

    /* ---- 日常随手拍（独立表） ---- */
    dailyAll: function () { return Daily.all(); },
    dailyAdd: function (rec) { return Daily.add(rec); },
    dailySetCaption: function (id, caption) { return Daily.setCaption(id, caption); },
    dailyRemove: function (id) { return Daily.remove(id); },

    /* ---- 点赞 ---- */
    likesAll: function () { return Likes.all(); },
    like: function (kind, ref) { return Likes.like(kind, ref); },
    unlike: function (kind, ref) { return Likes.unlike(kind, ref); }
  };

  global.Store = Store;
})(window);
