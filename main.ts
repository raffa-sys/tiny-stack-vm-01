// SPDX-License-Identifier: MIT
// Tiny stack VM for make.fun tiny-stack-vm-01: a faithful interpreter of ISA.md v1,
// mirroring the reference VM (generator/subject/vm.mjs) trap for trap, including the
// hard cases: exact 32-bit MUL, unsigned DIVU/MODU/LTU, INT_MIN/-1, shifts masked to
// 5 bits, PUSH8 sign extension, step/output limits, and all ten trap codes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// opcode -> imm*100 + pops*10 + pushes (absent = unknown opcode, trap 5)
const T: { [k: number]: number } = {
  0: 0, 1: 101, 2: 401, 3: 10, 4: 12, 5: 22, 6: 23, 7: 33,
  16: 21, 17: 21, 18: 21, 19: 21, 20: 21, 21: 21, 22: 21, 23: 11, 24: 21,
  25: 21, 26: 21, 27: 11, 28: 21, 29: 21, 30: 21, 32: 21, 33: 21, 34: 21,
  48: 200, 49: 210, 50: 210, 51: 200, 52: 0, 64: 11, 65: 20,
  80: 10, 81: 10, 82: 1, 83: 10,
};

function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; code: number } {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  const end = (code: number): { o: Uint8Array; code: number } => ({ o: out.subarray(0, olen), code });
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const op = p[pc];
    const t = T[op];
    if (t === undefined) return end(5);
    const imm = (t / 100) | 0;
    const pops = ((t / 10) | 0) % 10;
    const pushes = t % 10;
    if (pc + imm >= p.length) return end(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = next;
    switch (op) {
      case 0:
        return end(0);
      case 1:
        D[sp++] = (p[next - 1] << 24) >> 24;
        break;
      case 2:
        D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24);
        break;
      case 3:
        sp--;
        break;
      case 4:
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 5: {
        const x = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = x;
        break;
      }
      case 6:
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 7: {
        const a = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = a;
        break;
      }
      case 23:
        D[sp - 1] = -D[sp - 1] | 0;
        break;
      case 27:
        D[sp - 1] = ~D[sp - 1];
        break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30:
      case 32: case 33: case 34: {
        const b = D[sp - 1];
        const a = D[sp - 2];
        let r: number;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) {
          if (b === 0) return end(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 20) {
          if (b === 0) return end(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 21) {
          if (b === 0) return end(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 22) {
          if (b === 0) return end(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = op === 48;
        if (op !== 48) {
          const v = D[--sp];
          take = op === 49 ? v === 0 : v !== 0;
        }
        if (take) pc = next + rel;
        break;
      }
      case 51:
        if (csp === 64) return end(7);
        C[csp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 52:
        if (csp === 0) return end(8);
        pc = C[--csp];
        break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[sp - 1];
        const v = D[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (olen + 1 > 65536) return end(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 82:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 83:
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let prog: Uint8Array = new Uint8Array(0);
  let inp: Uint8Array = new Uint8Array(0);
  try { prog = readFileSync(join(I, id, 'program.bin')); } catch { /* missing -> empty program, trap 9 */ }
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { /* missing -> empty input */ }
  const r = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
