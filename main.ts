// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Immediate length per opcode; -1 means the byte names no opcode.
const L = new Int8Array(256).fill(-1);
for (const k of [0,3,4,5,6,7,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,52,64,65,80,81,82,83]) L[k] = 0;
L[1] = 1; L[2] = 4; L[48] = 2; L[49] = 2; L[50] = 2; L[51] = 2;
// Run one program, returning [output bytes, exit code]. Values stay signed
// 32-bit: JS bitwise ops and |0 wrap every result mod 2^32.
function run(p, q) {
  const m = new Int32Array(256), s = new Int32Array(257), c = new Int32Array(65);
  let sp = 0, cp = 0, pc = 0, ip = 0, st = 0, ol = 0, a, b, t;
  const o = [];
  const n = p.length;
  const off = () => ((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16;
  for (;;) {
    if (st >= 1e6) return [o, 10];
    if (pc < 0 || pc >= n) return [o, 9];
    const op = p[pc], il = L[op];
    if (il < 0) return [o, 5];
    if (pc + 1 + il > n) return [o, 9];
    st++;
    switch (op) {
      case 0: return [o, 0];
      case 1:
        if (sp > 255) return [o, 3];
        t = p[pc + 1]; s[sp++] = t > 127 ? t - 256 : t; pc += 2; break;
      case 2:
        if (sp > 255) return [o, 3];
        s[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24); pc += 5; break;
      case 3:
        if (sp < 1) return [o, 2];
        sp--; pc++; break;
      case 4:
        if (sp < 1) return [o, 2];
        if (sp > 255) return [o, 3];
        s[sp] = s[sp - 1]; sp++; pc++; break;
      case 5:
        if (sp < 2) return [o, 2];
        t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; pc++; break;
      case 6:
        if (sp < 2) return [o, 2];
        if (sp > 255) return [o, 3];
        s[sp] = s[sp - 2]; sp++; pc++; break;
      case 7:
        if (sp < 3) return [o, 2];
        t = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = t; pc++; break;
      case 16:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = (s[sp - 1] + b) | 0; pc++; break;
      case 17:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = (s[sp - 1] - b) | 0; pc++; break;
      case 18:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = Math.imul(s[sp - 1], b); pc++; break;
      case 19:
        if (sp < 2) return [o, 2];
        b = s[--sp]; a = s[sp - 1];
        if (b === 0) return [o, 4];
        s[sp - 1] = (a / b) | 0; pc++; break;
      case 20:
        if (sp < 2) return [o, 2];
        b = s[--sp]; a = s[sp - 1];
        if (b === 0) return [o, 4];
        s[sp - 1] = (a % b) | 0; pc++; break;
      case 21:
        if (sp < 2) return [o, 2];
        b = s[--sp]; a = s[sp - 1];
        if (b === 0) return [o, 4];
        s[sp - 1] = ((a >>> 0) / (b >>> 0)) | 0; pc++; break;
      case 22:
        if (sp < 2) return [o, 2];
        b = s[--sp]; a = s[sp - 1];
        if (b === 0) return [o, 4];
        s[sp - 1] = ((a >>> 0) % (b >>> 0)) | 0; pc++; break;
      case 23:
        if (sp < 1) return [o, 2];
        s[sp - 1] = -s[sp - 1] | 0; pc++; break;
      case 24:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] & b; pc++; break;
      case 25:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] | b; pc++; break;
      case 26:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] ^ b; pc++; break;
      case 27:
        if (sp < 1) return [o, 2];
        s[sp - 1] = ~s[sp - 1]; pc++; break;
      case 28:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] << b; pc++; break;
      case 29:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] >> b; pc++; break;
      case 30:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> b) | 0; pc++; break;
      case 32:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] === b ? 1 : 0; pc++; break;
      case 33:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = s[sp - 1] < b ? 1 : 0; pc++; break;
      case 34:
        if (sp < 2) return [o, 2];
        b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> 0) < (b >>> 0) ? 1 : 0; pc++; break;
      case 48:
        pc = pc + 3 + off(); break;
      case 49:
        if (sp < 1) return [o, 2];
        t = s[--sp]; pc = t === 0 ? pc + 3 + off() : pc + 3; break;
      case 50:
        if (sp < 1) return [o, 2];
        t = s[--sp]; pc = t !== 0 ? pc + 3 + off() : pc + 3; break;
      case 51:
        if (cp > 63) return [o, 7];
        c[cp++] = pc + 3; pc = p[pc + 1] | (p[pc + 2] << 8); break;
      case 52:
        if (cp < 1) return [o, 8];
        pc = c[--cp]; break;
      case 64:
        if (sp < 1) return [o, 2];
        a = s[sp - 1];
        if (a < 0 || a > 255) return [o, 6];
        s[sp - 1] = m[a]; pc++; break;
      case 65:
        if (sp < 2) return [o, 2];
        a = s[--sp]; b = s[--sp];
        if (a < 0 || a > 255) return [o, 6];
        m[a] = b; pc++; break;
      case 80: {
        if (sp < 1) return [o, 2];
        const w = String(s[--sp]);
        if (ol + w.length > 65536) return [o, 11];
        for (let i = 0; i < w.length; i++) o.push(w.charCodeAt(i));
        ol += w.length; pc++; break;
      }
      case 81:
        if (sp < 1) return [o, 2];
        if (ol > 65535) return [o, 11];
        o.push(s[--sp] & 255); ol++; pc++; break;
      case 82:
        if (sp > 255) return [o, 3];
        s[sp++] = ip < q.length ? q[ip++] : -1; pc++; break;
      case 83:
        if (sp < 1) return [o, 2];
        return [o, s[--sp] & 255];
      default: return [o, 5];
    }
  }
}
for (const id of readdirSync(I).sort()) {
  let prog, inp;
  try { prog = readFileSync(join(I, id, 'program.bin')); } catch { prog = Buffer.alloc(0); }
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { inp = Buffer.alloc(0); }
  const [out, code] = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), Buffer.from(out));
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
