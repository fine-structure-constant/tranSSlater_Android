(() => {
    window.isTauri = true;
    window.calls = [];
    window.fakeSettings = {
      proxy: "", autoTranslate: true, autoSpeak: false, langPair: "auto|zh-CN",
      engine: "google", historyMode: "all",
      theme: "plain", font: "md", windowWidth: 1020, windowHeight: 760, rememberWindow: false,
      selectTranslate: true, clipboardFallback: true, shellMenu: true,
    };
    // 划词 / 右键菜单通道的替身
    window.eventListeners = [];
    window.startupText = null;
    window.registryHasShellMenu = true;
    let callbackSeq = 0;
    const transformCallback = (callback, once = false) => {
      const id = ++callbackSeq;
      window[`_${id}`] = (payload) => {
        if (once) delete window[`_${id}`];
        callback(payload);
      };
      return id;
    };
    // 测试里用它模拟后端 emit("translate-selection", ...) 到主窗口
    window.emitEvent = (event, payload) => {
      for (const listener of window.eventListeners) {
        if (listener.event === event) window[`_${listener.handler}`]({ event, id: 0, payload });
      }
    };
    window.fakeHistory = [
      { id: 2, query: "coercion", fromLang: "en", toLang: "zh-CN", engine: "youdao",
        translation: "强迫", isWord: true, createdAt: 1760000060000 },
      { id: 1, query: "hello", fromLang: "en", toLang: "zh-CN", engine: "google",
        translation: "你好", isWord: true, createdAt: 1760000000000 },
    ];
    window.exportedTo = null;
    window.resizedTo = null;
    window.maximizeCalls = 0;
    window.quitCalled = false;
    window.fakeCelebrationWords = ["coercion", "hello", "好奇心"];
    window.confettiFailure = false;
    window.confettiDelay = 0;
    window.drawnConfetti = new Set();
    window.confettiSamples = [];
    window.confettiFrameTextCount = 0;
    window.peakConfettiTextCount = 0;
    window.liveConfettiTextCalls = 0;
    window.confettiFirstFrame = null;
    window.confettiFrameCounts = [];
    const spriteText = new WeakMap();
    const originalRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const scheduledAt = performance.now();
      return originalRaf(time => {
        window.confettiFrameTextCount = 0;
        // 原点检查固定在第一帧，避免机器忙时首帧已飞出几十像素。
        const firstLaunch = !window.confettiFirstFrame && document.querySelector("#word-confetti");
        callback(firstLaunch ? scheduledAt : time);
        window.peakConfettiTextCount = Math.max(window.peakConfettiTextCount, window.confettiFrameTextCount);
        if (window.confettiFrameTextCount) {
          window.confettiFrameCounts.push(window.confettiFrameTextCount);
          if (!window.confettiFirstFrame) window.confettiFirstFrame = window.confettiSamples.slice(0, window.confettiFrameTextCount);
        }
      });
    };
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.id === "word-confetti") window.liveConfettiTextCalls++;
      else spriteText.set(this.canvas, { text, size: Number(this.font.match(/([\d.]+)px/)?.[1] ?? 0) });
      return originalFillText.call(this, text, ...args);
    };
    const originalStrokeText = CanvasRenderingContext2D.prototype.strokeText;
    CanvasRenderingContext2D.prototype.strokeText = function(...args) {
      if (this.canvas.id === "word-confetti") window.liveConfettiTextCalls++;
      return originalStrokeText.apply(this, args);
    };
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      const info = spriteText.get(source);
      if (this.canvas.id === "word-confetti" && info) {
        window.drawnConfetti.add(info.text);
        window.confettiFrameTextCount++;
        const transform = this.getTransform();
        const dpr = this.canvas.width / innerWidth;
        if (window.confettiSamples.length < 6000) window.confettiSamples.push({ ...info, x: transform.e / dpr, y: transform.f / dpr });
      }
      return originalDrawImage.call(this, source, ...args);
    };
    const cache = new Set();
    const engines = [
      { id: "google", name: "Google 翻译", note: "大陆需代理", needsProxy: true, supportsSentence: true, supportsDictionary: true, supportsAudio: false },
      { id: "youdao", name: "有道词典", note: "国内直连，无需代理；柯林斯、专业释义、词源、词组短语、同根词最全", needsProxy: false, supportsSentence: true, supportsDictionary: true, supportsAudio: true },
      { id: "youdaoTrans", name: "有道翻译", note: "国内直连，无需代理；单词与整句都能翻", needsProxy: false, supportsSentence: true, supportsDictionary: false, supportsAudio: true },
    ];
    window.__TAURI_INTERNALS__ = { transformCallback, invoke: async (cmd, args) => {
      window.calls.push({ cmd, args });
      if (cmd === "plugin:event|listen") {
        window.eventListeners.push({ event: args.event, handler: args.handler });
        return window.eventListeners.length;
      }
      if (cmd === "plugin:event|unlisten") {
        window.eventListeners = window.eventListeners.filter(l => l.handler !== args.eventId);
        return null;
      }
      if (cmd === "load_settings") return window.fakeSettings;
      if (cmd === "save_settings") {
        if (args.settings.proxy === "invalid") throw "输入或设置无效：代理地址无效";
        window.fakeSettings = args.settings;
        return;
      }
      if (cmd === "take_startup_text") {
        const text = window.startupText;
        window.startupText = null;
        return text;
      }
      if (cmd === "shell_menu_registered") return window.registryHasShellMenu;
      if (cmd === "engines") return engines;
      if (cmd === "cache_stats") return { size: cache.size };
      if (cmd === "clear_cache") { cache.clear(); return; }
      if (cmd === "resize_window") { window.resizedTo = { width: args.width, height: args.height }; return; }
      if (cmd === "toggle_maximize") { window.maximizeCalls++; return true; }
      if (cmd === "quit_app") { window.quitCalled = true; return; }
      if (cmd === "app_info") return {
        version: "0.1.0",
        settingsPath: "C:\\Users\\test\\AppData\\Roaming\\com.tauri-app.translater\\settings.json",
        historyPath: "C:\\Users\\test\\AppData\\Roaming\\com.tauri-app.translater\\history.db",
        configDir: "C:\\Users\\test\\AppData\\Roaming\\com.tauri-app.translater",
        dataDir: "C:\\Users\\test\\AppData\\Roaming\\com.tauri-app.translater",
      };
      if (cmd === "history_stats") return { total: window.fakeHistory.length, sizeBytes: 20480 };
      if (cmd === "history_celebration_words") {
        await new Promise(resolve => setTimeout(resolve, window.confettiDelay));
        if (window.confettiFailure) throw "history read failed";
        return window.fakeCelebrationWords;
      }
      if (cmd === "history_list") {
        const filter = args.filter ?? "";
        const items = window.fakeHistory.filter(
          h => !filter || h.query.includes(filter) || h.translation.includes(filter));
        return { items: items.slice(args.offset, args.offset + args.limit), total: items.length };
      }
      if (cmd === "history_get") {
        const hit = window.fakeHistory.find(h => h.id === args.id);
        if (!hit) return null;
        return {
          query: hit.query, sourceLang: hit.fromLang, targetLang: hit.toLang, engine: hit.engine,
          translation: hit.translation, segments: [{ source: hit.query, text: hit.translation }],
          romanization: null, phonetic: null, phoneticUk: null, speakUrl: null, targetSpeakUrl: null,
          dictionary: [{ pos: "noun", terms: ["强迫"], back: [], exams: [] }], alternatives: [],
          synonyms: [], definitions: [], examples: [], phrases: [], related: [], sections: [],
          isWord: hit.isWord, cached: true, elapsedMs: 0,
        };
      }
      if (cmd === "history_delete") {
        window.fakeHistory = window.fakeHistory.filter(h => h.id !== args.id);
        return true;
      }
      if (cmd === "history_clear") {
        const n = window.fakeHistory.length;
        window.fakeHistory = [];
        return n;
      }
      if (cmd === "export_history") {
        window.exportedTo = { format: args.format, path: args.path };
        return 2;
      }
      if (cmd === "plugin:dialog|save") return "C:\\tmp\\history.csv";
      if (cmd === "translate") {
        await new Promise(resolve => setTimeout(resolve, args.text === "slow" ? 350 : 20));
        if (args.text === "network-failure") throw "connect error";
        if (args.text === "translateor") return {
          query: args.text, sourceLang: "en", targetLang: "zh-CN", engine: args.engine,
          translation: "", segments: [], romanization: null, phonetic: null, phoneticUk: null,
          speakUrl: null, targetSpeakUrl: null, dictionary: [], alternatives: [], synonyms: [],
          definitions: [], examples: [], phrases: [], related: [], sections: [],
          suggestions: window.spellingSuggestions ?? [
            { word: "translator", translation: "n. 译者；翻译器" },
            { word: "translation", translation: "n. 翻译；译文；转化；调任" },
          ],
          isWord: false, cached: false, elapsedMs: 20,
        };
        const cached = cache.has(args.text);
        cache.add(args.text);
        return {
          query: args.text, sourceLang: args.from === "auto" ? "en" : args.from,
          targetLang: args.to, engine: args.engine ?? "google",
          translation: `译文：${args.text}`,
          segments: [{ source: args.text, text: `译文：${args.text}` }],
          romanization: "Qiǎngpò", phonetic: "test", phoneticUk: "test-uk",
          speakUrl: null, targetSpeakUrl: null,
          dictionary: [{ pos: "noun", terms: ["译词"], back: [], exams: ["CET4"] }],
          alternatives: ["候选"],
          definitions: [{ pos: "noun", definitions: [{ text: "fixture definition", example: "example", similar: ["near"] }], source: "WordNet" }],
          synonyms: [{ pos: "noun", words: ["synonym"], gloss: "同义说明" }],
          examples: [{ text: 'a <b>word</b> <img src=x onerror="window.injected=true">', translation: "一个词", source: "《牛津词典》" }],
          phrases: [{ term: "take off", translation: "起飞", source: "21世纪" }],
          related: [{ pos: "adj.", words: [{ word: "coercive", gloss: "强制的" }] }],
          sections: [
            { key: "collins", title: "柯林斯", note: "柯林斯英汉双解大词典", markdown: false, groups: [
              { label: "teɪk", note: null, items: [
                { text: "to hold something", translation: "拿", note: "1",
                  extra: [{ text: "Let me take your coat.", translation: "我来帮你拿大衣。", source: null }] }] }] },
            { key: "ai", title: "AI 释义", note: "由有道 AI 生成，仅供参考", markdown: true, groups: [
              { label: "", note: null, items: [
                { text: "### 核心\n- 表示拿走\n**重点**", translation: null, note: null, extra: [] }] }] },
          ],
          isWord: true, cached, elapsedMs: 20,
        };
      }
      throw `Unexpected command: ${cmd}`;
    }};
})();
