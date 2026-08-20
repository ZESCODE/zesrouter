/**
 * ZESRelay - Injector (MAIN world)
 * 
 * 在页面主世界中运行，可以直接访问：
 * - window.grecaptcha.enterprise
 * - window.__next_f (Next.js 数据)
 * - 页面的所有全局变量
 * 
 * 通过 window.postMessage 与 content.js 通信
 */
(function() {
  'use strict';

  var SITEKEY = '6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0';
  var TAG = '[ZESRelay]';

  // ========== 提取模型列表 ==========
  function extractModels() {
    try {
      // 方法1：从 __NEXT_DATA__ 提取
      if (window.__NEXT_DATA__) {
        var props = window.__NEXT_DATA__.props;
        if (props && props.pageProps && props.pageProps.initialModels) {
          return props.pageProps.initialModels;
        }
      }

      // 方法2：从 self.__next_f 提取
      if (window.__next_f) {
        for (var i = 0; i < window.__next_f.length; i++) {
          var entry = window.__next_f[i];
          if (!entry || !entry[1]) continue;
          var str = typeof entry[1] === 'string' ? entry[1] : '';
          if (str.indexOf('initialModels') >= 0) {
            // 找到 JSON 部分
            var jsonStart = str.indexOf('{"initialModels"');
            if (jsonStart < 0) jsonStart = str.indexOf('"initialModels"');
            if (jsonStart >= 0) {
              // 向前找到包含它的对象开始
              var braceStart = str.lastIndexOf('{', jsonStart);
              if (braceStart >= 0) {
                // 尝试解析
                var depth = 0;
                for (var j = braceStart; j < str.length; j++) {
                  if (str[j] === '{') depth++;
                  else if (str[j] === '}') depth--;
                  if (depth === 0) {
                    try {
                      var obj = JSON.parse(str.substring(braceStart, j + 1));
                      if (obj.initialModels) return obj.initialModels;
                    } catch(e) {}
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // 方法3：从 HTML script 标签提取
      var scripts = document.querySelectorAll('script');
      for (var k = 0; k < scripts.length; k++) {
        var text = scripts[k].textContent || '';
        if (text.indexOf('initialModels') >= 0 && text.indexOf('self.__next_f.push') >= 0) {
          var match = text.match(/initialModels":\s*(\[[\s\S]*?\])\s*,\s*"/);
          if (match) {
            try {
              return JSON.parse(match[1]);
            } catch(e) {}
          }
        }
      }
    } catch(e) {
      console.error(TAG, 'extractModels error:', e);
    }
    return null;
  }

  // ========== 提取 Next.js server action hashes ==========
  function extractNextActions() {
    // 这些 hash 用于 Next.js server actions（如 generateUploadUrl 等）
    // 暂时不需要，后续如果支持图片上传再添加
    return {};
  }

  // ========== reCAPTCHA token 获取 ==========
  function getRecaptchaToken(action) {
    return new Promise(function(resolve, reject) {
      var g = window.grecaptcha && window.grecaptcha.enterprise
        ? window.grecaptcha.enterprise
        : window.grecaptcha;

      if (!g || typeof g.execute !== 'function') {
        reject(new Error('grecaptcha not available'));
        return;
      }

      g.ready(function() {
        g.execute(SITEKEY, { action: action || 'chat_submit' })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  // ========== reCAPTCHA V2 token 获取（prompt failed 升级用） ==========
  // 与 arena.ai 官方一致：V2 站点 key 6Le3_cYs...，渲染隐藏 widget 等待 callback
  var V2_SITEKEY = '6Le3_cYsAAAAAGwWOK2RLDgNI15Bh8C0yLBOL1yL';
  var v2Container = null;
  var v2WidgetId = null;
  var v2Pending = null;

  function getV2RecaptchaToken() {
    return new Promise(function(resolve, reject) {
      var g = window.grecaptcha && window.grecaptcha.enterprise
        ? window.grecaptcha.enterprise
        : window.grecaptcha;
      if (!g || typeof g.render !== 'function') {
        reject(new Error('grecaptcha.enterprise.render not available'));
        return;
      }
      g.ready(function() {
        try {
          if (!v2Container) {
            v2Container = document.createElement('div');
            v2Container.style.position = 'fixed';
            v2Container.style.left = '-9999px';
            v2Container.style.top = '0';
            v2Container.style.width = '300px';
            v2Container.style.height = '300px';
            v2Container.style.zIndex = '2147483647';
            document.body.appendChild(v2Container);
          }
          var container = document.createElement('div');
          container.id = 'arena2api-v2-' + Date.now();
          v2Container.appendChild(container);
          if (v2WidgetId != null) {
            try { g.reset(v2WidgetId); } catch(e) {}
          }
          v2WidgetId = g.render(container, {
            sitekey: V2_SITEKEY,
            size: 'invisible',
            callback: function(token) {
              if (v2Pending) {
                v2Pending.resolve(token);
                v2Pending = null;
              }
            },
            'error-callback': function() {
              if (v2Pending) {
                v2Pending.reject(new Error('recaptcha v2 error'));
                v2Pending = null;
              }
            },
            'expired-callback': function() {
              if (v2Pending) {
                v2Pending.reject(new Error('recaptcha v2 expired'));
                v2Pending = null;
              }
            },
          });
          try { g.execute(v2WidgetId); } catch(e) {
            reject(new Error('recaptcha v2 execute failed: ' + (e.message || e)));
            return;
          }
          v2Pending = { resolve: resolve, reject: reject };
          setTimeout(function() {
            if (v2Pending) {
              v2Pending.reject(new Error('recaptcha v2 timeout'));
              v2Pending = null;
            }
          }, 60000);
        } catch(e) {
          reject(new Error('recaptcha v2 render failed: ' + (e.message || e)));
        }
      });
    });
  }

  // ========== 提取 cookies ==========
  function extractCookies() {
    var cookies = {};
    try {
      var cookieStr = document.cookie;
      if (cookieStr) {
        cookieStr.split(';').forEach(function(pair) {
          var parts = pair.trim().split('=');
          if (parts.length >= 2) {
            cookies[parts[0]] = parts.slice(1).join('=');
          }
        });
      }
    } catch(e) {
      console.error(TAG, 'extractCookies error:', e);
    }
    return cookies;
  }

  // ========== 消息处理 ==========
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.from !== 'arena2api-content') return;

    var msg = event.data;
    var rid = msg.rid;

    switch (msg.type) {
      case 'GET_TOKEN':
        getRecaptchaToken(msg.action).then(function(token) {
          window.postMessage({
            from: 'arena2api-injector',
            type: 'TOKEN_OK',
            rid: rid,
            token: token,
            action: msg.action || 'chat_submit',
          }, '*');
        }).catch(function(err) {
          window.postMessage({
            from: 'arena2api-injector',
            type: 'TOKEN_ERR',
            rid: rid,
            error: err.message || String(err),
          }, '*');
        });
        break;

      case 'GET_V2_TOKEN':
        getV2RecaptchaToken().then(function(token) {
          window.postMessage({
            from: 'arena2api-injector',
            type: 'V2_TOKEN_OK',
            rid: rid,
            token: token,
          }, '*');
        }).catch(function(err) {
          window.postMessage({
            from: 'arena2api-injector',
            type: 'V2_TOKEN_ERR',
            rid: rid,
            error: err.message || String(err),
          }, '*');
        });
        break;

      case 'GET_MODELS':
        var models = extractModels();
        window.postMessage({
          from: 'arena2api-injector',
          type: 'MODELS_OK',
          rid: rid,
          models: models,
        }, '*');
        break;

      case 'GET_COOKIES':
        var cookies = extractCookies();
        window.postMessage({
          from: 'arena2api-injector',
          type: 'COOKIES_OK',
          rid: rid,
          cookies: cookies,
        }, '*');
        break;

      case 'CHECK':
        var g = window.grecaptcha && window.grecaptcha.enterprise
          ? window.grecaptcha.enterprise
          : window.grecaptcha;
        window.postMessage({
          from: 'arena2api-injector',
          type: 'CHECK_OK',
          rid: rid,
          recaptcha: !!(g && typeof g.execute === 'function'),
          enterprise: !!(window.grecaptcha && window.grecaptcha.enterprise),
        }, '*');
        break;
    }
  });

  // ========== 初始化通知 ==========
  // 延迟一下确保 content.js 已经在监听
  setTimeout(function() {
    var models = extractModels();
    var cookies = extractCookies();
    window.postMessage({
      from: 'arena2api-injector',
      type: 'INIT',
      models: models,
      cookies: cookies,
    }, '*');
    console.log(TAG, 'Injector ready, models:', models ? models.length : 0, 'cookies:', Object.keys(cookies).join(', '));
  }, 1000);

})();
