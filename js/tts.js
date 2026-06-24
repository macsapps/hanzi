function speak(text, options = {}) {
  return new Promise((resolve) => {
    if (!text) { resolve(); return; }
    // 过滤掉纯拼音/英文字母，只保留中文汉字
    const chineseText = text.replace(/[a-zA-Z.]/g, '').trim();
    // 如果过滤后完全没有中文，说明是纯拼音，不朗读
    if (!chineseText) { resolve(); return; }
    // 再次检查：只保留中文字符
    const cleanText = chineseText.replace(/[^\u4e00-\u9fa5]/g, '').trim();
    if (!cleanText) { resolve(); return; }
    // 默认 cancel 之前的语音，但如果是从 playChar 连续调用则不 cancel
    if (options.cancel !== false) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.4;
    utterance.pitch = 0.9;
    utterance.volume = 1.1;
    let resolved = false;
    const done = () => { if (resolved) return; resolved = true; resolve(); };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
    setTimeout(done, 15000);
  });
}

function stopSpeak() {
  window.speechSynthesis.cancel();
}
