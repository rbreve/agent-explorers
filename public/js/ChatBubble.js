import * as THREE from 'three';

/**
 * ChatBubble — renders speech and thought bubbles as Three.js sprites.
 * Handles canvas drawing, word-wrapping, texture lifecycle, and fade timers.
 */
export class ChatBubble {
  constructor(group, options = {}) {
    this.type = options.type || 'speech'; // 'speech' or 'thought'
    this.duration = options.duration || 5.0;
    this.timer = 0;
    this.currentText = '';

    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.visible = false;
    this.sprite.position.z = this.type === 'speech' ? 4 : 3.8;
    group.add(this.sprite);
  }

  show(text, agentRadius, targetName) {
    if (!text) return;
    this.currentText = text;
    this.timer = this.duration;

    if (this.type === 'speech') {
      this._drawSpeech(text, agentRadius, targetName);
    } else {
      this._drawThought(text, agentRadius);
    }
  }

  update(dt) {
    if (!this.sprite.visible) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.sprite.visible = false;
      this.sprite.material.opacity = 0;
      if (this.type === 'speech') this.currentText = '';
    } else {
      const fadeStart = this.type === 'speech' ? 1.0 : 0.8;
      if (this.timer < fadeStart) {
        this.sprite.material.opacity = this.timer / fadeStart;
      }
    }
  }

  dispose() {
    if (this.sprite.material.map) {
      this.sprite.material.map.dispose();
    }
  }

  // ── Private drawing ──

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  _measureWidest(ctx, lines) {
    let w = 0;
    for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
    return w;
  }

  _swapTexture(canvas) {
    const oldTex = this.sprite.material.map;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.sprite.material.map = texture;
    this.sprite.material.needsUpdate = true;
    if (oldTex) requestAnimationFrame(() => oldTex.dispose());
  }

  _drawSpeech(text, agentRadius, targetName) {
    const fontSize = 16;
    const font = `${fontSize}px Courier New`;
    const headerFont = 'italic 13px Courier New';
    const lineHeight = fontSize + 6;
    const padding = 14;
    const tailHeight = 12;
    const maxBubbleWidth = 320;
    const header = targetName ? `\u2192 ${targetName}` : null;

    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = font;
    const lines = this._wrapText(mctx, text, maxBubbleWidth - padding * 2);
    let widestLine = this._measureWidest(mctx, lines);
    if (header) {
      mctx.font = headerFont;
      widestLine = Math.max(widestLine, mctx.measureText(header).width);
    }

    const headerHeight = header ? 20 : 0;
    const bubbleW = Math.max(80, Math.ceil(widestLine) + padding * 2);
    const bubbleH = lines.length * lineHeight + padding * 2 + headerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = bubbleW + 4;
    canvas.height = bubbleH + tailHeight + 4;
    const ctx = canvas.getContext('2d');

    // Bubble shape with tail
    const r = 10;
    const bx = 2, by = 2, w = bubbleW, h = bubbleH;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + w - r, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    ctx.lineTo(bx + w, by + h - r);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    ctx.lineTo(bx + w * 0.55, by + h);
    ctx.lineTo(bx + w * 0.5, by + h + tailHeight);
    ctx.lineTo(bx + w * 0.42, by + h);
    ctx.lineTo(bx + r, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 15, 25, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 100, 140, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let textY = padding + fontSize;
    if (header) {
      ctx.font = headerFont;
      ctx.fillStyle = '#8888cc';
      ctx.textAlign = 'center';
      ctx.fillText(header, canvas.width / 2, textY);
      textY += headerHeight;
    }
    ctx.font = font;
    ctx.fillStyle = '#eeeeee';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, textY + i * lineHeight);
    }

    this._swapTexture(canvas);

    const scale = 0.5;
    this.sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    this.sprite.position.set(0, agentRadius + 28 + (canvas.height * scale) / 2, 4);
    this.sprite.material.opacity = 1;
    this.sprite.visible = true;
  }

  _drawThought(text, agentRadius) {
    const fontSize = 18;
    const font = `italic ${fontSize}px Courier New`;
    const padding = 12;
    const maxWidth = 320;
    const lineHeight = fontSize + 4;

    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = font;
    const lines = this._wrapText(mctx, text, maxWidth - padding * 2);
    const widestLine = this._measureWidest(mctx, lines);

    const bubbleW = Math.max(60, Math.ceil(widestLine) + padding * 2);
    const bubbleH = lines.length * lineHeight + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = bubbleW + 4;
    canvas.height = bubbleH + 4;
    const ctx = canvas.getContext('2d');

    // Thought bubble — rounded rect with dotted border
    const r = 8;
    const bx = 2, by = 2, w = bubbleW, h = bubbleH;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + w - r, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    ctx.lineTo(bx + w, by + h - r);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    ctx.lineTo(bx + r, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40, 40, 20, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 180, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = font;
    ctx.fillStyle = '#dddd88';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, padding + fontSize + i * lineHeight);
    }

    this._swapTexture(canvas);

    const scale = 0.45;
    this.sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    this.sprite.position.set(0, -agentRadius - 35 - (canvas.height * scale) / 2, 3.8);
    this.sprite.material.opacity = 1;
    this.sprite.visible = true;
  }
}
