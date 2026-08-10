/**
 * 音效：背景音樂（OGG 載入 + loop）＋ 動作 OGG 載入（去抖）。
 * 調用端：audio.unlock(), audio.play(name), audio.bgm.play/stop, audio.mute 開關。
 */

const SFX_LIST = ["jump", "land", "coin", "hurt", "spring", "exit", "click", "error", "win"];

export class PixelAudio {
  constructor(base = "assets/sfx") {
    this.base = base;
    this.ctx = null;
    this.enabled = true;
    this.vol = 0.55;
    this.cache = new Map(); // name → decoded AudioBuffer
    this.bgmBuf = null;
    this.bgmSrc = null;
    this.bgmGain = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  async unlock() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        // 不 await resume：沒手勢時不會 resolve。僅嘗試觸發即可。
        this.ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.bgmGain) this.bgmGain.gain.value = on ? this.vol * 0.5 : 0;
  }

  setVol(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.bgmGain) this.bgmGain.gain.value = this.enabled ? this.vol * 0.5 : 0;
  }

  async load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    this.ensure();
    if (!this.ctx) return null;
    try {
      const res = await fetch(`${this.base}/${name}.ogg`);
      if (!res.ok) throw new Error(`fetch ${name} ${res.status}`);
      const buf = await res.arrayBuffer();
      const audio = await Promise.race([
        this.ctx.decodeAudioData(buf),
        new Promise((_, rej) => setTimeout(() => rej(new Error("decode timeout")), 5000)),
      ]);
      this.cache.set(name, audio);
      return audio;
    } catch {
      return null;
    }
  }

  async preloadAll() {
    const tasks = [
      ...SFX_LIST.map((n) =>
        Promise.race([this.load(n), new Promise((r) => setTimeout(() => r(null), 8000))])
      ),
      Promise.race([this.loadBgm(), new Promise((r) => setTimeout(() => r(null), 8000))]),
    ];
    return Promise.all(tasks);
  }

  async loadBgm() {
    if (this.bgmBuf) return this.bgmBuf;
    this.ensure();
    if (!this.ctx) return null;
    try {
      const res = await fetch(`${this.base}/bgm.ogg`);
      if (!res.ok) throw new Error(`fetch bgm ${res.status}`);
      const buf = await res.arrayBuffer();
      const audio = await Promise.race([
        this.ctx.decodeAudioData(buf),
        new Promise((_, rej) => setTimeout(() => rej(new Error("decode timeout")), 5000)),
      ]);
      this.bgmBuf = audio;
      return this.bgmBuf;
    } catch {
      return null;
    }
  }

  async play(name) {
    if (!this.enabled) return;
    const buf = await this.load(name);
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = this.vol;
    src.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  }

  async playBgm() {
    if (!this.enabled) return;
    const buf = await this.loadBgm();
    if (!buf || !this.ctx) return;
    if (this.bgmSrc) {
      try { this.bgmSrc.stop(); } catch { /* ignore */ }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = this.vol * 0.5;
    src.connect(g);
    g.connect(this.ctx.destination);
    src.start();
    this.bgmSrc = src;
    this.bgmGain = g;
  }

  stopBgm() {
    if (this.bgmSrc) {
      try { this.bgmSrc.stop(); } catch { /* ignore */ }
      this.bgmSrc = null;
      this.bgmGain = null;
    }
  }
}
