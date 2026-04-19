import { ipcMain as H, app as re, dialog as He, shell as va, Notification as qa, session as Po, BrowserWindow as jo } from "electron";
import ct, { fileURLToPath as Lo } from "url";
import xe, { dirname as Ps, join as Oe } from "path";
import No from "electron-store";
import { spawn as ba } from "child_process";
import de from "fs";
import pt, { randomBytes as Bo } from "crypto";
import De from "util";
import oe, { Readable as Fo } from "stream";
import lt from "http";
import At from "https";
import js from "http2";
import Uo from "assert";
import Ls from "tty";
import qo from "os";
import je from "zlib";
import Ns, { EventEmitter as Do } from "events";
import Io from "net";
import zo from "tls";
import Mo from "buffer";
const it = /* @__PURE__ */ new Map();
function $o(t) {
  const e = t.indexOf("ipc-guard.");
  return e === -1 ? !1 : !t.slice(e + 10).startsWith("test.");
}
function Bs() {
  const a = (new Error().stack ?? "").split(`
`).find((n, i) => i >= 2 && !$o(n));
  return a ? a.trim() : "<unknown caller>";
}
function Fs(t, e, a, n) {
  return new Error(
    `[ipc-guard] Duplicate IPC handler for channel "${t}" (${n}).
  First registered at:  ${e}
  Attempted again at:   ${a}
Remove one of the registrations, or call ipcMain.removeHandler("${t}") before re-registering.`
  );
}
const Ho = H.handle.bind(H), Wo = H.handleOnce.bind(H), Go = H.removeHandler.bind(H);
H.handle = function(e, a) {
  const n = Bs(), i = it.get(e);
  if (i !== void 0)
    throw Fs(e, i, n, "handle");
  it.set(e, n), Ho(e, a);
};
H.handleOnce = function(e, a) {
  const n = Bs(), i = it.get(e);
  if (i !== void 0)
    throw Fs(e, i, n, "handleOnce");
  it.set(e, n), Wo(e, a);
};
H.removeHandler = function(e) {
  it.delete(e), Go(e);
};
function ga(t, e) {
  var i;
  return (((i = t.defaultOutputPath) == null ? void 0 : i.trim()) || xe.join(e, "outputs")).replace(/\\/g, "/");
}
function Us(t, e) {
  const a = (t.defaultOutputPath || "").trim(), n = (e.defaultOutputPath || "").trim(), i = (t.pythonPath || "").trim(), o = (e.pythonPath || "").trim();
  return a !== n || i !== o;
}
function Me(t) {
  return t.replace(/\\/g, "/").replace(/\/$/, "");
}
function Da(t, e) {
  if (!t)
    return Me(e);
  if (t.startsWith("/outputs/") || t.startsWith("outputs/")) {
    const n = t.replace(/^\/?outputs\/+/, "");
    return Me(xe.join(e, n));
  }
  if (xe.isAbsolute(t))
    return Me(t);
  const a = t.replace(/^\/+/, "");
  return Me(xe.join(e, a));
}
function Vo(t, e) {
  const a = Me(t);
  return e.some((n) => {
    const i = Me(n);
    return a === i || a.startsWith(`${i}/`);
  });
}
function Ko(t, e, a, n) {
  const i = Da(t, e);
  if (n(i) || xe.isAbsolute(t) && !t.startsWith("/outputs/") && !t.startsWith("outputs/"))
    return i;
  for (const o of a) {
    const s = Da(t, o);
    if (n(s))
      return s;
  }
  return i;
}
const Yo = ["http://127.0.0.1:8000", "http://localhost:8000"];
async function Jo(t, e, a) {
  const n = new AbortController(), i = setTimeout(() => n.abort(), a);
  try {
    return (await t(`${e}/`, { signal: n.signal })).ok;
  } catch {
    return !1;
  } finally {
    clearTimeout(i);
  }
}
async function ya({
  fetchImpl: t = fetch,
  origins: e = Yo,
  timeoutMs: a = 6e4,
  intervalMs: n = 500,
  requestTimeoutMs: i = 1500
} = {}) {
  const o = Date.now() + a;
  do {
    for (const s of e)
      if (await Jo(t, s, i))
        return { ready: !0, origin: s };
    if (Date.now() >= o)
      break;
    await new Promise((s) => setTimeout(s, n));
  } while (!0);
  return { ready: !1, origin: null };
}
function da(t, e) {
  return {
    running: !!(t && t.exitCode === null && e),
    pid: (t == null ? void 0 : t.pid) ?? null
  };
}
const Xo = "x-vision-studio-token", qs = process.env.VISION_STUDIO_BACKEND_AUTH_TOKEN || Bo(32).toString("hex");
function ge() {
  return {
    [Xo]: qs
  };
}
const Zo = /* @__PURE__ */ new Set(["settings", "recentProjects", "firstRun", "modelsDownloaded"]), Qo = /* @__PURE__ */ new Set([
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "bash",
  "bash.exe",
  "sh",
  "sh.exe",
  "wscript",
  "wscript.exe",
  "cscript",
  "cscript.exe"
]), er = /[;&|`$<>]/, tr = /^(py|python(?:\d+(?:\.\d+)*)?)(?:\.exe)?$/i;
function Ia(t) {
  return xe.resolve(t).replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}
function nr(t, e) {
  const a = Ia(t), n = Ia(e);
  return a === n || a.startsWith(`${n}/`);
}
function ar(t) {
  try {
    const e = new URL(t);
    return e.protocol === "http:" || e.protocol === "https:";
  } catch {
    return !1;
  }
}
function ir(t) {
  const e = t.trim();
  if (!e || er.test(e))
    return !1;
  const a = xe.basename(e).toLowerCase();
  return Qo.has(a) ? !1 : tr.test(a);
}
function Ds(t) {
  return Zo.has(t);
}
function Is(t, e) {
  if (!xe.isAbsolute(t))
    return null;
  const a = xe.resolve(t);
  return e.some((i) => nr(a, i)) ? a : null;
}
function Te(t, e = "Request failed") {
  return typeof t == "object" && t !== null && "code" in t && t.code === "BACKEND_DOWN" ? "The AI backend is not running. Please restart the app or start the backend manually from Settings." : e;
}
function zs(t, e) {
  return function() {
    return t.apply(e, arguments);
  };
}
const { toString: sr } = Object.prototype, { getPrototypeOf: _a } = Object, { iterator: Pt, toStringTag: Ms } = Symbol, jt = /* @__PURE__ */ ((t) => (e) => {
  const a = sr.call(e);
  return t[a] || (t[a] = a.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null)), Ce = (t) => (t = t.toLowerCase(), (e) => jt(e) === t), Lt = (t) => (e) => typeof e === t, { isArray: Ke } = Array, We = Lt("undefined");
function ut(t) {
  return t !== null && !We(t) && t.constructor !== null && !We(t.constructor) && be(t.constructor.isBuffer) && t.constructor.isBuffer(t);
}
const $s = Ce("ArrayBuffer");
function or(t) {
  let e;
  return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? e = ArrayBuffer.isView(t) : e = t && t.buffer && $s(t.buffer), e;
}
const rr = Lt("string"), be = Lt("function"), Hs = Lt("number"), dt = (t) => t !== null && typeof t == "object", cr = (t) => t === !0 || t === !1, wt = (t) => {
  if (jt(t) !== "object")
    return !1;
  const e = _a(t);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Ms in t) && !(Pt in t);
}, pr = (t) => {
  if (!dt(t) || ut(t))
    return !1;
  try {
    return Object.keys(t).length === 0 && Object.getPrototypeOf(t) === Object.prototype;
  } catch {
    return !1;
  }
}, lr = Ce("Date"), ur = Ce("File"), dr = Ce("Blob"), mr = Ce("FileList"), fr = (t) => dt(t) && be(t.pipe), hr = (t) => {
  let e;
  return t && (typeof FormData == "function" && t instanceof FormData || be(t.append) && ((e = jt(t)) === "formdata" || // detect form-data instance
  e === "object" && be(t.toString) && t.toString() === "[object FormData]"));
}, xr = Ce("URLSearchParams"), [vr, br, gr, yr] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers"
].map(Ce), _r = (t) => t.trim ? t.trim() : t.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function mt(t, e, { allOwnKeys: a = !1 } = {}) {
  if (t === null || typeof t > "u")
    return;
  let n, i;
  if (typeof t != "object" && (t = [t]), Ke(t))
    for (n = 0, i = t.length; n < i; n++)
      e.call(null, t[n], n, t);
  else {
    if (ut(t))
      return;
    const o = a ? Object.getOwnPropertyNames(t) : Object.keys(t), s = o.length;
    let r;
    for (n = 0; n < s; n++)
      r = o[n], e.call(null, t[r], r, t);
  }
}
function Ws(t, e) {
  if (ut(t))
    return null;
  e = e.toLowerCase();
  const a = Object.keys(t);
  let n = a.length, i;
  for (; n-- > 0; )
    if (i = a[n], e === i.toLowerCase())
      return i;
  return null;
}
const Ne = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global, Gs = (t) => !We(t) && t !== Ne;
function ma() {
  const { caseless: t, skipUndefined: e } = Gs(this) && this || {}, a = {}, n = (i, o) => {
    if (o === "__proto__" || o === "constructor" || o === "prototype")
      return;
    const s = t && Ws(a, o) || o;
    wt(a[s]) && wt(i) ? a[s] = ma(a[s], i) : wt(i) ? a[s] = ma({}, i) : Ke(i) ? a[s] = i.slice() : (!e || !We(i)) && (a[s] = i);
  };
  for (let i = 0, o = arguments.length; i < o; i++)
    arguments[i] && mt(arguments[i], n);
  return a;
}
const wr = (t, e, a, { allOwnKeys: n } = {}) => (mt(
  e,
  (i, o) => {
    a && be(i) ? Object.defineProperty(t, o, {
      value: zs(i, a),
      writable: !0,
      enumerable: !0,
      configurable: !0
    }) : Object.defineProperty(t, o, {
      value: i,
      writable: !0,
      enumerable: !0,
      configurable: !0
    });
  },
  { allOwnKeys: n }
), t), Er = (t) => (t.charCodeAt(0) === 65279 && (t = t.slice(1)), t), Sr = (t, e, a, n) => {
  t.prototype = Object.create(
    e.prototype,
    n
  ), Object.defineProperty(t.prototype, "constructor", {
    value: t,
    writable: !0,
    enumerable: !1,
    configurable: !0
  }), Object.defineProperty(t, "super", {
    value: e.prototype
  }), a && Object.assign(t.prototype, a);
}, Rr = (t, e, a, n) => {
  let i, o, s;
  const r = {};
  if (e = e || {}, t == null) return e;
  do {
    for (i = Object.getOwnPropertyNames(t), o = i.length; o-- > 0; )
      s = i[o], (!n || n(s, t, e)) && !r[s] && (e[s] = t[s], r[s] = !0);
    t = a !== !1 && _a(t);
  } while (t && (!a || a(t, e)) && t !== Object.prototype);
  return e;
}, kr = (t, e, a) => {
  t = String(t), (a === void 0 || a > t.length) && (a = t.length), a -= e.length;
  const n = t.indexOf(e, a);
  return n !== -1 && n === a;
}, Or = (t) => {
  if (!t) return null;
  if (Ke(t)) return t;
  let e = t.length;
  if (!Hs(e)) return null;
  const a = new Array(e);
  for (; e-- > 0; )
    a[e] = t[e];
  return a;
}, Tr = /* @__PURE__ */ ((t) => (e) => t && e instanceof t)(typeof Uint8Array < "u" && _a(Uint8Array)), Cr = (t, e) => {
  const n = (t && t[Pt]).call(t);
  let i;
  for (; (i = n.next()) && !i.done; ) {
    const o = i.value;
    e.call(t, o[0], o[1]);
  }
}, Ar = (t, e) => {
  let a;
  const n = [];
  for (; (a = t.exec(e)) !== null; )
    n.push(a);
  return n;
}, Pr = Ce("HTMLFormElement"), jr = (t) => t.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function(a, n, i) {
  return n.toUpperCase() + i;
}), za = (({ hasOwnProperty: t }) => (e, a) => t.call(e, a))(Object.prototype), Lr = Ce("RegExp"), Vs = (t, e) => {
  const a = Object.getOwnPropertyDescriptors(t), n = {};
  mt(a, (i, o) => {
    let s;
    (s = e(i, o, t)) !== !1 && (n[o] = s || i);
  }), Object.defineProperties(t, n);
}, Nr = (t) => {
  Vs(t, (e, a) => {
    if (be(t) && ["arguments", "caller", "callee"].indexOf(a) !== -1)
      return !1;
    const n = t[a];
    if (be(n)) {
      if (e.enumerable = !1, "writable" in e) {
        e.writable = !1;
        return;
      }
      e.set || (e.set = () => {
        throw Error("Can not rewrite read-only method '" + a + "'");
      });
    }
  });
}, Br = (t, e) => {
  const a = {}, n = (i) => {
    i.forEach((o) => {
      a[o] = !0;
    });
  };
  return Ke(t) ? n(t) : n(String(t).split(e)), a;
}, Fr = () => {
}, Ur = (t, e) => t != null && Number.isFinite(t = +t) ? t : e;
function qr(t) {
  return !!(t && be(t.append) && t[Ms] === "FormData" && t[Pt]);
}
const Dr = (t) => {
  const e = new Array(10), a = (n, i) => {
    if (dt(n)) {
      if (e.indexOf(n) >= 0)
        return;
      if (ut(n))
        return n;
      if (!("toJSON" in n)) {
        e[i] = n;
        const o = Ke(n) ? [] : {};
        return mt(n, (s, r) => {
          const c = a(s, i + 1);
          !We(c) && (o[r] = c);
        }), e[i] = void 0, o;
      }
    }
    return n;
  };
  return a(t, 0);
}, Ir = Ce("AsyncFunction"), zr = (t) => t && (dt(t) || be(t)) && be(t.then) && be(t.catch), Ks = ((t, e) => t ? setImmediate : e ? ((a, n) => (Ne.addEventListener(
  "message",
  ({ source: i, data: o }) => {
    i === Ne && o === a && n.length && n.shift()();
  },
  !1
), (i) => {
  n.push(i), Ne.postMessage(a, "*");
}))(`axios@${Math.random()}`, []) : (a) => setTimeout(a))(typeof setImmediate == "function", be(Ne.postMessage)), Mr = typeof queueMicrotask < "u" ? queueMicrotask.bind(Ne) : typeof process < "u" && process.nextTick || Ks, $r = (t) => t != null && be(t[Pt]), _ = {
  isArray: Ke,
  isArrayBuffer: $s,
  isBuffer: ut,
  isFormData: hr,
  isArrayBufferView: or,
  isString: rr,
  isNumber: Hs,
  isBoolean: cr,
  isObject: dt,
  isPlainObject: wt,
  isEmptyObject: pr,
  isReadableStream: vr,
  isRequest: br,
  isResponse: gr,
  isHeaders: yr,
  isUndefined: We,
  isDate: lr,
  isFile: ur,
  isBlob: dr,
  isRegExp: Lr,
  isFunction: be,
  isStream: fr,
  isURLSearchParams: xr,
  isTypedArray: Tr,
  isFileList: mr,
  forEach: mt,
  merge: ma,
  extend: wr,
  trim: _r,
  stripBOM: Er,
  inherits: Sr,
  toFlatObject: Rr,
  kindOf: jt,
  kindOfTest: Ce,
  endsWith: kr,
  toArray: Or,
  forEachEntry: Cr,
  matchAll: Ar,
  isHTMLForm: Pr,
  hasOwnProperty: za,
  hasOwnProp: za,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors: Vs,
  freezeMethods: Nr,
  toObjectSet: Br,
  toCamelCase: jr,
  noop: Fr,
  toFiniteNumber: Ur,
  findKey: Ws,
  global: Ne,
  isContextDefined: Gs,
  isSpecCompliantForm: qr,
  toJSONObject: Dr,
  isAsyncFn: Ir,
  isThenable: zr,
  setImmediate: Ks,
  asap: Mr,
  isIterable: $r
};
let N = class Ys extends Error {
  static from(e, a, n, i, o, s) {
    const r = new Ys(e.message, a || e.code, n, i, o);
    return r.cause = e, r.name = e.name, s && Object.assign(r, s), r;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(e, a, n, i, o) {
    super(e), this.name = "AxiosError", this.isAxiosError = !0, a && (this.code = a), n && (this.config = n), i && (this.request = i), o && (this.response = o, this.status = o.status);
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: _.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
N.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
N.ERR_BAD_OPTION = "ERR_BAD_OPTION";
N.ECONNABORTED = "ECONNABORTED";
N.ETIMEDOUT = "ETIMEDOUT";
N.ERR_NETWORK = "ERR_NETWORK";
N.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
N.ERR_DEPRECATED = "ERR_DEPRECATED";
N.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
N.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
N.ERR_CANCELED = "ERR_CANCELED";
N.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
N.ERR_INVALID_URL = "ERR_INVALID_URL";
function wa(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var Gt, Ma;
function Hr() {
  if (Ma) return Gt;
  Ma = 1;
  var t = oe.Stream, e = De;
  Gt = a;
  function a() {
    this.source = null, this.dataSize = 0, this.maxDataSize = 1024 * 1024, this.pauseStream = !0, this._maxDataSizeExceeded = !1, this._released = !1, this._bufferedEvents = [];
  }
  return e.inherits(a, t), a.create = function(n, i) {
    var o = new this();
    i = i || {};
    for (var s in i)
      o[s] = i[s];
    o.source = n;
    var r = n.emit;
    return n.emit = function() {
      return o._handleEmit(arguments), r.apply(n, arguments);
    }, n.on("error", function() {
    }), o.pauseStream && n.pause(), o;
  }, Object.defineProperty(a.prototype, "readable", {
    configurable: !0,
    enumerable: !0,
    get: function() {
      return this.source.readable;
    }
  }), a.prototype.setEncoding = function() {
    return this.source.setEncoding.apply(this.source, arguments);
  }, a.prototype.resume = function() {
    this._released || this.release(), this.source.resume();
  }, a.prototype.pause = function() {
    this.source.pause();
  }, a.prototype.release = function() {
    this._released = !0, this._bufferedEvents.forEach((function(n) {
      this.emit.apply(this, n);
    }).bind(this)), this._bufferedEvents = [];
  }, a.prototype.pipe = function() {
    var n = t.prototype.pipe.apply(this, arguments);
    return this.resume(), n;
  }, a.prototype._handleEmit = function(n) {
    if (this._released) {
      this.emit.apply(this, n);
      return;
    }
    n[0] === "data" && (this.dataSize += n[1].length, this._checkIfMaxDataSizeExceeded()), this._bufferedEvents.push(n);
  }, a.prototype._checkIfMaxDataSizeExceeded = function() {
    if (!this._maxDataSizeExceeded && !(this.dataSize <= this.maxDataSize)) {
      this._maxDataSizeExceeded = !0;
      var n = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this.emit("error", new Error(n));
    }
  }, Gt;
}
var Vt, $a;
function Wr() {
  if ($a) return Vt;
  $a = 1;
  var t = De, e = oe.Stream, a = Hr();
  Vt = n;
  function n() {
    this.writable = !1, this.readable = !0, this.dataSize = 0, this.maxDataSize = 2 * 1024 * 1024, this.pauseStreams = !0, this._released = !1, this._streams = [], this._currentStream = null, this._insideLoop = !1, this._pendingNext = !1;
  }
  return t.inherits(n, e), n.create = function(i) {
    var o = new this();
    i = i || {};
    for (var s in i)
      o[s] = i[s];
    return o;
  }, n.isStreamLike = function(i) {
    return typeof i != "function" && typeof i != "string" && typeof i != "boolean" && typeof i != "number" && !Buffer.isBuffer(i);
  }, n.prototype.append = function(i) {
    var o = n.isStreamLike(i);
    if (o) {
      if (!(i instanceof a)) {
        var s = a.create(i, {
          maxDataSize: 1 / 0,
          pauseStream: this.pauseStreams
        });
        i.on("data", this._checkDataSize.bind(this)), i = s;
      }
      this._handleErrors(i), this.pauseStreams && i.pause();
    }
    return this._streams.push(i), this;
  }, n.prototype.pipe = function(i, o) {
    return e.prototype.pipe.call(this, i, o), this.resume(), i;
  }, n.prototype._getNext = function() {
    if (this._currentStream = null, this._insideLoop) {
      this._pendingNext = !0;
      return;
    }
    this._insideLoop = !0;
    try {
      do
        this._pendingNext = !1, this._realGetNext();
      while (this._pendingNext);
    } finally {
      this._insideLoop = !1;
    }
  }, n.prototype._realGetNext = function() {
    var i = this._streams.shift();
    if (typeof i > "u") {
      this.end();
      return;
    }
    if (typeof i != "function") {
      this._pipeNext(i);
      return;
    }
    var o = i;
    o((function(s) {
      var r = n.isStreamLike(s);
      r && (s.on("data", this._checkDataSize.bind(this)), this._handleErrors(s)), this._pipeNext(s);
    }).bind(this));
  }, n.prototype._pipeNext = function(i) {
    this._currentStream = i;
    var o = n.isStreamLike(i);
    if (o) {
      i.on("end", this._getNext.bind(this)), i.pipe(this, { end: !1 });
      return;
    }
    var s = i;
    this.write(s), this._getNext();
  }, n.prototype._handleErrors = function(i) {
    var o = this;
    i.on("error", function(s) {
      o._emitError(s);
    });
  }, n.prototype.write = function(i) {
    this.emit("data", i);
  }, n.prototype.pause = function() {
    this.pauseStreams && (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function" && this._currentStream.pause(), this.emit("pause"));
  }, n.prototype.resume = function() {
    this._released || (this._released = !0, this.writable = !0, this._getNext()), this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function" && this._currentStream.resume(), this.emit("resume");
  }, n.prototype.end = function() {
    this._reset(), this.emit("end");
  }, n.prototype.destroy = function() {
    this._reset(), this.emit("close");
  }, n.prototype._reset = function() {
    this.writable = !1, this._streams = [], this._currentStream = null;
  }, n.prototype._checkDataSize = function() {
    if (this._updateDataSize(), !(this.dataSize <= this.maxDataSize)) {
      var i = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this._emitError(new Error(i));
    }
  }, n.prototype._updateDataSize = function() {
    this.dataSize = 0;
    var i = this;
    this._streams.forEach(function(o) {
      o.dataSize && (i.dataSize += o.dataSize);
    }), this._currentStream && this._currentStream.dataSize && (this.dataSize += this._currentStream.dataSize);
  }, n.prototype._emitError = function(i) {
    this._reset(), this.emit("error", i);
  }, Vt;
}
var Kt = {};
const Gr = {
  "application/1d-interleaved-parityfec": { source: "iana" },
  "application/3gpdash-qoe-report+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/3gpp-ims+xml": { source: "iana", compressible: !0 },
  "application/3gpphal+json": { source: "iana", compressible: !0 },
  "application/3gpphalforms+json": { source: "iana", compressible: !0 },
  "application/a2l": { source: "iana" },
  "application/ace+cbor": { source: "iana" },
  "application/activemessage": { source: "iana" },
  "application/activity+json": { source: "iana", compressible: !0 },
  "application/alto-costmap+json": { source: "iana", compressible: !0 },
  "application/alto-costmapfilter+json": { source: "iana", compressible: !0 },
  "application/alto-directory+json": { source: "iana", compressible: !0 },
  "application/alto-endpointcost+json": { source: "iana", compressible: !0 },
  "application/alto-endpointcostparams+json": { source: "iana", compressible: !0 },
  "application/alto-endpointprop+json": { source: "iana", compressible: !0 },
  "application/alto-endpointpropparams+json": { source: "iana", compressible: !0 },
  "application/alto-error+json": { source: "iana", compressible: !0 },
  "application/alto-networkmap+json": { source: "iana", compressible: !0 },
  "application/alto-networkmapfilter+json": { source: "iana", compressible: !0 },
  "application/alto-updatestreamcontrol+json": { source: "iana", compressible: !0 },
  "application/alto-updatestreamparams+json": { source: "iana", compressible: !0 },
  "application/aml": { source: "iana" },
  "application/andrew-inset": { source: "iana", extensions: ["ez"] },
  "application/applefile": { source: "iana" },
  "application/applixware": { source: "apache", extensions: ["aw"] },
  "application/at+jwt": { source: "iana" },
  "application/atf": { source: "iana" },
  "application/atfx": { source: "iana" },
  "application/atom+xml": { source: "iana", compressible: !0, extensions: ["atom"] },
  "application/atomcat+xml": { source: "iana", compressible: !0, extensions: ["atomcat"] },
  "application/atomdeleted+xml": { source: "iana", compressible: !0, extensions: ["atomdeleted"] },
  "application/atomicmail": { source: "iana" },
  "application/atomsvc+xml": { source: "iana", compressible: !0, extensions: ["atomsvc"] },
  "application/atsc-dwd+xml": { source: "iana", compressible: !0, extensions: ["dwd"] },
  "application/atsc-dynamic-event-message": { source: "iana" },
  "application/atsc-held+xml": { source: "iana", compressible: !0, extensions: ["held"] },
  "application/atsc-rdt+json": { source: "iana", compressible: !0 },
  "application/atsc-rsat+xml": { source: "iana", compressible: !0, extensions: ["rsat"] },
  "application/atxml": { source: "iana" },
  "application/auth-policy+xml": { source: "iana", compressible: !0 },
  "application/bacnet-xdd+zip": { source: "iana", compressible: !1 },
  "application/batch-smtp": { source: "iana" },
  "application/bdoc": { compressible: !1, extensions: ["bdoc"] },
  "application/beep+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/calendar+json": { source: "iana", compressible: !0 },
  "application/calendar+xml": { source: "iana", compressible: !0, extensions: ["xcs"] },
  "application/call-completion": { source: "iana" },
  "application/cals-1840": { source: "iana" },
  "application/captive+json": { source: "iana", compressible: !0 },
  "application/cbor": { source: "iana" },
  "application/cbor-seq": { source: "iana" },
  "application/cccex": { source: "iana" },
  "application/ccmp+xml": { source: "iana", compressible: !0 },
  "application/ccxml+xml": { source: "iana", compressible: !0, extensions: ["ccxml"] },
  "application/cdfx+xml": { source: "iana", compressible: !0, extensions: ["cdfx"] },
  "application/cdmi-capability": { source: "iana", extensions: ["cdmia"] },
  "application/cdmi-container": { source: "iana", extensions: ["cdmic"] },
  "application/cdmi-domain": { source: "iana", extensions: ["cdmid"] },
  "application/cdmi-object": { source: "iana", extensions: ["cdmio"] },
  "application/cdmi-queue": { source: "iana", extensions: ["cdmiq"] },
  "application/cdni": { source: "iana" },
  "application/cea": { source: "iana" },
  "application/cea-2018+xml": { source: "iana", compressible: !0 },
  "application/cellml+xml": { source: "iana", compressible: !0 },
  "application/cfw": { source: "iana" },
  "application/city+json": { source: "iana", compressible: !0 },
  "application/clr": { source: "iana" },
  "application/clue+xml": { source: "iana", compressible: !0 },
  "application/clue_info+xml": { source: "iana", compressible: !0 },
  "application/cms": { source: "iana" },
  "application/cnrp+xml": { source: "iana", compressible: !0 },
  "application/coap-group+json": { source: "iana", compressible: !0 },
  "application/coap-payload": { source: "iana" },
  "application/commonground": { source: "iana" },
  "application/conference-info+xml": { source: "iana", compressible: !0 },
  "application/cose": { source: "iana" },
  "application/cose-key": { source: "iana" },
  "application/cose-key-set": { source: "iana" },
  "application/cpl+xml": { source: "iana", compressible: !0, extensions: ["cpl"] },
  "application/csrattrs": { source: "iana" },
  "application/csta+xml": { source: "iana", compressible: !0 },
  "application/cstadata+xml": { source: "iana", compressible: !0 },
  "application/csvm+json": { source: "iana", compressible: !0 },
  "application/cu-seeme": { source: "apache", extensions: ["cu"] },
  "application/cwt": { source: "iana" },
  "application/cybercash": { source: "iana" },
  "application/dart": { compressible: !0 },
  "application/dash+xml": { source: "iana", compressible: !0, extensions: ["mpd"] },
  "application/dash-patch+xml": { source: "iana", compressible: !0, extensions: ["mpp"] },
  "application/dashdelta": { source: "iana" },
  "application/davmount+xml": { source: "iana", compressible: !0, extensions: ["davmount"] },
  "application/dca-rft": { source: "iana" },
  "application/dcd": { source: "iana" },
  "application/dec-dx": { source: "iana" },
  "application/dialog-info+xml": { source: "iana", compressible: !0 },
  "application/dicom": { source: "iana" },
  "application/dicom+json": { source: "iana", compressible: !0 },
  "application/dicom+xml": { source: "iana", compressible: !0 },
  "application/dii": { source: "iana" },
  "application/dit": { source: "iana" },
  "application/dns": { source: "iana" },
  "application/dns+json": { source: "iana", compressible: !0 },
  "application/dns-message": { source: "iana" },
  "application/docbook+xml": { source: "apache", compressible: !0, extensions: ["dbk"] },
  "application/dots+cbor": { source: "iana" },
  "application/dskpp+xml": { source: "iana", compressible: !0 },
  "application/dssc+der": { source: "iana", extensions: ["dssc"] },
  "application/dssc+xml": { source: "iana", compressible: !0, extensions: ["xdssc"] },
  "application/dvcs": { source: "iana" },
  "application/ecmascript": { source: "iana", compressible: !0, extensions: ["es", "ecma"] },
  "application/edi-consent": { source: "iana" },
  "application/edi-x12": { source: "iana", compressible: !1 },
  "application/edifact": { source: "iana", compressible: !1 },
  "application/efi": { source: "iana" },
  "application/elm+json": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/elm+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.cap+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/emergencycalldata.comment+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.control+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.deviceinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.ecall.msd": { source: "iana" },
  "application/emergencycalldata.providerinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.serviceinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.subscriberinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.veds+xml": { source: "iana", compressible: !0 },
  "application/emma+xml": { source: "iana", compressible: !0, extensions: ["emma"] },
  "application/emotionml+xml": { source: "iana", compressible: !0, extensions: ["emotionml"] },
  "application/encaprtp": { source: "iana" },
  "application/epp+xml": { source: "iana", compressible: !0 },
  "application/epub+zip": { source: "iana", compressible: !1, extensions: ["epub"] },
  "application/eshop": { source: "iana" },
  "application/exi": { source: "iana", extensions: ["exi"] },
  "application/expect-ct-report+json": { source: "iana", compressible: !0 },
  "application/express": { source: "iana", extensions: ["exp"] },
  "application/fastinfoset": { source: "iana" },
  "application/fastsoap": { source: "iana" },
  "application/fdt+xml": { source: "iana", compressible: !0, extensions: ["fdt"] },
  "application/fhir+json": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/fhir+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/fido.trusted-apps+json": { compressible: !0 },
  "application/fits": { source: "iana" },
  "application/flexfec": { source: "iana" },
  "application/font-sfnt": { source: "iana" },
  "application/font-tdpfr": { source: "iana", extensions: ["pfr"] },
  "application/font-woff": { source: "iana", compressible: !1 },
  "application/framework-attributes+xml": { source: "iana", compressible: !0 },
  "application/geo+json": { source: "iana", compressible: !0, extensions: ["geojson"] },
  "application/geo+json-seq": { source: "iana" },
  "application/geopackage+sqlite3": { source: "iana" },
  "application/geoxacml+xml": { source: "iana", compressible: !0 },
  "application/gltf-buffer": { source: "iana" },
  "application/gml+xml": { source: "iana", compressible: !0, extensions: ["gml"] },
  "application/gpx+xml": { source: "apache", compressible: !0, extensions: ["gpx"] },
  "application/gxf": { source: "apache", extensions: ["gxf"] },
  "application/gzip": { source: "iana", compressible: !1, extensions: ["gz"] },
  "application/h224": { source: "iana" },
  "application/held+xml": { source: "iana", compressible: !0 },
  "application/hjson": { extensions: ["hjson"] },
  "application/http": { source: "iana" },
  "application/hyperstudio": { source: "iana", extensions: ["stk"] },
  "application/ibe-key-request+xml": { source: "iana", compressible: !0 },
  "application/ibe-pkg-reply+xml": { source: "iana", compressible: !0 },
  "application/ibe-pp-data": { source: "iana" },
  "application/iges": { source: "iana" },
  "application/im-iscomposing+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/index": { source: "iana" },
  "application/index.cmd": { source: "iana" },
  "application/index.obj": { source: "iana" },
  "application/index.response": { source: "iana" },
  "application/index.vnd": { source: "iana" },
  "application/inkml+xml": { source: "iana", compressible: !0, extensions: ["ink", "inkml"] },
  "application/iotp": { source: "iana" },
  "application/ipfix": { source: "iana", extensions: ["ipfix"] },
  "application/ipp": { source: "iana" },
  "application/isup": { source: "iana" },
  "application/its+xml": { source: "iana", compressible: !0, extensions: ["its"] },
  "application/java-archive": { source: "apache", compressible: !1, extensions: ["jar", "war", "ear"] },
  "application/java-serialized-object": { source: "apache", compressible: !1, extensions: ["ser"] },
  "application/java-vm": { source: "apache", compressible: !1, extensions: ["class"] },
  "application/javascript": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["js", "mjs"] },
  "application/jf2feed+json": { source: "iana", compressible: !0 },
  "application/jose": { source: "iana" },
  "application/jose+json": { source: "iana", compressible: !0 },
  "application/jrd+json": { source: "iana", compressible: !0 },
  "application/jscalendar+json": { source: "iana", compressible: !0 },
  "application/json": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["json", "map"] },
  "application/json-patch+json": { source: "iana", compressible: !0 },
  "application/json-seq": { source: "iana" },
  "application/json5": { extensions: ["json5"] },
  "application/jsonml+json": { source: "apache", compressible: !0, extensions: ["jsonml"] },
  "application/jwk+json": { source: "iana", compressible: !0 },
  "application/jwk-set+json": { source: "iana", compressible: !0 },
  "application/jwt": { source: "iana" },
  "application/kpml-request+xml": { source: "iana", compressible: !0 },
  "application/kpml-response+xml": { source: "iana", compressible: !0 },
  "application/ld+json": { source: "iana", compressible: !0, extensions: ["jsonld"] },
  "application/lgr+xml": { source: "iana", compressible: !0, extensions: ["lgr"] },
  "application/link-format": { source: "iana" },
  "application/load-control+xml": { source: "iana", compressible: !0 },
  "application/lost+xml": { source: "iana", compressible: !0, extensions: ["lostxml"] },
  "application/lostsync+xml": { source: "iana", compressible: !0 },
  "application/lpf+zip": { source: "iana", compressible: !1 },
  "application/lxf": { source: "iana" },
  "application/mac-binhex40": { source: "iana", extensions: ["hqx"] },
  "application/mac-compactpro": { source: "apache", extensions: ["cpt"] },
  "application/macwriteii": { source: "iana" },
  "application/mads+xml": { source: "iana", compressible: !0, extensions: ["mads"] },
  "application/manifest+json": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["webmanifest"] },
  "application/marc": { source: "iana", extensions: ["mrc"] },
  "application/marcxml+xml": { source: "iana", compressible: !0, extensions: ["mrcx"] },
  "application/mathematica": { source: "iana", extensions: ["ma", "nb", "mb"] },
  "application/mathml+xml": { source: "iana", compressible: !0, extensions: ["mathml"] },
  "application/mathml-content+xml": { source: "iana", compressible: !0 },
  "application/mathml-presentation+xml": { source: "iana", compressible: !0 },
  "application/mbms-associated-procedure-description+xml": { source: "iana", compressible: !0 },
  "application/mbms-deregister+xml": { source: "iana", compressible: !0 },
  "application/mbms-envelope+xml": { source: "iana", compressible: !0 },
  "application/mbms-msk+xml": { source: "iana", compressible: !0 },
  "application/mbms-msk-response+xml": { source: "iana", compressible: !0 },
  "application/mbms-protection-description+xml": { source: "iana", compressible: !0 },
  "application/mbms-reception-report+xml": { source: "iana", compressible: !0 },
  "application/mbms-register+xml": { source: "iana", compressible: !0 },
  "application/mbms-register-response+xml": { source: "iana", compressible: !0 },
  "application/mbms-schedule+xml": { source: "iana", compressible: !0 },
  "application/mbms-user-service-description+xml": { source: "iana", compressible: !0 },
  "application/mbox": { source: "iana", extensions: ["mbox"] },
  "application/media-policy-dataset+xml": { source: "iana", compressible: !0, extensions: ["mpf"] },
  "application/media_control+xml": { source: "iana", compressible: !0 },
  "application/mediaservercontrol+xml": { source: "iana", compressible: !0, extensions: ["mscml"] },
  "application/merge-patch+json": { source: "iana", compressible: !0 },
  "application/metalink+xml": { source: "apache", compressible: !0, extensions: ["metalink"] },
  "application/metalink4+xml": { source: "iana", compressible: !0, extensions: ["meta4"] },
  "application/mets+xml": { source: "iana", compressible: !0, extensions: ["mets"] },
  "application/mf4": { source: "iana" },
  "application/mikey": { source: "iana" },
  "application/mipc": { source: "iana" },
  "application/missing-blocks+cbor-seq": { source: "iana" },
  "application/mmt-aei+xml": { source: "iana", compressible: !0, extensions: ["maei"] },
  "application/mmt-usd+xml": { source: "iana", compressible: !0, extensions: ["musd"] },
  "application/mods+xml": { source: "iana", compressible: !0, extensions: ["mods"] },
  "application/moss-keys": { source: "iana" },
  "application/moss-signature": { source: "iana" },
  "application/mosskey-data": { source: "iana" },
  "application/mosskey-request": { source: "iana" },
  "application/mp21": { source: "iana", extensions: ["m21", "mp21"] },
  "application/mp4": { source: "iana", extensions: ["mp4s", "m4p"] },
  "application/mpeg4-generic": { source: "iana" },
  "application/mpeg4-iod": { source: "iana" },
  "application/mpeg4-iod-xmt": { source: "iana" },
  "application/mrb-consumer+xml": { source: "iana", compressible: !0 },
  "application/mrb-publish+xml": { source: "iana", compressible: !0 },
  "application/msc-ivr+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/msc-mixer+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/msword": { source: "iana", compressible: !1, extensions: ["doc", "dot"] },
  "application/mud+json": { source: "iana", compressible: !0 },
  "application/multipart-core": { source: "iana" },
  "application/mxf": { source: "iana", extensions: ["mxf"] },
  "application/n-quads": { source: "iana", extensions: ["nq"] },
  "application/n-triples": { source: "iana", extensions: ["nt"] },
  "application/nasdata": { source: "iana" },
  "application/news-checkgroups": { source: "iana", charset: "US-ASCII" },
  "application/news-groupinfo": { source: "iana", charset: "US-ASCII" },
  "application/news-transmission": { source: "iana" },
  "application/nlsml+xml": { source: "iana", compressible: !0 },
  "application/node": { source: "iana", extensions: ["cjs"] },
  "application/nss": { source: "iana" },
  "application/oauth-authz-req+jwt": { source: "iana" },
  "application/oblivious-dns-message": { source: "iana" },
  "application/ocsp-request": { source: "iana" },
  "application/ocsp-response": { source: "iana" },
  "application/octet-stream": { source: "iana", compressible: !1, extensions: ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"] },
  "application/oda": { source: "iana", extensions: ["oda"] },
  "application/odm+xml": { source: "iana", compressible: !0 },
  "application/odx": { source: "iana" },
  "application/oebps-package+xml": { source: "iana", compressible: !0, extensions: ["opf"] },
  "application/ogg": { source: "iana", compressible: !1, extensions: ["ogx"] },
  "application/omdoc+xml": { source: "apache", compressible: !0, extensions: ["omdoc"] },
  "application/onenote": { source: "apache", extensions: ["onetoc", "onetoc2", "onetmp", "onepkg"] },
  "application/opc-nodeset+xml": { source: "iana", compressible: !0 },
  "application/oscore": { source: "iana" },
  "application/oxps": { source: "iana", extensions: ["oxps"] },
  "application/p21": { source: "iana" },
  "application/p21+zip": { source: "iana", compressible: !1 },
  "application/p2p-overlay+xml": { source: "iana", compressible: !0, extensions: ["relo"] },
  "application/parityfec": { source: "iana" },
  "application/passport": { source: "iana" },
  "application/patch-ops-error+xml": { source: "iana", compressible: !0, extensions: ["xer"] },
  "application/pdf": { source: "iana", compressible: !1, extensions: ["pdf"] },
  "application/pdx": { source: "iana" },
  "application/pem-certificate-chain": { source: "iana" },
  "application/pgp-encrypted": { source: "iana", compressible: !1, extensions: ["pgp"] },
  "application/pgp-keys": { source: "iana", extensions: ["asc"] },
  "application/pgp-signature": { source: "iana", extensions: ["asc", "sig"] },
  "application/pics-rules": { source: "apache", extensions: ["prf"] },
  "application/pidf+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/pidf-diff+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/pkcs10": { source: "iana", extensions: ["p10"] },
  "application/pkcs12": { source: "iana" },
  "application/pkcs7-mime": { source: "iana", extensions: ["p7m", "p7c"] },
  "application/pkcs7-signature": { source: "iana", extensions: ["p7s"] },
  "application/pkcs8": { source: "iana", extensions: ["p8"] },
  "application/pkcs8-encrypted": { source: "iana" },
  "application/pkix-attr-cert": { source: "iana", extensions: ["ac"] },
  "application/pkix-cert": { source: "iana", extensions: ["cer"] },
  "application/pkix-crl": { source: "iana", extensions: ["crl"] },
  "application/pkix-pkipath": { source: "iana", extensions: ["pkipath"] },
  "application/pkixcmp": { source: "iana", extensions: ["pki"] },
  "application/pls+xml": { source: "iana", compressible: !0, extensions: ["pls"] },
  "application/poc-settings+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/postscript": { source: "iana", compressible: !0, extensions: ["ai", "eps", "ps"] },
  "application/ppsp-tracker+json": { source: "iana", compressible: !0 },
  "application/problem+json": { source: "iana", compressible: !0 },
  "application/problem+xml": { source: "iana", compressible: !0 },
  "application/provenance+xml": { source: "iana", compressible: !0, extensions: ["provx"] },
  "application/prs.alvestrand.titrax-sheet": { source: "iana" },
  "application/prs.cww": { source: "iana", extensions: ["cww"] },
  "application/prs.cyn": { source: "iana", charset: "7-BIT" },
  "application/prs.hpub+zip": { source: "iana", compressible: !1 },
  "application/prs.nprend": { source: "iana" },
  "application/prs.plucker": { source: "iana" },
  "application/prs.rdf-xml-crypt": { source: "iana" },
  "application/prs.xsf+xml": { source: "iana", compressible: !0 },
  "application/pskc+xml": { source: "iana", compressible: !0, extensions: ["pskcxml"] },
  "application/pvd+json": { source: "iana", compressible: !0 },
  "application/qsig": { source: "iana" },
  "application/raml+yaml": { compressible: !0, extensions: ["raml"] },
  "application/raptorfec": { source: "iana" },
  "application/rdap+json": { source: "iana", compressible: !0 },
  "application/rdf+xml": { source: "iana", compressible: !0, extensions: ["rdf", "owl"] },
  "application/reginfo+xml": { source: "iana", compressible: !0, extensions: ["rif"] },
  "application/relax-ng-compact-syntax": { source: "iana", extensions: ["rnc"] },
  "application/remote-printing": { source: "iana" },
  "application/reputon+json": { source: "iana", compressible: !0 },
  "application/resource-lists+xml": { source: "iana", compressible: !0, extensions: ["rl"] },
  "application/resource-lists-diff+xml": { source: "iana", compressible: !0, extensions: ["rld"] },
  "application/rfc+xml": { source: "iana", compressible: !0 },
  "application/riscos": { source: "iana" },
  "application/rlmi+xml": { source: "iana", compressible: !0 },
  "application/rls-services+xml": { source: "iana", compressible: !0, extensions: ["rs"] },
  "application/route-apd+xml": { source: "iana", compressible: !0, extensions: ["rapd"] },
  "application/route-s-tsid+xml": { source: "iana", compressible: !0, extensions: ["sls"] },
  "application/route-usd+xml": { source: "iana", compressible: !0, extensions: ["rusd"] },
  "application/rpki-ghostbusters": { source: "iana", extensions: ["gbr"] },
  "application/rpki-manifest": { source: "iana", extensions: ["mft"] },
  "application/rpki-publication": { source: "iana" },
  "application/rpki-roa": { source: "iana", extensions: ["roa"] },
  "application/rpki-updown": { source: "iana" },
  "application/rsd+xml": { source: "apache", compressible: !0, extensions: ["rsd"] },
  "application/rss+xml": { source: "apache", compressible: !0, extensions: ["rss"] },
  "application/rtf": { source: "iana", compressible: !0, extensions: ["rtf"] },
  "application/rtploopback": { source: "iana" },
  "application/rtx": { source: "iana" },
  "application/samlassertion+xml": { source: "iana", compressible: !0 },
  "application/samlmetadata+xml": { source: "iana", compressible: !0 },
  "application/sarif+json": { source: "iana", compressible: !0 },
  "application/sarif-external-properties+json": { source: "iana", compressible: !0 },
  "application/sbe": { source: "iana" },
  "application/sbml+xml": { source: "iana", compressible: !0, extensions: ["sbml"] },
  "application/scaip+xml": { source: "iana", compressible: !0 },
  "application/scim+json": { source: "iana", compressible: !0 },
  "application/scvp-cv-request": { source: "iana", extensions: ["scq"] },
  "application/scvp-cv-response": { source: "iana", extensions: ["scs"] },
  "application/scvp-vp-request": { source: "iana", extensions: ["spq"] },
  "application/scvp-vp-response": { source: "iana", extensions: ["spp"] },
  "application/sdp": { source: "iana", extensions: ["sdp"] },
  "application/secevent+jwt": { source: "iana" },
  "application/senml+cbor": { source: "iana" },
  "application/senml+json": { source: "iana", compressible: !0 },
  "application/senml+xml": { source: "iana", compressible: !0, extensions: ["senmlx"] },
  "application/senml-etch+cbor": { source: "iana" },
  "application/senml-etch+json": { source: "iana", compressible: !0 },
  "application/senml-exi": { source: "iana" },
  "application/sensml+cbor": { source: "iana" },
  "application/sensml+json": { source: "iana", compressible: !0 },
  "application/sensml+xml": { source: "iana", compressible: !0, extensions: ["sensmlx"] },
  "application/sensml-exi": { source: "iana" },
  "application/sep+xml": { source: "iana", compressible: !0 },
  "application/sep-exi": { source: "iana" },
  "application/session-info": { source: "iana" },
  "application/set-payment": { source: "iana" },
  "application/set-payment-initiation": { source: "iana", extensions: ["setpay"] },
  "application/set-registration": { source: "iana" },
  "application/set-registration-initiation": { source: "iana", extensions: ["setreg"] },
  "application/sgml": { source: "iana" },
  "application/sgml-open-catalog": { source: "iana" },
  "application/shf+xml": { source: "iana", compressible: !0, extensions: ["shf"] },
  "application/sieve": { source: "iana", extensions: ["siv", "sieve"] },
  "application/simple-filter+xml": { source: "iana", compressible: !0 },
  "application/simple-message-summary": { source: "iana" },
  "application/simplesymbolcontainer": { source: "iana" },
  "application/sipc": { source: "iana" },
  "application/slate": { source: "iana" },
  "application/smil": { source: "iana" },
  "application/smil+xml": { source: "iana", compressible: !0, extensions: ["smi", "smil"] },
  "application/smpte336m": { source: "iana" },
  "application/soap+fastinfoset": { source: "iana" },
  "application/soap+xml": { source: "iana", compressible: !0 },
  "application/sparql-query": { source: "iana", extensions: ["rq"] },
  "application/sparql-results+xml": { source: "iana", compressible: !0, extensions: ["srx"] },
  "application/spdx+json": { source: "iana", compressible: !0 },
  "application/spirits-event+xml": { source: "iana", compressible: !0 },
  "application/sql": { source: "iana" },
  "application/srgs": { source: "iana", extensions: ["gram"] },
  "application/srgs+xml": { source: "iana", compressible: !0, extensions: ["grxml"] },
  "application/sru+xml": { source: "iana", compressible: !0, extensions: ["sru"] },
  "application/ssdl+xml": { source: "apache", compressible: !0, extensions: ["ssdl"] },
  "application/ssml+xml": { source: "iana", compressible: !0, extensions: ["ssml"] },
  "application/stix+json": { source: "iana", compressible: !0 },
  "application/swid+xml": { source: "iana", compressible: !0, extensions: ["swidtag"] },
  "application/tamp-apex-update": { source: "iana" },
  "application/tamp-apex-update-confirm": { source: "iana" },
  "application/tamp-community-update": { source: "iana" },
  "application/tamp-community-update-confirm": { source: "iana" },
  "application/tamp-error": { source: "iana" },
  "application/tamp-sequence-adjust": { source: "iana" },
  "application/tamp-sequence-adjust-confirm": { source: "iana" },
  "application/tamp-status-query": { source: "iana" },
  "application/tamp-status-response": { source: "iana" },
  "application/tamp-update": { source: "iana" },
  "application/tamp-update-confirm": { source: "iana" },
  "application/tar": { compressible: !0 },
  "application/taxii+json": { source: "iana", compressible: !0 },
  "application/td+json": { source: "iana", compressible: !0 },
  "application/tei+xml": { source: "iana", compressible: !0, extensions: ["tei", "teicorpus"] },
  "application/tetra_isi": { source: "iana" },
  "application/thraud+xml": { source: "iana", compressible: !0, extensions: ["tfi"] },
  "application/timestamp-query": { source: "iana" },
  "application/timestamp-reply": { source: "iana" },
  "application/timestamped-data": { source: "iana", extensions: ["tsd"] },
  "application/tlsrpt+gzip": { source: "iana" },
  "application/tlsrpt+json": { source: "iana", compressible: !0 },
  "application/tnauthlist": { source: "iana" },
  "application/token-introspection+jwt": { source: "iana" },
  "application/toml": { compressible: !0, extensions: ["toml"] },
  "application/trickle-ice-sdpfrag": { source: "iana" },
  "application/trig": { source: "iana", extensions: ["trig"] },
  "application/ttml+xml": { source: "iana", compressible: !0, extensions: ["ttml"] },
  "application/tve-trigger": { source: "iana" },
  "application/tzif": { source: "iana" },
  "application/tzif-leap": { source: "iana" },
  "application/ubjson": { compressible: !1, extensions: ["ubj"] },
  "application/ulpfec": { source: "iana" },
  "application/urc-grpsheet+xml": { source: "iana", compressible: !0 },
  "application/urc-ressheet+xml": { source: "iana", compressible: !0, extensions: ["rsheet"] },
  "application/urc-targetdesc+xml": { source: "iana", compressible: !0, extensions: ["td"] },
  "application/urc-uisocketdesc+xml": { source: "iana", compressible: !0 },
  "application/vcard+json": { source: "iana", compressible: !0 },
  "application/vcard+xml": { source: "iana", compressible: !0 },
  "application/vemmi": { source: "iana" },
  "application/vividence.scriptfile": { source: "apache" },
  "application/vnd.1000minds.decision-model+xml": { source: "iana", compressible: !0, extensions: ["1km"] },
  "application/vnd.3gpp-prose+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp-prose-pc3ch+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp-v2x-local-service-information": { source: "iana" },
  "application/vnd.3gpp.5gnas": { source: "iana" },
  "application/vnd.3gpp.access-transfer-events+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.bsf+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.gmop+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.gtpc": { source: "iana" },
  "application/vnd.3gpp.interworking-data": { source: "iana" },
  "application/vnd.3gpp.lpp": { source: "iana" },
  "application/vnd.3gpp.mc-signalling-ear": { source: "iana" },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-payload": { source: "iana" },
  "application/vnd.3gpp.mcdata-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-signalling": { source: "iana" },
  "application/vnd.3gpp.mcdata-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-floor-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-location-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-signed+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-location-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mid-call+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.ngap": { source: "iana" },
  "application/vnd.3gpp.pfcp": { source: "iana" },
  "application/vnd.3gpp.pic-bw-large": { source: "iana", extensions: ["plb"] },
  "application/vnd.3gpp.pic-bw-small": { source: "iana", extensions: ["psb"] },
  "application/vnd.3gpp.pic-bw-var": { source: "iana", extensions: ["pvb"] },
  "application/vnd.3gpp.s1ap": { source: "iana" },
  "application/vnd.3gpp.sms": { source: "iana" },
  "application/vnd.3gpp.sms+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.srvcc-ext+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.srvcc-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.state-and-event-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.ussd+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp2.bcmcsinfo+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp2.sms": { source: "iana" },
  "application/vnd.3gpp2.tcap": { source: "iana", extensions: ["tcap"] },
  "application/vnd.3lightssoftware.imagescal": { source: "iana" },
  "application/vnd.3m.post-it-notes": { source: "iana", extensions: ["pwn"] },
  "application/vnd.accpac.simply.aso": { source: "iana", extensions: ["aso"] },
  "application/vnd.accpac.simply.imp": { source: "iana", extensions: ["imp"] },
  "application/vnd.acucobol": { source: "iana", extensions: ["acu"] },
  "application/vnd.acucorp": { source: "iana", extensions: ["atc", "acutc"] },
  "application/vnd.adobe.air-application-installer-package+zip": { source: "apache", compressible: !1, extensions: ["air"] },
  "application/vnd.adobe.flash.movie": { source: "iana" },
  "application/vnd.adobe.formscentral.fcdt": { source: "iana", extensions: ["fcdt"] },
  "application/vnd.adobe.fxp": { source: "iana", extensions: ["fxp", "fxpl"] },
  "application/vnd.adobe.partial-upload": { source: "iana" },
  "application/vnd.adobe.xdp+xml": { source: "iana", compressible: !0, extensions: ["xdp"] },
  "application/vnd.adobe.xfdf": { source: "iana", extensions: ["xfdf"] },
  "application/vnd.aether.imp": { source: "iana" },
  "application/vnd.afpc.afplinedata": { source: "iana" },
  "application/vnd.afpc.afplinedata-pagedef": { source: "iana" },
  "application/vnd.afpc.cmoca-cmresource": { source: "iana" },
  "application/vnd.afpc.foca-charset": { source: "iana" },
  "application/vnd.afpc.foca-codedfont": { source: "iana" },
  "application/vnd.afpc.foca-codepage": { source: "iana" },
  "application/vnd.afpc.modca": { source: "iana" },
  "application/vnd.afpc.modca-cmtable": { source: "iana" },
  "application/vnd.afpc.modca-formdef": { source: "iana" },
  "application/vnd.afpc.modca-mediummap": { source: "iana" },
  "application/vnd.afpc.modca-objectcontainer": { source: "iana" },
  "application/vnd.afpc.modca-overlay": { source: "iana" },
  "application/vnd.afpc.modca-pagesegment": { source: "iana" },
  "application/vnd.age": { source: "iana", extensions: ["age"] },
  "application/vnd.ah-barcode": { source: "iana" },
  "application/vnd.ahead.space": { source: "iana", extensions: ["ahead"] },
  "application/vnd.airzip.filesecure.azf": { source: "iana", extensions: ["azf"] },
  "application/vnd.airzip.filesecure.azs": { source: "iana", extensions: ["azs"] },
  "application/vnd.amadeus+json": { source: "iana", compressible: !0 },
  "application/vnd.amazon.ebook": { source: "apache", extensions: ["azw"] },
  "application/vnd.amazon.mobi8-ebook": { source: "iana" },
  "application/vnd.americandynamics.acc": { source: "iana", extensions: ["acc"] },
  "application/vnd.amiga.ami": { source: "iana", extensions: ["ami"] },
  "application/vnd.amundsen.maze+xml": { source: "iana", compressible: !0 },
  "application/vnd.android.ota": { source: "iana" },
  "application/vnd.android.package-archive": { source: "apache", compressible: !1, extensions: ["apk"] },
  "application/vnd.anki": { source: "iana" },
  "application/vnd.anser-web-certificate-issue-initiation": { source: "iana", extensions: ["cii"] },
  "application/vnd.anser-web-funds-transfer-initiation": { source: "apache", extensions: ["fti"] },
  "application/vnd.antix.game-component": { source: "iana", extensions: ["atx"] },
  "application/vnd.apache.arrow.file": { source: "iana" },
  "application/vnd.apache.arrow.stream": { source: "iana" },
  "application/vnd.apache.thrift.binary": { source: "iana" },
  "application/vnd.apache.thrift.compact": { source: "iana" },
  "application/vnd.apache.thrift.json": { source: "iana" },
  "application/vnd.api+json": { source: "iana", compressible: !0 },
  "application/vnd.aplextor.warrp+json": { source: "iana", compressible: !0 },
  "application/vnd.apothekende.reservation+json": { source: "iana", compressible: !0 },
  "application/vnd.apple.installer+xml": { source: "iana", compressible: !0, extensions: ["mpkg"] },
  "application/vnd.apple.keynote": { source: "iana", extensions: ["key"] },
  "application/vnd.apple.mpegurl": { source: "iana", extensions: ["m3u8"] },
  "application/vnd.apple.numbers": { source: "iana", extensions: ["numbers"] },
  "application/vnd.apple.pages": { source: "iana", extensions: ["pages"] },
  "application/vnd.apple.pkpass": { compressible: !1, extensions: ["pkpass"] },
  "application/vnd.arastra.swi": { source: "iana" },
  "application/vnd.aristanetworks.swi": { source: "iana", extensions: ["swi"] },
  "application/vnd.artisan+json": { source: "iana", compressible: !0 },
  "application/vnd.artsquare": { source: "iana" },
  "application/vnd.astraea-software.iota": { source: "iana", extensions: ["iota"] },
  "application/vnd.audiograph": { source: "iana", extensions: ["aep"] },
  "application/vnd.autopackage": { source: "iana" },
  "application/vnd.avalon+json": { source: "iana", compressible: !0 },
  "application/vnd.avistar+xml": { source: "iana", compressible: !0 },
  "application/vnd.balsamiq.bmml+xml": { source: "iana", compressible: !0, extensions: ["bmml"] },
  "application/vnd.balsamiq.bmpr": { source: "iana" },
  "application/vnd.banana-accounting": { source: "iana" },
  "application/vnd.bbf.usp.error": { source: "iana" },
  "application/vnd.bbf.usp.msg": { source: "iana" },
  "application/vnd.bbf.usp.msg+json": { source: "iana", compressible: !0 },
  "application/vnd.bekitzur-stech+json": { source: "iana", compressible: !0 },
  "application/vnd.bint.med-content": { source: "iana" },
  "application/vnd.biopax.rdf+xml": { source: "iana", compressible: !0 },
  "application/vnd.blink-idb-value-wrapper": { source: "iana" },
  "application/vnd.blueice.multipass": { source: "iana", extensions: ["mpm"] },
  "application/vnd.bluetooth.ep.oob": { source: "iana" },
  "application/vnd.bluetooth.le.oob": { source: "iana" },
  "application/vnd.bmi": { source: "iana", extensions: ["bmi"] },
  "application/vnd.bpf": { source: "iana" },
  "application/vnd.bpf3": { source: "iana" },
  "application/vnd.businessobjects": { source: "iana", extensions: ["rep"] },
  "application/vnd.byu.uapi+json": { source: "iana", compressible: !0 },
  "application/vnd.cab-jscript": { source: "iana" },
  "application/vnd.canon-cpdl": { source: "iana" },
  "application/vnd.canon-lips": { source: "iana" },
  "application/vnd.capasystems-pg+json": { source: "iana", compressible: !0 },
  "application/vnd.cendio.thinlinc.clientconf": { source: "iana" },
  "application/vnd.century-systems.tcp_stream": { source: "iana" },
  "application/vnd.chemdraw+xml": { source: "iana", compressible: !0, extensions: ["cdxml"] },
  "application/vnd.chess-pgn": { source: "iana" },
  "application/vnd.chipnuts.karaoke-mmd": { source: "iana", extensions: ["mmd"] },
  "application/vnd.ciedi": { source: "iana" },
  "application/vnd.cinderella": { source: "iana", extensions: ["cdy"] },
  "application/vnd.cirpack.isdn-ext": { source: "iana" },
  "application/vnd.citationstyles.style+xml": { source: "iana", compressible: !0, extensions: ["csl"] },
  "application/vnd.claymore": { source: "iana", extensions: ["cla"] },
  "application/vnd.cloanto.rp9": { source: "iana", extensions: ["rp9"] },
  "application/vnd.clonk.c4group": { source: "iana", extensions: ["c4g", "c4d", "c4f", "c4p", "c4u"] },
  "application/vnd.cluetrust.cartomobile-config": { source: "iana", extensions: ["c11amc"] },
  "application/vnd.cluetrust.cartomobile-config-pkg": { source: "iana", extensions: ["c11amz"] },
  "application/vnd.coffeescript": { source: "iana" },
  "application/vnd.collabio.xodocuments.document": { source: "iana" },
  "application/vnd.collabio.xodocuments.document-template": { source: "iana" },
  "application/vnd.collabio.xodocuments.presentation": { source: "iana" },
  "application/vnd.collabio.xodocuments.presentation-template": { source: "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet": { source: "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet-template": { source: "iana" },
  "application/vnd.collection+json": { source: "iana", compressible: !0 },
  "application/vnd.collection.doc+json": { source: "iana", compressible: !0 },
  "application/vnd.collection.next+json": { source: "iana", compressible: !0 },
  "application/vnd.comicbook+zip": { source: "iana", compressible: !1 },
  "application/vnd.comicbook-rar": { source: "iana" },
  "application/vnd.commerce-battelle": { source: "iana" },
  "application/vnd.commonspace": { source: "iana", extensions: ["csp"] },
  "application/vnd.contact.cmsg": { source: "iana", extensions: ["cdbcmsg"] },
  "application/vnd.coreos.ignition+json": { source: "iana", compressible: !0 },
  "application/vnd.cosmocaller": { source: "iana", extensions: ["cmc"] },
  "application/vnd.crick.clicker": { source: "iana", extensions: ["clkx"] },
  "application/vnd.crick.clicker.keyboard": { source: "iana", extensions: ["clkk"] },
  "application/vnd.crick.clicker.palette": { source: "iana", extensions: ["clkp"] },
  "application/vnd.crick.clicker.template": { source: "iana", extensions: ["clkt"] },
  "application/vnd.crick.clicker.wordbank": { source: "iana", extensions: ["clkw"] },
  "application/vnd.criticaltools.wbs+xml": { source: "iana", compressible: !0, extensions: ["wbs"] },
  "application/vnd.cryptii.pipe+json": { source: "iana", compressible: !0 },
  "application/vnd.crypto-shade-file": { source: "iana" },
  "application/vnd.cryptomator.encrypted": { source: "iana" },
  "application/vnd.cryptomator.vault": { source: "iana" },
  "application/vnd.ctc-posml": { source: "iana", extensions: ["pml"] },
  "application/vnd.ctct.ws+xml": { source: "iana", compressible: !0 },
  "application/vnd.cups-pdf": { source: "iana" },
  "application/vnd.cups-postscript": { source: "iana" },
  "application/vnd.cups-ppd": { source: "iana", extensions: ["ppd"] },
  "application/vnd.cups-raster": { source: "iana" },
  "application/vnd.cups-raw": { source: "iana" },
  "application/vnd.curl": { source: "iana" },
  "application/vnd.curl.car": { source: "apache", extensions: ["car"] },
  "application/vnd.curl.pcurl": { source: "apache", extensions: ["pcurl"] },
  "application/vnd.cyan.dean.root+xml": { source: "iana", compressible: !0 },
  "application/vnd.cybank": { source: "iana" },
  "application/vnd.cyclonedx+json": { source: "iana", compressible: !0 },
  "application/vnd.cyclonedx+xml": { source: "iana", compressible: !0 },
  "application/vnd.d2l.coursepackage1p0+zip": { source: "iana", compressible: !1 },
  "application/vnd.d3m-dataset": { source: "iana" },
  "application/vnd.d3m-problem": { source: "iana" },
  "application/vnd.dart": { source: "iana", compressible: !0, extensions: ["dart"] },
  "application/vnd.data-vision.rdz": { source: "iana", extensions: ["rdz"] },
  "application/vnd.datapackage+json": { source: "iana", compressible: !0 },
  "application/vnd.dataresource+json": { source: "iana", compressible: !0 },
  "application/vnd.dbf": { source: "iana", extensions: ["dbf"] },
  "application/vnd.debian.binary-package": { source: "iana" },
  "application/vnd.dece.data": { source: "iana", extensions: ["uvf", "uvvf", "uvd", "uvvd"] },
  "application/vnd.dece.ttml+xml": { source: "iana", compressible: !0, extensions: ["uvt", "uvvt"] },
  "application/vnd.dece.unspecified": { source: "iana", extensions: ["uvx", "uvvx"] },
  "application/vnd.dece.zip": { source: "iana", extensions: ["uvz", "uvvz"] },
  "application/vnd.denovo.fcselayout-link": { source: "iana", extensions: ["fe_launch"] },
  "application/vnd.desmume.movie": { source: "iana" },
  "application/vnd.dir-bi.plate-dl-nosuffix": { source: "iana" },
  "application/vnd.dm.delegation+xml": { source: "iana", compressible: !0 },
  "application/vnd.dna": { source: "iana", extensions: ["dna"] },
  "application/vnd.document+json": { source: "iana", compressible: !0 },
  "application/vnd.dolby.mlp": { source: "apache", extensions: ["mlp"] },
  "application/vnd.dolby.mobile.1": { source: "iana" },
  "application/vnd.dolby.mobile.2": { source: "iana" },
  "application/vnd.doremir.scorecloud-binary-document": { source: "iana" },
  "application/vnd.dpgraph": { source: "iana", extensions: ["dpg"] },
  "application/vnd.dreamfactory": { source: "iana", extensions: ["dfac"] },
  "application/vnd.drive+json": { source: "iana", compressible: !0 },
  "application/vnd.ds-keypoint": { source: "apache", extensions: ["kpxx"] },
  "application/vnd.dtg.local": { source: "iana" },
  "application/vnd.dtg.local.flash": { source: "iana" },
  "application/vnd.dtg.local.html": { source: "iana" },
  "application/vnd.dvb.ait": { source: "iana", extensions: ["ait"] },
  "application/vnd.dvb.dvbisl+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.dvbj": { source: "iana" },
  "application/vnd.dvb.esgcontainer": { source: "iana" },
  "application/vnd.dvb.ipdcdftnotifaccess": { source: "iana" },
  "application/vnd.dvb.ipdcesgaccess": { source: "iana" },
  "application/vnd.dvb.ipdcesgaccess2": { source: "iana" },
  "application/vnd.dvb.ipdcesgpdd": { source: "iana" },
  "application/vnd.dvb.ipdcroaming": { source: "iana" },
  "application/vnd.dvb.iptv.alfec-base": { source: "iana" },
  "application/vnd.dvb.iptv.alfec-enhancement": { source: "iana" },
  "application/vnd.dvb.notif-aggregate-root+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-container+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-generic+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-msglist+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-registration-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-registration-response+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-init+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.pfr": { source: "iana" },
  "application/vnd.dvb.service": { source: "iana", extensions: ["svc"] },
  "application/vnd.dxr": { source: "iana" },
  "application/vnd.dynageo": { source: "iana", extensions: ["geo"] },
  "application/vnd.dzr": { source: "iana" },
  "application/vnd.easykaraoke.cdgdownload": { source: "iana" },
  "application/vnd.ecdis-update": { source: "iana" },
  "application/vnd.ecip.rlp": { source: "iana" },
  "application/vnd.eclipse.ditto+json": { source: "iana", compressible: !0 },
  "application/vnd.ecowin.chart": { source: "iana", extensions: ["mag"] },
  "application/vnd.ecowin.filerequest": { source: "iana" },
  "application/vnd.ecowin.fileupdate": { source: "iana" },
  "application/vnd.ecowin.series": { source: "iana" },
  "application/vnd.ecowin.seriesrequest": { source: "iana" },
  "application/vnd.ecowin.seriesupdate": { source: "iana" },
  "application/vnd.efi.img": { source: "iana" },
  "application/vnd.efi.iso": { source: "iana" },
  "application/vnd.emclient.accessrequest+xml": { source: "iana", compressible: !0 },
  "application/vnd.enliven": { source: "iana", extensions: ["nml"] },
  "application/vnd.enphase.envoy": { source: "iana" },
  "application/vnd.eprints.data+xml": { source: "iana", compressible: !0 },
  "application/vnd.epson.esf": { source: "iana", extensions: ["esf"] },
  "application/vnd.epson.msf": { source: "iana", extensions: ["msf"] },
  "application/vnd.epson.quickanime": { source: "iana", extensions: ["qam"] },
  "application/vnd.epson.salt": { source: "iana", extensions: ["slt"] },
  "application/vnd.epson.ssf": { source: "iana", extensions: ["ssf"] },
  "application/vnd.ericsson.quickcall": { source: "iana" },
  "application/vnd.espass-espass+zip": { source: "iana", compressible: !1 },
  "application/vnd.eszigno3+xml": { source: "iana", compressible: !0, extensions: ["es3", "et3"] },
  "application/vnd.etsi.aoc+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.asic-e+zip": { source: "iana", compressible: !1 },
  "application/vnd.etsi.asic-s+zip": { source: "iana", compressible: !1 },
  "application/vnd.etsi.cug+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvcommand+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvdiscovery+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-bc+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-cod+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-npvr+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvservice+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsync+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvueprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.mcid+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.mheg5": { source: "iana" },
  "application/vnd.etsi.overload-control-policy-dataset+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.pstn+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.sci+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.simservs+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.timestamp-token": { source: "iana" },
  "application/vnd.etsi.tsl+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.tsl.der": { source: "iana" },
  "application/vnd.eu.kasparian.car+json": { source: "iana", compressible: !0 },
  "application/vnd.eudora.data": { source: "iana" },
  "application/vnd.evolv.ecig.profile": { source: "iana" },
  "application/vnd.evolv.ecig.settings": { source: "iana" },
  "application/vnd.evolv.ecig.theme": { source: "iana" },
  "application/vnd.exstream-empower+zip": { source: "iana", compressible: !1 },
  "application/vnd.exstream-package": { source: "iana" },
  "application/vnd.ezpix-album": { source: "iana", extensions: ["ez2"] },
  "application/vnd.ezpix-package": { source: "iana", extensions: ["ez3"] },
  "application/vnd.f-secure.mobile": { source: "iana" },
  "application/vnd.familysearch.gedcom+zip": { source: "iana", compressible: !1 },
  "application/vnd.fastcopy-disk-image": { source: "iana" },
  "application/vnd.fdf": { source: "iana", extensions: ["fdf"] },
  "application/vnd.fdsn.mseed": { source: "iana", extensions: ["mseed"] },
  "application/vnd.fdsn.seed": { source: "iana", extensions: ["seed", "dataless"] },
  "application/vnd.ffsns": { source: "iana" },
  "application/vnd.ficlab.flb+zip": { source: "iana", compressible: !1 },
  "application/vnd.filmit.zfc": { source: "iana" },
  "application/vnd.fints": { source: "iana" },
  "application/vnd.firemonkeys.cloudcell": { source: "iana" },
  "application/vnd.flographit": { source: "iana", extensions: ["gph"] },
  "application/vnd.fluxtime.clip": { source: "iana", extensions: ["ftc"] },
  "application/vnd.font-fontforge-sfd": { source: "iana" },
  "application/vnd.framemaker": { source: "iana", extensions: ["fm", "frame", "maker", "book"] },
  "application/vnd.frogans.fnc": { source: "iana", extensions: ["fnc"] },
  "application/vnd.frogans.ltf": { source: "iana", extensions: ["ltf"] },
  "application/vnd.fsc.weblaunch": { source: "iana", extensions: ["fsc"] },
  "application/vnd.fujifilm.fb.docuworks": { source: "iana" },
  "application/vnd.fujifilm.fb.docuworks.binder": { source: "iana" },
  "application/vnd.fujifilm.fb.docuworks.container": { source: "iana" },
  "application/vnd.fujifilm.fb.jfi+xml": { source: "iana", compressible: !0 },
  "application/vnd.fujitsu.oasys": { source: "iana", extensions: ["oas"] },
  "application/vnd.fujitsu.oasys2": { source: "iana", extensions: ["oa2"] },
  "application/vnd.fujitsu.oasys3": { source: "iana", extensions: ["oa3"] },
  "application/vnd.fujitsu.oasysgp": { source: "iana", extensions: ["fg5"] },
  "application/vnd.fujitsu.oasysprs": { source: "iana", extensions: ["bh2"] },
  "application/vnd.fujixerox.art-ex": { source: "iana" },
  "application/vnd.fujixerox.art4": { source: "iana" },
  "application/vnd.fujixerox.ddd": { source: "iana", extensions: ["ddd"] },
  "application/vnd.fujixerox.docuworks": { source: "iana", extensions: ["xdw"] },
  "application/vnd.fujixerox.docuworks.binder": { source: "iana", extensions: ["xbd"] },
  "application/vnd.fujixerox.docuworks.container": { source: "iana" },
  "application/vnd.fujixerox.hbpl": { source: "iana" },
  "application/vnd.fut-misnet": { source: "iana" },
  "application/vnd.futoin+cbor": { source: "iana" },
  "application/vnd.futoin+json": { source: "iana", compressible: !0 },
  "application/vnd.fuzzysheet": { source: "iana", extensions: ["fzs"] },
  "application/vnd.genomatix.tuxedo": { source: "iana", extensions: ["txd"] },
  "application/vnd.gentics.grd+json": { source: "iana", compressible: !0 },
  "application/vnd.geo+json": { source: "iana", compressible: !0 },
  "application/vnd.geocube+xml": { source: "iana", compressible: !0 },
  "application/vnd.geogebra.file": { source: "iana", extensions: ["ggb"] },
  "application/vnd.geogebra.slides": { source: "iana" },
  "application/vnd.geogebra.tool": { source: "iana", extensions: ["ggt"] },
  "application/vnd.geometry-explorer": { source: "iana", extensions: ["gex", "gre"] },
  "application/vnd.geonext": { source: "iana", extensions: ["gxt"] },
  "application/vnd.geoplan": { source: "iana", extensions: ["g2w"] },
  "application/vnd.geospace": { source: "iana", extensions: ["g3w"] },
  "application/vnd.gerber": { source: "iana" },
  "application/vnd.globalplatform.card-content-mgt": { source: "iana" },
  "application/vnd.globalplatform.card-content-mgt-response": { source: "iana" },
  "application/vnd.gmx": { source: "iana", extensions: ["gmx"] },
  "application/vnd.google-apps.document": { compressible: !1, extensions: ["gdoc"] },
  "application/vnd.google-apps.presentation": { compressible: !1, extensions: ["gslides"] },
  "application/vnd.google-apps.spreadsheet": { compressible: !1, extensions: ["gsheet"] },
  "application/vnd.google-earth.kml+xml": { source: "iana", compressible: !0, extensions: ["kml"] },
  "application/vnd.google-earth.kmz": { source: "iana", compressible: !1, extensions: ["kmz"] },
  "application/vnd.gov.sk.e-form+xml": { source: "iana", compressible: !0 },
  "application/vnd.gov.sk.e-form+zip": { source: "iana", compressible: !1 },
  "application/vnd.gov.sk.xmldatacontainer+xml": { source: "iana", compressible: !0 },
  "application/vnd.grafeq": { source: "iana", extensions: ["gqf", "gqs"] },
  "application/vnd.gridmp": { source: "iana" },
  "application/vnd.groove-account": { source: "iana", extensions: ["gac"] },
  "application/vnd.groove-help": { source: "iana", extensions: ["ghf"] },
  "application/vnd.groove-identity-message": { source: "iana", extensions: ["gim"] },
  "application/vnd.groove-injector": { source: "iana", extensions: ["grv"] },
  "application/vnd.groove-tool-message": { source: "iana", extensions: ["gtm"] },
  "application/vnd.groove-tool-template": { source: "iana", extensions: ["tpl"] },
  "application/vnd.groove-vcard": { source: "iana", extensions: ["vcg"] },
  "application/vnd.hal+json": { source: "iana", compressible: !0 },
  "application/vnd.hal+xml": { source: "iana", compressible: !0, extensions: ["hal"] },
  "application/vnd.handheld-entertainment+xml": { source: "iana", compressible: !0, extensions: ["zmm"] },
  "application/vnd.hbci": { source: "iana", extensions: ["hbci"] },
  "application/vnd.hc+json": { source: "iana", compressible: !0 },
  "application/vnd.hcl-bireports": { source: "iana" },
  "application/vnd.hdt": { source: "iana" },
  "application/vnd.heroku+json": { source: "iana", compressible: !0 },
  "application/vnd.hhe.lesson-player": { source: "iana", extensions: ["les"] },
  "application/vnd.hl7cda+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.hl7v2+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.hp-hpgl": { source: "iana", extensions: ["hpgl"] },
  "application/vnd.hp-hpid": { source: "iana", extensions: ["hpid"] },
  "application/vnd.hp-hps": { source: "iana", extensions: ["hps"] },
  "application/vnd.hp-jlyt": { source: "iana", extensions: ["jlt"] },
  "application/vnd.hp-pcl": { source: "iana", extensions: ["pcl"] },
  "application/vnd.hp-pclxl": { source: "iana", extensions: ["pclxl"] },
  "application/vnd.httphone": { source: "iana" },
  "application/vnd.hydrostatix.sof-data": { source: "iana", extensions: ["sfd-hdstx"] },
  "application/vnd.hyper+json": { source: "iana", compressible: !0 },
  "application/vnd.hyper-item+json": { source: "iana", compressible: !0 },
  "application/vnd.hyperdrive+json": { source: "iana", compressible: !0 },
  "application/vnd.hzn-3d-crossword": { source: "iana" },
  "application/vnd.ibm.afplinedata": { source: "iana" },
  "application/vnd.ibm.electronic-media": { source: "iana" },
  "application/vnd.ibm.minipay": { source: "iana", extensions: ["mpy"] },
  "application/vnd.ibm.modcap": { source: "iana", extensions: ["afp", "listafp", "list3820"] },
  "application/vnd.ibm.rights-management": { source: "iana", extensions: ["irm"] },
  "application/vnd.ibm.secure-container": { source: "iana", extensions: ["sc"] },
  "application/vnd.iccprofile": { source: "iana", extensions: ["icc", "icm"] },
  "application/vnd.ieee.1905": { source: "iana" },
  "application/vnd.igloader": { source: "iana", extensions: ["igl"] },
  "application/vnd.imagemeter.folder+zip": { source: "iana", compressible: !1 },
  "application/vnd.imagemeter.image+zip": { source: "iana", compressible: !1 },
  "application/vnd.immervision-ivp": { source: "iana", extensions: ["ivp"] },
  "application/vnd.immervision-ivu": { source: "iana", extensions: ["ivu"] },
  "application/vnd.ims.imsccv1p1": { source: "iana" },
  "application/vnd.ims.imsccv1p2": { source: "iana" },
  "application/vnd.ims.imsccv1p3": { source: "iana" },
  "application/vnd.ims.lis.v2.result+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolproxy+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolproxy.id+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolsettings+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": { source: "iana", compressible: !0 },
  "application/vnd.informedcontrol.rms+xml": { source: "iana", compressible: !0 },
  "application/vnd.informix-visionary": { source: "iana" },
  "application/vnd.infotech.project": { source: "iana" },
  "application/vnd.infotech.project+xml": { source: "iana", compressible: !0 },
  "application/vnd.innopath.wamp.notification": { source: "iana" },
  "application/vnd.insors.igm": { source: "iana", extensions: ["igm"] },
  "application/vnd.intercon.formnet": { source: "iana", extensions: ["xpw", "xpx"] },
  "application/vnd.intergeo": { source: "iana", extensions: ["i2g"] },
  "application/vnd.intertrust.digibox": { source: "iana" },
  "application/vnd.intertrust.nncp": { source: "iana" },
  "application/vnd.intu.qbo": { source: "iana", extensions: ["qbo"] },
  "application/vnd.intu.qfx": { source: "iana", extensions: ["qfx"] },
  "application/vnd.iptc.g2.catalogitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.conceptitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.knowledgeitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.newsitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.newsmessage+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.packageitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.planningitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.ipunplugged.rcprofile": { source: "iana", extensions: ["rcprofile"] },
  "application/vnd.irepository.package+xml": { source: "iana", compressible: !0, extensions: ["irp"] },
  "application/vnd.is-xpr": { source: "iana", extensions: ["xpr"] },
  "application/vnd.isac.fcs": { source: "iana", extensions: ["fcs"] },
  "application/vnd.iso11783-10+zip": { source: "iana", compressible: !1 },
  "application/vnd.jam": { source: "iana", extensions: ["jam"] },
  "application/vnd.japannet-directory-service": { source: "iana" },
  "application/vnd.japannet-jpnstore-wakeup": { source: "iana" },
  "application/vnd.japannet-payment-wakeup": { source: "iana" },
  "application/vnd.japannet-registration": { source: "iana" },
  "application/vnd.japannet-registration-wakeup": { source: "iana" },
  "application/vnd.japannet-setstore-wakeup": { source: "iana" },
  "application/vnd.japannet-verification": { source: "iana" },
  "application/vnd.japannet-verification-wakeup": { source: "iana" },
  "application/vnd.jcp.javame.midlet-rms": { source: "iana", extensions: ["rms"] },
  "application/vnd.jisp": { source: "iana", extensions: ["jisp"] },
  "application/vnd.joost.joda-archive": { source: "iana", extensions: ["joda"] },
  "application/vnd.jsk.isdn-ngn": { source: "iana" },
  "application/vnd.kahootz": { source: "iana", extensions: ["ktz", "ktr"] },
  "application/vnd.kde.karbon": { source: "iana", extensions: ["karbon"] },
  "application/vnd.kde.kchart": { source: "iana", extensions: ["chrt"] },
  "application/vnd.kde.kformula": { source: "iana", extensions: ["kfo"] },
  "application/vnd.kde.kivio": { source: "iana", extensions: ["flw"] },
  "application/vnd.kde.kontour": { source: "iana", extensions: ["kon"] },
  "application/vnd.kde.kpresenter": { source: "iana", extensions: ["kpr", "kpt"] },
  "application/vnd.kde.kspread": { source: "iana", extensions: ["ksp"] },
  "application/vnd.kde.kword": { source: "iana", extensions: ["kwd", "kwt"] },
  "application/vnd.kenameaapp": { source: "iana", extensions: ["htke"] },
  "application/vnd.kidspiration": { source: "iana", extensions: ["kia"] },
  "application/vnd.kinar": { source: "iana", extensions: ["kne", "knp"] },
  "application/vnd.koan": { source: "iana", extensions: ["skp", "skd", "skt", "skm"] },
  "application/vnd.kodak-descriptor": { source: "iana", extensions: ["sse"] },
  "application/vnd.las": { source: "iana" },
  "application/vnd.las.las+json": { source: "iana", compressible: !0 },
  "application/vnd.las.las+xml": { source: "iana", compressible: !0, extensions: ["lasxml"] },
  "application/vnd.laszip": { source: "iana" },
  "application/vnd.leap+json": { source: "iana", compressible: !0 },
  "application/vnd.liberty-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.llamagraphics.life-balance.desktop": { source: "iana", extensions: ["lbd"] },
  "application/vnd.llamagraphics.life-balance.exchange+xml": { source: "iana", compressible: !0, extensions: ["lbe"] },
  "application/vnd.logipipe.circuit+zip": { source: "iana", compressible: !1 },
  "application/vnd.loom": { source: "iana" },
  "application/vnd.lotus-1-2-3": { source: "iana", extensions: ["123"] },
  "application/vnd.lotus-approach": { source: "iana", extensions: ["apr"] },
  "application/vnd.lotus-freelance": { source: "iana", extensions: ["pre"] },
  "application/vnd.lotus-notes": { source: "iana", extensions: ["nsf"] },
  "application/vnd.lotus-organizer": { source: "iana", extensions: ["org"] },
  "application/vnd.lotus-screencam": { source: "iana", extensions: ["scm"] },
  "application/vnd.lotus-wordpro": { source: "iana", extensions: ["lwp"] },
  "application/vnd.macports.portpkg": { source: "iana", extensions: ["portpkg"] },
  "application/vnd.mapbox-vector-tile": { source: "iana", extensions: ["mvt"] },
  "application/vnd.marlin.drm.actiontoken+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.conftoken+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.license+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.mdcf": { source: "iana" },
  "application/vnd.mason+json": { source: "iana", compressible: !0 },
  "application/vnd.maxar.archive.3tz+zip": { source: "iana", compressible: !1 },
  "application/vnd.maxmind.maxmind-db": { source: "iana" },
  "application/vnd.mcd": { source: "iana", extensions: ["mcd"] },
  "application/vnd.medcalcdata": { source: "iana", extensions: ["mc1"] },
  "application/vnd.mediastation.cdkey": { source: "iana", extensions: ["cdkey"] },
  "application/vnd.meridian-slingshot": { source: "iana" },
  "application/vnd.mfer": { source: "iana", extensions: ["mwf"] },
  "application/vnd.mfmp": { source: "iana", extensions: ["mfm"] },
  "application/vnd.micro+json": { source: "iana", compressible: !0 },
  "application/vnd.micrografx.flo": { source: "iana", extensions: ["flo"] },
  "application/vnd.micrografx.igx": { source: "iana", extensions: ["igx"] },
  "application/vnd.microsoft.portable-executable": { source: "iana" },
  "application/vnd.microsoft.windows.thumbnail-cache": { source: "iana" },
  "application/vnd.miele+json": { source: "iana", compressible: !0 },
  "application/vnd.mif": { source: "iana", extensions: ["mif"] },
  "application/vnd.minisoft-hp3000-save": { source: "iana" },
  "application/vnd.mitsubishi.misty-guard.trustweb": { source: "iana" },
  "application/vnd.mobius.daf": { source: "iana", extensions: ["daf"] },
  "application/vnd.mobius.dis": { source: "iana", extensions: ["dis"] },
  "application/vnd.mobius.mbk": { source: "iana", extensions: ["mbk"] },
  "application/vnd.mobius.mqy": { source: "iana", extensions: ["mqy"] },
  "application/vnd.mobius.msl": { source: "iana", extensions: ["msl"] },
  "application/vnd.mobius.plc": { source: "iana", extensions: ["plc"] },
  "application/vnd.mobius.txf": { source: "iana", extensions: ["txf"] },
  "application/vnd.mophun.application": { source: "iana", extensions: ["mpn"] },
  "application/vnd.mophun.certificate": { source: "iana", extensions: ["mpc"] },
  "application/vnd.motorola.flexsuite": { source: "iana" },
  "application/vnd.motorola.flexsuite.adsi": { source: "iana" },
  "application/vnd.motorola.flexsuite.fis": { source: "iana" },
  "application/vnd.motorola.flexsuite.gotap": { source: "iana" },
  "application/vnd.motorola.flexsuite.kmr": { source: "iana" },
  "application/vnd.motorola.flexsuite.ttc": { source: "iana" },
  "application/vnd.motorola.flexsuite.wem": { source: "iana" },
  "application/vnd.motorola.iprm": { source: "iana" },
  "application/vnd.mozilla.xul+xml": { source: "iana", compressible: !0, extensions: ["xul"] },
  "application/vnd.ms-3mfdocument": { source: "iana" },
  "application/vnd.ms-artgalry": { source: "iana", extensions: ["cil"] },
  "application/vnd.ms-asf": { source: "iana" },
  "application/vnd.ms-cab-compressed": { source: "iana", extensions: ["cab"] },
  "application/vnd.ms-color.iccprofile": { source: "apache" },
  "application/vnd.ms-excel": { source: "iana", compressible: !1, extensions: ["xls", "xlm", "xla", "xlc", "xlt", "xlw"] },
  "application/vnd.ms-excel.addin.macroenabled.12": { source: "iana", extensions: ["xlam"] },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": { source: "iana", extensions: ["xlsb"] },
  "application/vnd.ms-excel.sheet.macroenabled.12": { source: "iana", extensions: ["xlsm"] },
  "application/vnd.ms-excel.template.macroenabled.12": { source: "iana", extensions: ["xltm"] },
  "application/vnd.ms-fontobject": { source: "iana", compressible: !0, extensions: ["eot"] },
  "application/vnd.ms-htmlhelp": { source: "iana", extensions: ["chm"] },
  "application/vnd.ms-ims": { source: "iana", extensions: ["ims"] },
  "application/vnd.ms-lrm": { source: "iana", extensions: ["lrm"] },
  "application/vnd.ms-office.activex+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-officetheme": { source: "iana", extensions: ["thmx"] },
  "application/vnd.ms-opentype": { source: "apache", compressible: !0 },
  "application/vnd.ms-outlook": { compressible: !1, extensions: ["msg"] },
  "application/vnd.ms-package.obfuscated-opentype": { source: "apache" },
  "application/vnd.ms-pki.seccat": { source: "apache", extensions: ["cat"] },
  "application/vnd.ms-pki.stl": { source: "apache", extensions: ["stl"] },
  "application/vnd.ms-playready.initiator+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-powerpoint": { source: "iana", compressible: !1, extensions: ["ppt", "pps", "pot"] },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": { source: "iana", extensions: ["ppam"] },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": { source: "iana", extensions: ["pptm"] },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": { source: "iana", extensions: ["sldm"] },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": { source: "iana", extensions: ["ppsm"] },
  "application/vnd.ms-powerpoint.template.macroenabled.12": { source: "iana", extensions: ["potm"] },
  "application/vnd.ms-printdevicecapabilities+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-printing.printticket+xml": { source: "apache", compressible: !0 },
  "application/vnd.ms-printschematicket+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-project": { source: "iana", extensions: ["mpp", "mpt"] },
  "application/vnd.ms-tnef": { source: "iana" },
  "application/vnd.ms-windows.devicepairing": { source: "iana" },
  "application/vnd.ms-windows.nwprinting.oob": { source: "iana" },
  "application/vnd.ms-windows.printerpairing": { source: "iana" },
  "application/vnd.ms-windows.wsd.oob": { source: "iana" },
  "application/vnd.ms-wmdrm.lic-chlg-req": { source: "iana" },
  "application/vnd.ms-wmdrm.lic-resp": { source: "iana" },
  "application/vnd.ms-wmdrm.meter-chlg-req": { source: "iana" },
  "application/vnd.ms-wmdrm.meter-resp": { source: "iana" },
  "application/vnd.ms-word.document.macroenabled.12": { source: "iana", extensions: ["docm"] },
  "application/vnd.ms-word.template.macroenabled.12": { source: "iana", extensions: ["dotm"] },
  "application/vnd.ms-works": { source: "iana", extensions: ["wps", "wks", "wcm", "wdb"] },
  "application/vnd.ms-wpl": { source: "iana", extensions: ["wpl"] },
  "application/vnd.ms-xpsdocument": { source: "iana", compressible: !1, extensions: ["xps"] },
  "application/vnd.msa-disk-image": { source: "iana" },
  "application/vnd.mseq": { source: "iana", extensions: ["mseq"] },
  "application/vnd.msign": { source: "iana" },
  "application/vnd.multiad.creator": { source: "iana" },
  "application/vnd.multiad.creator.cif": { source: "iana" },
  "application/vnd.music-niff": { source: "iana" },
  "application/vnd.musician": { source: "iana", extensions: ["mus"] },
  "application/vnd.muvee.style": { source: "iana", extensions: ["msty"] },
  "application/vnd.mynfc": { source: "iana", extensions: ["taglet"] },
  "application/vnd.nacamar.ybrid+json": { source: "iana", compressible: !0 },
  "application/vnd.ncd.control": { source: "iana" },
  "application/vnd.ncd.reference": { source: "iana" },
  "application/vnd.nearst.inv+json": { source: "iana", compressible: !0 },
  "application/vnd.nebumind.line": { source: "iana" },
  "application/vnd.nervana": { source: "iana" },
  "application/vnd.netfpx": { source: "iana" },
  "application/vnd.neurolanguage.nlu": { source: "iana", extensions: ["nlu"] },
  "application/vnd.nimn": { source: "iana" },
  "application/vnd.nintendo.nitro.rom": { source: "iana" },
  "application/vnd.nintendo.snes.rom": { source: "iana" },
  "application/vnd.nitf": { source: "iana", extensions: ["ntf", "nitf"] },
  "application/vnd.noblenet-directory": { source: "iana", extensions: ["nnd"] },
  "application/vnd.noblenet-sealer": { source: "iana", extensions: ["nns"] },
  "application/vnd.noblenet-web": { source: "iana", extensions: ["nnw"] },
  "application/vnd.nokia.catalogs": { source: "iana" },
  "application/vnd.nokia.conml+wbxml": { source: "iana" },
  "application/vnd.nokia.conml+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.iptv.config+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.isds-radio-presets": { source: "iana" },
  "application/vnd.nokia.landmark+wbxml": { source: "iana" },
  "application/vnd.nokia.landmark+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.landmarkcollection+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.n-gage.ac+xml": { source: "iana", compressible: !0, extensions: ["ac"] },
  "application/vnd.nokia.n-gage.data": { source: "iana", extensions: ["ngdat"] },
  "application/vnd.nokia.n-gage.symbian.install": { source: "iana", extensions: ["n-gage"] },
  "application/vnd.nokia.ncd": { source: "iana" },
  "application/vnd.nokia.pcd+wbxml": { source: "iana" },
  "application/vnd.nokia.pcd+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.radio-preset": { source: "iana", extensions: ["rpst"] },
  "application/vnd.nokia.radio-presets": { source: "iana", extensions: ["rpss"] },
  "application/vnd.novadigm.edm": { source: "iana", extensions: ["edm"] },
  "application/vnd.novadigm.edx": { source: "iana", extensions: ["edx"] },
  "application/vnd.novadigm.ext": { source: "iana", extensions: ["ext"] },
  "application/vnd.ntt-local.content-share": { source: "iana" },
  "application/vnd.ntt-local.file-transfer": { source: "iana" },
  "application/vnd.ntt-local.ogw_remote-access": { source: "iana" },
  "application/vnd.ntt-local.sip-ta_remote": { source: "iana" },
  "application/vnd.ntt-local.sip-ta_tcp_stream": { source: "iana" },
  "application/vnd.oasis.opendocument.chart": { source: "iana", extensions: ["odc"] },
  "application/vnd.oasis.opendocument.chart-template": { source: "iana", extensions: ["otc"] },
  "application/vnd.oasis.opendocument.database": { source: "iana", extensions: ["odb"] },
  "application/vnd.oasis.opendocument.formula": { source: "iana", extensions: ["odf"] },
  "application/vnd.oasis.opendocument.formula-template": { source: "iana", extensions: ["odft"] },
  "application/vnd.oasis.opendocument.graphics": { source: "iana", compressible: !1, extensions: ["odg"] },
  "application/vnd.oasis.opendocument.graphics-template": { source: "iana", extensions: ["otg"] },
  "application/vnd.oasis.opendocument.image": { source: "iana", extensions: ["odi"] },
  "application/vnd.oasis.opendocument.image-template": { source: "iana", extensions: ["oti"] },
  "application/vnd.oasis.opendocument.presentation": { source: "iana", compressible: !1, extensions: ["odp"] },
  "application/vnd.oasis.opendocument.presentation-template": { source: "iana", extensions: ["otp"] },
  "application/vnd.oasis.opendocument.spreadsheet": { source: "iana", compressible: !1, extensions: ["ods"] },
  "application/vnd.oasis.opendocument.spreadsheet-template": { source: "iana", extensions: ["ots"] },
  "application/vnd.oasis.opendocument.text": { source: "iana", compressible: !1, extensions: ["odt"] },
  "application/vnd.oasis.opendocument.text-master": { source: "iana", extensions: ["odm"] },
  "application/vnd.oasis.opendocument.text-template": { source: "iana", extensions: ["ott"] },
  "application/vnd.oasis.opendocument.text-web": { source: "iana", extensions: ["oth"] },
  "application/vnd.obn": { source: "iana" },
  "application/vnd.ocf+cbor": { source: "iana" },
  "application/vnd.oci.image.manifest.v1+json": { source: "iana", compressible: !0 },
  "application/vnd.oftn.l10n+json": { source: "iana", compressible: !0 },
  "application/vnd.oipf.contentaccessdownload+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.contentaccessstreaming+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.cspg-hexbinary": { source: "iana" },
  "application/vnd.oipf.dae.svg+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.dae.xhtml+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.mippvcontrolmessage+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.pae.gem": { source: "iana" },
  "application/vnd.oipf.spdiscovery+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.spdlist+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.ueprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.userprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.olpc-sugar": { source: "iana", extensions: ["xo"] },
  "application/vnd.oma-scws-config": { source: "iana" },
  "application/vnd.oma-scws-http-request": { source: "iana" },
  "application/vnd.oma-scws-http-response": { source: "iana" },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.drm-trigger+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.imd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.ltkm": { source: "iana" },
  "application/vnd.oma.bcast.notification+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.provisioningtrigger": { source: "iana" },
  "application/vnd.oma.bcast.sgboot": { source: "iana" },
  "application/vnd.oma.bcast.sgdd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.sgdu": { source: "iana" },
  "application/vnd.oma.bcast.simple-symbol-container": { source: "iana" },
  "application/vnd.oma.bcast.smartcard-trigger+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.sprov+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.stkm": { source: "iana" },
  "application/vnd.oma.cab-address-book+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-feature-handler+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-pcc+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-subs-invite+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-user-prefs+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.dcd": { source: "iana" },
  "application/vnd.oma.dcdc": { source: "iana" },
  "application/vnd.oma.dd2+xml": { source: "iana", compressible: !0, extensions: ["dd2"] },
  "application/vnd.oma.drm.risd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.group-usage-list+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.lwm2m+cbor": { source: "iana" },
  "application/vnd.oma.lwm2m+json": { source: "iana", compressible: !0 },
  "application/vnd.oma.lwm2m+tlv": { source: "iana" },
  "application/vnd.oma.pal+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.detailed-progress-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.final-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.groups+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.invocation-descriptor+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.optimized-progress-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.push": { source: "iana" },
  "application/vnd.oma.scidm.messages+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.xcap-directory+xml": { source: "iana", compressible: !0 },
  "application/vnd.omads-email+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omads-file+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omads-folder+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omaloc-supl-init": { source: "iana" },
  "application/vnd.onepager": { source: "iana" },
  "application/vnd.onepagertamp": { source: "iana" },
  "application/vnd.onepagertamx": { source: "iana" },
  "application/vnd.onepagertat": { source: "iana" },
  "application/vnd.onepagertatp": { source: "iana" },
  "application/vnd.onepagertatx": { source: "iana" },
  "application/vnd.openblox.game+xml": { source: "iana", compressible: !0, extensions: ["obgx"] },
  "application/vnd.openblox.game-binary": { source: "iana" },
  "application/vnd.openeye.oeb": { source: "iana" },
  "application/vnd.openofficeorg.extension": { source: "apache", extensions: ["oxt"] },
  "application/vnd.openstreetmap.data+xml": { source: "iana", compressible: !0, extensions: ["osm"] },
  "application/vnd.opentimestamps.ots": { source: "iana" },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawing+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { source: "iana", compressible: !1, extensions: ["pptx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": { source: "iana", extensions: ["sldx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": { source: "iana", extensions: ["ppsx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.template": { source: "iana", extensions: ["potx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { source: "iana", compressible: !1, extensions: ["xlsx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": { source: "iana", extensions: ["xltx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.theme+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.vmldrawing": { source: "iana" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { source: "iana", compressible: !1, extensions: ["docx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": { source: "iana", extensions: ["dotx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.core-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.relationships+xml": { source: "iana", compressible: !0 },
  "application/vnd.oracle.resource+json": { source: "iana", compressible: !0 },
  "application/vnd.orange.indata": { source: "iana" },
  "application/vnd.osa.netdeploy": { source: "iana" },
  "application/vnd.osgeo.mapguide.package": { source: "iana", extensions: ["mgp"] },
  "application/vnd.osgi.bundle": { source: "iana" },
  "application/vnd.osgi.dp": { source: "iana", extensions: ["dp"] },
  "application/vnd.osgi.subsystem": { source: "iana", extensions: ["esa"] },
  "application/vnd.otps.ct-kip+xml": { source: "iana", compressible: !0 },
  "application/vnd.oxli.countgraph": { source: "iana" },
  "application/vnd.pagerduty+json": { source: "iana", compressible: !0 },
  "application/vnd.palm": { source: "iana", extensions: ["pdb", "pqa", "oprc"] },
  "application/vnd.panoply": { source: "iana" },
  "application/vnd.paos.xml": { source: "iana" },
  "application/vnd.patentdive": { source: "iana" },
  "application/vnd.patientecommsdoc": { source: "iana" },
  "application/vnd.pawaafile": { source: "iana", extensions: ["paw"] },
  "application/vnd.pcos": { source: "iana" },
  "application/vnd.pg.format": { source: "iana", extensions: ["str"] },
  "application/vnd.pg.osasli": { source: "iana", extensions: ["ei6"] },
  "application/vnd.piaccess.application-licence": { source: "iana" },
  "application/vnd.picsel": { source: "iana", extensions: ["efif"] },
  "application/vnd.pmi.widget": { source: "iana", extensions: ["wg"] },
  "application/vnd.poc.group-advertisement+xml": { source: "iana", compressible: !0 },
  "application/vnd.pocketlearn": { source: "iana", extensions: ["plf"] },
  "application/vnd.powerbuilder6": { source: "iana", extensions: ["pbd"] },
  "application/vnd.powerbuilder6-s": { source: "iana" },
  "application/vnd.powerbuilder7": { source: "iana" },
  "application/vnd.powerbuilder7-s": { source: "iana" },
  "application/vnd.powerbuilder75": { source: "iana" },
  "application/vnd.powerbuilder75-s": { source: "iana" },
  "application/vnd.preminet": { source: "iana" },
  "application/vnd.previewsystems.box": { source: "iana", extensions: ["box"] },
  "application/vnd.proteus.magazine": { source: "iana", extensions: ["mgz"] },
  "application/vnd.psfs": { source: "iana" },
  "application/vnd.publishare-delta-tree": { source: "iana", extensions: ["qps"] },
  "application/vnd.pvi.ptid1": { source: "iana", extensions: ["ptid"] },
  "application/vnd.pwg-multiplexed": { source: "iana" },
  "application/vnd.pwg-xhtml-print+xml": { source: "iana", compressible: !0 },
  "application/vnd.qualcomm.brew-app-res": { source: "iana" },
  "application/vnd.quarantainenet": { source: "iana" },
  "application/vnd.quark.quarkxpress": { source: "iana", extensions: ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"] },
  "application/vnd.quobject-quoxdocument": { source: "iana" },
  "application/vnd.radisys.moml+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-conf+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-conn+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-dialog+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-stream+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-conf+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-base+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-group+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-speech+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-transform+xml": { source: "iana", compressible: !0 },
  "application/vnd.rainstor.data": { source: "iana" },
  "application/vnd.rapid": { source: "iana" },
  "application/vnd.rar": { source: "iana", extensions: ["rar"] },
  "application/vnd.realvnc.bed": { source: "iana", extensions: ["bed"] },
  "application/vnd.recordare.musicxml": { source: "iana", extensions: ["mxl"] },
  "application/vnd.recordare.musicxml+xml": { source: "iana", compressible: !0, extensions: ["musicxml"] },
  "application/vnd.renlearn.rlprint": { source: "iana" },
  "application/vnd.resilient.logic": { source: "iana" },
  "application/vnd.restful+json": { source: "iana", compressible: !0 },
  "application/vnd.rig.cryptonote": { source: "iana", extensions: ["cryptonote"] },
  "application/vnd.rim.cod": { source: "apache", extensions: ["cod"] },
  "application/vnd.rn-realmedia": { source: "apache", extensions: ["rm"] },
  "application/vnd.rn-realmedia-vbr": { source: "apache", extensions: ["rmvb"] },
  "application/vnd.route66.link66+xml": { source: "iana", compressible: !0, extensions: ["link66"] },
  "application/vnd.rs-274x": { source: "iana" },
  "application/vnd.ruckus.download": { source: "iana" },
  "application/vnd.s3sms": { source: "iana" },
  "application/vnd.sailingtracker.track": { source: "iana", extensions: ["st"] },
  "application/vnd.sar": { source: "iana" },
  "application/vnd.sbm.cid": { source: "iana" },
  "application/vnd.sbm.mid2": { source: "iana" },
  "application/vnd.scribus": { source: "iana" },
  "application/vnd.sealed.3df": { source: "iana" },
  "application/vnd.sealed.csf": { source: "iana" },
  "application/vnd.sealed.doc": { source: "iana" },
  "application/vnd.sealed.eml": { source: "iana" },
  "application/vnd.sealed.mht": { source: "iana" },
  "application/vnd.sealed.net": { source: "iana" },
  "application/vnd.sealed.ppt": { source: "iana" },
  "application/vnd.sealed.tiff": { source: "iana" },
  "application/vnd.sealed.xls": { source: "iana" },
  "application/vnd.sealedmedia.softseal.html": { source: "iana" },
  "application/vnd.sealedmedia.softseal.pdf": { source: "iana" },
  "application/vnd.seemail": { source: "iana", extensions: ["see"] },
  "application/vnd.seis+json": { source: "iana", compressible: !0 },
  "application/vnd.sema": { source: "iana", extensions: ["sema"] },
  "application/vnd.semd": { source: "iana", extensions: ["semd"] },
  "application/vnd.semf": { source: "iana", extensions: ["semf"] },
  "application/vnd.shade-save-file": { source: "iana" },
  "application/vnd.shana.informed.formdata": { source: "iana", extensions: ["ifm"] },
  "application/vnd.shana.informed.formtemplate": { source: "iana", extensions: ["itp"] },
  "application/vnd.shana.informed.interchange": { source: "iana", extensions: ["iif"] },
  "application/vnd.shana.informed.package": { source: "iana", extensions: ["ipk"] },
  "application/vnd.shootproof+json": { source: "iana", compressible: !0 },
  "application/vnd.shopkick+json": { source: "iana", compressible: !0 },
  "application/vnd.shp": { source: "iana" },
  "application/vnd.shx": { source: "iana" },
  "application/vnd.sigrok.session": { source: "iana" },
  "application/vnd.simtech-mindmapper": { source: "iana", extensions: ["twd", "twds"] },
  "application/vnd.siren+json": { source: "iana", compressible: !0 },
  "application/vnd.smaf": { source: "iana", extensions: ["mmf"] },
  "application/vnd.smart.notebook": { source: "iana" },
  "application/vnd.smart.teacher": { source: "iana", extensions: ["teacher"] },
  "application/vnd.snesdev-page-table": { source: "iana" },
  "application/vnd.software602.filler.form+xml": { source: "iana", compressible: !0, extensions: ["fo"] },
  "application/vnd.software602.filler.form-xml-zip": { source: "iana" },
  "application/vnd.solent.sdkm+xml": { source: "iana", compressible: !0, extensions: ["sdkm", "sdkd"] },
  "application/vnd.spotfire.dxp": { source: "iana", extensions: ["dxp"] },
  "application/vnd.spotfire.sfs": { source: "iana", extensions: ["sfs"] },
  "application/vnd.sqlite3": { source: "iana" },
  "application/vnd.sss-cod": { source: "iana" },
  "application/vnd.sss-dtf": { source: "iana" },
  "application/vnd.sss-ntf": { source: "iana" },
  "application/vnd.stardivision.calc": { source: "apache", extensions: ["sdc"] },
  "application/vnd.stardivision.draw": { source: "apache", extensions: ["sda"] },
  "application/vnd.stardivision.impress": { source: "apache", extensions: ["sdd"] },
  "application/vnd.stardivision.math": { source: "apache", extensions: ["smf"] },
  "application/vnd.stardivision.writer": { source: "apache", extensions: ["sdw", "vor"] },
  "application/vnd.stardivision.writer-global": { source: "apache", extensions: ["sgl"] },
  "application/vnd.stepmania.package": { source: "iana", extensions: ["smzip"] },
  "application/vnd.stepmania.stepchart": { source: "iana", extensions: ["sm"] },
  "application/vnd.street-stream": { source: "iana" },
  "application/vnd.sun.wadl+xml": { source: "iana", compressible: !0, extensions: ["wadl"] },
  "application/vnd.sun.xml.calc": { source: "apache", extensions: ["sxc"] },
  "application/vnd.sun.xml.calc.template": { source: "apache", extensions: ["stc"] },
  "application/vnd.sun.xml.draw": { source: "apache", extensions: ["sxd"] },
  "application/vnd.sun.xml.draw.template": { source: "apache", extensions: ["std"] },
  "application/vnd.sun.xml.impress": { source: "apache", extensions: ["sxi"] },
  "application/vnd.sun.xml.impress.template": { source: "apache", extensions: ["sti"] },
  "application/vnd.sun.xml.math": { source: "apache", extensions: ["sxm"] },
  "application/vnd.sun.xml.writer": { source: "apache", extensions: ["sxw"] },
  "application/vnd.sun.xml.writer.global": { source: "apache", extensions: ["sxg"] },
  "application/vnd.sun.xml.writer.template": { source: "apache", extensions: ["stw"] },
  "application/vnd.sus-calendar": { source: "iana", extensions: ["sus", "susp"] },
  "application/vnd.svd": { source: "iana", extensions: ["svd"] },
  "application/vnd.swiftview-ics": { source: "iana" },
  "application/vnd.sycle+xml": { source: "iana", compressible: !0 },
  "application/vnd.syft+json": { source: "iana", compressible: !0 },
  "application/vnd.symbian.install": { source: "apache", extensions: ["sis", "sisx"] },
  "application/vnd.syncml+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["xsm"] },
  "application/vnd.syncml.dm+wbxml": { source: "iana", charset: "UTF-8", extensions: ["bdm"] },
  "application/vnd.syncml.dm+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["xdm"] },
  "application/vnd.syncml.dm.notification": { source: "iana" },
  "application/vnd.syncml.dmddf+wbxml": { source: "iana" },
  "application/vnd.syncml.dmddf+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["ddf"] },
  "application/vnd.syncml.dmtnds+wbxml": { source: "iana" },
  "application/vnd.syncml.dmtnds+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.syncml.ds.notification": { source: "iana" },
  "application/vnd.tableschema+json": { source: "iana", compressible: !0 },
  "application/vnd.tao.intent-module-archive": { source: "iana", extensions: ["tao"] },
  "application/vnd.tcpdump.pcap": { source: "iana", extensions: ["pcap", "cap", "dmp"] },
  "application/vnd.think-cell.ppttc+json": { source: "iana", compressible: !0 },
  "application/vnd.tmd.mediaflex.api+xml": { source: "iana", compressible: !0 },
  "application/vnd.tml": { source: "iana" },
  "application/vnd.tmobile-livetv": { source: "iana", extensions: ["tmo"] },
  "application/vnd.tri.onesource": { source: "iana" },
  "application/vnd.trid.tpt": { source: "iana", extensions: ["tpt"] },
  "application/vnd.triscape.mxs": { source: "iana", extensions: ["mxs"] },
  "application/vnd.trueapp": { source: "iana", extensions: ["tra"] },
  "application/vnd.truedoc": { source: "iana" },
  "application/vnd.ubisoft.webplayer": { source: "iana" },
  "application/vnd.ufdl": { source: "iana", extensions: ["ufd", "ufdl"] },
  "application/vnd.uiq.theme": { source: "iana", extensions: ["utz"] },
  "application/vnd.umajin": { source: "iana", extensions: ["umj"] },
  "application/vnd.unity": { source: "iana", extensions: ["unityweb"] },
  "application/vnd.uoml+xml": { source: "iana", compressible: !0, extensions: ["uoml"] },
  "application/vnd.uplanet.alert": { source: "iana" },
  "application/vnd.uplanet.alert-wbxml": { source: "iana" },
  "application/vnd.uplanet.bearer-choice": { source: "iana" },
  "application/vnd.uplanet.bearer-choice-wbxml": { source: "iana" },
  "application/vnd.uplanet.cacheop": { source: "iana" },
  "application/vnd.uplanet.cacheop-wbxml": { source: "iana" },
  "application/vnd.uplanet.channel": { source: "iana" },
  "application/vnd.uplanet.channel-wbxml": { source: "iana" },
  "application/vnd.uplanet.list": { source: "iana" },
  "application/vnd.uplanet.list-wbxml": { source: "iana" },
  "application/vnd.uplanet.listcmd": { source: "iana" },
  "application/vnd.uplanet.listcmd-wbxml": { source: "iana" },
  "application/vnd.uplanet.signal": { source: "iana" },
  "application/vnd.uri-map": { source: "iana" },
  "application/vnd.valve.source.material": { source: "iana" },
  "application/vnd.vcx": { source: "iana", extensions: ["vcx"] },
  "application/vnd.vd-study": { source: "iana" },
  "application/vnd.vectorworks": { source: "iana" },
  "application/vnd.vel+json": { source: "iana", compressible: !0 },
  "application/vnd.verimatrix.vcas": { source: "iana" },
  "application/vnd.veritone.aion+json": { source: "iana", compressible: !0 },
  "application/vnd.veryant.thin": { source: "iana" },
  "application/vnd.ves.encrypted": { source: "iana" },
  "application/vnd.vidsoft.vidconference": { source: "iana" },
  "application/vnd.visio": { source: "iana", extensions: ["vsd", "vst", "vss", "vsw"] },
  "application/vnd.visionary": { source: "iana", extensions: ["vis"] },
  "application/vnd.vividence.scriptfile": { source: "iana" },
  "application/vnd.vsf": { source: "iana", extensions: ["vsf"] },
  "application/vnd.wap.sic": { source: "iana" },
  "application/vnd.wap.slc": { source: "iana" },
  "application/vnd.wap.wbxml": { source: "iana", charset: "UTF-8", extensions: ["wbxml"] },
  "application/vnd.wap.wmlc": { source: "iana", extensions: ["wmlc"] },
  "application/vnd.wap.wmlscriptc": { source: "iana", extensions: ["wmlsc"] },
  "application/vnd.webturbo": { source: "iana", extensions: ["wtb"] },
  "application/vnd.wfa.dpp": { source: "iana" },
  "application/vnd.wfa.p2p": { source: "iana" },
  "application/vnd.wfa.wsc": { source: "iana" },
  "application/vnd.windows.devicepairing": { source: "iana" },
  "application/vnd.wmc": { source: "iana" },
  "application/vnd.wmf.bootstrap": { source: "iana" },
  "application/vnd.wolfram.mathematica": { source: "iana" },
  "application/vnd.wolfram.mathematica.package": { source: "iana" },
  "application/vnd.wolfram.player": { source: "iana", extensions: ["nbp"] },
  "application/vnd.wordperfect": { source: "iana", extensions: ["wpd"] },
  "application/vnd.wqd": { source: "iana", extensions: ["wqd"] },
  "application/vnd.wrq-hp3000-labelled": { source: "iana" },
  "application/vnd.wt.stf": { source: "iana", extensions: ["stf"] },
  "application/vnd.wv.csp+wbxml": { source: "iana" },
  "application/vnd.wv.csp+xml": { source: "iana", compressible: !0 },
  "application/vnd.wv.ssp+xml": { source: "iana", compressible: !0 },
  "application/vnd.xacml+json": { source: "iana", compressible: !0 },
  "application/vnd.xara": { source: "iana", extensions: ["xar"] },
  "application/vnd.xfdl": { source: "iana", extensions: ["xfdl"] },
  "application/vnd.xfdl.webform": { source: "iana" },
  "application/vnd.xmi+xml": { source: "iana", compressible: !0 },
  "application/vnd.xmpie.cpkg": { source: "iana" },
  "application/vnd.xmpie.dpkg": { source: "iana" },
  "application/vnd.xmpie.plan": { source: "iana" },
  "application/vnd.xmpie.ppkg": { source: "iana" },
  "application/vnd.xmpie.xlim": { source: "iana" },
  "application/vnd.yamaha.hv-dic": { source: "iana", extensions: ["hvd"] },
  "application/vnd.yamaha.hv-script": { source: "iana", extensions: ["hvs"] },
  "application/vnd.yamaha.hv-voice": { source: "iana", extensions: ["hvp"] },
  "application/vnd.yamaha.openscoreformat": { source: "iana", extensions: ["osf"] },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": { source: "iana", compressible: !0, extensions: ["osfpvg"] },
  "application/vnd.yamaha.remote-setup": { source: "iana" },
  "application/vnd.yamaha.smaf-audio": { source: "iana", extensions: ["saf"] },
  "application/vnd.yamaha.smaf-phrase": { source: "iana", extensions: ["spf"] },
  "application/vnd.yamaha.through-ngn": { source: "iana" },
  "application/vnd.yamaha.tunnel-udpencap": { source: "iana" },
  "application/vnd.yaoweme": { source: "iana" },
  "application/vnd.yellowriver-custom-menu": { source: "iana", extensions: ["cmp"] },
  "application/vnd.youtube.yt": { source: "iana" },
  "application/vnd.zul": { source: "iana", extensions: ["zir", "zirz"] },
  "application/vnd.zzazz.deck+xml": { source: "iana", compressible: !0, extensions: ["zaz"] },
  "application/voicexml+xml": { source: "iana", compressible: !0, extensions: ["vxml"] },
  "application/voucher-cms+json": { source: "iana", compressible: !0 },
  "application/vq-rtcpxr": { source: "iana" },
  "application/wasm": { source: "iana", compressible: !0, extensions: ["wasm"] },
  "application/watcherinfo+xml": { source: "iana", compressible: !0, extensions: ["wif"] },
  "application/webpush-options+json": { source: "iana", compressible: !0 },
  "application/whoispp-query": { source: "iana" },
  "application/whoispp-response": { source: "iana" },
  "application/widget": { source: "iana", extensions: ["wgt"] },
  "application/winhlp": { source: "apache", extensions: ["hlp"] },
  "application/wita": { source: "iana" },
  "application/wordperfect5.1": { source: "iana" },
  "application/wsdl+xml": { source: "iana", compressible: !0, extensions: ["wsdl"] },
  "application/wspolicy+xml": { source: "iana", compressible: !0, extensions: ["wspolicy"] },
  "application/x-7z-compressed": { source: "apache", compressible: !1, extensions: ["7z"] },
  "application/x-abiword": { source: "apache", extensions: ["abw"] },
  "application/x-ace-compressed": { source: "apache", extensions: ["ace"] },
  "application/x-amf": { source: "apache" },
  "application/x-apple-diskimage": { source: "apache", extensions: ["dmg"] },
  "application/x-arj": { compressible: !1, extensions: ["arj"] },
  "application/x-authorware-bin": { source: "apache", extensions: ["aab", "x32", "u32", "vox"] },
  "application/x-authorware-map": { source: "apache", extensions: ["aam"] },
  "application/x-authorware-seg": { source: "apache", extensions: ["aas"] },
  "application/x-bcpio": { source: "apache", extensions: ["bcpio"] },
  "application/x-bdoc": { compressible: !1, extensions: ["bdoc"] },
  "application/x-bittorrent": { source: "apache", extensions: ["torrent"] },
  "application/x-blorb": { source: "apache", extensions: ["blb", "blorb"] },
  "application/x-bzip": { source: "apache", compressible: !1, extensions: ["bz"] },
  "application/x-bzip2": { source: "apache", compressible: !1, extensions: ["bz2", "boz"] },
  "application/x-cbr": { source: "apache", extensions: ["cbr", "cba", "cbt", "cbz", "cb7"] },
  "application/x-cdlink": { source: "apache", extensions: ["vcd"] },
  "application/x-cfs-compressed": { source: "apache", extensions: ["cfs"] },
  "application/x-chat": { source: "apache", extensions: ["chat"] },
  "application/x-chess-pgn": { source: "apache", extensions: ["pgn"] },
  "application/x-chrome-extension": { extensions: ["crx"] },
  "application/x-cocoa": { source: "nginx", extensions: ["cco"] },
  "application/x-compress": { source: "apache" },
  "application/x-conference": { source: "apache", extensions: ["nsc"] },
  "application/x-cpio": { source: "apache", extensions: ["cpio"] },
  "application/x-csh": { source: "apache", extensions: ["csh"] },
  "application/x-deb": { compressible: !1 },
  "application/x-debian-package": { source: "apache", extensions: ["deb", "udeb"] },
  "application/x-dgc-compressed": { source: "apache", extensions: ["dgc"] },
  "application/x-director": { source: "apache", extensions: ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"] },
  "application/x-doom": { source: "apache", extensions: ["wad"] },
  "application/x-dtbncx+xml": { source: "apache", compressible: !0, extensions: ["ncx"] },
  "application/x-dtbook+xml": { source: "apache", compressible: !0, extensions: ["dtb"] },
  "application/x-dtbresource+xml": { source: "apache", compressible: !0, extensions: ["res"] },
  "application/x-dvi": { source: "apache", compressible: !1, extensions: ["dvi"] },
  "application/x-envoy": { source: "apache", extensions: ["evy"] },
  "application/x-eva": { source: "apache", extensions: ["eva"] },
  "application/x-font-bdf": { source: "apache", extensions: ["bdf"] },
  "application/x-font-dos": { source: "apache" },
  "application/x-font-framemaker": { source: "apache" },
  "application/x-font-ghostscript": { source: "apache", extensions: ["gsf"] },
  "application/x-font-libgrx": { source: "apache" },
  "application/x-font-linux-psf": { source: "apache", extensions: ["psf"] },
  "application/x-font-pcf": { source: "apache", extensions: ["pcf"] },
  "application/x-font-snf": { source: "apache", extensions: ["snf"] },
  "application/x-font-speedo": { source: "apache" },
  "application/x-font-sunos-news": { source: "apache" },
  "application/x-font-type1": { source: "apache", extensions: ["pfa", "pfb", "pfm", "afm"] },
  "application/x-font-vfont": { source: "apache" },
  "application/x-freearc": { source: "apache", extensions: ["arc"] },
  "application/x-futuresplash": { source: "apache", extensions: ["spl"] },
  "application/x-gca-compressed": { source: "apache", extensions: ["gca"] },
  "application/x-glulx": { source: "apache", extensions: ["ulx"] },
  "application/x-gnumeric": { source: "apache", extensions: ["gnumeric"] },
  "application/x-gramps-xml": { source: "apache", extensions: ["gramps"] },
  "application/x-gtar": { source: "apache", extensions: ["gtar"] },
  "application/x-gzip": { source: "apache" },
  "application/x-hdf": { source: "apache", extensions: ["hdf"] },
  "application/x-httpd-php": { compressible: !0, extensions: ["php"] },
  "application/x-install-instructions": { source: "apache", extensions: ["install"] },
  "application/x-iso9660-image": { source: "apache", extensions: ["iso"] },
  "application/x-iwork-keynote-sffkey": { extensions: ["key"] },
  "application/x-iwork-numbers-sffnumbers": { extensions: ["numbers"] },
  "application/x-iwork-pages-sffpages": { extensions: ["pages"] },
  "application/x-java-archive-diff": { source: "nginx", extensions: ["jardiff"] },
  "application/x-java-jnlp-file": { source: "apache", compressible: !1, extensions: ["jnlp"] },
  "application/x-javascript": { compressible: !0 },
  "application/x-keepass2": { extensions: ["kdbx"] },
  "application/x-latex": { source: "apache", compressible: !1, extensions: ["latex"] },
  "application/x-lua-bytecode": { extensions: ["luac"] },
  "application/x-lzh-compressed": { source: "apache", extensions: ["lzh", "lha"] },
  "application/x-makeself": { source: "nginx", extensions: ["run"] },
  "application/x-mie": { source: "apache", extensions: ["mie"] },
  "application/x-mobipocket-ebook": { source: "apache", extensions: ["prc", "mobi"] },
  "application/x-mpegurl": { compressible: !1 },
  "application/x-ms-application": { source: "apache", extensions: ["application"] },
  "application/x-ms-shortcut": { source: "apache", extensions: ["lnk"] },
  "application/x-ms-wmd": { source: "apache", extensions: ["wmd"] },
  "application/x-ms-wmz": { source: "apache", extensions: ["wmz"] },
  "application/x-ms-xbap": { source: "apache", extensions: ["xbap"] },
  "application/x-msaccess": { source: "apache", extensions: ["mdb"] },
  "application/x-msbinder": { source: "apache", extensions: ["obd"] },
  "application/x-mscardfile": { source: "apache", extensions: ["crd"] },
  "application/x-msclip": { source: "apache", extensions: ["clp"] },
  "application/x-msdos-program": { extensions: ["exe"] },
  "application/x-msdownload": { source: "apache", extensions: ["exe", "dll", "com", "bat", "msi"] },
  "application/x-msmediaview": { source: "apache", extensions: ["mvb", "m13", "m14"] },
  "application/x-msmetafile": { source: "apache", extensions: ["wmf", "wmz", "emf", "emz"] },
  "application/x-msmoney": { source: "apache", extensions: ["mny"] },
  "application/x-mspublisher": { source: "apache", extensions: ["pub"] },
  "application/x-msschedule": { source: "apache", extensions: ["scd"] },
  "application/x-msterminal": { source: "apache", extensions: ["trm"] },
  "application/x-mswrite": { source: "apache", extensions: ["wri"] },
  "application/x-netcdf": { source: "apache", extensions: ["nc", "cdf"] },
  "application/x-ns-proxy-autoconfig": { compressible: !0, extensions: ["pac"] },
  "application/x-nzb": { source: "apache", extensions: ["nzb"] },
  "application/x-perl": { source: "nginx", extensions: ["pl", "pm"] },
  "application/x-pilot": { source: "nginx", extensions: ["prc", "pdb"] },
  "application/x-pkcs12": { source: "apache", compressible: !1, extensions: ["p12", "pfx"] },
  "application/x-pkcs7-certificates": { source: "apache", extensions: ["p7b", "spc"] },
  "application/x-pkcs7-certreqresp": { source: "apache", extensions: ["p7r"] },
  "application/x-pki-message": { source: "iana" },
  "application/x-rar-compressed": { source: "apache", compressible: !1, extensions: ["rar"] },
  "application/x-redhat-package-manager": { source: "nginx", extensions: ["rpm"] },
  "application/x-research-info-systems": { source: "apache", extensions: ["ris"] },
  "application/x-sea": { source: "nginx", extensions: ["sea"] },
  "application/x-sh": { source: "apache", compressible: !0, extensions: ["sh"] },
  "application/x-shar": { source: "apache", extensions: ["shar"] },
  "application/x-shockwave-flash": { source: "apache", compressible: !1, extensions: ["swf"] },
  "application/x-silverlight-app": { source: "apache", extensions: ["xap"] },
  "application/x-sql": { source: "apache", extensions: ["sql"] },
  "application/x-stuffit": { source: "apache", compressible: !1, extensions: ["sit"] },
  "application/x-stuffitx": { source: "apache", extensions: ["sitx"] },
  "application/x-subrip": { source: "apache", extensions: ["srt"] },
  "application/x-sv4cpio": { source: "apache", extensions: ["sv4cpio"] },
  "application/x-sv4crc": { source: "apache", extensions: ["sv4crc"] },
  "application/x-t3vm-image": { source: "apache", extensions: ["t3"] },
  "application/x-tads": { source: "apache", extensions: ["gam"] },
  "application/x-tar": { source: "apache", compressible: !0, extensions: ["tar"] },
  "application/x-tcl": { source: "apache", extensions: ["tcl", "tk"] },
  "application/x-tex": { source: "apache", extensions: ["tex"] },
  "application/x-tex-tfm": { source: "apache", extensions: ["tfm"] },
  "application/x-texinfo": { source: "apache", extensions: ["texinfo", "texi"] },
  "application/x-tgif": { source: "apache", extensions: ["obj"] },
  "application/x-ustar": { source: "apache", extensions: ["ustar"] },
  "application/x-virtualbox-hdd": { compressible: !0, extensions: ["hdd"] },
  "application/x-virtualbox-ova": { compressible: !0, extensions: ["ova"] },
  "application/x-virtualbox-ovf": { compressible: !0, extensions: ["ovf"] },
  "application/x-virtualbox-vbox": { compressible: !0, extensions: ["vbox"] },
  "application/x-virtualbox-vbox-extpack": { compressible: !1, extensions: ["vbox-extpack"] },
  "application/x-virtualbox-vdi": { compressible: !0, extensions: ["vdi"] },
  "application/x-virtualbox-vhd": { compressible: !0, extensions: ["vhd"] },
  "application/x-virtualbox-vmdk": { compressible: !0, extensions: ["vmdk"] },
  "application/x-wais-source": { source: "apache", extensions: ["src"] },
  "application/x-web-app-manifest+json": { compressible: !0, extensions: ["webapp"] },
  "application/x-www-form-urlencoded": { source: "iana", compressible: !0 },
  "application/x-x509-ca-cert": { source: "iana", extensions: ["der", "crt", "pem"] },
  "application/x-x509-ca-ra-cert": { source: "iana" },
  "application/x-x509-next-ca-cert": { source: "iana" },
  "application/x-xfig": { source: "apache", extensions: ["fig"] },
  "application/x-xliff+xml": { source: "apache", compressible: !0, extensions: ["xlf"] },
  "application/x-xpinstall": { source: "apache", compressible: !1, extensions: ["xpi"] },
  "application/x-xz": { source: "apache", extensions: ["xz"] },
  "application/x-zmachine": { source: "apache", extensions: ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"] },
  "application/x400-bp": { source: "iana" },
  "application/xacml+xml": { source: "iana", compressible: !0 },
  "application/xaml+xml": { source: "apache", compressible: !0, extensions: ["xaml"] },
  "application/xcap-att+xml": { source: "iana", compressible: !0, extensions: ["xav"] },
  "application/xcap-caps+xml": { source: "iana", compressible: !0, extensions: ["xca"] },
  "application/xcap-diff+xml": { source: "iana", compressible: !0, extensions: ["xdf"] },
  "application/xcap-el+xml": { source: "iana", compressible: !0, extensions: ["xel"] },
  "application/xcap-error+xml": { source: "iana", compressible: !0 },
  "application/xcap-ns+xml": { source: "iana", compressible: !0, extensions: ["xns"] },
  "application/xcon-conference-info+xml": { source: "iana", compressible: !0 },
  "application/xcon-conference-info-diff+xml": { source: "iana", compressible: !0 },
  "application/xenc+xml": { source: "iana", compressible: !0, extensions: ["xenc"] },
  "application/xhtml+xml": { source: "iana", compressible: !0, extensions: ["xhtml", "xht"] },
  "application/xhtml-voice+xml": { source: "apache", compressible: !0 },
  "application/xliff+xml": { source: "iana", compressible: !0, extensions: ["xlf"] },
  "application/xml": { source: "iana", compressible: !0, extensions: ["xml", "xsl", "xsd", "rng"] },
  "application/xml-dtd": { source: "iana", compressible: !0, extensions: ["dtd"] },
  "application/xml-external-parsed-entity": { source: "iana" },
  "application/xml-patch+xml": { source: "iana", compressible: !0 },
  "application/xmpp+xml": { source: "iana", compressible: !0 },
  "application/xop+xml": { source: "iana", compressible: !0, extensions: ["xop"] },
  "application/xproc+xml": { source: "apache", compressible: !0, extensions: ["xpl"] },
  "application/xslt+xml": { source: "iana", compressible: !0, extensions: ["xsl", "xslt"] },
  "application/xspf+xml": { source: "apache", compressible: !0, extensions: ["xspf"] },
  "application/xv+xml": { source: "iana", compressible: !0, extensions: ["mxml", "xhvml", "xvml", "xvm"] },
  "application/yang": { source: "iana", extensions: ["yang"] },
  "application/yang-data+json": { source: "iana", compressible: !0 },
  "application/yang-data+xml": { source: "iana", compressible: !0 },
  "application/yang-patch+json": { source: "iana", compressible: !0 },
  "application/yang-patch+xml": { source: "iana", compressible: !0 },
  "application/yin+xml": { source: "iana", compressible: !0, extensions: ["yin"] },
  "application/zip": { source: "iana", compressible: !1, extensions: ["zip"] },
  "application/zlib": { source: "iana" },
  "application/zstd": { source: "iana" },
  "audio/1d-interleaved-parityfec": { source: "iana" },
  "audio/32kadpcm": { source: "iana" },
  "audio/3gpp": { source: "iana", compressible: !1, extensions: ["3gpp"] },
  "audio/3gpp2": { source: "iana" },
  "audio/aac": { source: "iana" },
  "audio/ac3": { source: "iana" },
  "audio/adpcm": { source: "apache", extensions: ["adp"] },
  "audio/amr": { source: "iana", extensions: ["amr"] },
  "audio/amr-wb": { source: "iana" },
  "audio/amr-wb+": { source: "iana" },
  "audio/aptx": { source: "iana" },
  "audio/asc": { source: "iana" },
  "audio/atrac-advanced-lossless": { source: "iana" },
  "audio/atrac-x": { source: "iana" },
  "audio/atrac3": { source: "iana" },
  "audio/basic": { source: "iana", compressible: !1, extensions: ["au", "snd"] },
  "audio/bv16": { source: "iana" },
  "audio/bv32": { source: "iana" },
  "audio/clearmode": { source: "iana" },
  "audio/cn": { source: "iana" },
  "audio/dat12": { source: "iana" },
  "audio/dls": { source: "iana" },
  "audio/dsr-es201108": { source: "iana" },
  "audio/dsr-es202050": { source: "iana" },
  "audio/dsr-es202211": { source: "iana" },
  "audio/dsr-es202212": { source: "iana" },
  "audio/dv": { source: "iana" },
  "audio/dvi4": { source: "iana" },
  "audio/eac3": { source: "iana" },
  "audio/encaprtp": { source: "iana" },
  "audio/evrc": { source: "iana" },
  "audio/evrc-qcp": { source: "iana" },
  "audio/evrc0": { source: "iana" },
  "audio/evrc1": { source: "iana" },
  "audio/evrcb": { source: "iana" },
  "audio/evrcb0": { source: "iana" },
  "audio/evrcb1": { source: "iana" },
  "audio/evrcnw": { source: "iana" },
  "audio/evrcnw0": { source: "iana" },
  "audio/evrcnw1": { source: "iana" },
  "audio/evrcwb": { source: "iana" },
  "audio/evrcwb0": { source: "iana" },
  "audio/evrcwb1": { source: "iana" },
  "audio/evs": { source: "iana" },
  "audio/flexfec": { source: "iana" },
  "audio/fwdred": { source: "iana" },
  "audio/g711-0": { source: "iana" },
  "audio/g719": { source: "iana" },
  "audio/g722": { source: "iana" },
  "audio/g7221": { source: "iana" },
  "audio/g723": { source: "iana" },
  "audio/g726-16": { source: "iana" },
  "audio/g726-24": { source: "iana" },
  "audio/g726-32": { source: "iana" },
  "audio/g726-40": { source: "iana" },
  "audio/g728": { source: "iana" },
  "audio/g729": { source: "iana" },
  "audio/g7291": { source: "iana" },
  "audio/g729d": { source: "iana" },
  "audio/g729e": { source: "iana" },
  "audio/gsm": { source: "iana" },
  "audio/gsm-efr": { source: "iana" },
  "audio/gsm-hr-08": { source: "iana" },
  "audio/ilbc": { source: "iana" },
  "audio/ip-mr_v2.5": { source: "iana" },
  "audio/isac": { source: "apache" },
  "audio/l16": { source: "iana" },
  "audio/l20": { source: "iana" },
  "audio/l24": { source: "iana", compressible: !1 },
  "audio/l8": { source: "iana" },
  "audio/lpc": { source: "iana" },
  "audio/melp": { source: "iana" },
  "audio/melp1200": { source: "iana" },
  "audio/melp2400": { source: "iana" },
  "audio/melp600": { source: "iana" },
  "audio/mhas": { source: "iana" },
  "audio/midi": { source: "apache", extensions: ["mid", "midi", "kar", "rmi"] },
  "audio/mobile-xmf": { source: "iana", extensions: ["mxmf"] },
  "audio/mp3": { compressible: !1, extensions: ["mp3"] },
  "audio/mp4": { source: "iana", compressible: !1, extensions: ["m4a", "mp4a"] },
  "audio/mp4a-latm": { source: "iana" },
  "audio/mpa": { source: "iana" },
  "audio/mpa-robust": { source: "iana" },
  "audio/mpeg": { source: "iana", compressible: !1, extensions: ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"] },
  "audio/mpeg4-generic": { source: "iana" },
  "audio/musepack": { source: "apache" },
  "audio/ogg": { source: "iana", compressible: !1, extensions: ["oga", "ogg", "spx", "opus"] },
  "audio/opus": { source: "iana" },
  "audio/parityfec": { source: "iana" },
  "audio/pcma": { source: "iana" },
  "audio/pcma-wb": { source: "iana" },
  "audio/pcmu": { source: "iana" },
  "audio/pcmu-wb": { source: "iana" },
  "audio/prs.sid": { source: "iana" },
  "audio/qcelp": { source: "iana" },
  "audio/raptorfec": { source: "iana" },
  "audio/red": { source: "iana" },
  "audio/rtp-enc-aescm128": { source: "iana" },
  "audio/rtp-midi": { source: "iana" },
  "audio/rtploopback": { source: "iana" },
  "audio/rtx": { source: "iana" },
  "audio/s3m": { source: "apache", extensions: ["s3m"] },
  "audio/scip": { source: "iana" },
  "audio/silk": { source: "apache", extensions: ["sil"] },
  "audio/smv": { source: "iana" },
  "audio/smv-qcp": { source: "iana" },
  "audio/smv0": { source: "iana" },
  "audio/sofa": { source: "iana" },
  "audio/sp-midi": { source: "iana" },
  "audio/speex": { source: "iana" },
  "audio/t140c": { source: "iana" },
  "audio/t38": { source: "iana" },
  "audio/telephone-event": { source: "iana" },
  "audio/tetra_acelp": { source: "iana" },
  "audio/tetra_acelp_bb": { source: "iana" },
  "audio/tone": { source: "iana" },
  "audio/tsvcis": { source: "iana" },
  "audio/uemclip": { source: "iana" },
  "audio/ulpfec": { source: "iana" },
  "audio/usac": { source: "iana" },
  "audio/vdvi": { source: "iana" },
  "audio/vmr-wb": { source: "iana" },
  "audio/vnd.3gpp.iufp": { source: "iana" },
  "audio/vnd.4sb": { source: "iana" },
  "audio/vnd.audiokoz": { source: "iana" },
  "audio/vnd.celp": { source: "iana" },
  "audio/vnd.cisco.nse": { source: "iana" },
  "audio/vnd.cmles.radio-events": { source: "iana" },
  "audio/vnd.cns.anp1": { source: "iana" },
  "audio/vnd.cns.inf1": { source: "iana" },
  "audio/vnd.dece.audio": { source: "iana", extensions: ["uva", "uvva"] },
  "audio/vnd.digital-winds": { source: "iana", extensions: ["eol"] },
  "audio/vnd.dlna.adts": { source: "iana" },
  "audio/vnd.dolby.heaac.1": { source: "iana" },
  "audio/vnd.dolby.heaac.2": { source: "iana" },
  "audio/vnd.dolby.mlp": { source: "iana" },
  "audio/vnd.dolby.mps": { source: "iana" },
  "audio/vnd.dolby.pl2": { source: "iana" },
  "audio/vnd.dolby.pl2x": { source: "iana" },
  "audio/vnd.dolby.pl2z": { source: "iana" },
  "audio/vnd.dolby.pulse.1": { source: "iana" },
  "audio/vnd.dra": { source: "iana", extensions: ["dra"] },
  "audio/vnd.dts": { source: "iana", extensions: ["dts"] },
  "audio/vnd.dts.hd": { source: "iana", extensions: ["dtshd"] },
  "audio/vnd.dts.uhd": { source: "iana" },
  "audio/vnd.dvb.file": { source: "iana" },
  "audio/vnd.everad.plj": { source: "iana" },
  "audio/vnd.hns.audio": { source: "iana" },
  "audio/vnd.lucent.voice": { source: "iana", extensions: ["lvp"] },
  "audio/vnd.ms-playready.media.pya": { source: "iana", extensions: ["pya"] },
  "audio/vnd.nokia.mobile-xmf": { source: "iana" },
  "audio/vnd.nortel.vbk": { source: "iana" },
  "audio/vnd.nuera.ecelp4800": { source: "iana", extensions: ["ecelp4800"] },
  "audio/vnd.nuera.ecelp7470": { source: "iana", extensions: ["ecelp7470"] },
  "audio/vnd.nuera.ecelp9600": { source: "iana", extensions: ["ecelp9600"] },
  "audio/vnd.octel.sbc": { source: "iana" },
  "audio/vnd.presonus.multitrack": { source: "iana" },
  "audio/vnd.qcelp": { source: "iana" },
  "audio/vnd.rhetorex.32kadpcm": { source: "iana" },
  "audio/vnd.rip": { source: "iana", extensions: ["rip"] },
  "audio/vnd.rn-realaudio": { compressible: !1 },
  "audio/vnd.sealedmedia.softseal.mpeg": { source: "iana" },
  "audio/vnd.vmx.cvsd": { source: "iana" },
  "audio/vnd.wave": { compressible: !1 },
  "audio/vorbis": { source: "iana", compressible: !1 },
  "audio/vorbis-config": { source: "iana" },
  "audio/wav": { compressible: !1, extensions: ["wav"] },
  "audio/wave": { compressible: !1, extensions: ["wav"] },
  "audio/webm": { source: "apache", compressible: !1, extensions: ["weba"] },
  "audio/x-aac": { source: "apache", compressible: !1, extensions: ["aac"] },
  "audio/x-aiff": { source: "apache", extensions: ["aif", "aiff", "aifc"] },
  "audio/x-caf": { source: "apache", compressible: !1, extensions: ["caf"] },
  "audio/x-flac": { source: "apache", extensions: ["flac"] },
  "audio/x-m4a": { source: "nginx", extensions: ["m4a"] },
  "audio/x-matroska": { source: "apache", extensions: ["mka"] },
  "audio/x-mpegurl": { source: "apache", extensions: ["m3u"] },
  "audio/x-ms-wax": { source: "apache", extensions: ["wax"] },
  "audio/x-ms-wma": { source: "apache", extensions: ["wma"] },
  "audio/x-pn-realaudio": { source: "apache", extensions: ["ram", "ra"] },
  "audio/x-pn-realaudio-plugin": { source: "apache", extensions: ["rmp"] },
  "audio/x-realaudio": { source: "nginx", extensions: ["ra"] },
  "audio/x-tta": { source: "apache" },
  "audio/x-wav": { source: "apache", extensions: ["wav"] },
  "audio/xm": { source: "apache", extensions: ["xm"] },
  "chemical/x-cdx": { source: "apache", extensions: ["cdx"] },
  "chemical/x-cif": { source: "apache", extensions: ["cif"] },
  "chemical/x-cmdf": { source: "apache", extensions: ["cmdf"] },
  "chemical/x-cml": { source: "apache", extensions: ["cml"] },
  "chemical/x-csml": { source: "apache", extensions: ["csml"] },
  "chemical/x-pdb": { source: "apache" },
  "chemical/x-xyz": { source: "apache", extensions: ["xyz"] },
  "font/collection": { source: "iana", extensions: ["ttc"] },
  "font/otf": { source: "iana", compressible: !0, extensions: ["otf"] },
  "font/sfnt": { source: "iana" },
  "font/ttf": { source: "iana", compressible: !0, extensions: ["ttf"] },
  "font/woff": { source: "iana", extensions: ["woff"] },
  "font/woff2": { source: "iana", extensions: ["woff2"] },
  "image/aces": { source: "iana", extensions: ["exr"] },
  "image/apng": { compressible: !1, extensions: ["apng"] },
  "image/avci": { source: "iana", extensions: ["avci"] },
  "image/avcs": { source: "iana", extensions: ["avcs"] },
  "image/avif": { source: "iana", compressible: !1, extensions: ["avif"] },
  "image/bmp": { source: "iana", compressible: !0, extensions: ["bmp"] },
  "image/cgm": { source: "iana", extensions: ["cgm"] },
  "image/dicom-rle": { source: "iana", extensions: ["drle"] },
  "image/emf": { source: "iana", extensions: ["emf"] },
  "image/fits": { source: "iana", extensions: ["fits"] },
  "image/g3fax": { source: "iana", extensions: ["g3"] },
  "image/gif": { source: "iana", compressible: !1, extensions: ["gif"] },
  "image/heic": { source: "iana", extensions: ["heic"] },
  "image/heic-sequence": { source: "iana", extensions: ["heics"] },
  "image/heif": { source: "iana", extensions: ["heif"] },
  "image/heif-sequence": { source: "iana", extensions: ["heifs"] },
  "image/hej2k": { source: "iana", extensions: ["hej2"] },
  "image/hsj2": { source: "iana", extensions: ["hsj2"] },
  "image/ief": { source: "iana", extensions: ["ief"] },
  "image/jls": { source: "iana", extensions: ["jls"] },
  "image/jp2": { source: "iana", compressible: !1, extensions: ["jp2", "jpg2"] },
  "image/jpeg": { source: "iana", compressible: !1, extensions: ["jpeg", "jpg", "jpe"] },
  "image/jph": { source: "iana", extensions: ["jph"] },
  "image/jphc": { source: "iana", extensions: ["jhc"] },
  "image/jpm": { source: "iana", compressible: !1, extensions: ["jpm"] },
  "image/jpx": { source: "iana", compressible: !1, extensions: ["jpx", "jpf"] },
  "image/jxr": { source: "iana", extensions: ["jxr"] },
  "image/jxra": { source: "iana", extensions: ["jxra"] },
  "image/jxrs": { source: "iana", extensions: ["jxrs"] },
  "image/jxs": { source: "iana", extensions: ["jxs"] },
  "image/jxsc": { source: "iana", extensions: ["jxsc"] },
  "image/jxsi": { source: "iana", extensions: ["jxsi"] },
  "image/jxss": { source: "iana", extensions: ["jxss"] },
  "image/ktx": { source: "iana", extensions: ["ktx"] },
  "image/ktx2": { source: "iana", extensions: ["ktx2"] },
  "image/naplps": { source: "iana" },
  "image/pjpeg": { compressible: !1 },
  "image/png": { source: "iana", compressible: !1, extensions: ["png"] },
  "image/prs.btif": { source: "iana", extensions: ["btif"] },
  "image/prs.pti": { source: "iana", extensions: ["pti"] },
  "image/pwg-raster": { source: "iana" },
  "image/sgi": { source: "apache", extensions: ["sgi"] },
  "image/svg+xml": { source: "iana", compressible: !0, extensions: ["svg", "svgz"] },
  "image/t38": { source: "iana", extensions: ["t38"] },
  "image/tiff": { source: "iana", compressible: !1, extensions: ["tif", "tiff"] },
  "image/tiff-fx": { source: "iana", extensions: ["tfx"] },
  "image/vnd.adobe.photoshop": { source: "iana", compressible: !0, extensions: ["psd"] },
  "image/vnd.airzip.accelerator.azv": { source: "iana", extensions: ["azv"] },
  "image/vnd.cns.inf2": { source: "iana" },
  "image/vnd.dece.graphic": { source: "iana", extensions: ["uvi", "uvvi", "uvg", "uvvg"] },
  "image/vnd.djvu": { source: "iana", extensions: ["djvu", "djv"] },
  "image/vnd.dvb.subtitle": { source: "iana", extensions: ["sub"] },
  "image/vnd.dwg": { source: "iana", extensions: ["dwg"] },
  "image/vnd.dxf": { source: "iana", extensions: ["dxf"] },
  "image/vnd.fastbidsheet": { source: "iana", extensions: ["fbs"] },
  "image/vnd.fpx": { source: "iana", extensions: ["fpx"] },
  "image/vnd.fst": { source: "iana", extensions: ["fst"] },
  "image/vnd.fujixerox.edmics-mmr": { source: "iana", extensions: ["mmr"] },
  "image/vnd.fujixerox.edmics-rlc": { source: "iana", extensions: ["rlc"] },
  "image/vnd.globalgraphics.pgb": { source: "iana" },
  "image/vnd.microsoft.icon": { source: "iana", compressible: !0, extensions: ["ico"] },
  "image/vnd.mix": { source: "iana" },
  "image/vnd.mozilla.apng": { source: "iana" },
  "image/vnd.ms-dds": { compressible: !0, extensions: ["dds"] },
  "image/vnd.ms-modi": { source: "iana", extensions: ["mdi"] },
  "image/vnd.ms-photo": { source: "apache", extensions: ["wdp"] },
  "image/vnd.net-fpx": { source: "iana", extensions: ["npx"] },
  "image/vnd.pco.b16": { source: "iana", extensions: ["b16"] },
  "image/vnd.radiance": { source: "iana" },
  "image/vnd.sealed.png": { source: "iana" },
  "image/vnd.sealedmedia.softseal.gif": { source: "iana" },
  "image/vnd.sealedmedia.softseal.jpg": { source: "iana" },
  "image/vnd.svf": { source: "iana" },
  "image/vnd.tencent.tap": { source: "iana", extensions: ["tap"] },
  "image/vnd.valve.source.texture": { source: "iana", extensions: ["vtf"] },
  "image/vnd.wap.wbmp": { source: "iana", extensions: ["wbmp"] },
  "image/vnd.xiff": { source: "iana", extensions: ["xif"] },
  "image/vnd.zbrush.pcx": { source: "iana", extensions: ["pcx"] },
  "image/webp": { source: "apache", extensions: ["webp"] },
  "image/wmf": { source: "iana", extensions: ["wmf"] },
  "image/x-3ds": { source: "apache", extensions: ["3ds"] },
  "image/x-cmu-raster": { source: "apache", extensions: ["ras"] },
  "image/x-cmx": { source: "apache", extensions: ["cmx"] },
  "image/x-freehand": { source: "apache", extensions: ["fh", "fhc", "fh4", "fh5", "fh7"] },
  "image/x-icon": { source: "apache", compressible: !0, extensions: ["ico"] },
  "image/x-jng": { source: "nginx", extensions: ["jng"] },
  "image/x-mrsid-image": { source: "apache", extensions: ["sid"] },
  "image/x-ms-bmp": { source: "nginx", compressible: !0, extensions: ["bmp"] },
  "image/x-pcx": { source: "apache", extensions: ["pcx"] },
  "image/x-pict": { source: "apache", extensions: ["pic", "pct"] },
  "image/x-portable-anymap": { source: "apache", extensions: ["pnm"] },
  "image/x-portable-bitmap": { source: "apache", extensions: ["pbm"] },
  "image/x-portable-graymap": { source: "apache", extensions: ["pgm"] },
  "image/x-portable-pixmap": { source: "apache", extensions: ["ppm"] },
  "image/x-rgb": { source: "apache", extensions: ["rgb"] },
  "image/x-tga": { source: "apache", extensions: ["tga"] },
  "image/x-xbitmap": { source: "apache", extensions: ["xbm"] },
  "image/x-xcf": { compressible: !1 },
  "image/x-xpixmap": { source: "apache", extensions: ["xpm"] },
  "image/x-xwindowdump": { source: "apache", extensions: ["xwd"] },
  "message/cpim": { source: "iana" },
  "message/delivery-status": { source: "iana" },
  "message/disposition-notification": { source: "iana", extensions: ["disposition-notification"] },
  "message/external-body": { source: "iana" },
  "message/feedback-report": { source: "iana" },
  "message/global": { source: "iana", extensions: ["u8msg"] },
  "message/global-delivery-status": { source: "iana", extensions: ["u8dsn"] },
  "message/global-disposition-notification": { source: "iana", extensions: ["u8mdn"] },
  "message/global-headers": { source: "iana", extensions: ["u8hdr"] },
  "message/http": { source: "iana", compressible: !1 },
  "message/imdn+xml": { source: "iana", compressible: !0 },
  "message/news": { source: "iana" },
  "message/partial": { source: "iana", compressible: !1 },
  "message/rfc822": { source: "iana", compressible: !0, extensions: ["eml", "mime"] },
  "message/s-http": { source: "iana" },
  "message/sip": { source: "iana" },
  "message/sipfrag": { source: "iana" },
  "message/tracking-status": { source: "iana" },
  "message/vnd.si.simp": { source: "iana" },
  "message/vnd.wfa.wsc": { source: "iana", extensions: ["wsc"] },
  "model/3mf": { source: "iana", extensions: ["3mf"] },
  "model/e57": { source: "iana" },
  "model/gltf+json": { source: "iana", compressible: !0, extensions: ["gltf"] },
  "model/gltf-binary": { source: "iana", compressible: !0, extensions: ["glb"] },
  "model/iges": { source: "iana", compressible: !1, extensions: ["igs", "iges"] },
  "model/mesh": { source: "iana", compressible: !1, extensions: ["msh", "mesh", "silo"] },
  "model/mtl": { source: "iana", extensions: ["mtl"] },
  "model/obj": { source: "iana", extensions: ["obj"] },
  "model/step": { source: "iana" },
  "model/step+xml": { source: "iana", compressible: !0, extensions: ["stpx"] },
  "model/step+zip": { source: "iana", compressible: !1, extensions: ["stpz"] },
  "model/step-xml+zip": { source: "iana", compressible: !1, extensions: ["stpxz"] },
  "model/stl": { source: "iana", extensions: ["stl"] },
  "model/vnd.collada+xml": { source: "iana", compressible: !0, extensions: ["dae"] },
  "model/vnd.dwf": { source: "iana", extensions: ["dwf"] },
  "model/vnd.flatland.3dml": { source: "iana" },
  "model/vnd.gdl": { source: "iana", extensions: ["gdl"] },
  "model/vnd.gs-gdl": { source: "apache" },
  "model/vnd.gs.gdl": { source: "iana" },
  "model/vnd.gtw": { source: "iana", extensions: ["gtw"] },
  "model/vnd.moml+xml": { source: "iana", compressible: !0 },
  "model/vnd.mts": { source: "iana", extensions: ["mts"] },
  "model/vnd.opengex": { source: "iana", extensions: ["ogex"] },
  "model/vnd.parasolid.transmit.binary": { source: "iana", extensions: ["x_b"] },
  "model/vnd.parasolid.transmit.text": { source: "iana", extensions: ["x_t"] },
  "model/vnd.pytha.pyox": { source: "iana" },
  "model/vnd.rosette.annotated-data-model": { source: "iana" },
  "model/vnd.sap.vds": { source: "iana", extensions: ["vds"] },
  "model/vnd.usdz+zip": { source: "iana", compressible: !1, extensions: ["usdz"] },
  "model/vnd.valve.source.compiled-map": { source: "iana", extensions: ["bsp"] },
  "model/vnd.vtu": { source: "iana", extensions: ["vtu"] },
  "model/vrml": { source: "iana", compressible: !1, extensions: ["wrl", "vrml"] },
  "model/x3d+binary": { source: "apache", compressible: !1, extensions: ["x3db", "x3dbz"] },
  "model/x3d+fastinfoset": { source: "iana", extensions: ["x3db"] },
  "model/x3d+vrml": { source: "apache", compressible: !1, extensions: ["x3dv", "x3dvz"] },
  "model/x3d+xml": { source: "iana", compressible: !0, extensions: ["x3d", "x3dz"] },
  "model/x3d-vrml": { source: "iana", extensions: ["x3dv"] },
  "multipart/alternative": { source: "iana", compressible: !1 },
  "multipart/appledouble": { source: "iana" },
  "multipart/byteranges": { source: "iana" },
  "multipart/digest": { source: "iana" },
  "multipart/encrypted": { source: "iana", compressible: !1 },
  "multipart/form-data": { source: "iana", compressible: !1 },
  "multipart/header-set": { source: "iana" },
  "multipart/mixed": { source: "iana" },
  "multipart/multilingual": { source: "iana" },
  "multipart/parallel": { source: "iana" },
  "multipart/related": { source: "iana", compressible: !1 },
  "multipart/report": { source: "iana" },
  "multipart/signed": { source: "iana", compressible: !1 },
  "multipart/vnd.bint.med-plus": { source: "iana" },
  "multipart/voice-message": { source: "iana" },
  "multipart/x-mixed-replace": { source: "iana" },
  "text/1d-interleaved-parityfec": { source: "iana" },
  "text/cache-manifest": { source: "iana", compressible: !0, extensions: ["appcache", "manifest"] },
  "text/calendar": { source: "iana", extensions: ["ics", "ifb"] },
  "text/calender": { compressible: !0 },
  "text/cmd": { compressible: !0 },
  "text/coffeescript": { extensions: ["coffee", "litcoffee"] },
  "text/cql": { source: "iana" },
  "text/cql-expression": { source: "iana" },
  "text/cql-identifier": { source: "iana" },
  "text/css": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["css"] },
  "text/csv": { source: "iana", compressible: !0, extensions: ["csv"] },
  "text/csv-schema": { source: "iana" },
  "text/directory": { source: "iana" },
  "text/dns": { source: "iana" },
  "text/ecmascript": { source: "iana" },
  "text/encaprtp": { source: "iana" },
  "text/enriched": { source: "iana" },
  "text/fhirpath": { source: "iana" },
  "text/flexfec": { source: "iana" },
  "text/fwdred": { source: "iana" },
  "text/gff3": { source: "iana" },
  "text/grammar-ref-list": { source: "iana" },
  "text/html": { source: "iana", compressible: !0, extensions: ["html", "htm", "shtml"] },
  "text/jade": { extensions: ["jade"] },
  "text/javascript": { source: "iana", compressible: !0 },
  "text/jcr-cnd": { source: "iana" },
  "text/jsx": { compressible: !0, extensions: ["jsx"] },
  "text/less": { compressible: !0, extensions: ["less"] },
  "text/markdown": { source: "iana", compressible: !0, extensions: ["markdown", "md"] },
  "text/mathml": { source: "nginx", extensions: ["mml"] },
  "text/mdx": { compressible: !0, extensions: ["mdx"] },
  "text/mizar": { source: "iana" },
  "text/n3": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["n3"] },
  "text/parameters": { source: "iana", charset: "UTF-8" },
  "text/parityfec": { source: "iana" },
  "text/plain": { source: "iana", compressible: !0, extensions: ["txt", "text", "conf", "def", "list", "log", "in", "ini"] },
  "text/provenance-notation": { source: "iana", charset: "UTF-8" },
  "text/prs.fallenstein.rst": { source: "iana" },
  "text/prs.lines.tag": { source: "iana", extensions: ["dsc"] },
  "text/prs.prop.logic": { source: "iana" },
  "text/raptorfec": { source: "iana" },
  "text/red": { source: "iana" },
  "text/rfc822-headers": { source: "iana" },
  "text/richtext": { source: "iana", compressible: !0, extensions: ["rtx"] },
  "text/rtf": { source: "iana", compressible: !0, extensions: ["rtf"] },
  "text/rtp-enc-aescm128": { source: "iana" },
  "text/rtploopback": { source: "iana" },
  "text/rtx": { source: "iana" },
  "text/sgml": { source: "iana", extensions: ["sgml", "sgm"] },
  "text/shaclc": { source: "iana" },
  "text/shex": { source: "iana", extensions: ["shex"] },
  "text/slim": { extensions: ["slim", "slm"] },
  "text/spdx": { source: "iana", extensions: ["spdx"] },
  "text/strings": { source: "iana" },
  "text/stylus": { extensions: ["stylus", "styl"] },
  "text/t140": { source: "iana" },
  "text/tab-separated-values": { source: "iana", compressible: !0, extensions: ["tsv"] },
  "text/troff": { source: "iana", extensions: ["t", "tr", "roff", "man", "me", "ms"] },
  "text/turtle": { source: "iana", charset: "UTF-8", extensions: ["ttl"] },
  "text/ulpfec": { source: "iana" },
  "text/uri-list": { source: "iana", compressible: !0, extensions: ["uri", "uris", "urls"] },
  "text/vcard": { source: "iana", compressible: !0, extensions: ["vcard"] },
  "text/vnd.a": { source: "iana" },
  "text/vnd.abc": { source: "iana" },
  "text/vnd.ascii-art": { source: "iana" },
  "text/vnd.curl": { source: "iana", extensions: ["curl"] },
  "text/vnd.curl.dcurl": { source: "apache", extensions: ["dcurl"] },
  "text/vnd.curl.mcurl": { source: "apache", extensions: ["mcurl"] },
  "text/vnd.curl.scurl": { source: "apache", extensions: ["scurl"] },
  "text/vnd.debian.copyright": { source: "iana", charset: "UTF-8" },
  "text/vnd.dmclientscript": { source: "iana" },
  "text/vnd.dvb.subtitle": { source: "iana", extensions: ["sub"] },
  "text/vnd.esmertec.theme-descriptor": { source: "iana", charset: "UTF-8" },
  "text/vnd.familysearch.gedcom": { source: "iana", extensions: ["ged"] },
  "text/vnd.ficlab.flt": { source: "iana" },
  "text/vnd.fly": { source: "iana", extensions: ["fly"] },
  "text/vnd.fmi.flexstor": { source: "iana", extensions: ["flx"] },
  "text/vnd.gml": { source: "iana" },
  "text/vnd.graphviz": { source: "iana", extensions: ["gv"] },
  "text/vnd.hans": { source: "iana" },
  "text/vnd.hgl": { source: "iana" },
  "text/vnd.in3d.3dml": { source: "iana", extensions: ["3dml"] },
  "text/vnd.in3d.spot": { source: "iana", extensions: ["spot"] },
  "text/vnd.iptc.newsml": { source: "iana" },
  "text/vnd.iptc.nitf": { source: "iana" },
  "text/vnd.latex-z": { source: "iana" },
  "text/vnd.motorola.reflex": { source: "iana" },
  "text/vnd.ms-mediapackage": { source: "iana" },
  "text/vnd.net2phone.commcenter.command": { source: "iana" },
  "text/vnd.radisys.msml-basic-layout": { source: "iana" },
  "text/vnd.senx.warpscript": { source: "iana" },
  "text/vnd.si.uricatalogue": { source: "iana" },
  "text/vnd.sosi": { source: "iana" },
  "text/vnd.sun.j2me.app-descriptor": { source: "iana", charset: "UTF-8", extensions: ["jad"] },
  "text/vnd.trolltech.linguist": { source: "iana", charset: "UTF-8" },
  "text/vnd.wap.si": { source: "iana" },
  "text/vnd.wap.sl": { source: "iana" },
  "text/vnd.wap.wml": { source: "iana", extensions: ["wml"] },
  "text/vnd.wap.wmlscript": { source: "iana", extensions: ["wmls"] },
  "text/vtt": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["vtt"] },
  "text/x-asm": { source: "apache", extensions: ["s", "asm"] },
  "text/x-c": { source: "apache", extensions: ["c", "cc", "cxx", "cpp", "h", "hh", "dic"] },
  "text/x-component": { source: "nginx", extensions: ["htc"] },
  "text/x-fortran": { source: "apache", extensions: ["f", "for", "f77", "f90"] },
  "text/x-gwt-rpc": { compressible: !0 },
  "text/x-handlebars-template": { extensions: ["hbs"] },
  "text/x-java-source": { source: "apache", extensions: ["java"] },
  "text/x-jquery-tmpl": { compressible: !0 },
  "text/x-lua": { extensions: ["lua"] },
  "text/x-markdown": { compressible: !0, extensions: ["mkd"] },
  "text/x-nfo": { source: "apache", extensions: ["nfo"] },
  "text/x-opml": { source: "apache", extensions: ["opml"] },
  "text/x-org": { compressible: !0, extensions: ["org"] },
  "text/x-pascal": { source: "apache", extensions: ["p", "pas"] },
  "text/x-processing": { compressible: !0, extensions: ["pde"] },
  "text/x-sass": { extensions: ["sass"] },
  "text/x-scss": { extensions: ["scss"] },
  "text/x-setext": { source: "apache", extensions: ["etx"] },
  "text/x-sfv": { source: "apache", extensions: ["sfv"] },
  "text/x-suse-ymp": { compressible: !0, extensions: ["ymp"] },
  "text/x-uuencode": { source: "apache", extensions: ["uu"] },
  "text/x-vcalendar": { source: "apache", extensions: ["vcs"] },
  "text/x-vcard": { source: "apache", extensions: ["vcf"] },
  "text/xml": { source: "iana", compressible: !0, extensions: ["xml"] },
  "text/xml-external-parsed-entity": { source: "iana" },
  "text/yaml": { compressible: !0, extensions: ["yaml", "yml"] },
  "video/1d-interleaved-parityfec": { source: "iana" },
  "video/3gpp": { source: "iana", extensions: ["3gp", "3gpp"] },
  "video/3gpp-tt": { source: "iana" },
  "video/3gpp2": { source: "iana", extensions: ["3g2"] },
  "video/av1": { source: "iana" },
  "video/bmpeg": { source: "iana" },
  "video/bt656": { source: "iana" },
  "video/celb": { source: "iana" },
  "video/dv": { source: "iana" },
  "video/encaprtp": { source: "iana" },
  "video/ffv1": { source: "iana" },
  "video/flexfec": { source: "iana" },
  "video/h261": { source: "iana", extensions: ["h261"] },
  "video/h263": { source: "iana", extensions: ["h263"] },
  "video/h263-1998": { source: "iana" },
  "video/h263-2000": { source: "iana" },
  "video/h264": { source: "iana", extensions: ["h264"] },
  "video/h264-rcdo": { source: "iana" },
  "video/h264-svc": { source: "iana" },
  "video/h265": { source: "iana" },
  "video/iso.segment": { source: "iana", extensions: ["m4s"] },
  "video/jpeg": { source: "iana", extensions: ["jpgv"] },
  "video/jpeg2000": { source: "iana" },
  "video/jpm": { source: "apache", extensions: ["jpm", "jpgm"] },
  "video/jxsv": { source: "iana" },
  "video/mj2": { source: "iana", extensions: ["mj2", "mjp2"] },
  "video/mp1s": { source: "iana" },
  "video/mp2p": { source: "iana" },
  "video/mp2t": { source: "iana", extensions: ["ts"] },
  "video/mp4": { source: "iana", compressible: !1, extensions: ["mp4", "mp4v", "mpg4"] },
  "video/mp4v-es": { source: "iana" },
  "video/mpeg": { source: "iana", compressible: !1, extensions: ["mpeg", "mpg", "mpe", "m1v", "m2v"] },
  "video/mpeg4-generic": { source: "iana" },
  "video/mpv": { source: "iana" },
  "video/nv": { source: "iana" },
  "video/ogg": { source: "iana", compressible: !1, extensions: ["ogv"] },
  "video/parityfec": { source: "iana" },
  "video/pointer": { source: "iana" },
  "video/quicktime": { source: "iana", compressible: !1, extensions: ["qt", "mov"] },
  "video/raptorfec": { source: "iana" },
  "video/raw": { source: "iana" },
  "video/rtp-enc-aescm128": { source: "iana" },
  "video/rtploopback": { source: "iana" },
  "video/rtx": { source: "iana" },
  "video/scip": { source: "iana" },
  "video/smpte291": { source: "iana" },
  "video/smpte292m": { source: "iana" },
  "video/ulpfec": { source: "iana" },
  "video/vc1": { source: "iana" },
  "video/vc2": { source: "iana" },
  "video/vnd.cctv": { source: "iana" },
  "video/vnd.dece.hd": { source: "iana", extensions: ["uvh", "uvvh"] },
  "video/vnd.dece.mobile": { source: "iana", extensions: ["uvm", "uvvm"] },
  "video/vnd.dece.mp4": { source: "iana" },
  "video/vnd.dece.pd": { source: "iana", extensions: ["uvp", "uvvp"] },
  "video/vnd.dece.sd": { source: "iana", extensions: ["uvs", "uvvs"] },
  "video/vnd.dece.video": { source: "iana", extensions: ["uvv", "uvvv"] },
  "video/vnd.directv.mpeg": { source: "iana" },
  "video/vnd.directv.mpeg-tts": { source: "iana" },
  "video/vnd.dlna.mpeg-tts": { source: "iana" },
  "video/vnd.dvb.file": { source: "iana", extensions: ["dvb"] },
  "video/vnd.fvt": { source: "iana", extensions: ["fvt"] },
  "video/vnd.hns.video": { source: "iana" },
  "video/vnd.iptvforum.1dparityfec-1010": { source: "iana" },
  "video/vnd.iptvforum.1dparityfec-2005": { source: "iana" },
  "video/vnd.iptvforum.2dparityfec-1010": { source: "iana" },
  "video/vnd.iptvforum.2dparityfec-2005": { source: "iana" },
  "video/vnd.iptvforum.ttsavc": { source: "iana" },
  "video/vnd.iptvforum.ttsmpeg2": { source: "iana" },
  "video/vnd.motorola.video": { source: "iana" },
  "video/vnd.motorola.videop": { source: "iana" },
  "video/vnd.mpegurl": { source: "iana", extensions: ["mxu", "m4u"] },
  "video/vnd.ms-playready.media.pyv": { source: "iana", extensions: ["pyv"] },
  "video/vnd.nokia.interleaved-multimedia": { source: "iana" },
  "video/vnd.nokia.mp4vr": { source: "iana" },
  "video/vnd.nokia.videovoip": { source: "iana" },
  "video/vnd.objectvideo": { source: "iana" },
  "video/vnd.radgamettools.bink": { source: "iana" },
  "video/vnd.radgamettools.smacker": { source: "iana" },
  "video/vnd.sealed.mpeg1": { source: "iana" },
  "video/vnd.sealed.mpeg4": { source: "iana" },
  "video/vnd.sealed.swf": { source: "iana" },
  "video/vnd.sealedmedia.softseal.mov": { source: "iana" },
  "video/vnd.uvvu.mp4": { source: "iana", extensions: ["uvu", "uvvu"] },
  "video/vnd.vivo": { source: "iana", extensions: ["viv"] },
  "video/vnd.youtube.yt": { source: "iana" },
  "video/vp8": { source: "iana" },
  "video/vp9": { source: "iana" },
  "video/webm": { source: "apache", compressible: !1, extensions: ["webm"] },
  "video/x-f4v": { source: "apache", extensions: ["f4v"] },
  "video/x-fli": { source: "apache", extensions: ["fli"] },
  "video/x-flv": { source: "apache", compressible: !1, extensions: ["flv"] },
  "video/x-m4v": { source: "apache", extensions: ["m4v"] },
  "video/x-matroska": { source: "apache", compressible: !1, extensions: ["mkv", "mk3d", "mks"] },
  "video/x-mng": { source: "apache", extensions: ["mng"] },
  "video/x-ms-asf": { source: "apache", extensions: ["asf", "asx"] },
  "video/x-ms-vob": { source: "apache", extensions: ["vob"] },
  "video/x-ms-wm": { source: "apache", extensions: ["wm"] },
  "video/x-ms-wmv": { source: "apache", compressible: !1, extensions: ["wmv"] },
  "video/x-ms-wmx": { source: "apache", extensions: ["wmx"] },
  "video/x-ms-wvx": { source: "apache", extensions: ["wvx"] },
  "video/x-msvideo": { source: "apache", extensions: ["avi"] },
  "video/x-sgi-movie": { source: "apache", extensions: ["movie"] },
  "video/x-smv": { source: "apache", extensions: ["smv"] },
  "x-conference/x-cooltalk": { source: "apache", extensions: ["ice"] },
  "x-shader/x-fragment": { compressible: !0 },
  "x-shader/x-vertex": { compressible: !0 }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var Yt, Ha;
function Vr() {
  return Ha || (Ha = 1, Yt = Gr), Yt;
}
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var Wa;
function Kr() {
  return Wa || (Wa = 1, (function(t) {
    var e = Vr(), a = xe.extname, n = /^\s*([^;\s]*)(?:;|\s|$)/, i = /^text\//i;
    t.charset = o, t.charsets = { lookup: o }, t.contentType = s, t.extension = r, t.extensions = /* @__PURE__ */ Object.create(null), t.lookup = c, t.types = /* @__PURE__ */ Object.create(null), u(t.extensions, t.types);
    function o(p) {
      if (!p || typeof p != "string")
        return !1;
      var d = n.exec(p), l = d && e[d[1].toLowerCase()];
      return l && l.charset ? l.charset : d && i.test(d[1]) ? "UTF-8" : !1;
    }
    function s(p) {
      if (!p || typeof p != "string")
        return !1;
      var d = p.indexOf("/") === -1 ? t.lookup(p) : p;
      if (!d)
        return !1;
      if (d.indexOf("charset") === -1) {
        var l = t.charset(d);
        l && (d += "; charset=" + l.toLowerCase());
      }
      return d;
    }
    function r(p) {
      if (!p || typeof p != "string")
        return !1;
      var d = n.exec(p), l = d && t.extensions[d[1].toLowerCase()];
      return !l || !l.length ? !1 : l[0];
    }
    function c(p) {
      if (!p || typeof p != "string")
        return !1;
      var d = a("x." + p).toLowerCase().substr(1);
      return d && t.types[d] || !1;
    }
    function u(p, d) {
      var l = ["nginx", "apache", void 0, "iana"];
      Object.keys(e).forEach(function(x) {
        var f = e[x], h = f.extensions;
        if (!(!h || !h.length)) {
          p[x] = h;
          for (var v = 0; v < h.length; v++) {
            var w = h[v];
            if (d[w]) {
              var k = l.indexOf(e[d[w]].source), A = l.indexOf(f.source);
              if (d[w] !== "application/octet-stream" && (k > A || k === A && d[w].substr(0, 12) === "application/"))
                continue;
            }
            d[w] = x;
          }
        }
      });
    }
  })(Kt)), Kt;
}
var Jt, Ga;
function Yr() {
  if (Ga) return Jt;
  Ga = 1, Jt = t;
  function t(e) {
    var a = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
    a ? a(e) : setTimeout(e, 0);
  }
  return Jt;
}
var Xt, Va;
function Js() {
  if (Va) return Xt;
  Va = 1;
  var t = Yr();
  Xt = e;
  function e(a) {
    var n = !1;
    return t(function() {
      n = !0;
    }), function(o, s) {
      n ? a(o, s) : t(function() {
        a(o, s);
      });
    };
  }
  return Xt;
}
var Zt, Ka;
function Xs() {
  if (Ka) return Zt;
  Ka = 1, Zt = t;
  function t(a) {
    Object.keys(a.jobs).forEach(e.bind(a)), a.jobs = {};
  }
  function e(a) {
    typeof this.jobs[a] == "function" && this.jobs[a]();
  }
  return Zt;
}
var Qt, Ya;
function Zs() {
  if (Ya) return Qt;
  Ya = 1;
  var t = Js(), e = Xs();
  Qt = a;
  function a(i, o, s, r) {
    var c = s.keyedList ? s.keyedList[s.index] : s.index;
    s.jobs[c] = n(o, c, i[c], function(u, p) {
      c in s.jobs && (delete s.jobs[c], u ? e(s) : s.results[c] = p, r(u, s.results));
    });
  }
  function n(i, o, s, r) {
    var c;
    return i.length == 2 ? c = i(s, t(r)) : c = i(s, o, t(r)), c;
  }
  return Qt;
}
var en, Ja;
function Qs() {
  if (Ja) return en;
  Ja = 1, en = t;
  function t(e, a) {
    var n = !Array.isArray(e), i = {
      index: 0,
      keyedList: n || a ? Object.keys(e) : null,
      jobs: {},
      results: n ? {} : [],
      size: n ? Object.keys(e).length : e.length
    };
    return a && i.keyedList.sort(n ? a : function(o, s) {
      return a(e[o], e[s]);
    }), i;
  }
  return en;
}
var tn, Xa;
function eo() {
  if (Xa) return tn;
  Xa = 1;
  var t = Xs(), e = Js();
  tn = a;
  function a(n) {
    Object.keys(this.jobs).length && (this.index = this.size, t(this), e(n)(null, this.results));
  }
  return tn;
}
var nn, Za;
function Jr() {
  if (Za) return nn;
  Za = 1;
  var t = Zs(), e = Qs(), a = eo();
  nn = n;
  function n(i, o, s) {
    for (var r = e(i); r.index < (r.keyedList || i).length; )
      t(i, o, r, function(c, u) {
        if (c) {
          s(c, u);
          return;
        }
        if (Object.keys(r.jobs).length === 0) {
          s(null, r.results);
          return;
        }
      }), r.index++;
    return a.bind(r, s);
  }
  return nn;
}
var et = { exports: {} }, Qa;
function to() {
  if (Qa) return et.exports;
  Qa = 1;
  var t = Zs(), e = Qs(), a = eo();
  et.exports = n, et.exports.ascending = i, et.exports.descending = o;
  function n(s, r, c, u) {
    var p = e(s, c);
    return t(s, r, p, function d(l, E) {
      if (l) {
        u(l, E);
        return;
      }
      if (p.index++, p.index < (p.keyedList || s).length) {
        t(s, r, p, d);
        return;
      }
      u(null, p.results);
    }), a.bind(p, u);
  }
  function i(s, r) {
    return s < r ? -1 : s > r ? 1 : 0;
  }
  function o(s, r) {
    return -1 * i(s, r);
  }
  return et.exports;
}
var an, ei;
function Xr() {
  if (ei) return an;
  ei = 1;
  var t = to();
  an = e;
  function e(a, n, i) {
    return t(a, n, null, i);
  }
  return an;
}
var sn, ti;
function Zr() {
  return ti || (ti = 1, sn = {
    parallel: Jr(),
    serial: Xr(),
    serialOrdered: to()
  }), sn;
}
var on, ni;
function no() {
  return ni || (ni = 1, on = Object), on;
}
var rn, ai;
function Qr() {
  return ai || (ai = 1, rn = Error), rn;
}
var cn, ii;
function ec() {
  return ii || (ii = 1, cn = EvalError), cn;
}
var pn, si;
function tc() {
  return si || (si = 1, pn = RangeError), pn;
}
var ln, oi;
function nc() {
  return oi || (oi = 1, ln = ReferenceError), ln;
}
var un, ri;
function ac() {
  return ri || (ri = 1, un = SyntaxError), un;
}
var dn, ci;
function Ea() {
  return ci || (ci = 1, dn = TypeError), dn;
}
var mn, pi;
function ic() {
  return pi || (pi = 1, mn = URIError), mn;
}
var fn, li;
function sc() {
  return li || (li = 1, fn = Math.abs), fn;
}
var hn, ui;
function oc() {
  return ui || (ui = 1, hn = Math.floor), hn;
}
var xn, di;
function rc() {
  return di || (di = 1, xn = Math.max), xn;
}
var vn, mi;
function cc() {
  return mi || (mi = 1, vn = Math.min), vn;
}
var bn, fi;
function pc() {
  return fi || (fi = 1, bn = Math.pow), bn;
}
var gn, hi;
function lc() {
  return hi || (hi = 1, gn = Math.round), gn;
}
var yn, xi;
function uc() {
  return xi || (xi = 1, yn = Number.isNaN || function(e) {
    return e !== e;
  }), yn;
}
var _n, vi;
function dc() {
  if (vi) return _n;
  vi = 1;
  var t = /* @__PURE__ */ uc();
  return _n = function(a) {
    return t(a) || a === 0 ? a : a < 0 ? -1 : 1;
  }, _n;
}
var wn, bi;
function mc() {
  return bi || (bi = 1, wn = Object.getOwnPropertyDescriptor), wn;
}
var En, gi;
function ao() {
  if (gi) return En;
  gi = 1;
  var t = /* @__PURE__ */ mc();
  if (t)
    try {
      t([], "length");
    } catch {
      t = null;
    }
  return En = t, En;
}
var Sn, yi;
function fc() {
  if (yi) return Sn;
  yi = 1;
  var t = Object.defineProperty || !1;
  if (t)
    try {
      t({}, "a", { value: 1 });
    } catch {
      t = !1;
    }
  return Sn = t, Sn;
}
var Rn, _i;
function io() {
  return _i || (_i = 1, Rn = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function")
      return !1;
    if (typeof Symbol.iterator == "symbol")
      return !0;
    var e = {}, a = Symbol("test"), n = Object(a);
    if (typeof a == "string" || Object.prototype.toString.call(a) !== "[object Symbol]" || Object.prototype.toString.call(n) !== "[object Symbol]")
      return !1;
    var i = 42;
    e[a] = i;
    for (var o in e)
      return !1;
    if (typeof Object.keys == "function" && Object.keys(e).length !== 0 || typeof Object.getOwnPropertyNames == "function" && Object.getOwnPropertyNames(e).length !== 0)
      return !1;
    var s = Object.getOwnPropertySymbols(e);
    if (s.length !== 1 || s[0] !== a || !Object.prototype.propertyIsEnumerable.call(e, a))
      return !1;
    if (typeof Object.getOwnPropertyDescriptor == "function") {
      var r = (
        /** @type {PropertyDescriptor} */
        Object.getOwnPropertyDescriptor(e, a)
      );
      if (r.value !== i || r.enumerable !== !0)
        return !1;
    }
    return !0;
  }), Rn;
}
var kn, wi;
function hc() {
  if (wi) return kn;
  wi = 1;
  var t = typeof Symbol < "u" && Symbol, e = io();
  return kn = function() {
    return typeof t != "function" || typeof Symbol != "function" || typeof t("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? !1 : e();
  }, kn;
}
var On, Ei;
function so() {
  return Ei || (Ei = 1, On = typeof Reflect < "u" && Reflect.getPrototypeOf || null), On;
}
var Tn, Si;
function oo() {
  if (Si) return Tn;
  Si = 1;
  var t = /* @__PURE__ */ no();
  return Tn = t.getPrototypeOf || null, Tn;
}
var Cn, Ri;
function xc() {
  if (Ri) return Cn;
  Ri = 1;
  var t = "Function.prototype.bind called on incompatible ", e = Object.prototype.toString, a = Math.max, n = "[object Function]", i = function(c, u) {
    for (var p = [], d = 0; d < c.length; d += 1)
      p[d] = c[d];
    for (var l = 0; l < u.length; l += 1)
      p[l + c.length] = u[l];
    return p;
  }, o = function(c, u) {
    for (var p = [], d = u, l = 0; d < c.length; d += 1, l += 1)
      p[l] = c[d];
    return p;
  }, s = function(r, c) {
    for (var u = "", p = 0; p < r.length; p += 1)
      u += r[p], p + 1 < r.length && (u += c);
    return u;
  };
  return Cn = function(c) {
    var u = this;
    if (typeof u != "function" || e.apply(u) !== n)
      throw new TypeError(t + u);
    for (var p = o(arguments, 1), d, l = function() {
      if (this instanceof d) {
        var v = u.apply(
          this,
          i(p, arguments)
        );
        return Object(v) === v ? v : this;
      }
      return u.apply(
        c,
        i(p, arguments)
      );
    }, E = a(0, u.length - p.length), x = [], f = 0; f < E; f++)
      x[f] = "$" + f;
    if (d = Function("binder", "return function (" + s(x, ",") + "){ return binder.apply(this,arguments); }")(l), u.prototype) {
      var h = function() {
      };
      h.prototype = u.prototype, d.prototype = new h(), h.prototype = null;
    }
    return d;
  }, Cn;
}
var An, ki;
function Nt() {
  if (ki) return An;
  ki = 1;
  var t = xc();
  return An = Function.prototype.bind || t, An;
}
var Pn, Oi;
function Sa() {
  return Oi || (Oi = 1, Pn = Function.prototype.call), Pn;
}
var jn, Ti;
function ro() {
  return Ti || (Ti = 1, jn = Function.prototype.apply), jn;
}
var Ln, Ci;
function vc() {
  return Ci || (Ci = 1, Ln = typeof Reflect < "u" && Reflect && Reflect.apply), Ln;
}
var Nn, Ai;
function bc() {
  if (Ai) return Nn;
  Ai = 1;
  var t = Nt(), e = ro(), a = Sa(), n = vc();
  return Nn = n || t.call(a, e), Nn;
}
var Bn, Pi;
function gc() {
  if (Pi) return Bn;
  Pi = 1;
  var t = Nt(), e = /* @__PURE__ */ Ea(), a = Sa(), n = bc();
  return Bn = function(o) {
    if (o.length < 1 || typeof o[0] != "function")
      throw new e("a function is required");
    return n(t, a, o);
  }, Bn;
}
var Fn, ji;
function yc() {
  if (ji) return Fn;
  ji = 1;
  var t = gc(), e = /* @__PURE__ */ ao(), a;
  try {
    a = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (s) {
    if (!s || typeof s != "object" || !("code" in s) || s.code !== "ERR_PROTO_ACCESS")
      throw s;
  }
  var n = !!a && e && e(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  ), i = Object, o = i.getPrototypeOf;
  return Fn = n && typeof n.get == "function" ? t([n.get]) : typeof o == "function" ? (
    /** @type {import('./get')} */
    function(r) {
      return o(r == null ? r : i(r));
    }
  ) : !1, Fn;
}
var Un, Li;
function _c() {
  if (Li) return Un;
  Li = 1;
  var t = so(), e = oo(), a = /* @__PURE__ */ yc();
  return Un = t ? function(i) {
    return t(i);
  } : e ? function(i) {
    if (!i || typeof i != "object" && typeof i != "function")
      throw new TypeError("getProto: not an object");
    return e(i);
  } : a ? function(i) {
    return a(i);
  } : null, Un;
}
var qn, Ni;
function Ra() {
  if (Ni) return qn;
  Ni = 1;
  var t = Function.prototype.call, e = Object.prototype.hasOwnProperty, a = Nt();
  return qn = a.call(t, e), qn;
}
var Dn, Bi;
function wc() {
  if (Bi) return Dn;
  Bi = 1;
  var t, e = /* @__PURE__ */ no(), a = /* @__PURE__ */ Qr(), n = /* @__PURE__ */ ec(), i = /* @__PURE__ */ tc(), o = /* @__PURE__ */ nc(), s = /* @__PURE__ */ ac(), r = /* @__PURE__ */ Ea(), c = /* @__PURE__ */ ic(), u = /* @__PURE__ */ sc(), p = /* @__PURE__ */ oc(), d = /* @__PURE__ */ rc(), l = /* @__PURE__ */ cc(), E = /* @__PURE__ */ pc(), x = /* @__PURE__ */ lc(), f = /* @__PURE__ */ dc(), h = Function, v = function(fe) {
    try {
      return h('"use strict"; return (' + fe + ").constructor;")();
    } catch {
    }
  }, w = /* @__PURE__ */ ao(), k = /* @__PURE__ */ fc(), A = function() {
    throw new r();
  }, g = w ? (function() {
    try {
      return arguments.callee, A;
    } catch {
      try {
        return w(arguments, "callee").get;
      } catch {
        return A;
      }
    }
  })() : A, m = hc()(), y = _c(), S = oo(), j = so(), L = ro(), I = Sa(), D = {}, W = typeof Uint8Array > "u" || !y ? t : y(Uint8Array), q = {
    __proto__: null,
    "%AggregateError%": typeof AggregateError > "u" ? t : AggregateError,
    "%Array%": Array,
    "%ArrayBuffer%": typeof ArrayBuffer > "u" ? t : ArrayBuffer,
    "%ArrayIteratorPrototype%": m && y ? y([][Symbol.iterator]()) : t,
    "%AsyncFromSyncIteratorPrototype%": t,
    "%AsyncFunction%": D,
    "%AsyncGenerator%": D,
    "%AsyncGeneratorFunction%": D,
    "%AsyncIteratorPrototype%": D,
    "%Atomics%": typeof Atomics > "u" ? t : Atomics,
    "%BigInt%": typeof BigInt > "u" ? t : BigInt,
    "%BigInt64Array%": typeof BigInt64Array > "u" ? t : BigInt64Array,
    "%BigUint64Array%": typeof BigUint64Array > "u" ? t : BigUint64Array,
    "%Boolean%": Boolean,
    "%DataView%": typeof DataView > "u" ? t : DataView,
    "%Date%": Date,
    "%decodeURI%": decodeURI,
    "%decodeURIComponent%": decodeURIComponent,
    "%encodeURI%": encodeURI,
    "%encodeURIComponent%": encodeURIComponent,
    "%Error%": a,
    "%eval%": eval,
    // eslint-disable-line no-eval
    "%EvalError%": n,
    "%Float16Array%": typeof Float16Array > "u" ? t : Float16Array,
    "%Float32Array%": typeof Float32Array > "u" ? t : Float32Array,
    "%Float64Array%": typeof Float64Array > "u" ? t : Float64Array,
    "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? t : FinalizationRegistry,
    "%Function%": h,
    "%GeneratorFunction%": D,
    "%Int8Array%": typeof Int8Array > "u" ? t : Int8Array,
    "%Int16Array%": typeof Int16Array > "u" ? t : Int16Array,
    "%Int32Array%": typeof Int32Array > "u" ? t : Int32Array,
    "%isFinite%": isFinite,
    "%isNaN%": isNaN,
    "%IteratorPrototype%": m && y ? y(y([][Symbol.iterator]())) : t,
    "%JSON%": typeof JSON == "object" ? JSON : t,
    "%Map%": typeof Map > "u" ? t : Map,
    "%MapIteratorPrototype%": typeof Map > "u" || !m || !y ? t : y((/* @__PURE__ */ new Map())[Symbol.iterator]()),
    "%Math%": Math,
    "%Number%": Number,
    "%Object%": e,
    "%Object.getOwnPropertyDescriptor%": w,
    "%parseFloat%": parseFloat,
    "%parseInt%": parseInt,
    "%Promise%": typeof Promise > "u" ? t : Promise,
    "%Proxy%": typeof Proxy > "u" ? t : Proxy,
    "%RangeError%": i,
    "%ReferenceError%": o,
    "%Reflect%": typeof Reflect > "u" ? t : Reflect,
    "%RegExp%": RegExp,
    "%Set%": typeof Set > "u" ? t : Set,
    "%SetIteratorPrototype%": typeof Set > "u" || !m || !y ? t : y((/* @__PURE__ */ new Set())[Symbol.iterator]()),
    "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? t : SharedArrayBuffer,
    "%String%": String,
    "%StringIteratorPrototype%": m && y ? y(""[Symbol.iterator]()) : t,
    "%Symbol%": m ? Symbol : t,
    "%SyntaxError%": s,
    "%ThrowTypeError%": g,
    "%TypedArray%": W,
    "%TypeError%": r,
    "%Uint8Array%": typeof Uint8Array > "u" ? t : Uint8Array,
    "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? t : Uint8ClampedArray,
    "%Uint16Array%": typeof Uint16Array > "u" ? t : Uint16Array,
    "%Uint32Array%": typeof Uint32Array > "u" ? t : Uint32Array,
    "%URIError%": c,
    "%WeakMap%": typeof WeakMap > "u" ? t : WeakMap,
    "%WeakRef%": typeof WeakRef > "u" ? t : WeakRef,
    "%WeakSet%": typeof WeakSet > "u" ? t : WeakSet,
    "%Function.prototype.call%": I,
    "%Function.prototype.apply%": L,
    "%Object.defineProperty%": k,
    "%Object.getPrototypeOf%": S,
    "%Math.abs%": u,
    "%Math.floor%": p,
    "%Math.max%": d,
    "%Math.min%": l,
    "%Math.pow%": E,
    "%Math.round%": x,
    "%Math.sign%": f,
    "%Reflect.getPrototypeOf%": j
  };
  if (y)
    try {
      null.error;
    } catch (fe) {
      var ne = y(y(fe));
      q["%Error.prototype%"] = ne;
    }
  var b = function fe(G) {
    var ce;
    if (G === "%AsyncFunction%")
      ce = v("async function () {}");
    else if (G === "%GeneratorFunction%")
      ce = v("function* () {}");
    else if (G === "%AsyncGeneratorFunction%")
      ce = v("async function* () {}");
    else if (G === "%AsyncGenerator%") {
      var ae = fe("%AsyncGeneratorFunction%");
      ae && (ce = ae.prototype);
    } else if (G === "%AsyncIteratorPrototype%") {
      var pe = fe("%AsyncGenerator%");
      pe && y && (ce = y(pe.prototype));
    }
    return q[G] = ce, ce;
  }, O = {
    __proto__: null,
    "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
    "%ArrayPrototype%": ["Array", "prototype"],
    "%ArrayProto_entries%": ["Array", "prototype", "entries"],
    "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
    "%ArrayProto_keys%": ["Array", "prototype", "keys"],
    "%ArrayProto_values%": ["Array", "prototype", "values"],
    "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
    "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
    "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
    "%BooleanPrototype%": ["Boolean", "prototype"],
    "%DataViewPrototype%": ["DataView", "prototype"],
    "%DatePrototype%": ["Date", "prototype"],
    "%ErrorPrototype%": ["Error", "prototype"],
    "%EvalErrorPrototype%": ["EvalError", "prototype"],
    "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
    "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
    "%FunctionPrototype%": ["Function", "prototype"],
    "%Generator%": ["GeneratorFunction", "prototype"],
    "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
    "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
    "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
    "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
    "%JSONParse%": ["JSON", "parse"],
    "%JSONStringify%": ["JSON", "stringify"],
    "%MapPrototype%": ["Map", "prototype"],
    "%NumberPrototype%": ["Number", "prototype"],
    "%ObjectPrototype%": ["Object", "prototype"],
    "%ObjProto_toString%": ["Object", "prototype", "toString"],
    "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
    "%PromisePrototype%": ["Promise", "prototype"],
    "%PromiseProto_then%": ["Promise", "prototype", "then"],
    "%Promise_all%": ["Promise", "all"],
    "%Promise_reject%": ["Promise", "reject"],
    "%Promise_resolve%": ["Promise", "resolve"],
    "%RangeErrorPrototype%": ["RangeError", "prototype"],
    "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
    "%RegExpPrototype%": ["RegExp", "prototype"],
    "%SetPrototype%": ["Set", "prototype"],
    "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
    "%StringPrototype%": ["String", "prototype"],
    "%SymbolPrototype%": ["Symbol", "prototype"],
    "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
    "%TypedArrayPrototype%": ["TypedArray", "prototype"],
    "%TypeErrorPrototype%": ["TypeError", "prototype"],
    "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
    "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
    "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
    "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
    "%URIErrorPrototype%": ["URIError", "prototype"],
    "%WeakMapPrototype%": ["WeakMap", "prototype"],
    "%WeakSetPrototype%": ["WeakSet", "prototype"]
  }, C = Nt(), z = /* @__PURE__ */ Ra(), F = C.call(I, Array.prototype.concat), P = C.call(L, Array.prototype.splice), M = C.call(I, String.prototype.replace), Q = C.call(I, String.prototype.slice), K = C.call(I, RegExp.prototype.exec), Y = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, V = /\\(\\)?/g, te = function(G) {
    var ce = Q(G, 0, 1), ae = Q(G, -1);
    if (ce === "%" && ae !== "%")
      throw new s("invalid intrinsic syntax, expected closing `%`");
    if (ae === "%" && ce !== "%")
      throw new s("invalid intrinsic syntax, expected opening `%`");
    var pe = [];
    return M(G, Y, function(he, Pe, ue, R) {
      pe[pe.length] = ue ? M(R, V, "$1") : Pe || he;
    }), pe;
  }, ye = function(G, ce) {
    var ae = G, pe;
    if (z(O, ae) && (pe = O[ae], ae = "%" + pe[0] + "%"), z(q, ae)) {
      var he = q[ae];
      if (he === D && (he = b(ae)), typeof he > "u" && !ce)
        throw new r("intrinsic " + G + " exists, but is not available. Please file an issue!");
      return {
        alias: pe,
        name: ae,
        value: he
      };
    }
    throw new s("intrinsic " + G + " does not exist!");
  };
  return Dn = function(G, ce) {
    if (typeof G != "string" || G.length === 0)
      throw new r("intrinsic name must be a non-empty string");
    if (arguments.length > 1 && typeof ce != "boolean")
      throw new r('"allowMissing" argument must be a boolean');
    if (K(/^%?[^%]*%?$/, G) === null)
      throw new s("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
    var ae = te(G), pe = ae.length > 0 ? ae[0] : "", he = ye("%" + pe + "%", ce), Pe = he.name, ue = he.value, R = !1, T = he.alias;
    T && (pe = T[0], P(ae, F([0, 1], T)));
    for (var U = 1, $ = !0; U < ae.length; U += 1) {
      var B = ae[U], J = Q(B, 0, 1), Re = Q(B, -1);
      if ((J === '"' || J === "'" || J === "`" || Re === '"' || Re === "'" || Re === "`") && J !== Re)
        throw new s("property names with quotes must have matching quotes");
      if ((B === "constructor" || !$) && (R = !0), pe += "." + B, Pe = "%" + pe + "%", z(q, Pe))
        ue = q[Pe];
      else if (ue != null) {
        if (!(B in ue)) {
          if (!ce)
            throw new r("base intrinsic for " + G + " exists, but the property is not available.");
          return;
        }
        if (w && U + 1 >= ae.length) {
          var ke = w(ue, B);
          $ = !!ke, $ && "get" in ke && !("originalValue" in ke.get) ? ue = ke.get : ue = ue[B];
        } else
          $ = z(ue, B), ue = ue[B];
        $ && !R && (q[Pe] = ue);
      }
    }
    return ue;
  }, Dn;
}
var In, Fi;
function Ec() {
  if (Fi) return In;
  Fi = 1;
  var t = io();
  return In = function() {
    return t() && !!Symbol.toStringTag;
  }, In;
}
var zn, Ui;
function Sc() {
  if (Ui) return zn;
  Ui = 1;
  var t = /* @__PURE__ */ wc(), e = t("%Object.defineProperty%", !0), a = Ec()(), n = /* @__PURE__ */ Ra(), i = /* @__PURE__ */ Ea(), o = a ? Symbol.toStringTag : null;
  return zn = function(r, c) {
    var u = arguments.length > 2 && !!arguments[2] && arguments[2].force, p = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
    if (typeof u < "u" && typeof u != "boolean" || typeof p < "u" && typeof p != "boolean")
      throw new i("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
    o && (u || !n(r, o)) && (e ? e(r, o, {
      configurable: !p,
      enumerable: !1,
      value: c,
      writable: !1
    }) : r[o] = c);
  }, zn;
}
var Mn, qi;
function Rc() {
  return qi || (qi = 1, Mn = function(t, e) {
    return Object.keys(e).forEach(function(a) {
      t[a] = t[a] || e[a];
    }), t;
  }), Mn;
}
var $n, Di;
function kc() {
  if (Di) return $n;
  Di = 1;
  var t = Wr(), e = De, a = xe, n = lt, i = At, o = ct.parse, s = de, r = oe.Stream, c = pt, u = Kr(), p = Zr(), d = /* @__PURE__ */ Sc(), l = /* @__PURE__ */ Ra(), E = Rc();
  function x(f) {
    if (!(this instanceof x))
      return new x(f);
    this._overheadLength = 0, this._valueLength = 0, this._valuesToMeasure = [], t.call(this), f = f || {};
    for (var h in f)
      this[h] = f[h];
  }
  return e.inherits(x, t), x.LINE_BREAK = `\r
`, x.DEFAULT_CONTENT_TYPE = "application/octet-stream", x.prototype.append = function(f, h, v) {
    v = v || {}, typeof v == "string" && (v = { filename: v });
    var w = t.prototype.append.bind(this);
    if ((typeof h == "number" || h == null) && (h = String(h)), Array.isArray(h)) {
      this._error(new Error("Arrays are not supported."));
      return;
    }
    var k = this._multiPartHeader(f, h, v), A = this._multiPartFooter();
    w(k), w(h), w(A), this._trackLength(k, h, v);
  }, x.prototype._trackLength = function(f, h, v) {
    var w = 0;
    v.knownLength != null ? w += Number(v.knownLength) : Buffer.isBuffer(h) ? w = h.length : typeof h == "string" && (w = Buffer.byteLength(h)), this._valueLength += w, this._overheadLength += Buffer.byteLength(f) + x.LINE_BREAK.length, !(!h || !h.path && !(h.readable && l(h, "httpVersion")) && !(h instanceof r)) && (v.knownLength || this._valuesToMeasure.push(h));
  }, x.prototype._lengthRetriever = function(f, h) {
    l(f, "fd") ? f.end != null && f.end != 1 / 0 && f.start != null ? h(null, f.end + 1 - (f.start ? f.start : 0)) : s.stat(f.path, function(v, w) {
      if (v) {
        h(v);
        return;
      }
      var k = w.size - (f.start ? f.start : 0);
      h(null, k);
    }) : l(f, "httpVersion") ? h(null, Number(f.headers["content-length"])) : l(f, "httpModule") ? (f.on("response", function(v) {
      f.pause(), h(null, Number(v.headers["content-length"]));
    }), f.resume()) : h("Unknown stream");
  }, x.prototype._multiPartHeader = function(f, h, v) {
    if (typeof v.header == "string")
      return v.header;
    var w = this._getContentDisposition(h, v), k = this._getContentType(h, v), A = "", g = {
      // add custom disposition as third element or keep it two elements if not
      "Content-Disposition": ["form-data", 'name="' + f + '"'].concat(w || []),
      // if no content type. allow it to be empty array
      "Content-Type": [].concat(k || [])
    };
    typeof v.header == "object" && E(g, v.header);
    var m;
    for (var y in g)
      if (l(g, y)) {
        if (m = g[y], m == null)
          continue;
        Array.isArray(m) || (m = [m]), m.length && (A += y + ": " + m.join("; ") + x.LINE_BREAK);
      }
    return "--" + this.getBoundary() + x.LINE_BREAK + A + x.LINE_BREAK;
  }, x.prototype._getContentDisposition = function(f, h) {
    var v;
    if (typeof h.filepath == "string" ? v = a.normalize(h.filepath).replace(/\\/g, "/") : h.filename || f && (f.name || f.path) ? v = a.basename(h.filename || f && (f.name || f.path)) : f && f.readable && l(f, "httpVersion") && (v = a.basename(f.client._httpMessage.path || "")), v)
      return 'filename="' + v + '"';
  }, x.prototype._getContentType = function(f, h) {
    var v = h.contentType;
    return !v && f && f.name && (v = u.lookup(f.name)), !v && f && f.path && (v = u.lookup(f.path)), !v && f && f.readable && l(f, "httpVersion") && (v = f.headers["content-type"]), !v && (h.filepath || h.filename) && (v = u.lookup(h.filepath || h.filename)), !v && f && typeof f == "object" && (v = x.DEFAULT_CONTENT_TYPE), v;
  }, x.prototype._multiPartFooter = function() {
    return (function(f) {
      var h = x.LINE_BREAK, v = this._streams.length === 0;
      v && (h += this._lastBoundary()), f(h);
    }).bind(this);
  }, x.prototype._lastBoundary = function() {
    return "--" + this.getBoundary() + "--" + x.LINE_BREAK;
  }, x.prototype.getHeaders = function(f) {
    var h, v = {
      "content-type": "multipart/form-data; boundary=" + this.getBoundary()
    };
    for (h in f)
      l(f, h) && (v[h.toLowerCase()] = f[h]);
    return v;
  }, x.prototype.setBoundary = function(f) {
    if (typeof f != "string")
      throw new TypeError("FormData boundary must be a string");
    this._boundary = f;
  }, x.prototype.getBoundary = function() {
    return this._boundary || this._generateBoundary(), this._boundary;
  }, x.prototype.getBuffer = function() {
    for (var f = new Buffer.alloc(0), h = this.getBoundary(), v = 0, w = this._streams.length; v < w; v++)
      typeof this._streams[v] != "function" && (Buffer.isBuffer(this._streams[v]) ? f = Buffer.concat([f, this._streams[v]]) : f = Buffer.concat([f, Buffer.from(this._streams[v])]), (typeof this._streams[v] != "string" || this._streams[v].substring(2, h.length + 2) !== h) && (f = Buffer.concat([f, Buffer.from(x.LINE_BREAK)])));
    return Buffer.concat([f, Buffer.from(this._lastBoundary())]);
  }, x.prototype._generateBoundary = function() {
    this._boundary = "--------------------------" + c.randomBytes(12).toString("hex");
  }, x.prototype.getLengthSync = function() {
    var f = this._overheadLength + this._valueLength;
    return this._streams.length && (f += this._lastBoundary().length), this.hasKnownLength() || this._error(new Error("Cannot calculate proper length in synchronous way.")), f;
  }, x.prototype.hasKnownLength = function() {
    var f = !0;
    return this._valuesToMeasure.length && (f = !1), f;
  }, x.prototype.getLength = function(f) {
    var h = this._overheadLength + this._valueLength;
    if (this._streams.length && (h += this._lastBoundary().length), !this._valuesToMeasure.length) {
      process.nextTick(f.bind(this, null, h));
      return;
    }
    p.parallel(this._valuesToMeasure, this._lengthRetriever, function(v, w) {
      if (v) {
        f(v);
        return;
      }
      w.forEach(function(k) {
        h += k;
      }), f(null, h);
    });
  }, x.prototype.submit = function(f, h) {
    var v, w, k = { method: "post" };
    return typeof f == "string" ? (f = o(f), w = E({
      port: f.port,
      path: f.pathname,
      host: f.hostname,
      protocol: f.protocol
    }, k)) : (w = E(f, k), w.port || (w.port = w.protocol === "https:" ? 443 : 80)), w.headers = this.getHeaders(f.headers), w.protocol === "https:" ? v = i.request(w) : v = n.request(w), this.getLength((function(A, g) {
      if (A && A !== "Unknown stream") {
        this._error(A);
        return;
      }
      if (g && v.setHeader("Content-Length", g), this.pipe(v), h) {
        var m, y = function(S, j) {
          return v.removeListener("error", y), v.removeListener("response", m), h.call(this, S, j);
        };
        m = y.bind(this, null), v.on("error", y), v.on("response", m);
      }
    }).bind(this)), v;
  }, x.prototype._error = function(f) {
    this.error || (this.error = f, this.pause(), this.emit("error", f));
  }, x.prototype.toString = function() {
    return "[object FormData]";
  }, d(x.prototype, "FormData"), $n = x, $n;
}
var Oc = kc();
const co = /* @__PURE__ */ wa(Oc);
function fa(t) {
  return _.isPlainObject(t) || _.isArray(t);
}
function po(t) {
  return _.endsWith(t, "[]") ? t.slice(0, -2) : t;
}
function Ii(t, e, a) {
  return t ? t.concat(e).map(function(i, o) {
    return i = po(i), !a && o ? "[" + i + "]" : i;
  }).join(a ? "." : "") : e;
}
function Tc(t) {
  return _.isArray(t) && !t.some(fa);
}
const Cc = _.toFlatObject(_, {}, null, function(e) {
  return /^is[A-Z]/.test(e);
});
function Bt(t, e, a) {
  if (!_.isObject(t))
    throw new TypeError("target must be an object");
  e = e || new (co || FormData)(), a = _.toFlatObject(a, {
    metaTokens: !0,
    dots: !1,
    indexes: !1
  }, !1, function(f, h) {
    return !_.isUndefined(h[f]);
  });
  const n = a.metaTokens, i = a.visitor || p, o = a.dots, s = a.indexes, c = (a.Blob || typeof Blob < "u" && Blob) && _.isSpecCompliantForm(e);
  if (!_.isFunction(i))
    throw new TypeError("visitor must be a function");
  function u(x) {
    if (x === null) return "";
    if (_.isDate(x))
      return x.toISOString();
    if (_.isBoolean(x))
      return x.toString();
    if (!c && _.isBlob(x))
      throw new N("Blob is not supported. Use a Buffer instead.");
    return _.isArrayBuffer(x) || _.isTypedArray(x) ? c && typeof Blob == "function" ? new Blob([x]) : Buffer.from(x) : x;
  }
  function p(x, f, h) {
    let v = x;
    if (x && !h && typeof x == "object") {
      if (_.endsWith(f, "{}"))
        f = n ? f : f.slice(0, -2), x = JSON.stringify(x);
      else if (_.isArray(x) && Tc(x) || (_.isFileList(x) || _.endsWith(f, "[]")) && (v = _.toArray(x)))
        return f = po(f), v.forEach(function(k, A) {
          !(_.isUndefined(k) || k === null) && e.append(
            // eslint-disable-next-line no-nested-ternary
            s === !0 ? Ii([f], A, o) : s === null ? f : f + "[]",
            u(k)
          );
        }), !1;
    }
    return fa(x) ? !0 : (e.append(Ii(h, f, o), u(x)), !1);
  }
  const d = [], l = Object.assign(Cc, {
    defaultVisitor: p,
    convertValue: u,
    isVisitable: fa
  });
  function E(x, f) {
    if (!_.isUndefined(x)) {
      if (d.indexOf(x) !== -1)
        throw Error("Circular reference detected in " + f.join("."));
      d.push(x), _.forEach(x, function(v, w) {
        (!(_.isUndefined(v) || v === null) && i.call(
          e,
          v,
          _.isString(w) ? w.trim() : w,
          f,
          l
        )) === !0 && E(v, f ? f.concat(w) : [w]);
      }), d.pop();
    }
  }
  if (!_.isObject(t))
    throw new TypeError("data must be an object");
  return E(t), e;
}
function zi(t) {
  const e = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(t).replace(/[!'()~]|%20|%00/g, function(n) {
    return e[n];
  });
}
function lo(t, e) {
  this._pairs = [], t && Bt(t, this, e);
}
const uo = lo.prototype;
uo.append = function(e, a) {
  this._pairs.push([e, a]);
};
uo.toString = function(e) {
  const a = e ? function(n) {
    return e.call(this, n, zi);
  } : zi;
  return this._pairs.map(function(i) {
    return a(i[0]) + "=" + a(i[1]);
  }, "").join("&");
};
function Ac(t) {
  return encodeURIComponent(t).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function ka(t, e, a) {
  if (!e)
    return t;
  const n = a && a.encode || Ac, i = _.isFunction(a) ? {
    serialize: a
  } : a, o = i && i.serialize;
  let s;
  if (o ? s = o(e, i) : s = _.isURLSearchParams(e) ? e.toString() : new lo(e, i).toString(n), s) {
    const r = t.indexOf("#");
    r !== -1 && (t = t.slice(0, r)), t += (t.indexOf("?") === -1 ? "?" : "&") + s;
  }
  return t;
}
class Mi {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(e, a, n) {
    return this.handlers.push({
      fulfilled: e,
      rejected: a,
      synchronous: n ? n.synchronous : !1,
      runWhen: n ? n.runWhen : null
    }), this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(e) {
    this.handlers[e] && (this.handlers[e] = null);
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    this.handlers && (this.handlers = []);
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(e) {
    _.forEach(this.handlers, function(n) {
      n !== null && e(n);
    });
  }
}
const Ft = {
  silentJSONParsing: !0,
  forcedJSONParsing: !0,
  clarifyTimeoutError: !1,
  legacyInterceptorReqResOrdering: !0
}, Pc = ct.URLSearchParams, Hn = "abcdefghijklmnopqrstuvwxyz", $i = "0123456789", mo = {
  DIGIT: $i,
  ALPHA: Hn,
  ALPHA_DIGIT: Hn + Hn.toUpperCase() + $i
}, jc = (t = 16, e = mo.ALPHA_DIGIT) => {
  let a = "";
  const { length: n } = e, i = new Uint32Array(t);
  pt.randomFillSync(i);
  for (let o = 0; o < t; o++)
    a += e[i[o] % n];
  return a;
}, Lc = {
  isNode: !0,
  classes: {
    URLSearchParams: Pc,
    FormData: co,
    Blob: typeof Blob < "u" && Blob || null
  },
  ALPHABET: mo,
  generateString: jc,
  protocols: ["http", "https", "file", "data"]
}, Oa = typeof window < "u" && typeof document < "u", ha = typeof navigator == "object" && navigator || void 0, Nc = Oa && (!ha || ["ReactNative", "NativeScript", "NS"].indexOf(ha.product) < 0), Bc = typeof WorkerGlobalScope < "u" && // eslint-disable-next-line no-undef
self instanceof WorkerGlobalScope && typeof self.importScripts == "function", Fc = Oa && window.location.href || "http://localhost", Uc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv: Oa,
  hasStandardBrowserEnv: Nc,
  hasStandardBrowserWebWorkerEnv: Bc,
  navigator: ha,
  origin: Fc
}, Symbol.toStringTag, { value: "Module" })), se = {
  ...Uc,
  ...Lc
};
function qc(t, e) {
  return Bt(t, new se.classes.URLSearchParams(), {
    visitor: function(a, n, i, o) {
      return se.isNode && _.isBuffer(a) ? (this.append(n, a.toString("base64")), !1) : o.defaultVisitor.apply(this, arguments);
    },
    ...e
  });
}
function Dc(t) {
  return _.matchAll(/\w+|\[(\w*)]/g, t).map((e) => e[0] === "[]" ? "" : e[1] || e[0]);
}
function Ic(t) {
  const e = {}, a = Object.keys(t);
  let n;
  const i = a.length;
  let o;
  for (n = 0; n < i; n++)
    o = a[n], e[o] = t[o];
  return e;
}
function fo(t) {
  function e(a, n, i, o) {
    let s = a[o++];
    if (s === "__proto__") return !0;
    const r = Number.isFinite(+s), c = o >= a.length;
    return s = !s && _.isArray(i) ? i.length : s, c ? (_.hasOwnProp(i, s) ? i[s] = [i[s], n] : i[s] = n, !r) : ((!i[s] || !_.isObject(i[s])) && (i[s] = []), e(a, n, i[s], o) && _.isArray(i[s]) && (i[s] = Ic(i[s])), !r);
  }
  if (_.isFormData(t) && _.isFunction(t.entries)) {
    const a = {};
    return _.forEachEntry(t, (n, i) => {
      e(Dc(n), i, a, 0);
    }), a;
  }
  return null;
}
function zc(t, e, a) {
  if (_.isString(t))
    try {
      return (e || JSON.parse)(t), _.trim(t);
    } catch (n) {
      if (n.name !== "SyntaxError")
        throw n;
    }
  return (a || JSON.stringify)(t);
}
const ft = {
  transitional: Ft,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function(e, a) {
    const n = a.getContentType() || "", i = n.indexOf("application/json") > -1, o = _.isObject(e);
    if (o && _.isHTMLForm(e) && (e = new FormData(e)), _.isFormData(e))
      return i ? JSON.stringify(fo(e)) : e;
    if (_.isArrayBuffer(e) || _.isBuffer(e) || _.isStream(e) || _.isFile(e) || _.isBlob(e) || _.isReadableStream(e))
      return e;
    if (_.isArrayBufferView(e))
      return e.buffer;
    if (_.isURLSearchParams(e))
      return a.setContentType("application/x-www-form-urlencoded;charset=utf-8", !1), e.toString();
    let r;
    if (o) {
      if (n.indexOf("application/x-www-form-urlencoded") > -1)
        return qc(e, this.formSerializer).toString();
      if ((r = _.isFileList(e)) || n.indexOf("multipart/form-data") > -1) {
        const c = this.env && this.env.FormData;
        return Bt(
          r ? { "files[]": e } : e,
          c && new c(),
          this.formSerializer
        );
      }
    }
    return o || i ? (a.setContentType("application/json", !1), zc(e)) : e;
  }],
  transformResponse: [function(e) {
    const a = this.transitional || ft.transitional, n = a && a.forcedJSONParsing, i = this.responseType === "json";
    if (_.isResponse(e) || _.isReadableStream(e))
      return e;
    if (e && _.isString(e) && (n && !this.responseType || i)) {
      const s = !(a && a.silentJSONParsing) && i;
      try {
        return JSON.parse(e, this.parseReviver);
      } catch (r) {
        if (s)
          throw r.name === "SyntaxError" ? N.from(r, N.ERR_BAD_RESPONSE, this, null, this.response) : r;
      }
    }
    return e;
  }],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: se.classes.FormData,
    Blob: se.classes.Blob
  },
  validateStatus: function(e) {
    return e >= 200 && e < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
_.forEach(["delete", "get", "head", "post", "put", "patch"], (t) => {
  ft.headers[t] = {};
});
const Mc = _.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]), $c = (t) => {
  const e = {};
  let a, n, i;
  return t && t.split(`
`).forEach(function(s) {
    i = s.indexOf(":"), a = s.substring(0, i).trim().toLowerCase(), n = s.substring(i + 1).trim(), !(!a || e[a] && Mc[a]) && (a === "set-cookie" ? e[a] ? e[a].push(n) : e[a] = [n] : e[a] = e[a] ? e[a] + ", " + n : n);
  }), e;
}, Hi = Symbol("internals");
function tt(t) {
  return t && String(t).trim().toLowerCase();
}
function Et(t) {
  return t === !1 || t == null ? t : _.isArray(t) ? t.map(Et) : String(t);
}
function Hc(t) {
  const e = /* @__PURE__ */ Object.create(null), a = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let n;
  for (; n = a.exec(t); )
    e[n[1]] = n[2];
  return e;
}
const Wc = (t) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(t.trim());
function Wn(t, e, a, n, i) {
  if (_.isFunction(n))
    return n.call(this, e, a);
  if (i && (e = a), !!_.isString(e)) {
    if (_.isString(n))
      return e.indexOf(n) !== -1;
    if (_.isRegExp(n))
      return n.test(e);
  }
}
function Gc(t) {
  return t.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (e, a, n) => a.toUpperCase() + n);
}
function Vc(t, e) {
  const a = _.toCamelCase(" " + e);
  ["get", "set", "has"].forEach((n) => {
    Object.defineProperty(t, n + a, {
      value: function(i, o, s) {
        return this[n].call(this, e, i, o, s);
      },
      configurable: !0
    });
  });
}
let me = class {
  constructor(e) {
    e && this.set(e);
  }
  set(e, a, n) {
    const i = this;
    function o(r, c, u) {
      const p = tt(c);
      if (!p)
        throw new Error("header name must be a non-empty string");
      const d = _.findKey(i, p);
      (!d || i[d] === void 0 || u === !0 || u === void 0 && i[d] !== !1) && (i[d || c] = Et(r));
    }
    const s = (r, c) => _.forEach(r, (u, p) => o(u, p, c));
    if (_.isPlainObject(e) || e instanceof this.constructor)
      s(e, a);
    else if (_.isString(e) && (e = e.trim()) && !Wc(e))
      s($c(e), a);
    else if (_.isObject(e) && _.isIterable(e)) {
      let r = {}, c, u;
      for (const p of e) {
        if (!_.isArray(p))
          throw TypeError("Object iterator must return a key-value pair");
        r[u = p[0]] = (c = r[u]) ? _.isArray(c) ? [...c, p[1]] : [c, p[1]] : p[1];
      }
      s(r, a);
    } else
      e != null && o(a, e, n);
    return this;
  }
  get(e, a) {
    if (e = tt(e), e) {
      const n = _.findKey(this, e);
      if (n) {
        const i = this[n];
        if (!a)
          return i;
        if (a === !0)
          return Hc(i);
        if (_.isFunction(a))
          return a.call(this, i, n);
        if (_.isRegExp(a))
          return a.exec(i);
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(e, a) {
    if (e = tt(e), e) {
      const n = _.findKey(this, e);
      return !!(n && this[n] !== void 0 && (!a || Wn(this, this[n], n, a)));
    }
    return !1;
  }
  delete(e, a) {
    const n = this;
    let i = !1;
    function o(s) {
      if (s = tt(s), s) {
        const r = _.findKey(n, s);
        r && (!a || Wn(n, n[r], r, a)) && (delete n[r], i = !0);
      }
    }
    return _.isArray(e) ? e.forEach(o) : o(e), i;
  }
  clear(e) {
    const a = Object.keys(this);
    let n = a.length, i = !1;
    for (; n--; ) {
      const o = a[n];
      (!e || Wn(this, this[o], o, e, !0)) && (delete this[o], i = !0);
    }
    return i;
  }
  normalize(e) {
    const a = this, n = {};
    return _.forEach(this, (i, o) => {
      const s = _.findKey(n, o);
      if (s) {
        a[s] = Et(i), delete a[o];
        return;
      }
      const r = e ? Gc(o) : String(o).trim();
      r !== o && delete a[o], a[r] = Et(i), n[r] = !0;
    }), this;
  }
  concat(...e) {
    return this.constructor.concat(this, ...e);
  }
  toJSON(e) {
    const a = /* @__PURE__ */ Object.create(null);
    return _.forEach(this, (n, i) => {
      n != null && n !== !1 && (a[i] = e && _.isArray(n) ? n.join(", ") : n);
    }), a;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([e, a]) => e + ": " + a).join(`
`);
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(e) {
    return e instanceof this ? e : new this(e);
  }
  static concat(e, ...a) {
    const n = new this(e);
    return a.forEach((i) => n.set(i)), n;
  }
  static accessor(e) {
    const n = (this[Hi] = this[Hi] = {
      accessors: {}
    }).accessors, i = this.prototype;
    function o(s) {
      const r = tt(s);
      n[r] || (Vc(i, s), n[r] = !0);
    }
    return _.isArray(e) ? e.forEach(o) : o(e), this;
  }
};
me.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
_.reduceDescriptors(me.prototype, ({ value: t }, e) => {
  let a = e[0].toUpperCase() + e.slice(1);
  return {
    get: () => t,
    set(n) {
      this[a] = n;
    }
  };
});
_.freezeMethods(me);
function Gn(t, e) {
  const a = this || ft, n = e || a, i = me.from(n.headers);
  let o = n.data;
  return _.forEach(t, function(r) {
    o = r.call(a, o, i.normalize(), e ? e.status : void 0);
  }), i.normalize(), o;
}
function ho(t) {
  return !!(t && t.__CANCEL__);
}
let Ue = class extends N {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(e, a, n) {
    super(e ?? "canceled", N.ERR_CANCELED, a, n), this.name = "CanceledError", this.__CANCEL__ = !0;
  }
};
function $e(t, e, a) {
  const n = a.config.validateStatus;
  !a.status || !n || n(a.status) ? t(a) : e(new N(
    "Request failed with status code " + a.status,
    [N.ERR_BAD_REQUEST, N.ERR_BAD_RESPONSE][Math.floor(a.status / 100) - 4],
    a.config,
    a.request,
    a
  ));
}
function Kc(t) {
  return typeof t != "string" ? !1 : /^([a-z][a-z\d+\-.]*:)?\/\//i.test(t);
}
function Yc(t, e) {
  return e ? t.replace(/\/?\/$/, "") + "/" + e.replace(/^\/+/, "") : t;
}
function Ta(t, e, a) {
  let n = !Kc(e);
  return t && (n || a == !1) ? Yc(t, e) : e;
}
var Vn = {}, Wi;
function Jc() {
  if (Wi) return Vn;
  Wi = 1;
  var t = ct.parse, e = {
    ftp: 21,
    gopher: 70,
    http: 80,
    https: 443,
    ws: 80,
    wss: 443
  }, a = String.prototype.endsWith || function(s) {
    return s.length <= this.length && this.indexOf(s, this.length - s.length) !== -1;
  };
  function n(s) {
    var r = typeof s == "string" ? t(s) : s || {}, c = r.protocol, u = r.host, p = r.port;
    if (typeof u != "string" || !u || typeof c != "string" || (c = c.split(":", 1)[0], u = u.replace(/:\d*$/, ""), p = parseInt(p) || e[c] || 0, !i(u, p)))
      return "";
    var d = o("npm_config_" + c + "_proxy") || o(c + "_proxy") || o("npm_config_proxy") || o("all_proxy");
    return d && d.indexOf("://") === -1 && (d = c + "://" + d), d;
  }
  function i(s, r) {
    var c = (o("npm_config_no_proxy") || o("no_proxy")).toLowerCase();
    return c ? c === "*" ? !1 : c.split(/[,\s]/).every(function(u) {
      if (!u)
        return !0;
      var p = u.match(/^(.+):(\d+)$/), d = p ? p[1] : u, l = p ? parseInt(p[2]) : 0;
      return l && l !== r ? !0 : /^[.*]/.test(d) ? (d.charAt(0) === "*" && (d = d.slice(1)), !a.call(s, d)) : s !== d;
    }) : !0;
  }
  function o(s) {
    return process.env[s.toLowerCase()] || process.env[s.toUpperCase()] || "";
  }
  return Vn.getProxyForUrl = n, Vn;
}
var Xc = Jc();
const Zc = /* @__PURE__ */ wa(Xc);
var vt = { exports: {} }, bt = { exports: {} }, gt = { exports: {} }, Kn, Gi;
function Qc() {
  if (Gi) return Kn;
  Gi = 1;
  var t = 1e3, e = t * 60, a = e * 60, n = a * 24, i = n * 7, o = n * 365.25;
  Kn = function(p, d) {
    d = d || {};
    var l = typeof p;
    if (l === "string" && p.length > 0)
      return s(p);
    if (l === "number" && isFinite(p))
      return d.long ? c(p) : r(p);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(p)
    );
  };
  function s(p) {
    if (p = String(p), !(p.length > 100)) {
      var d = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        p
      );
      if (d) {
        var l = parseFloat(d[1]), E = (d[2] || "ms").toLowerCase();
        switch (E) {
          case "years":
          case "year":
          case "yrs":
          case "yr":
          case "y":
            return l * o;
          case "weeks":
          case "week":
          case "w":
            return l * i;
          case "days":
          case "day":
          case "d":
            return l * n;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            return l * a;
          case "minutes":
          case "minute":
          case "mins":
          case "min":
          case "m":
            return l * e;
          case "seconds":
          case "second":
          case "secs":
          case "sec":
          case "s":
            return l * t;
          case "milliseconds":
          case "millisecond":
          case "msecs":
          case "msec":
          case "ms":
            return l;
          default:
            return;
        }
      }
    }
  }
  function r(p) {
    var d = Math.abs(p);
    return d >= n ? Math.round(p / n) + "d" : d >= a ? Math.round(p / a) + "h" : d >= e ? Math.round(p / e) + "m" : d >= t ? Math.round(p / t) + "s" : p + "ms";
  }
  function c(p) {
    var d = Math.abs(p);
    return d >= n ? u(p, d, n, "day") : d >= a ? u(p, d, a, "hour") : d >= e ? u(p, d, e, "minute") : d >= t ? u(p, d, t, "second") : p + " ms";
  }
  function u(p, d, l, E) {
    var x = d >= l * 1.5;
    return Math.round(p / l) + " " + E + (x ? "s" : "");
  }
  return Kn;
}
var Yn, Vi;
function xo() {
  if (Vi) return Yn;
  Vi = 1;
  function t(e) {
    n.debug = n, n.default = n, n.coerce = u, n.disable = r, n.enable = o, n.enabled = c, n.humanize = Qc(), n.destroy = p, Object.keys(e).forEach((d) => {
      n[d] = e[d];
    }), n.names = [], n.skips = [], n.formatters = {};
    function a(d) {
      let l = 0;
      for (let E = 0; E < d.length; E++)
        l = (l << 5) - l + d.charCodeAt(E), l |= 0;
      return n.colors[Math.abs(l) % n.colors.length];
    }
    n.selectColor = a;
    function n(d) {
      let l, E = null, x, f;
      function h(...v) {
        if (!h.enabled)
          return;
        const w = h, k = Number(/* @__PURE__ */ new Date()), A = k - (l || k);
        w.diff = A, w.prev = l, w.curr = k, l = k, v[0] = n.coerce(v[0]), typeof v[0] != "string" && v.unshift("%O");
        let g = 0;
        v[0] = v[0].replace(/%([a-zA-Z%])/g, (y, S) => {
          if (y === "%%")
            return "%";
          g++;
          const j = n.formatters[S];
          if (typeof j == "function") {
            const L = v[g];
            y = j.call(w, L), v.splice(g, 1), g--;
          }
          return y;
        }), n.formatArgs.call(w, v), (w.log || n.log).apply(w, v);
      }
      return h.namespace = d, h.useColors = n.useColors(), h.color = n.selectColor(d), h.extend = i, h.destroy = n.destroy, Object.defineProperty(h, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => E !== null ? E : (x !== n.namespaces && (x = n.namespaces, f = n.enabled(d)), f),
        set: (v) => {
          E = v;
        }
      }), typeof n.init == "function" && n.init(h), h;
    }
    function i(d, l) {
      const E = n(this.namespace + (typeof l > "u" ? ":" : l) + d);
      return E.log = this.log, E;
    }
    function o(d) {
      n.save(d), n.namespaces = d, n.names = [], n.skips = [];
      const l = (typeof d == "string" ? d : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const E of l)
        E[0] === "-" ? n.skips.push(E.slice(1)) : n.names.push(E);
    }
    function s(d, l) {
      let E = 0, x = 0, f = -1, h = 0;
      for (; E < d.length; )
        if (x < l.length && (l[x] === d[E] || l[x] === "*"))
          l[x] === "*" ? (f = x, h = E, x++) : (E++, x++);
        else if (f !== -1)
          x = f + 1, h++, E = h;
        else
          return !1;
      for (; x < l.length && l[x] === "*"; )
        x++;
      return x === l.length;
    }
    function r() {
      const d = [
        ...n.names,
        ...n.skips.map((l) => "-" + l)
      ].join(",");
      return n.enable(""), d;
    }
    function c(d) {
      for (const l of n.skips)
        if (s(d, l))
          return !1;
      for (const l of n.names)
        if (s(d, l))
          return !0;
      return !1;
    }
    function u(d) {
      return d instanceof Error ? d.stack || d.message : d;
    }
    function p() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return n.enable(n.load()), n;
  }
  return Yn = t, Yn;
}
var Ki;
function ep() {
  return Ki || (Ki = 1, (function(t, e) {
    e.formatArgs = n, e.save = i, e.load = o, e.useColors = a, e.storage = s(), e.destroy = /* @__PURE__ */ (() => {
      let c = !1;
      return () => {
        c || (c = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
      };
    })(), e.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function a() {
      if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs))
        return !0;
      if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))
        return !1;
      let c;
      return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator < "u" && navigator.userAgent && (c = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(c[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function n(c) {
      if (c[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + c[0] + (this.useColors ? "%c " : " ") + "+" + t.exports.humanize(this.diff), !this.useColors)
        return;
      const u = "color: " + this.color;
      c.splice(1, 0, u, "color: inherit");
      let p = 0, d = 0;
      c[0].replace(/%[a-zA-Z%]/g, (l) => {
        l !== "%%" && (p++, l === "%c" && (d = p));
      }), c.splice(d, 0, u);
    }
    e.log = console.debug || console.log || (() => {
    });
    function i(c) {
      try {
        c ? e.storage.setItem("debug", c) : e.storage.removeItem("debug");
      } catch {
      }
    }
    function o() {
      let c;
      try {
        c = e.storage.getItem("debug") || e.storage.getItem("DEBUG");
      } catch {
      }
      return !c && typeof process < "u" && "env" in process && (c = process.env.DEBUG), c;
    }
    function s() {
      try {
        return localStorage;
      } catch {
      }
    }
    t.exports = xo()(e);
    const { formatters: r } = t.exports;
    r.j = function(c) {
      try {
        return JSON.stringify(c);
      } catch (u) {
        return "[UnexpectedJSONParseError]: " + u.message;
      }
    };
  })(gt, gt.exports)), gt.exports;
}
var yt = { exports: {} }, Jn, Yi;
function tp() {
  return Yi || (Yi = 1, Jn = (t, e = process.argv) => {
    const a = t.startsWith("-") ? "" : t.length === 1 ? "-" : "--", n = e.indexOf(a + t), i = e.indexOf("--");
    return n !== -1 && (i === -1 || n < i);
  }), Jn;
}
var Xn, Ji;
function np() {
  if (Ji) return Xn;
  Ji = 1;
  const t = qo, e = Ls, a = tp(), { env: n } = process;
  let i;
  a("no-color") || a("no-colors") || a("color=false") || a("color=never") ? i = 0 : (a("color") || a("colors") || a("color=true") || a("color=always")) && (i = 1), "FORCE_COLOR" in n && (n.FORCE_COLOR === "true" ? i = 1 : n.FORCE_COLOR === "false" ? i = 0 : i = n.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(n.FORCE_COLOR, 10), 3));
  function o(c) {
    return c === 0 ? !1 : {
      level: c,
      hasBasic: !0,
      has256: c >= 2,
      has16m: c >= 3
    };
  }
  function s(c, u) {
    if (i === 0)
      return 0;
    if (a("color=16m") || a("color=full") || a("color=truecolor"))
      return 3;
    if (a("color=256"))
      return 2;
    if (c && !u && i === void 0)
      return 0;
    const p = i || 0;
    if (n.TERM === "dumb")
      return p;
    if (process.platform === "win32") {
      const d = t.release().split(".");
      return Number(d[0]) >= 10 && Number(d[2]) >= 10586 ? Number(d[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in n)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((d) => d in n) || n.CI_NAME === "codeship" ? 1 : p;
    if ("TEAMCITY_VERSION" in n)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(n.TEAMCITY_VERSION) ? 1 : 0;
    if (n.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in n) {
      const d = parseInt((n.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (n.TERM_PROGRAM) {
        case "iTerm.app":
          return d >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(n.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(n.TERM) || "COLORTERM" in n ? 1 : p;
  }
  function r(c) {
    const u = s(c, c && c.isTTY);
    return o(u);
  }
  return Xn = {
    supportsColor: r,
    stdout: o(s(!0, e.isatty(1))),
    stderr: o(s(!0, e.isatty(2)))
  }, Xn;
}
var Xi;
function ap() {
  return Xi || (Xi = 1, (function(t, e) {
    const a = Ls, n = De;
    e.init = p, e.log = r, e.formatArgs = o, e.save = c, e.load = u, e.useColors = i, e.destroy = n.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), e.colors = [6, 2, 3, 4, 5, 1];
    try {
      const l = np();
      l && (l.stderr || l).level >= 2 && (e.colors = [
        20,
        21,
        26,
        27,
        32,
        33,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        56,
        57,
        62,
        63,
        68,
        69,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        92,
        93,
        98,
        99,
        112,
        113,
        128,
        129,
        134,
        135,
        148,
        149,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        178,
        179,
        184,
        185,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        203,
        204,
        205,
        206,
        207,
        208,
        209,
        214,
        215,
        220,
        221
      ]);
    } catch {
    }
    e.inspectOpts = Object.keys(process.env).filter((l) => /^debug_/i.test(l)).reduce((l, E) => {
      const x = E.substring(6).toLowerCase().replace(/_([a-z])/g, (h, v) => v.toUpperCase());
      let f = process.env[E];
      return /^(yes|on|true|enabled)$/i.test(f) ? f = !0 : /^(no|off|false|disabled)$/i.test(f) ? f = !1 : f === "null" ? f = null : f = Number(f), l[x] = f, l;
    }, {});
    function i() {
      return "colors" in e.inspectOpts ? !!e.inspectOpts.colors : a.isatty(process.stderr.fd);
    }
    function o(l) {
      const { namespace: E, useColors: x } = this;
      if (x) {
        const f = this.color, h = "\x1B[3" + (f < 8 ? f : "8;5;" + f), v = `  ${h};1m${E} \x1B[0m`;
        l[0] = v + l[0].split(`
`).join(`
` + v), l.push(h + "m+" + t.exports.humanize(this.diff) + "\x1B[0m");
      } else
        l[0] = s() + E + " " + l[0];
    }
    function s() {
      return e.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function r(...l) {
      return process.stderr.write(n.formatWithOptions(e.inspectOpts, ...l) + `
`);
    }
    function c(l) {
      l ? process.env.DEBUG = l : delete process.env.DEBUG;
    }
    function u() {
      return process.env.DEBUG;
    }
    function p(l) {
      l.inspectOpts = {};
      const E = Object.keys(e.inspectOpts);
      for (let x = 0; x < E.length; x++)
        l.inspectOpts[E[x]] = e.inspectOpts[E[x]];
    }
    t.exports = xo()(e);
    const { formatters: d } = t.exports;
    d.o = function(l) {
      return this.inspectOpts.colors = this.useColors, n.inspect(l, this.inspectOpts).split(`
`).map((E) => E.trim()).join(" ");
    }, d.O = function(l) {
      return this.inspectOpts.colors = this.useColors, n.inspect(l, this.inspectOpts);
    };
  })(yt, yt.exports)), yt.exports;
}
var Zi;
function ip() {
  return Zi || (Zi = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? bt.exports = ep() : bt.exports = ap()), bt.exports;
}
var Zn, Qi;
function sp() {
  if (Qi) return Zn;
  Qi = 1;
  var t;
  return Zn = function() {
    if (!t) {
      try {
        t = ip()("follow-redirects");
      } catch {
      }
      typeof t != "function" && (t = function() {
      });
    }
    t.apply(null, arguments);
  }, Zn;
}
var es;
function op() {
  if (es) return vt.exports;
  es = 1;
  var t = ct, e = t.URL, a = lt, n = At, i = oe.Writable, o = Uo, s = sp();
  (function() {
    var O = typeof process < "u", C = typeof window < "u" && typeof document < "u", z = W(Error.captureStackTrace);
    !O && (C || !z) && console.warn("The follow-redirects package should be excluded from browser builds.");
  })();
  var r = !1;
  try {
    o(new e(""));
  } catch (b) {
    r = b.code === "ERR_INVALID_URL";
  }
  var c = [
    "auth",
    "host",
    "hostname",
    "href",
    "path",
    "pathname",
    "port",
    "protocol",
    "query",
    "search",
    "hash"
  ], u = ["abort", "aborted", "connect", "error", "socket", "timeout"], p = /* @__PURE__ */ Object.create(null);
  u.forEach(function(b) {
    p[b] = function(O, C, z) {
      this._redirectable.emit(b, O, C, z);
    };
  });
  var d = j(
    "ERR_INVALID_URL",
    "Invalid URL",
    TypeError
  ), l = j(
    "ERR_FR_REDIRECTION_FAILURE",
    "Redirected request failed"
  ), E = j(
    "ERR_FR_TOO_MANY_REDIRECTS",
    "Maximum number of redirects exceeded",
    l
  ), x = j(
    "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
    "Request body larger than maxBodyLength limit"
  ), f = j(
    "ERR_STREAM_WRITE_AFTER_END",
    "write after end"
  ), h = i.prototype.destroy || k;
  function v(b, O) {
    i.call(this), this._sanitizeOptions(b), this._options = b, this._ended = !1, this._ending = !1, this._redirectCount = 0, this._redirects = [], this._requestBodyLength = 0, this._requestBodyBuffers = [], O && this.on("response", O);
    var C = this;
    this._onNativeResponse = function(z) {
      try {
        C._processResponse(z);
      } catch (F) {
        C.emit("error", F instanceof l ? F : new l({ cause: F }));
      }
    }, this._performRequest();
  }
  v.prototype = Object.create(i.prototype), v.prototype.abort = function() {
    L(this._currentRequest), this._currentRequest.abort(), this.emit("abort");
  }, v.prototype.destroy = function(b) {
    return L(this._currentRequest, b), h.call(this, b), this;
  }, v.prototype.write = function(b, O, C) {
    if (this._ending)
      throw new f();
    if (!D(b) && !q(b))
      throw new TypeError("data should be a string, Buffer or Uint8Array");
    if (W(O) && (C = O, O = null), b.length === 0) {
      C && C();
      return;
    }
    this._requestBodyLength + b.length <= this._options.maxBodyLength ? (this._requestBodyLength += b.length, this._requestBodyBuffers.push({ data: b, encoding: O }), this._currentRequest.write(b, O, C)) : (this.emit("error", new x()), this.abort());
  }, v.prototype.end = function(b, O, C) {
    if (W(b) ? (C = b, b = O = null) : W(O) && (C = O, O = null), !b)
      this._ended = this._ending = !0, this._currentRequest.end(null, null, C);
    else {
      var z = this, F = this._currentRequest;
      this.write(b, O, function() {
        z._ended = !0, F.end(null, null, C);
      }), this._ending = !0;
    }
  }, v.prototype.setHeader = function(b, O) {
    this._options.headers[b] = O, this._currentRequest.setHeader(b, O);
  }, v.prototype.removeHeader = function(b) {
    delete this._options.headers[b], this._currentRequest.removeHeader(b);
  }, v.prototype.setTimeout = function(b, O) {
    var C = this;
    function z(M) {
      M.setTimeout(b), M.removeListener("timeout", M.destroy), M.addListener("timeout", M.destroy);
    }
    function F(M) {
      C._timeout && clearTimeout(C._timeout), C._timeout = setTimeout(function() {
        C.emit("timeout"), P();
      }, b), z(M);
    }
    function P() {
      C._timeout && (clearTimeout(C._timeout), C._timeout = null), C.removeListener("abort", P), C.removeListener("error", P), C.removeListener("response", P), C.removeListener("close", P), O && C.removeListener("timeout", O), C.socket || C._currentRequest.removeListener("socket", F);
    }
    return O && this.on("timeout", O), this.socket ? F(this.socket) : this._currentRequest.once("socket", F), this.on("socket", z), this.on("abort", P), this.on("error", P), this.on("response", P), this.on("close", P), this;
  }, [
    "flushHeaders",
    "getHeader",
    "setNoDelay",
    "setSocketKeepAlive"
  ].forEach(function(b) {
    v.prototype[b] = function(O, C) {
      return this._currentRequest[b](O, C);
    };
  }), ["aborted", "connection", "socket"].forEach(function(b) {
    Object.defineProperty(v.prototype, b, {
      get: function() {
        return this._currentRequest[b];
      }
    });
  }), v.prototype._sanitizeOptions = function(b) {
    if (b.headers || (b.headers = {}), b.host && (b.hostname || (b.hostname = b.host), delete b.host), !b.pathname && b.path) {
      var O = b.path.indexOf("?");
      O < 0 ? b.pathname = b.path : (b.pathname = b.path.substring(0, O), b.search = b.path.substring(O));
    }
  }, v.prototype._performRequest = function() {
    var b = this._options.protocol, O = this._options.nativeProtocols[b];
    if (!O)
      throw new TypeError("Unsupported protocol " + b);
    if (this._options.agents) {
      var C = b.slice(0, -1);
      this._options.agent = this._options.agents[C];
    }
    var z = this._currentRequest = O.request(this._options, this._onNativeResponse);
    z._redirectable = this;
    for (var F of u)
      z.on(F, p[F]);
    if (this._currentUrl = /^\//.test(this._options.path) ? t.format(this._options) : (
      // When making a request to a proxy, […]
      // a client MUST send the target URI in absolute-form […].
      this._options.path
    ), this._isRedirect) {
      var P = 0, M = this, Q = this._requestBodyBuffers;
      (function K(Y) {
        if (z === M._currentRequest)
          if (Y)
            M.emit("error", Y);
          else if (P < Q.length) {
            var V = Q[P++];
            z.finished || z.write(V.data, V.encoding, K);
          } else M._ended && z.end();
      })();
    }
  }, v.prototype._processResponse = function(b) {
    var O = b.statusCode;
    this._options.trackRedirects && this._redirects.push({
      url: this._currentUrl,
      headers: b.headers,
      statusCode: O
    });
    var C = b.headers.location;
    if (!C || this._options.followRedirects === !1 || O < 300 || O >= 400) {
      b.responseUrl = this._currentUrl, b.redirects = this._redirects, this.emit("response", b), this._requestBodyBuffers = [];
      return;
    }
    if (L(this._currentRequest), b.destroy(), ++this._redirectCount > this._options.maxRedirects)
      throw new E();
    var z, F = this._options.beforeRedirect;
    F && (z = Object.assign({
      // The Host header was set by nativeProtocol.request
      Host: b.req.getHeader("host")
    }, this._options.headers));
    var P = this._options.method;
    ((O === 301 || O === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
    // the server is redirecting the user agent to a different resource […]
    // A user agent can perform a retrieval request targeting that URI
    // (a GET or HEAD request if using HTTP) […]
    O === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) && (this._options.method = "GET", this._requestBodyBuffers = [], S(/^content-/i, this._options.headers));
    var M = S(/^host$/i, this._options.headers), Q = A(this._currentUrl), K = M || Q.host, Y = /^\w+:/.test(C) ? this._currentUrl : t.format(Object.assign(Q, { host: K })), V = g(C, Y);
    if (s("redirecting to", V.href), this._isRedirect = !0, y(V, this._options), (V.protocol !== Q.protocol && V.protocol !== "https:" || V.host !== K && !I(V.host, K)) && S(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers), W(F)) {
      var te = {
        headers: b.headers,
        statusCode: O
      }, ye = {
        url: Y,
        method: P,
        headers: z
      };
      F(this._options, te, ye), this._sanitizeOptions(this._options);
    }
    this._performRequest();
  };
  function w(b) {
    var O = {
      maxRedirects: 21,
      maxBodyLength: 10485760
    }, C = {};
    return Object.keys(b).forEach(function(z) {
      var F = z + ":", P = C[F] = b[z], M = O[z] = Object.create(P);
      function Q(Y, V, te) {
        return ne(Y) ? Y = y(Y) : D(Y) ? Y = y(A(Y)) : (te = V, V = m(Y), Y = { protocol: F }), W(V) && (te = V, V = null), V = Object.assign({
          maxRedirects: O.maxRedirects,
          maxBodyLength: O.maxBodyLength
        }, Y, V), V.nativeProtocols = C, !D(V.host) && !D(V.hostname) && (V.hostname = "::1"), o.equal(V.protocol, F, "protocol mismatch"), s("options", V), new v(V, te);
      }
      function K(Y, V, te) {
        var ye = M.request(Y, V, te);
        return ye.end(), ye;
      }
      Object.defineProperties(M, {
        request: { value: Q, configurable: !0, enumerable: !0, writable: !0 },
        get: { value: K, configurable: !0, enumerable: !0, writable: !0 }
      });
    }), O;
  }
  function k() {
  }
  function A(b) {
    var O;
    if (r)
      O = new e(b);
    else if (O = m(t.parse(b)), !D(O.protocol))
      throw new d({ input: b });
    return O;
  }
  function g(b, O) {
    return r ? new e(b, O) : A(t.resolve(O, b));
  }
  function m(b) {
    if (/^\[/.test(b.hostname) && !/^\[[:0-9a-f]+\]$/i.test(b.hostname))
      throw new d({ input: b.href || b });
    if (/^\[/.test(b.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(b.host))
      throw new d({ input: b.href || b });
    return b;
  }
  function y(b, O) {
    var C = O || {};
    for (var z of c)
      C[z] = b[z];
    return C.hostname.startsWith("[") && (C.hostname = C.hostname.slice(1, -1)), C.port !== "" && (C.port = Number(C.port)), C.path = C.search ? C.pathname + C.search : C.pathname, C;
  }
  function S(b, O) {
    var C;
    for (var z in O)
      b.test(z) && (C = O[z], delete O[z]);
    return C === null || typeof C > "u" ? void 0 : String(C).trim();
  }
  function j(b, O, C) {
    function z(F) {
      W(Error.captureStackTrace) && Error.captureStackTrace(this, this.constructor), Object.assign(this, F || {}), this.code = b, this.message = this.cause ? O + ": " + this.cause.message : O;
    }
    return z.prototype = new (C || Error)(), Object.defineProperties(z.prototype, {
      constructor: {
        value: z,
        enumerable: !1
      },
      name: {
        value: "Error [" + b + "]",
        enumerable: !1
      }
    }), z;
  }
  function L(b, O) {
    for (var C of u)
      b.removeListener(C, p[C]);
    b.on("error", k), b.destroy(O);
  }
  function I(b, O) {
    o(D(b) && D(O));
    var C = b.length - O.length - 1;
    return C > 0 && b[C] === "." && b.endsWith(O);
  }
  function D(b) {
    return typeof b == "string" || b instanceof String;
  }
  function W(b) {
    return typeof b == "function";
  }
  function q(b) {
    return typeof b == "object" && "length" in b;
  }
  function ne(b) {
    return e && b instanceof e;
  }
  return vt.exports = w({ http: a, https: n }), vt.exports.wrap = w, vt.exports;
}
var rp = op();
const cp = /* @__PURE__ */ wa(rp), Rt = "1.13.5";
function vo(t) {
  const e = /^([-+\w]{1,25})(:?\/\/|:)/.exec(t);
  return e && e[1] || "";
}
const pp = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function lp(t, e, a) {
  const n = a && a.Blob || se.classes.Blob, i = vo(t);
  if (e === void 0 && n && (e = !0), i === "data") {
    t = i.length ? t.slice(i.length + 1) : t;
    const o = pp.exec(t);
    if (!o)
      throw new N("Invalid URL", N.ERR_INVALID_URL);
    const s = o[1], r = o[2], c = o[3], u = Buffer.from(decodeURIComponent(c), r ? "base64" : "utf8");
    if (e) {
      if (!n)
        throw new N("Blob is not supported", N.ERR_NOT_SUPPORT);
      return new n([u], { type: s });
    }
    return u;
  }
  throw new N("Unsupported protocol " + i, N.ERR_NOT_SUPPORT);
}
const Qn = Symbol("internals");
class ts extends oe.Transform {
  constructor(e) {
    e = _.toFlatObject(e, {
      maxRate: 0,
      chunkSize: 64 * 1024,
      minChunkSize: 100,
      timeWindow: 500,
      ticksRate: 2,
      samplesCount: 15
    }, null, (n, i) => !_.isUndefined(i[n])), super({
      readableHighWaterMark: e.chunkSize
    });
    const a = this[Qn] = {
      timeWindow: e.timeWindow,
      chunkSize: e.chunkSize,
      maxRate: e.maxRate,
      minChunkSize: e.minChunkSize,
      bytesSeen: 0,
      isCaptured: !1,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null
    };
    this.on("newListener", (n) => {
      n === "progress" && (a.isCaptured || (a.isCaptured = !0));
    });
  }
  _read(e) {
    const a = this[Qn];
    return a.onReadCallback && a.onReadCallback(), super._read(e);
  }
  _transform(e, a, n) {
    const i = this[Qn], o = i.maxRate, s = this.readableHighWaterMark, r = i.timeWindow, c = 1e3 / r, u = o / c, p = i.minChunkSize !== !1 ? Math.max(i.minChunkSize, u * 0.01) : 0, d = (E, x) => {
      const f = Buffer.byteLength(E);
      i.bytesSeen += f, i.bytes += f, i.isCaptured && this.emit("progress", i.bytesSeen), this.push(E) ? process.nextTick(x) : i.onReadCallback = () => {
        i.onReadCallback = null, process.nextTick(x);
      };
    }, l = (E, x) => {
      const f = Buffer.byteLength(E);
      let h = null, v = s, w, k = 0;
      if (o) {
        const A = Date.now();
        (!i.ts || (k = A - i.ts) >= r) && (i.ts = A, w = u - i.bytes, i.bytes = w < 0 ? -w : 0, k = 0), w = u - i.bytes;
      }
      if (o) {
        if (w <= 0)
          return setTimeout(() => {
            x(null, E);
          }, r - k);
        w < v && (v = w);
      }
      v && f > v && f - v > p && (h = E.subarray(v), E = E.subarray(0, v)), d(E, h ? () => {
        process.nextTick(x, null, h);
      } : x);
    };
    l(e, function E(x, f) {
      if (x)
        return n(x);
      f ? l(f, E) : n(null);
    });
  }
}
const { asyncIterator: ns } = Symbol, bo = async function* (t) {
  t.stream ? yield* t.stream() : t.arrayBuffer ? yield await t.arrayBuffer() : t[ns] ? yield* t[ns]() : yield t;
}, up = se.ALPHABET.ALPHA_DIGIT + "-_", st = typeof TextEncoder == "function" ? new TextEncoder() : new De.TextEncoder(), Be = `\r
`, dp = st.encode(Be), mp = 2;
class fp {
  constructor(e, a) {
    const { escapeName: n } = this.constructor, i = _.isString(a);
    let o = `Content-Disposition: form-data; name="${n(e)}"${!i && a.name ? `; filename="${n(a.name)}"` : ""}${Be}`;
    i ? a = st.encode(String(a).replace(/\r?\n|\r\n?/g, Be)) : o += `Content-Type: ${a.type || "application/octet-stream"}${Be}`, this.headers = st.encode(o + Be), this.contentLength = i ? a.byteLength : a.size, this.size = this.headers.byteLength + this.contentLength + mp, this.name = e, this.value = a;
  }
  async *encode() {
    yield this.headers;
    const { value: e } = this;
    _.isTypedArray(e) ? yield e : yield* bo(e), yield dp;
  }
  static escapeName(e) {
    return String(e).replace(/[\r\n"]/g, (a) => ({
      "\r": "%0D",
      "\n": "%0A",
      '"': "%22"
    })[a]);
  }
}
const hp = (t, e, a) => {
  const {
    tag: n = "form-data-boundary",
    size: i = 25,
    boundary: o = n + "-" + se.generateString(i, up)
  } = a || {};
  if (!_.isFormData(t))
    throw TypeError("FormData instance required");
  if (o.length < 1 || o.length > 70)
    throw Error("boundary must be 10-70 characters long");
  const s = st.encode("--" + o + Be), r = st.encode("--" + o + "--" + Be);
  let c = r.byteLength;
  const u = Array.from(t.entries()).map(([d, l]) => {
    const E = new fp(d, l);
    return c += E.size, E;
  });
  c += s.byteLength * u.length, c = _.toFiniteNumber(c);
  const p = {
    "Content-Type": `multipart/form-data; boundary=${o}`
  };
  return Number.isFinite(c) && (p["Content-Length"] = c), e && e(p), Fo.from((async function* () {
    for (const d of u)
      yield s, yield* d.encode();
    yield r;
  })());
};
class xp extends oe.Transform {
  __transform(e, a, n) {
    this.push(e), n();
  }
  _transform(e, a, n) {
    if (e.length !== 0 && (this._transform = this.__transform, e[0] !== 120)) {
      const i = Buffer.alloc(2);
      i[0] = 120, i[1] = 156, this.push(i, a);
    }
    this.__transform(e, a, n);
  }
}
const vp = (t, e) => _.isAsyncFn(t) ? function(...a) {
  const n = a.pop();
  t.apply(this, a).then((i) => {
    try {
      e ? n(null, ...e(i)) : n(null, i);
    } catch (o) {
      n(o);
    }
  }, n);
} : t;
function bp(t, e) {
  t = t || 10;
  const a = new Array(t), n = new Array(t);
  let i = 0, o = 0, s;
  return e = e !== void 0 ? e : 1e3, function(c) {
    const u = Date.now(), p = n[o];
    s || (s = u), a[i] = c, n[i] = u;
    let d = o, l = 0;
    for (; d !== i; )
      l += a[d++], d = d % t;
    if (i = (i + 1) % t, i === o && (o = (o + 1) % t), u - s < e)
      return;
    const E = p && u - p;
    return E ? Math.round(l * 1e3 / E) : void 0;
  };
}
function gp(t, e) {
  let a = 0, n = 1e3 / e, i, o;
  const s = (u, p = Date.now()) => {
    a = p, i = null, o && (clearTimeout(o), o = null), t(...u);
  };
  return [(...u) => {
    const p = Date.now(), d = p - a;
    d >= n ? s(u, p) : (i = u, o || (o = setTimeout(() => {
      o = null, s(i);
    }, n - d)));
  }, () => i && s(i)];
}
const Ge = (t, e, a = 3) => {
  let n = 0;
  const i = bp(50, 250);
  return gp((o) => {
    const s = o.loaded, r = o.lengthComputable ? o.total : void 0, c = s - n, u = i(c), p = s <= r;
    n = s;
    const d = {
      loaded: s,
      total: r,
      progress: r ? s / r : void 0,
      bytes: c,
      rate: u || void 0,
      estimated: u && r && p ? (r - s) / u : void 0,
      event: o,
      lengthComputable: r != null,
      [e ? "download" : "upload"]: !0
    };
    t(d);
  }, a);
}, kt = (t, e) => {
  const a = t != null;
  return [(n) => e[0]({
    lengthComputable: a,
    total: t,
    loaded: n
  }), e[1]];
}, Ot = (t) => (...e) => _.asap(() => t(...e));
function yp(t) {
  if (!t || typeof t != "string" || !t.startsWith("data:")) return 0;
  const e = t.indexOf(",");
  if (e < 0) return 0;
  const a = t.slice(5, e), n = t.slice(e + 1);
  if (/;base64/i.test(a)) {
    let o = n.length;
    const s = n.length;
    for (let l = 0; l < s; l++)
      if (n.charCodeAt(l) === 37 && l + 2 < s) {
        const E = n.charCodeAt(l + 1), x = n.charCodeAt(l + 2);
        (E >= 48 && E <= 57 || E >= 65 && E <= 70 || E >= 97 && E <= 102) && (x >= 48 && x <= 57 || x >= 65 && x <= 70 || x >= 97 && x <= 102) && (o -= 2, l += 2);
      }
    let r = 0, c = s - 1;
    const u = (l) => l >= 2 && n.charCodeAt(l - 2) === 37 && // '%'
    n.charCodeAt(l - 1) === 51 && // '3'
    (n.charCodeAt(l) === 68 || n.charCodeAt(l) === 100);
    c >= 0 && (n.charCodeAt(c) === 61 ? (r++, c--) : u(c) && (r++, c -= 3)), r === 1 && c >= 0 && (n.charCodeAt(c) === 61 || u(c)) && r++;
    const d = Math.floor(o / 4) * 3 - (r || 0);
    return d > 0 ? d : 0;
  }
  return Buffer.byteLength(n, "utf8");
}
const as = {
  flush: je.constants.Z_SYNC_FLUSH,
  finishFlush: je.constants.Z_SYNC_FLUSH
}, _p = {
  flush: je.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: je.constants.BROTLI_OPERATION_FLUSH
}, is = _.isFunction(je.createBrotliDecompress), { http: wp, https: Ep } = cp, Sp = /https:?/, ss = se.protocols.map((t) => t + ":"), os = (t, [e, a]) => (t.on("end", a).on("error", a), e);
class Rp {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(e, a) {
    a = Object.assign({
      sessionTimeout: 1e3
    }, a);
    let n = this.sessions[e];
    if (n) {
      let p = n.length;
      for (let d = 0; d < p; d++) {
        const [l, E] = n[d];
        if (!l.destroyed && !l.closed && De.isDeepStrictEqual(E, a))
          return l;
      }
    }
    const i = js.connect(e, a);
    let o;
    const s = () => {
      if (o)
        return;
      o = !0;
      let p = n, d = p.length, l = d;
      for (; l--; )
        if (p[l][0] === i) {
          d === 1 ? delete this.sessions[e] : p.splice(l, 1);
          return;
        }
    }, r = i.request, { sessionTimeout: c } = a;
    if (c != null) {
      let p, d = 0;
      i.request = function() {
        const l = r.apply(this, arguments);
        return d++, p && (clearTimeout(p), p = null), l.once("close", () => {
          --d || (p = setTimeout(() => {
            p = null, s();
          }, c));
        }), l;
      };
    }
    i.once("close", s);
    let u = [
      i,
      a
    ];
    return n ? n.push(u) : n = this.sessions[e] = [u], i;
  }
}
const kp = new Rp();
function Op(t, e) {
  t.beforeRedirects.proxy && t.beforeRedirects.proxy(t), t.beforeRedirects.config && t.beforeRedirects.config(t, e);
}
function go(t, e, a) {
  let n = e;
  if (!n && n !== !1) {
    const i = Zc.getProxyForUrl(a);
    i && (n = new URL(i));
  }
  if (n) {
    if (n.username && (n.auth = (n.username || "") + ":" + (n.password || "")), n.auth) {
      if (!!(n.auth.username || n.auth.password))
        n.auth = (n.auth.username || "") + ":" + (n.auth.password || "");
      else if (typeof n.auth == "object")
        throw new N("Invalid proxy authorization", N.ERR_BAD_OPTION, { proxy: n });
      const s = Buffer.from(n.auth, "utf8").toString("base64");
      t.headers["Proxy-Authorization"] = "Basic " + s;
    }
    t.headers.host = t.hostname + (t.port ? ":" + t.port : "");
    const i = n.hostname || n.host;
    t.hostname = i, t.host = i, t.port = n.port, t.path = a, n.protocol && (t.protocol = n.protocol.includes(":") ? n.protocol : `${n.protocol}:`);
  }
  t.beforeRedirects.proxy = function(o) {
    go(o, e, o.href);
  };
}
const Tp = typeof process < "u" && _.kindOf(process) === "process", Cp = (t) => new Promise((e, a) => {
  let n, i;
  const o = (c, u) => {
    i || (i = !0, n && n(c, u));
  }, s = (c) => {
    o(c), e(c);
  }, r = (c) => {
    o(c, !0), a(c);
  };
  t(s, r, (c) => n = c).catch(r);
}), Ap = ({ address: t, family: e }) => {
  if (!_.isString(t))
    throw TypeError("address must be a string");
  return {
    address: t,
    family: e || (t.indexOf(".") < 0 ? 6 : 4)
  };
}, rs = (t, e) => Ap(_.isObject(t) ? t : { address: t, family: e }), Pp = {
  request(t, e) {
    const a = t.protocol + "//" + t.hostname + ":" + (t.port || (t.protocol === "https:" ? 443 : 80)), { http2Options: n, headers: i } = t, o = kp.getSession(a, n), {
      HTTP2_HEADER_SCHEME: s,
      HTTP2_HEADER_METHOD: r,
      HTTP2_HEADER_PATH: c,
      HTTP2_HEADER_STATUS: u
    } = js.constants, p = {
      [s]: t.protocol.replace(":", ""),
      [r]: t.method,
      [c]: t.path
    };
    _.forEach(i, (l, E) => {
      E.charAt(0) !== ":" && (p[E] = l);
    });
    const d = o.request(p);
    return d.once("response", (l) => {
      const E = d;
      l = Object.assign({}, l);
      const x = l[u];
      delete l[u], E.headers = l, E.statusCode = +x, e(E);
    }), d;
  }
}, jp = Tp && function(e) {
  return Cp(async function(n, i, o) {
    let { data: s, lookup: r, family: c, httpVersion: u = 1, http2Options: p } = e;
    const { responseType: d, responseEncoding: l } = e, E = e.method.toUpperCase();
    let x, f = !1, h;
    if (u = +u, Number.isNaN(u))
      throw TypeError(`Invalid protocol version: '${e.httpVersion}' is not a number`);
    if (u !== 1 && u !== 2)
      throw TypeError(`Unsupported protocol version '${u}'`);
    const v = u === 2;
    if (r) {
      const F = vp(r, (P) => _.isArray(P) ? P : [P]);
      r = (P, M, Q) => {
        F(P, M, (K, Y, V) => {
          if (K)
            return Q(K);
          const te = _.isArray(Y) ? Y.map((ye) => rs(ye)) : [rs(Y, V)];
          M.all ? Q(K, te) : Q(K, te[0].address, te[0].family);
        });
      };
    }
    const w = new Do();
    function k(F) {
      try {
        w.emit("abort", !F || F.type ? new Ue(null, e, h) : F);
      } catch (P) {
        console.warn("emit error", P);
      }
    }
    w.once("abort", i);
    const A = () => {
      e.cancelToken && e.cancelToken.unsubscribe(k), e.signal && e.signal.removeEventListener("abort", k), w.removeAllListeners();
    };
    (e.cancelToken || e.signal) && (e.cancelToken && e.cancelToken.subscribe(k), e.signal && (e.signal.aborted ? k() : e.signal.addEventListener("abort", k))), o((F, P) => {
      if (x = !0, P) {
        f = !0, A();
        return;
      }
      const { data: M } = F;
      if (M instanceof oe.Readable || M instanceof oe.Duplex) {
        const Q = oe.finished(M, () => {
          Q(), A();
        });
      } else
        A();
    });
    const g = Ta(e.baseURL, e.url, e.allowAbsoluteUrls), m = new URL(g, se.hasBrowserEnv ? se.origin : void 0), y = m.protocol || ss[0];
    if (y === "data:") {
      if (e.maxContentLength > -1) {
        const P = String(e.url || g || "");
        if (yp(P) > e.maxContentLength)
          return i(new N(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            N.ERR_BAD_RESPONSE,
            e
          ));
      }
      let F;
      if (E !== "GET")
        return $e(n, i, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config: e
        });
      try {
        F = lp(e.url, d === "blob", {
          Blob: e.env && e.env.Blob
        });
      } catch (P) {
        throw N.from(P, N.ERR_BAD_REQUEST, e);
      }
      return d === "text" ? (F = F.toString(l), (!l || l === "utf8") && (F = _.stripBOM(F))) : d === "stream" && (F = oe.Readable.from(F)), $e(n, i, {
        data: F,
        status: 200,
        statusText: "OK",
        headers: new me(),
        config: e
      });
    }
    if (ss.indexOf(y) === -1)
      return i(new N(
        "Unsupported protocol " + y,
        N.ERR_BAD_REQUEST,
        e
      ));
    const S = me.from(e.headers).normalize();
    S.set("User-Agent", "axios/" + Rt, !1);
    const { onUploadProgress: j, onDownloadProgress: L } = e, I = e.maxRate;
    let D, W;
    if (_.isSpecCompliantForm(s)) {
      const F = S.getContentType(/boundary=([-_\w\d]{10,70})/i);
      s = hp(s, (P) => {
        S.set(P);
      }, {
        tag: `axios-${Rt}-boundary`,
        boundary: F && F[1] || void 0
      });
    } else if (_.isFormData(s) && _.isFunction(s.getHeaders)) {
      if (S.set(s.getHeaders()), !S.hasContentLength())
        try {
          const F = await De.promisify(s.getLength).call(s);
          Number.isFinite(F) && F >= 0 && S.setContentLength(F);
        } catch {
        }
    } else if (_.isBlob(s) || _.isFile(s))
      s.size && S.setContentType(s.type || "application/octet-stream"), S.setContentLength(s.size || 0), s = oe.Readable.from(bo(s));
    else if (s && !_.isStream(s)) {
      if (!Buffer.isBuffer(s)) if (_.isArrayBuffer(s))
        s = Buffer.from(new Uint8Array(s));
      else if (_.isString(s))
        s = Buffer.from(s, "utf-8");
      else
        return i(new N(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          N.ERR_BAD_REQUEST,
          e
        ));
      if (S.setContentLength(s.length, !1), e.maxBodyLength > -1 && s.length > e.maxBodyLength)
        return i(new N(
          "Request body larger than maxBodyLength limit",
          N.ERR_BAD_REQUEST,
          e
        ));
    }
    const q = _.toFiniteNumber(S.getContentLength());
    _.isArray(I) ? (D = I[0], W = I[1]) : D = W = I, s && (j || D) && (_.isStream(s) || (s = oe.Readable.from(s, { objectMode: !1 })), s = oe.pipeline([s, new ts({
      maxRate: _.toFiniteNumber(D)
    })], _.noop), j && s.on("progress", os(
      s,
      kt(
        q,
        Ge(Ot(j), !1, 3)
      )
    )));
    let ne;
    if (e.auth) {
      const F = e.auth.username || "", P = e.auth.password || "";
      ne = F + ":" + P;
    }
    if (!ne && m.username) {
      const F = m.username, P = m.password;
      ne = F + ":" + P;
    }
    ne && S.delete("authorization");
    let b;
    try {
      b = ka(
        m.pathname + m.search,
        e.params,
        e.paramsSerializer
      ).replace(/^\?/, "");
    } catch (F) {
      const P = new Error(F.message);
      return P.config = e, P.url = e.url, P.exists = !0, i(P);
    }
    S.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (is ? ", br" : ""),
      !1
    );
    const O = {
      path: b,
      method: E,
      headers: S.toJSON(),
      agents: { http: e.httpAgent, https: e.httpsAgent },
      auth: ne,
      protocol: y,
      family: c,
      beforeRedirect: Op,
      beforeRedirects: {},
      http2Options: p
    };
    !_.isUndefined(r) && (O.lookup = r), e.socketPath ? O.socketPath = e.socketPath : (O.hostname = m.hostname.startsWith("[") ? m.hostname.slice(1, -1) : m.hostname, O.port = m.port, go(O, e.proxy, y + "//" + m.hostname + (m.port ? ":" + m.port : "") + O.path));
    let C;
    const z = Sp.test(O.protocol);
    if (O.agent = z ? e.httpsAgent : e.httpAgent, v ? C = Pp : e.transport ? C = e.transport : e.maxRedirects === 0 ? C = z ? At : lt : (e.maxRedirects && (O.maxRedirects = e.maxRedirects), e.beforeRedirect && (O.beforeRedirects.config = e.beforeRedirect), C = z ? Ep : wp), e.maxBodyLength > -1 ? O.maxBodyLength = e.maxBodyLength : O.maxBodyLength = 1 / 0, e.insecureHTTPParser && (O.insecureHTTPParser = e.insecureHTTPParser), h = C.request(O, function(P) {
      if (h.destroyed) return;
      const M = [P], Q = _.toFiniteNumber(P.headers["content-length"]);
      if (L || W) {
        const te = new ts({
          maxRate: _.toFiniteNumber(W)
        });
        L && te.on("progress", os(
          te,
          kt(
            Q,
            Ge(Ot(L), !0, 3)
          )
        )), M.push(te);
      }
      let K = P;
      const Y = P.req || h;
      if (e.decompress !== !1 && P.headers["content-encoding"])
        switch ((E === "HEAD" || P.statusCode === 204) && delete P.headers["content-encoding"], (P.headers["content-encoding"] || "").toLowerCase()) {
          /*eslint default-case:0*/
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            M.push(je.createUnzip(as)), delete P.headers["content-encoding"];
            break;
          case "deflate":
            M.push(new xp()), M.push(je.createUnzip(as)), delete P.headers["content-encoding"];
            break;
          case "br":
            is && (M.push(je.createBrotliDecompress(_p)), delete P.headers["content-encoding"]);
        }
      K = M.length > 1 ? oe.pipeline(M, _.noop) : M[0];
      const V = {
        status: P.statusCode,
        statusText: P.statusMessage,
        headers: new me(P.headers),
        config: e,
        request: Y
      };
      if (d === "stream")
        V.data = K, $e(n, i, V);
      else {
        const te = [];
        let ye = 0;
        K.on("data", function(G) {
          te.push(G), ye += G.length, e.maxContentLength > -1 && ye > e.maxContentLength && (f = !0, K.destroy(), k(new N(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            N.ERR_BAD_RESPONSE,
            e,
            Y
          )));
        }), K.on("aborted", function() {
          if (f)
            return;
          const G = new N(
            "stream has been aborted",
            N.ERR_BAD_RESPONSE,
            e,
            Y
          );
          K.destroy(G), i(G);
        }), K.on("error", function(G) {
          h.destroyed || i(N.from(G, null, e, Y));
        }), K.on("end", function() {
          try {
            let G = te.length === 1 ? te[0] : Buffer.concat(te);
            d !== "arraybuffer" && (G = G.toString(l), (!l || l === "utf8") && (G = _.stripBOM(G))), V.data = G;
          } catch (G) {
            return i(N.from(G, null, e, V.request, V));
          }
          $e(n, i, V);
        });
      }
      w.once("abort", (te) => {
        K.destroyed || (K.emit("error", te), K.destroy());
      });
    }), w.once("abort", (F) => {
      h.close ? h.close() : h.destroy(F);
    }), h.on("error", function(P) {
      i(N.from(P, null, e, h));
    }), h.on("socket", function(P) {
      P.setKeepAlive(!0, 1e3 * 60);
    }), e.timeout) {
      const F = parseInt(e.timeout, 10);
      if (Number.isNaN(F)) {
        k(new N(
          "error trying to parse `config.timeout` to int",
          N.ERR_BAD_OPTION_VALUE,
          e,
          h
        ));
        return;
      }
      h.setTimeout(F, function() {
        if (x) return;
        let M = e.timeout ? "timeout of " + e.timeout + "ms exceeded" : "timeout exceeded";
        const Q = e.transitional || Ft;
        e.timeoutErrorMessage && (M = e.timeoutErrorMessage), k(new N(
          M,
          Q.clarifyTimeoutError ? N.ETIMEDOUT : N.ECONNABORTED,
          e,
          h
        ));
      });
    } else
      h.setTimeout(0);
    if (_.isStream(s)) {
      let F = !1, P = !1;
      s.on("end", () => {
        F = !0;
      }), s.once("error", (M) => {
        P = !0, h.destroy(M);
      }), s.on("close", () => {
        !F && !P && k(new Ue("Request stream has been aborted", e, h));
      }), s.pipe(h);
    } else
      s && h.write(s), h.end();
  });
}, Lp = se.hasStandardBrowserEnv ? /* @__PURE__ */ ((t, e) => (a) => (a = new URL(a, se.origin), t.protocol === a.protocol && t.host === a.host && (e || t.port === a.port)))(
  new URL(se.origin),
  se.navigator && /(msie|trident)/i.test(se.navigator.userAgent)
) : () => !0, Np = se.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(t, e, a, n, i, o, s) {
      if (typeof document > "u") return;
      const r = [`${t}=${encodeURIComponent(e)}`];
      _.isNumber(a) && r.push(`expires=${new Date(a).toUTCString()}`), _.isString(n) && r.push(`path=${n}`), _.isString(i) && r.push(`domain=${i}`), o === !0 && r.push("secure"), _.isString(s) && r.push(`SameSite=${s}`), document.cookie = r.join("; ");
    },
    read(t) {
      if (typeof document > "u") return null;
      const e = document.cookie.match(new RegExp("(?:^|; )" + t + "=([^;]*)"));
      return e ? decodeURIComponent(e[1]) : null;
    },
    remove(t) {
      this.write(t, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
), cs = (t) => t instanceof me ? { ...t } : t;
function qe(t, e) {
  e = e || {};
  const a = {};
  function n(u, p, d, l) {
    return _.isPlainObject(u) && _.isPlainObject(p) ? _.merge.call({ caseless: l }, u, p) : _.isPlainObject(p) ? _.merge({}, p) : _.isArray(p) ? p.slice() : p;
  }
  function i(u, p, d, l) {
    if (_.isUndefined(p)) {
      if (!_.isUndefined(u))
        return n(void 0, u, d, l);
    } else return n(u, p, d, l);
  }
  function o(u, p) {
    if (!_.isUndefined(p))
      return n(void 0, p);
  }
  function s(u, p) {
    if (_.isUndefined(p)) {
      if (!_.isUndefined(u))
        return n(void 0, u);
    } else return n(void 0, p);
  }
  function r(u, p, d) {
    if (d in e)
      return n(u, p);
    if (d in t)
      return n(void 0, u);
  }
  const c = {
    url: o,
    method: o,
    data: o,
    baseURL: s,
    transformRequest: s,
    transformResponse: s,
    paramsSerializer: s,
    timeout: s,
    timeoutMessage: s,
    withCredentials: s,
    withXSRFToken: s,
    adapter: s,
    responseType: s,
    xsrfCookieName: s,
    xsrfHeaderName: s,
    onUploadProgress: s,
    onDownloadProgress: s,
    decompress: s,
    maxContentLength: s,
    maxBodyLength: s,
    beforeRedirect: s,
    transport: s,
    httpAgent: s,
    httpsAgent: s,
    cancelToken: s,
    socketPath: s,
    responseEncoding: s,
    validateStatus: r,
    headers: (u, p, d) => i(cs(u), cs(p), d, !0)
  };
  return _.forEach(
    Object.keys({ ...t, ...e }),
    function(p) {
      if (p === "__proto__" || p === "constructor" || p === "prototype")
        return;
      const d = _.hasOwnProp(c, p) ? c[p] : i, l = d(t[p], e[p], p);
      _.isUndefined(l) && d !== r || (a[p] = l);
    }
  ), a;
}
const yo = (t) => {
  const e = qe({}, t);
  let { data: a, withXSRFToken: n, xsrfHeaderName: i, xsrfCookieName: o, headers: s, auth: r } = e;
  if (e.headers = s = me.from(s), e.url = ka(Ta(e.baseURL, e.url, e.allowAbsoluteUrls), t.params, t.paramsSerializer), r && s.set(
    "Authorization",
    "Basic " + btoa((r.username || "") + ":" + (r.password ? unescape(encodeURIComponent(r.password)) : ""))
  ), _.isFormData(a)) {
    if (se.hasStandardBrowserEnv || se.hasStandardBrowserWebWorkerEnv)
      s.setContentType(void 0);
    else if (_.isFunction(a.getHeaders)) {
      const c = a.getHeaders(), u = ["content-type", "content-length"];
      Object.entries(c).forEach(([p, d]) => {
        u.includes(p.toLowerCase()) && s.set(p, d);
      });
    }
  }
  if (se.hasStandardBrowserEnv && (n && _.isFunction(n) && (n = n(e)), n || n !== !1 && Lp(e.url))) {
    const c = i && o && Np.read(o);
    c && s.set(i, c);
  }
  return e;
}, Bp = typeof XMLHttpRequest < "u", Fp = Bp && function(t) {
  return new Promise(function(a, n) {
    const i = yo(t);
    let o = i.data;
    const s = me.from(i.headers).normalize();
    let { responseType: r, onUploadProgress: c, onDownloadProgress: u } = i, p, d, l, E, x;
    function f() {
      E && E(), x && x(), i.cancelToken && i.cancelToken.unsubscribe(p), i.signal && i.signal.removeEventListener("abort", p);
    }
    let h = new XMLHttpRequest();
    h.open(i.method.toUpperCase(), i.url, !0), h.timeout = i.timeout;
    function v() {
      if (!h)
        return;
      const k = me.from(
        "getAllResponseHeaders" in h && h.getAllResponseHeaders()
      ), g = {
        data: !r || r === "text" || r === "json" ? h.responseText : h.response,
        status: h.status,
        statusText: h.statusText,
        headers: k,
        config: t,
        request: h
      };
      $e(function(y) {
        a(y), f();
      }, function(y) {
        n(y), f();
      }, g), h = null;
    }
    "onloadend" in h ? h.onloadend = v : h.onreadystatechange = function() {
      !h || h.readyState !== 4 || h.status === 0 && !(h.responseURL && h.responseURL.indexOf("file:") === 0) || setTimeout(v);
    }, h.onabort = function() {
      h && (n(new N("Request aborted", N.ECONNABORTED, t, h)), h = null);
    }, h.onerror = function(A) {
      const g = A && A.message ? A.message : "Network Error", m = new N(g, N.ERR_NETWORK, t, h);
      m.event = A || null, n(m), h = null;
    }, h.ontimeout = function() {
      let A = i.timeout ? "timeout of " + i.timeout + "ms exceeded" : "timeout exceeded";
      const g = i.transitional || Ft;
      i.timeoutErrorMessage && (A = i.timeoutErrorMessage), n(new N(
        A,
        g.clarifyTimeoutError ? N.ETIMEDOUT : N.ECONNABORTED,
        t,
        h
      )), h = null;
    }, o === void 0 && s.setContentType(null), "setRequestHeader" in h && _.forEach(s.toJSON(), function(A, g) {
      h.setRequestHeader(g, A);
    }), _.isUndefined(i.withCredentials) || (h.withCredentials = !!i.withCredentials), r && r !== "json" && (h.responseType = i.responseType), u && ([l, x] = Ge(u, !0), h.addEventListener("progress", l)), c && h.upload && ([d, E] = Ge(c), h.upload.addEventListener("progress", d), h.upload.addEventListener("loadend", E)), (i.cancelToken || i.signal) && (p = (k) => {
      h && (n(!k || k.type ? new Ue(null, t, h) : k), h.abort(), h = null);
    }, i.cancelToken && i.cancelToken.subscribe(p), i.signal && (i.signal.aborted ? p() : i.signal.addEventListener("abort", p)));
    const w = vo(i.url);
    if (w && se.protocols.indexOf(w) === -1) {
      n(new N("Unsupported protocol " + w + ":", N.ERR_BAD_REQUEST, t));
      return;
    }
    h.send(o || null);
  });
}, Up = (t, e) => {
  const { length: a } = t = t ? t.filter(Boolean) : [];
  if (e || a) {
    let n = new AbortController(), i;
    const o = function(u) {
      if (!i) {
        i = !0, r();
        const p = u instanceof Error ? u : this.reason;
        n.abort(p instanceof N ? p : new Ue(p instanceof Error ? p.message : p));
      }
    };
    let s = e && setTimeout(() => {
      s = null, o(new N(`timeout of ${e}ms exceeded`, N.ETIMEDOUT));
    }, e);
    const r = () => {
      t && (s && clearTimeout(s), s = null, t.forEach((u) => {
        u.unsubscribe ? u.unsubscribe(o) : u.removeEventListener("abort", o);
      }), t = null);
    };
    t.forEach((u) => u.addEventListener("abort", o));
    const { signal: c } = n;
    return c.unsubscribe = () => _.asap(r), c;
  }
}, qp = function* (t, e) {
  let a = t.byteLength;
  if (a < e) {
    yield t;
    return;
  }
  let n = 0, i;
  for (; n < a; )
    i = n + e, yield t.slice(n, i), n = i;
}, Dp = async function* (t, e) {
  for await (const a of Ip(t))
    yield* qp(a, e);
}, Ip = async function* (t) {
  if (t[Symbol.asyncIterator]) {
    yield* t;
    return;
  }
  const e = t.getReader();
  try {
    for (; ; ) {
      const { done: a, value: n } = await e.read();
      if (a)
        break;
      yield n;
    }
  } finally {
    await e.cancel();
  }
}, ps = (t, e, a, n) => {
  const i = Dp(t, e);
  let o = 0, s, r = (c) => {
    s || (s = !0, n && n(c));
  };
  return new ReadableStream({
    async pull(c) {
      try {
        const { done: u, value: p } = await i.next();
        if (u) {
          r(), c.close();
          return;
        }
        let d = p.byteLength;
        if (a) {
          let l = o += d;
          a(l);
        }
        c.enqueue(new Uint8Array(p));
      } catch (u) {
        throw r(u), u;
      }
    },
    cancel(c) {
      return r(c), i.return();
    }
  }, {
    highWaterMark: 2
  });
}, ls = 64 * 1024, { isFunction: _t } = _, zp = (({ Request: t, Response: e }) => ({
  Request: t,
  Response: e
}))(_.global), {
  ReadableStream: us,
  TextEncoder: ds
} = _.global, ms = (t, ...e) => {
  try {
    return !!t(...e);
  } catch {
    return !1;
  }
}, Mp = (t) => {
  t = _.merge.call({
    skipUndefined: !0
  }, zp, t);
  const { fetch: e, Request: a, Response: n } = t, i = e ? _t(e) : typeof fetch == "function", o = _t(a), s = _t(n);
  if (!i)
    return !1;
  const r = i && _t(us), c = i && (typeof ds == "function" ? /* @__PURE__ */ ((x) => (f) => x.encode(f))(new ds()) : async (x) => new Uint8Array(await new a(x).arrayBuffer())), u = o && r && ms(() => {
    let x = !1;
    const f = new a(se.origin, {
      body: new us(),
      method: "POST",
      get duplex() {
        return x = !0, "half";
      }
    }).headers.has("Content-Type");
    return x && !f;
  }), p = s && r && ms(() => _.isReadableStream(new n("").body)), d = {
    stream: p && ((x) => x.body)
  };
  i && ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((x) => {
    !d[x] && (d[x] = (f, h) => {
      let v = f && f[x];
      if (v)
        return v.call(f);
      throw new N(`Response type '${x}' is not supported`, N.ERR_NOT_SUPPORT, h);
    });
  });
  const l = async (x) => {
    if (x == null)
      return 0;
    if (_.isBlob(x))
      return x.size;
    if (_.isSpecCompliantForm(x))
      return (await new a(se.origin, {
        method: "POST",
        body: x
      }).arrayBuffer()).byteLength;
    if (_.isArrayBufferView(x) || _.isArrayBuffer(x))
      return x.byteLength;
    if (_.isURLSearchParams(x) && (x = x + ""), _.isString(x))
      return (await c(x)).byteLength;
  }, E = async (x, f) => {
    const h = _.toFiniteNumber(x.getContentLength());
    return h ?? l(f);
  };
  return async (x) => {
    let {
      url: f,
      method: h,
      data: v,
      signal: w,
      cancelToken: k,
      timeout: A,
      onDownloadProgress: g,
      onUploadProgress: m,
      responseType: y,
      headers: S,
      withCredentials: j = "same-origin",
      fetchOptions: L
    } = yo(x), I = e || fetch;
    y = y ? (y + "").toLowerCase() : "text";
    let D = Up([w, k && k.toAbortSignal()], A), W = null;
    const q = D && D.unsubscribe && (() => {
      D.unsubscribe();
    });
    let ne;
    try {
      if (m && u && h !== "get" && h !== "head" && (ne = await E(S, v)) !== 0) {
        let P = new a(f, {
          method: "POST",
          body: v,
          duplex: "half"
        }), M;
        if (_.isFormData(v) && (M = P.headers.get("content-type")) && S.setContentType(M), P.body) {
          const [Q, K] = kt(
            ne,
            Ge(Ot(m))
          );
          v = ps(P.body, ls, Q, K);
        }
      }
      _.isString(j) || (j = j ? "include" : "omit");
      const b = o && "credentials" in a.prototype, O = {
        ...L,
        signal: D,
        method: h.toUpperCase(),
        headers: S.normalize().toJSON(),
        body: v,
        duplex: "half",
        credentials: b ? j : void 0
      };
      W = o && new a(f, O);
      let C = await (o ? I(W, L) : I(f, O));
      const z = p && (y === "stream" || y === "response");
      if (p && (g || z && q)) {
        const P = {};
        ["status", "statusText", "headers"].forEach((Y) => {
          P[Y] = C[Y];
        });
        const M = _.toFiniteNumber(C.headers.get("content-length")), [Q, K] = g && kt(
          M,
          Ge(Ot(g), !0)
        ) || [];
        C = new n(
          ps(C.body, ls, Q, () => {
            K && K(), q && q();
          }),
          P
        );
      }
      y = y || "text";
      let F = await d[_.findKey(d, y) || "text"](C, x);
      return !z && q && q(), await new Promise((P, M) => {
        $e(P, M, {
          data: F,
          headers: me.from(C.headers),
          status: C.status,
          statusText: C.statusText,
          config: x,
          request: W
        });
      });
    } catch (b) {
      throw q && q(), b && b.name === "TypeError" && /Load failed|fetch/i.test(b.message) ? Object.assign(
        new N("Network Error", N.ERR_NETWORK, x, W, b && b.response),
        {
          cause: b.cause || b
        }
      ) : N.from(b, b && b.code, x, W, b && b.response);
    }
  };
}, $p = /* @__PURE__ */ new Map(), _o = (t) => {
  let e = t && t.env || {};
  const { fetch: a, Request: n, Response: i } = e, o = [
    n,
    i,
    a
  ];
  let s = o.length, r = s, c, u, p = $p;
  for (; r--; )
    c = o[r], u = p.get(c), u === void 0 && p.set(c, u = r ? /* @__PURE__ */ new Map() : Mp(e)), p = u;
  return u;
};
_o();
const Ca = {
  http: jp,
  xhr: Fp,
  fetch: {
    get: _o
  }
};
_.forEach(Ca, (t, e) => {
  if (t) {
    try {
      Object.defineProperty(t, "name", { value: e });
    } catch {
    }
    Object.defineProperty(t, "adapterName", { value: e });
  }
});
const fs = (t) => `- ${t}`, Hp = (t) => _.isFunction(t) || t === null || t === !1;
function Wp(t, e) {
  t = _.isArray(t) ? t : [t];
  const { length: a } = t;
  let n, i;
  const o = {};
  for (let s = 0; s < a; s++) {
    n = t[s];
    let r;
    if (i = n, !Hp(n) && (i = Ca[(r = String(n)).toLowerCase()], i === void 0))
      throw new N(`Unknown adapter '${r}'`);
    if (i && (_.isFunction(i) || (i = i.get(e))))
      break;
    o[r || "#" + s] = i;
  }
  if (!i) {
    const s = Object.entries(o).map(
      ([c, u]) => `adapter ${c} ` + (u === !1 ? "is not supported by the environment" : "is not available in the build")
    );
    let r = a ? s.length > 1 ? `since :
` + s.map(fs).join(`
`) : " " + fs(s[0]) : "as no adapter specified";
    throw new N(
      "There is no suitable adapter to dispatch the request " + r,
      "ERR_NOT_SUPPORT"
    );
  }
  return i;
}
const wo = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter: Wp,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: Ca
};
function ea(t) {
  if (t.cancelToken && t.cancelToken.throwIfRequested(), t.signal && t.signal.aborted)
    throw new Ue(null, t);
}
function hs(t) {
  return ea(t), t.headers = me.from(t.headers), t.data = Gn.call(
    t,
    t.transformRequest
  ), ["post", "put", "patch"].indexOf(t.method) !== -1 && t.headers.setContentType("application/x-www-form-urlencoded", !1), wo.getAdapter(t.adapter || ft.adapter, t)(t).then(function(n) {
    return ea(t), n.data = Gn.call(
      t,
      t.transformResponse,
      n
    ), n.headers = me.from(n.headers), n;
  }, function(n) {
    return ho(n) || (ea(t), n && n.response && (n.response.data = Gn.call(
      t,
      t.transformResponse,
      n.response
    ), n.response.headers = me.from(n.response.headers))), Promise.reject(n);
  });
}
const Ut = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((t, e) => {
  Ut[t] = function(n) {
    return typeof n === t || "a" + (e < 1 ? "n " : " ") + t;
  };
});
const xs = {};
Ut.transitional = function(e, a, n) {
  function i(o, s) {
    return "[Axios v" + Rt + "] Transitional option '" + o + "'" + s + (n ? ". " + n : "");
  }
  return (o, s, r) => {
    if (e === !1)
      throw new N(
        i(s, " has been removed" + (a ? " in " + a : "")),
        N.ERR_DEPRECATED
      );
    return a && !xs[s] && (xs[s] = !0, console.warn(
      i(
        s,
        " has been deprecated since v" + a + " and will be removed in the near future"
      )
    )), e ? e(o, s, r) : !0;
  };
};
Ut.spelling = function(e) {
  return (a, n) => (console.warn(`${n} is likely a misspelling of ${e}`), !0);
};
function Gp(t, e, a) {
  if (typeof t != "object")
    throw new N("options must be an object", N.ERR_BAD_OPTION_VALUE);
  const n = Object.keys(t);
  let i = n.length;
  for (; i-- > 0; ) {
    const o = n[i], s = e[o];
    if (s) {
      const r = t[o], c = r === void 0 || s(r, o, t);
      if (c !== !0)
        throw new N("option " + o + " must be " + c, N.ERR_BAD_OPTION_VALUE);
      continue;
    }
    if (a !== !0)
      throw new N("Unknown option " + o, N.ERR_BAD_OPTION);
  }
}
const St = {
  assertOptions: Gp,
  validators: Ut
}, Se = St.validators;
let Fe = class {
  constructor(e) {
    this.defaults = e || {}, this.interceptors = {
      request: new Mi(),
      response: new Mi()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(e, a) {
    try {
      return await this._request(e, a);
    } catch (n) {
      if (n instanceof Error) {
        let i = {};
        Error.captureStackTrace ? Error.captureStackTrace(i) : i = new Error();
        const o = i.stack ? i.stack.replace(/^.+\n/, "") : "";
        try {
          n.stack ? o && !String(n.stack).endsWith(o.replace(/^.+\n.+\n/, "")) && (n.stack += `
` + o) : n.stack = o;
        } catch {
        }
      }
      throw n;
    }
  }
  _request(e, a) {
    typeof e == "string" ? (a = a || {}, a.url = e) : a = e || {}, a = qe(this.defaults, a);
    const { transitional: n, paramsSerializer: i, headers: o } = a;
    n !== void 0 && St.assertOptions(n, {
      silentJSONParsing: Se.transitional(Se.boolean),
      forcedJSONParsing: Se.transitional(Se.boolean),
      clarifyTimeoutError: Se.transitional(Se.boolean),
      legacyInterceptorReqResOrdering: Se.transitional(Se.boolean)
    }, !1), i != null && (_.isFunction(i) ? a.paramsSerializer = {
      serialize: i
    } : St.assertOptions(i, {
      encode: Se.function,
      serialize: Se.function
    }, !0)), a.allowAbsoluteUrls !== void 0 || (this.defaults.allowAbsoluteUrls !== void 0 ? a.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls : a.allowAbsoluteUrls = !0), St.assertOptions(a, {
      baseUrl: Se.spelling("baseURL"),
      withXsrfToken: Se.spelling("withXSRFToken")
    }, !0), a.method = (a.method || this.defaults.method || "get").toLowerCase();
    let s = o && _.merge(
      o.common,
      o[a.method]
    );
    o && _.forEach(
      ["delete", "get", "head", "post", "put", "patch", "common"],
      (x) => {
        delete o[x];
      }
    ), a.headers = me.concat(s, o);
    const r = [];
    let c = !0;
    this.interceptors.request.forEach(function(f) {
      if (typeof f.runWhen == "function" && f.runWhen(a) === !1)
        return;
      c = c && f.synchronous;
      const h = a.transitional || Ft;
      h && h.legacyInterceptorReqResOrdering ? r.unshift(f.fulfilled, f.rejected) : r.push(f.fulfilled, f.rejected);
    });
    const u = [];
    this.interceptors.response.forEach(function(f) {
      u.push(f.fulfilled, f.rejected);
    });
    let p, d = 0, l;
    if (!c) {
      const x = [hs.bind(this), void 0];
      for (x.unshift(...r), x.push(...u), l = x.length, p = Promise.resolve(a); d < l; )
        p = p.then(x[d++], x[d++]);
      return p;
    }
    l = r.length;
    let E = a;
    for (; d < l; ) {
      const x = r[d++], f = r[d++];
      try {
        E = x(E);
      } catch (h) {
        f.call(this, h);
        break;
      }
    }
    try {
      p = hs.call(this, E);
    } catch (x) {
      return Promise.reject(x);
    }
    for (d = 0, l = u.length; d < l; )
      p = p.then(u[d++], u[d++]);
    return p;
  }
  getUri(e) {
    e = qe(this.defaults, e);
    const a = Ta(e.baseURL, e.url, e.allowAbsoluteUrls);
    return ka(a, e.params, e.paramsSerializer);
  }
};
_.forEach(["delete", "get", "head", "options"], function(e) {
  Fe.prototype[e] = function(a, n) {
    return this.request(qe(n || {}, {
      method: e,
      url: a,
      data: (n || {}).data
    }));
  };
});
_.forEach(["post", "put", "patch"], function(e) {
  function a(n) {
    return function(o, s, r) {
      return this.request(qe(r || {}, {
        method: e,
        headers: n ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url: o,
        data: s
      }));
    };
  }
  Fe.prototype[e] = a(), Fe.prototype[e + "Form"] = a(!0);
});
let Vp = class Eo {
  constructor(e) {
    if (typeof e != "function")
      throw new TypeError("executor must be a function.");
    let a;
    this.promise = new Promise(function(o) {
      a = o;
    });
    const n = this;
    this.promise.then((i) => {
      if (!n._listeners) return;
      let o = n._listeners.length;
      for (; o-- > 0; )
        n._listeners[o](i);
      n._listeners = null;
    }), this.promise.then = (i) => {
      let o;
      const s = new Promise((r) => {
        n.subscribe(r), o = r;
      }).then(i);
      return s.cancel = function() {
        n.unsubscribe(o);
      }, s;
    }, e(function(o, s, r) {
      n.reason || (n.reason = new Ue(o, s, r), a(n.reason));
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason)
      throw this.reason;
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(e) {
    if (this.reason) {
      e(this.reason);
      return;
    }
    this._listeners ? this._listeners.push(e) : this._listeners = [e];
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(e) {
    if (!this._listeners)
      return;
    const a = this._listeners.indexOf(e);
    a !== -1 && this._listeners.splice(a, 1);
  }
  toAbortSignal() {
    const e = new AbortController(), a = (n) => {
      e.abort(n);
    };
    return this.subscribe(a), e.signal.unsubscribe = () => this.unsubscribe(a), e.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let e;
    return {
      token: new Eo(function(i) {
        e = i;
      }),
      cancel: e
    };
  }
};
function Kp(t) {
  return function(a) {
    return t.apply(null, a);
  };
}
function Yp(t) {
  return _.isObject(t) && t.isAxiosError === !0;
}
const xa = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(xa).forEach(([t, e]) => {
  xa[e] = t;
});
function So(t) {
  const e = new Fe(t), a = zs(Fe.prototype.request, e);
  return _.extend(a, Fe.prototype, e, { allOwnKeys: !0 }), _.extend(a, e, null, { allOwnKeys: !0 }), a.create = function(i) {
    return So(qe(t, i));
  }, a;
}
const X = So(ft);
X.Axios = Fe;
X.CanceledError = Ue;
X.CancelToken = Vp;
X.isCancel = ho;
X.VERSION = Rt;
X.toFormData = Bt;
X.AxiosError = N;
X.Cancel = X.CanceledError;
X.all = function(e) {
  return Promise.all(e);
};
X.spread = Kp;
X.isAxiosError = Yp;
X.mergeConfig = qe;
X.AxiosHeaders = me;
X.formToJSON = (t) => fo(_.isHTMLForm(t) ? new FormData(t) : t);
X.getAdapter = wo.getAdapter;
X.HttpStatusCode = xa;
X.default = X;
const {
  Axios: jl,
  AxiosError: Ll,
  CanceledError: Nl,
  isCancel: Bl,
  CancelToken: Fl,
  VERSION: Ul,
  all: ql,
  Cancel: Dl,
  isAxiosError: Il,
  spread: zl,
  toFormData: Ml,
  AxiosHeaders: $l,
  HttpStatusCode: Hl,
  formToJSON: Wl,
  getAdapter: Gl,
  mergeConfig: Vl
} = X;
var nt = { exports: {} }, ta, vs;
function Le() {
  if (vs) return ta;
  vs = 1;
  const t = ["nodebuffer", "arraybuffer", "fragments"], e = typeof Blob < "u";
  return e && t.push("blob"), ta = {
    BINARY_TYPES: t,
    CLOSE_TIMEOUT: 3e4,
    EMPTY_BUFFER: Buffer.alloc(0),
    GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
    hasBlob: e,
    kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
    kListener: Symbol("kListener"),
    kStatusCode: Symbol("status-code"),
    kWebSocket: Symbol("websocket"),
    NOOP: () => {
    }
  }, ta;
}
var bs;
function qt() {
  if (bs) return nt.exports;
  bs = 1;
  const { EMPTY_BUFFER: t } = Le(), e = Buffer[Symbol.species];
  function a(r, c) {
    if (r.length === 0) return t;
    if (r.length === 1) return r[0];
    const u = Buffer.allocUnsafe(c);
    let p = 0;
    for (let d = 0; d < r.length; d++) {
      const l = r[d];
      u.set(l, p), p += l.length;
    }
    return p < c ? new e(u.buffer, u.byteOffset, p) : u;
  }
  function n(r, c, u, p, d) {
    for (let l = 0; l < d; l++)
      u[p + l] = r[l] ^ c[l & 3];
  }
  function i(r, c) {
    for (let u = 0; u < r.length; u++)
      r[u] ^= c[u & 3];
  }
  function o(r) {
    return r.length === r.buffer.byteLength ? r.buffer : r.buffer.slice(r.byteOffset, r.byteOffset + r.length);
  }
  function s(r) {
    if (s.readOnly = !0, Buffer.isBuffer(r)) return r;
    let c;
    return r instanceof ArrayBuffer ? c = new e(r) : ArrayBuffer.isView(r) ? c = new e(r.buffer, r.byteOffset, r.byteLength) : (c = Buffer.from(r), s.readOnly = !1), c;
  }
  if (nt.exports = {
    concat: a,
    mask: n,
    toArrayBuffer: o,
    toBuffer: s,
    unmask: i
  }, !process.env.WS_NO_BUFFER_UTIL)
    try {
      const r = require("bufferutil");
      nt.exports.mask = function(c, u, p, d, l) {
        l < 48 ? n(c, u, p, d, l) : r.mask(c, u, p, d, l);
      }, nt.exports.unmask = function(c, u) {
        c.length < 32 ? i(c, u) : r.unmask(c, u);
      };
    } catch {
    }
  return nt.exports;
}
var na, gs;
function Jp() {
  if (gs) return na;
  gs = 1;
  const t = Symbol("kDone"), e = Symbol("kRun");
  class a {
    /**
     * Creates a new `Limiter`.
     *
     * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
     *     to run concurrently
     */
    constructor(i) {
      this[t] = () => {
        this.pending--, this[e]();
      }, this.concurrency = i || 1 / 0, this.jobs = [], this.pending = 0;
    }
    /**
     * Adds a job to the queue.
     *
     * @param {Function} job The job to run
     * @public
     */
    add(i) {
      this.jobs.push(i), this[e]();
    }
    /**
     * Removes a job from the queue and runs it if possible.
     *
     * @private
     */
    [e]() {
      if (this.pending !== this.concurrency && this.jobs.length) {
        const i = this.jobs.shift();
        this.pending++, i(this[t]);
      }
    }
  }
  return na = a, na;
}
var aa, ys;
function Dt() {
  if (ys) return aa;
  ys = 1;
  const t = je, e = qt(), a = Jp(), { kStatusCode: n } = Le(), i = Buffer[Symbol.species], o = Buffer.from([0, 0, 255, 255]), s = Symbol("permessage-deflate"), r = Symbol("total-length"), c = Symbol("callback"), u = Symbol("buffers"), p = Symbol("error");
  let d;
  class l {
    /**
     * Creates a PerMessageDeflate instance.
     *
     * @param {Object} [options] Configuration options
     * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
     *     for, or request, a custom client window size
     * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
     *     acknowledge disabling of client context takeover
     * @param {Number} [options.concurrencyLimit=10] The number of concurrent
     *     calls to zlib
     * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
     *     use of a custom server window size
     * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
     *     disabling of server context takeover
     * @param {Number} [options.threshold=1024] Size (in bytes) below which
     *     messages should not be compressed if context takeover is disabled
     * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
     *     deflate
     * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
     *     inflate
     * @param {Boolean} [isServer=false] Create the instance in either server or
     *     client mode
     * @param {Number} [maxPayload=0] The maximum allowed message length
     */
    constructor(v, w, k) {
      if (this._maxPayload = k | 0, this._options = v || {}, this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024, this._isServer = !!w, this._deflate = null, this._inflate = null, this.params = null, !d) {
        const A = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
        d = new a(A);
      }
    }
    /**
     * @type {String}
     */
    static get extensionName() {
      return "permessage-deflate";
    }
    /**
     * Create an extension negotiation offer.
     *
     * @return {Object} Extension parameters
     * @public
     */
    offer() {
      const v = {};
      return this._options.serverNoContextTakeover && (v.server_no_context_takeover = !0), this._options.clientNoContextTakeover && (v.client_no_context_takeover = !0), this._options.serverMaxWindowBits && (v.server_max_window_bits = this._options.serverMaxWindowBits), this._options.clientMaxWindowBits ? v.client_max_window_bits = this._options.clientMaxWindowBits : this._options.clientMaxWindowBits == null && (v.client_max_window_bits = !0), v;
    }
    /**
     * Accept an extension negotiation offer/response.
     *
     * @param {Array} configurations The extension negotiation offers/reponse
     * @return {Object} Accepted configuration
     * @public
     */
    accept(v) {
      return v = this.normalizeParams(v), this.params = this._isServer ? this.acceptAsServer(v) : this.acceptAsClient(v), this.params;
    }
    /**
     * Releases all resources used by the extension.
     *
     * @public
     */
    cleanup() {
      if (this._inflate && (this._inflate.close(), this._inflate = null), this._deflate) {
        const v = this._deflate[c];
        this._deflate.close(), this._deflate = null, v && v(
          new Error(
            "The deflate stream was closed while data was being processed"
          )
        );
      }
    }
    /**
     *  Accept an extension negotiation offer.
     *
     * @param {Array} offers The extension negotiation offers
     * @return {Object} Accepted configuration
     * @private
     */
    acceptAsServer(v) {
      const w = this._options, k = v.find((A) => !(w.serverNoContextTakeover === !1 && A.server_no_context_takeover || A.server_max_window_bits && (w.serverMaxWindowBits === !1 || typeof w.serverMaxWindowBits == "number" && w.serverMaxWindowBits > A.server_max_window_bits) || typeof w.clientMaxWindowBits == "number" && !A.client_max_window_bits));
      if (!k)
        throw new Error("None of the extension offers can be accepted");
      return w.serverNoContextTakeover && (k.server_no_context_takeover = !0), w.clientNoContextTakeover && (k.client_no_context_takeover = !0), typeof w.serverMaxWindowBits == "number" && (k.server_max_window_bits = w.serverMaxWindowBits), typeof w.clientMaxWindowBits == "number" ? k.client_max_window_bits = w.clientMaxWindowBits : (k.client_max_window_bits === !0 || w.clientMaxWindowBits === !1) && delete k.client_max_window_bits, k;
    }
    /**
     * Accept the extension negotiation response.
     *
     * @param {Array} response The extension negotiation response
     * @return {Object} Accepted configuration
     * @private
     */
    acceptAsClient(v) {
      const w = v[0];
      if (this._options.clientNoContextTakeover === !1 && w.client_no_context_takeover)
        throw new Error('Unexpected parameter "client_no_context_takeover"');
      if (!w.client_max_window_bits)
        typeof this._options.clientMaxWindowBits == "number" && (w.client_max_window_bits = this._options.clientMaxWindowBits);
      else if (this._options.clientMaxWindowBits === !1 || typeof this._options.clientMaxWindowBits == "number" && w.client_max_window_bits > this._options.clientMaxWindowBits)
        throw new Error(
          'Unexpected or invalid parameter "client_max_window_bits"'
        );
      return w;
    }
    /**
     * Normalize parameters.
     *
     * @param {Array} configurations The extension negotiation offers/reponse
     * @return {Array} The offers/response with normalized parameters
     * @private
     */
    normalizeParams(v) {
      return v.forEach((w) => {
        Object.keys(w).forEach((k) => {
          let A = w[k];
          if (A.length > 1)
            throw new Error(`Parameter "${k}" must have only a single value`);
          if (A = A[0], k === "client_max_window_bits") {
            if (A !== !0) {
              const g = +A;
              if (!Number.isInteger(g) || g < 8 || g > 15)
                throw new TypeError(
                  `Invalid value for parameter "${k}": ${A}`
                );
              A = g;
            } else if (!this._isServer)
              throw new TypeError(
                `Invalid value for parameter "${k}": ${A}`
              );
          } else if (k === "server_max_window_bits") {
            const g = +A;
            if (!Number.isInteger(g) || g < 8 || g > 15)
              throw new TypeError(
                `Invalid value for parameter "${k}": ${A}`
              );
            A = g;
          } else if (k === "client_no_context_takeover" || k === "server_no_context_takeover") {
            if (A !== !0)
              throw new TypeError(
                `Invalid value for parameter "${k}": ${A}`
              );
          } else
            throw new Error(`Unknown parameter "${k}"`);
          w[k] = A;
        });
      }), v;
    }
    /**
     * Decompress data. Concurrency limited.
     *
     * @param {Buffer} data Compressed data
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @public
     */
    decompress(v, w, k) {
      d.add((A) => {
        this._decompress(v, w, (g, m) => {
          A(), k(g, m);
        });
      });
    }
    /**
     * Compress data. Concurrency limited.
     *
     * @param {(Buffer|String)} data Data to compress
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @public
     */
    compress(v, w, k) {
      d.add((A) => {
        this._compress(v, w, (g, m) => {
          A(), k(g, m);
        });
      });
    }
    /**
     * Decompress data.
     *
     * @param {Buffer} data Compressed data
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @private
     */
    _decompress(v, w, k) {
      const A = this._isServer ? "client" : "server";
      if (!this._inflate) {
        const g = `${A}_max_window_bits`, m = typeof this.params[g] != "number" ? t.Z_DEFAULT_WINDOWBITS : this.params[g];
        this._inflate = t.createInflateRaw({
          ...this._options.zlibInflateOptions,
          windowBits: m
        }), this._inflate[s] = this, this._inflate[r] = 0, this._inflate[u] = [], this._inflate.on("error", f), this._inflate.on("data", x);
      }
      this._inflate[c] = k, this._inflate.write(v), w && this._inflate.write(o), this._inflate.flush(() => {
        const g = this._inflate[p];
        if (g) {
          this._inflate.close(), this._inflate = null, k(g);
          return;
        }
        const m = e.concat(
          this._inflate[u],
          this._inflate[r]
        );
        this._inflate._readableState.endEmitted ? (this._inflate.close(), this._inflate = null) : (this._inflate[r] = 0, this._inflate[u] = [], w && this.params[`${A}_no_context_takeover`] && this._inflate.reset()), k(null, m);
      });
    }
    /**
     * Compress data.
     *
     * @param {(Buffer|String)} data Data to compress
     * @param {Boolean} fin Specifies whether or not this is the last fragment
     * @param {Function} callback Callback
     * @private
     */
    _compress(v, w, k) {
      const A = this._isServer ? "server" : "client";
      if (!this._deflate) {
        const g = `${A}_max_window_bits`, m = typeof this.params[g] != "number" ? t.Z_DEFAULT_WINDOWBITS : this.params[g];
        this._deflate = t.createDeflateRaw({
          ...this._options.zlibDeflateOptions,
          windowBits: m
        }), this._deflate[r] = 0, this._deflate[u] = [], this._deflate.on("data", E);
      }
      this._deflate[c] = k, this._deflate.write(v), this._deflate.flush(t.Z_SYNC_FLUSH, () => {
        if (!this._deflate)
          return;
        let g = e.concat(
          this._deflate[u],
          this._deflate[r]
        );
        w && (g = new i(g.buffer, g.byteOffset, g.length - 4)), this._deflate[c] = null, this._deflate[r] = 0, this._deflate[u] = [], w && this.params[`${A}_no_context_takeover`] && this._deflate.reset(), k(null, g);
      });
    }
  }
  aa = l;
  function E(h) {
    this[u].push(h), this[r] += h.length;
  }
  function x(h) {
    if (this[r] += h.length, this[s]._maxPayload < 1 || this[r] <= this[s]._maxPayload) {
      this[u].push(h);
      return;
    }
    this[p] = new RangeError("Max payload size exceeded"), this[p].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH", this[p][n] = 1009, this.removeListener("data", x), this.reset();
  }
  function f(h) {
    if (this[s]._inflate = null, this[p]) {
      this[c](this[p]);
      return;
    }
    h[n] = 1007, this[c](h);
  }
  return aa;
}
var at = { exports: {} }, _s;
function ht() {
  if (_s) return at.exports;
  _s = 1;
  const { isUtf8: t } = Mo, { hasBlob: e } = Le(), a = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 0 - 15
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 16 - 31
    0,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    1,
    0,
    // 32 - 47
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    // 48 - 63
    0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    // 64 - 79
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    1,
    1,
    // 80 - 95
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    // 96 - 111
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    0,
    1,
    0
    // 112 - 127
  ];
  function n(s) {
    return s >= 1e3 && s <= 1014 && s !== 1004 && s !== 1005 && s !== 1006 || s >= 3e3 && s <= 4999;
  }
  function i(s) {
    const r = s.length;
    let c = 0;
    for (; c < r; )
      if ((s[c] & 128) === 0)
        c++;
      else if ((s[c] & 224) === 192) {
        if (c + 1 === r || (s[c + 1] & 192) !== 128 || (s[c] & 254) === 192)
          return !1;
        c += 2;
      } else if ((s[c] & 240) === 224) {
        if (c + 2 >= r || (s[c + 1] & 192) !== 128 || (s[c + 2] & 192) !== 128 || s[c] === 224 && (s[c + 1] & 224) === 128 || // Overlong
        s[c] === 237 && (s[c + 1] & 224) === 160)
          return !1;
        c += 3;
      } else if ((s[c] & 248) === 240) {
        if (c + 3 >= r || (s[c + 1] & 192) !== 128 || (s[c + 2] & 192) !== 128 || (s[c + 3] & 192) !== 128 || s[c] === 240 && (s[c + 1] & 240) === 128 || // Overlong
        s[c] === 244 && s[c + 1] > 143 || s[c] > 244)
          return !1;
        c += 4;
      } else
        return !1;
    return !0;
  }
  function o(s) {
    return e && typeof s == "object" && typeof s.arrayBuffer == "function" && typeof s.type == "string" && typeof s.stream == "function" && (s[Symbol.toStringTag] === "Blob" || s[Symbol.toStringTag] === "File");
  }
  if (at.exports = {
    isBlob: o,
    isValidStatusCode: n,
    isValidUTF8: i,
    tokenChars: a
  }, t)
    at.exports.isValidUTF8 = function(s) {
      return s.length < 24 ? i(s) : t(s);
    };
  else if (!process.env.WS_NO_UTF_8_VALIDATE)
    try {
      const s = require("utf-8-validate");
      at.exports.isValidUTF8 = function(r) {
        return r.length < 32 ? i(r) : s(r);
      };
    } catch {
    }
  return at.exports;
}
var ia, ws;
function Ro() {
  if (ws) return ia;
  ws = 1;
  const { Writable: t } = oe, e = Dt(), {
    BINARY_TYPES: a,
    EMPTY_BUFFER: n,
    kStatusCode: i,
    kWebSocket: o
  } = Le(), { concat: s, toArrayBuffer: r, unmask: c } = qt(), { isValidStatusCode: u, isValidUTF8: p } = ht(), d = Buffer[Symbol.species], l = 0, E = 1, x = 2, f = 3, h = 4, v = 5, w = 6;
  class k extends t {
    /**
     * Creates a Receiver instance.
     *
     * @param {Object} [options] Options object
     * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {String} [options.binaryType=nodebuffer] The type for binary data
     * @param {Object} [options.extensions] An object containing the negotiated
     *     extensions
     * @param {Boolean} [options.isServer=false] Specifies whether to operate in
     *     client or server mode
     * @param {Number} [options.maxPayload=0] The maximum allowed message length
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     */
    constructor(g = {}) {
      super(), this._allowSynchronousEvents = g.allowSynchronousEvents !== void 0 ? g.allowSynchronousEvents : !0, this._binaryType = g.binaryType || a[0], this._extensions = g.extensions || {}, this._isServer = !!g.isServer, this._maxPayload = g.maxPayload | 0, this._skipUTF8Validation = !!g.skipUTF8Validation, this[o] = void 0, this._bufferedBytes = 0, this._buffers = [], this._compressed = !1, this._payloadLength = 0, this._mask = void 0, this._fragmented = 0, this._masked = !1, this._fin = !1, this._opcode = 0, this._totalPayloadLength = 0, this._messageLength = 0, this._fragments = [], this._errored = !1, this._loop = !1, this._state = l;
    }
    /**
     * Implements `Writable.prototype._write()`.
     *
     * @param {Buffer} chunk The chunk of data to write
     * @param {String} encoding The character encoding of `chunk`
     * @param {Function} cb Callback
     * @private
     */
    _write(g, m, y) {
      if (this._opcode === 8 && this._state == l) return y();
      this._bufferedBytes += g.length, this._buffers.push(g), this.startLoop(y);
    }
    /**
     * Consumes `n` bytes from the buffered data.
     *
     * @param {Number} n The number of bytes to consume
     * @return {Buffer} The consumed bytes
     * @private
     */
    consume(g) {
      if (this._bufferedBytes -= g, g === this._buffers[0].length) return this._buffers.shift();
      if (g < this._buffers[0].length) {
        const y = this._buffers[0];
        return this._buffers[0] = new d(
          y.buffer,
          y.byteOffset + g,
          y.length - g
        ), new d(y.buffer, y.byteOffset, g);
      }
      const m = Buffer.allocUnsafe(g);
      do {
        const y = this._buffers[0], S = m.length - g;
        g >= y.length ? m.set(this._buffers.shift(), S) : (m.set(new Uint8Array(y.buffer, y.byteOffset, g), S), this._buffers[0] = new d(
          y.buffer,
          y.byteOffset + g,
          y.length - g
        )), g -= y.length;
      } while (g > 0);
      return m;
    }
    /**
     * Starts the parsing loop.
     *
     * @param {Function} cb Callback
     * @private
     */
    startLoop(g) {
      this._loop = !0;
      do
        switch (this._state) {
          case l:
            this.getInfo(g);
            break;
          case E:
            this.getPayloadLength16(g);
            break;
          case x:
            this.getPayloadLength64(g);
            break;
          case f:
            this.getMask();
            break;
          case h:
            this.getData(g);
            break;
          case v:
          case w:
            this._loop = !1;
            return;
        }
      while (this._loop);
      this._errored || g();
    }
    /**
     * Reads the first two bytes of a frame.
     *
     * @param {Function} cb Callback
     * @private
     */
    getInfo(g) {
      if (this._bufferedBytes < 2) {
        this._loop = !1;
        return;
      }
      const m = this.consume(2);
      if ((m[0] & 48) !== 0) {
        const S = this.createError(
          RangeError,
          "RSV2 and RSV3 must be clear",
          !0,
          1002,
          "WS_ERR_UNEXPECTED_RSV_2_3"
        );
        g(S);
        return;
      }
      const y = (m[0] & 64) === 64;
      if (y && !this._extensions[e.extensionName]) {
        const S = this.createError(
          RangeError,
          "RSV1 must be clear",
          !0,
          1002,
          "WS_ERR_UNEXPECTED_RSV_1"
        );
        g(S);
        return;
      }
      if (this._fin = (m[0] & 128) === 128, this._opcode = m[0] & 15, this._payloadLength = m[1] & 127, this._opcode === 0) {
        if (y) {
          const S = this.createError(
            RangeError,
            "RSV1 must be clear",
            !0,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          g(S);
          return;
        }
        if (!this._fragmented) {
          const S = this.createError(
            RangeError,
            "invalid opcode 0",
            !0,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          g(S);
          return;
        }
        this._opcode = this._fragmented;
      } else if (this._opcode === 1 || this._opcode === 2) {
        if (this._fragmented) {
          const S = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            !0,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          g(S);
          return;
        }
        this._compressed = y;
      } else if (this._opcode > 7 && this._opcode < 11) {
        if (!this._fin) {
          const S = this.createError(
            RangeError,
            "FIN must be set",
            !0,
            1002,
            "WS_ERR_EXPECTED_FIN"
          );
          g(S);
          return;
        }
        if (y) {
          const S = this.createError(
            RangeError,
            "RSV1 must be clear",
            !0,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          g(S);
          return;
        }
        if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
          const S = this.createError(
            RangeError,
            `invalid payload length ${this._payloadLength}`,
            !0,
            1002,
            "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
          );
          g(S);
          return;
        }
      } else {
        const S = this.createError(
          RangeError,
          `invalid opcode ${this._opcode}`,
          !0,
          1002,
          "WS_ERR_INVALID_OPCODE"
        );
        g(S);
        return;
      }
      if (!this._fin && !this._fragmented && (this._fragmented = this._opcode), this._masked = (m[1] & 128) === 128, this._isServer) {
        if (!this._masked) {
          const S = this.createError(
            RangeError,
            "MASK must be set",
            !0,
            1002,
            "WS_ERR_EXPECTED_MASK"
          );
          g(S);
          return;
        }
      } else if (this._masked) {
        const S = this.createError(
          RangeError,
          "MASK must be clear",
          !0,
          1002,
          "WS_ERR_UNEXPECTED_MASK"
        );
        g(S);
        return;
      }
      this._payloadLength === 126 ? this._state = E : this._payloadLength === 127 ? this._state = x : this.haveLength(g);
    }
    /**
     * Gets extended payload length (7+16).
     *
     * @param {Function} cb Callback
     * @private
     */
    getPayloadLength16(g) {
      if (this._bufferedBytes < 2) {
        this._loop = !1;
        return;
      }
      this._payloadLength = this.consume(2).readUInt16BE(0), this.haveLength(g);
    }
    /**
     * Gets extended payload length (7+64).
     *
     * @param {Function} cb Callback
     * @private
     */
    getPayloadLength64(g) {
      if (this._bufferedBytes < 8) {
        this._loop = !1;
        return;
      }
      const m = this.consume(8), y = m.readUInt32BE(0);
      if (y > Math.pow(2, 21) - 1) {
        const S = this.createError(
          RangeError,
          "Unsupported WebSocket frame: payload length > 2^53 - 1",
          !1,
          1009,
          "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
        );
        g(S);
        return;
      }
      this._payloadLength = y * Math.pow(2, 32) + m.readUInt32BE(4), this.haveLength(g);
    }
    /**
     * Payload length has been read.
     *
     * @param {Function} cb Callback
     * @private
     */
    haveLength(g) {
      if (this._payloadLength && this._opcode < 8 && (this._totalPayloadLength += this._payloadLength, this._totalPayloadLength > this._maxPayload && this._maxPayload > 0)) {
        const m = this.createError(
          RangeError,
          "Max payload size exceeded",
          !1,
          1009,
          "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
        );
        g(m);
        return;
      }
      this._masked ? this._state = f : this._state = h;
    }
    /**
     * Reads mask bytes.
     *
     * @private
     */
    getMask() {
      if (this._bufferedBytes < 4) {
        this._loop = !1;
        return;
      }
      this._mask = this.consume(4), this._state = h;
    }
    /**
     * Reads data bytes.
     *
     * @param {Function} cb Callback
     * @private
     */
    getData(g) {
      let m = n;
      if (this._payloadLength) {
        if (this._bufferedBytes < this._payloadLength) {
          this._loop = !1;
          return;
        }
        m = this.consume(this._payloadLength), this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0 && c(m, this._mask);
      }
      if (this._opcode > 7) {
        this.controlMessage(m, g);
        return;
      }
      if (this._compressed) {
        this._state = v, this.decompress(m, g);
        return;
      }
      m.length && (this._messageLength = this._totalPayloadLength, this._fragments.push(m)), this.dataMessage(g);
    }
    /**
     * Decompresses data.
     *
     * @param {Buffer} data Compressed data
     * @param {Function} cb Callback
     * @private
     */
    decompress(g, m) {
      this._extensions[e.extensionName].decompress(g, this._fin, (S, j) => {
        if (S) return m(S);
        if (j.length) {
          if (this._messageLength += j.length, this._messageLength > this._maxPayload && this._maxPayload > 0) {
            const L = this.createError(
              RangeError,
              "Max payload size exceeded",
              !1,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            m(L);
            return;
          }
          this._fragments.push(j);
        }
        this.dataMessage(m), this._state === l && this.startLoop(m);
      });
    }
    /**
     * Handles a data message.
     *
     * @param {Function} cb Callback
     * @private
     */
    dataMessage(g) {
      if (!this._fin) {
        this._state = l;
        return;
      }
      const m = this._messageLength, y = this._fragments;
      if (this._totalPayloadLength = 0, this._messageLength = 0, this._fragmented = 0, this._fragments = [], this._opcode === 2) {
        let S;
        this._binaryType === "nodebuffer" ? S = s(y, m) : this._binaryType === "arraybuffer" ? S = r(s(y, m)) : this._binaryType === "blob" ? S = new Blob(y) : S = y, this._allowSynchronousEvents ? (this.emit("message", S, !0), this._state = l) : (this._state = w, setImmediate(() => {
          this.emit("message", S, !0), this._state = l, this.startLoop(g);
        }));
      } else {
        const S = s(y, m);
        if (!this._skipUTF8Validation && !p(S)) {
          const j = this.createError(
            Error,
            "invalid UTF-8 sequence",
            !0,
            1007,
            "WS_ERR_INVALID_UTF8"
          );
          g(j);
          return;
        }
        this._state === v || this._allowSynchronousEvents ? (this.emit("message", S, !1), this._state = l) : (this._state = w, setImmediate(() => {
          this.emit("message", S, !1), this._state = l, this.startLoop(g);
        }));
      }
    }
    /**
     * Handles a control message.
     *
     * @param {Buffer} data Data to handle
     * @return {(Error|RangeError|undefined)} A possible error
     * @private
     */
    controlMessage(g, m) {
      if (this._opcode === 8) {
        if (g.length === 0)
          this._loop = !1, this.emit("conclude", 1005, n), this.end();
        else {
          const y = g.readUInt16BE(0);
          if (!u(y)) {
            const j = this.createError(
              RangeError,
              `invalid status code ${y}`,
              !0,
              1002,
              "WS_ERR_INVALID_CLOSE_CODE"
            );
            m(j);
            return;
          }
          const S = new d(
            g.buffer,
            g.byteOffset + 2,
            g.length - 2
          );
          if (!this._skipUTF8Validation && !p(S)) {
            const j = this.createError(
              Error,
              "invalid UTF-8 sequence",
              !0,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            m(j);
            return;
          }
          this._loop = !1, this.emit("conclude", y, S), this.end();
        }
        this._state = l;
        return;
      }
      this._allowSynchronousEvents ? (this.emit(this._opcode === 9 ? "ping" : "pong", g), this._state = l) : (this._state = w, setImmediate(() => {
        this.emit(this._opcode === 9 ? "ping" : "pong", g), this._state = l, this.startLoop(m);
      }));
    }
    /**
     * Builds an error object.
     *
     * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
     * @param {String} message The error message
     * @param {Boolean} prefix Specifies whether or not to add a default prefix to
     *     `message`
     * @param {Number} statusCode The status code
     * @param {String} errorCode The exposed error code
     * @return {(Error|RangeError)} The error
     * @private
     */
    createError(g, m, y, S, j) {
      this._loop = !1, this._errored = !0;
      const L = new g(
        y ? `Invalid WebSocket frame: ${m}` : m
      );
      return Error.captureStackTrace(L, this.createError), L.code = j, L[i] = S, L;
    }
  }
  return ia = k, ia;
}
var sa, Es;
function ko() {
  if (Es) return sa;
  Es = 1;
  const { Duplex: t } = oe, { randomFillSync: e } = pt, a = Dt(), { EMPTY_BUFFER: n, kWebSocket: i, NOOP: o } = Le(), { isBlob: s, isValidStatusCode: r } = ht(), { mask: c, toBuffer: u } = qt(), p = Symbol("kByteLength"), d = Buffer.alloc(4), l = 8 * 1024;
  let E, x = l;
  const f = 0, h = 1, v = 2;
  class w {
    /**
     * Creates a Sender instance.
     *
     * @param {Duplex} socket The connection socket
     * @param {Object} [extensions] An object containing the negotiated extensions
     * @param {Function} [generateMask] The function used to generate the masking
     *     key
     */
    constructor(m, y, S) {
      this._extensions = y || {}, S && (this._generateMask = S, this._maskBuffer = Buffer.alloc(4)), this._socket = m, this._firstFragment = !0, this._compress = !1, this._bufferedBytes = 0, this._queue = [], this._state = f, this.onerror = o, this[i] = void 0;
    }
    /**
     * Frames a piece of data according to the HyBi WebSocket protocol.
     *
     * @param {(Buffer|String)} data The data to frame
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @return {(Buffer|String)[]} The framed data
     * @public
     */
    static frame(m, y) {
      let S, j = !1, L = 2, I = !1;
      y.mask && (S = y.maskBuffer || d, y.generateMask ? y.generateMask(S) : (x === l && (E === void 0 && (E = Buffer.alloc(l)), e(E, 0, l), x = 0), S[0] = E[x++], S[1] = E[x++], S[2] = E[x++], S[3] = E[x++]), I = (S[0] | S[1] | S[2] | S[3]) === 0, L = 6);
      let D;
      typeof m == "string" ? (!y.mask || I) && y[p] !== void 0 ? D = y[p] : (m = Buffer.from(m), D = m.length) : (D = m.length, j = y.mask && y.readOnly && !I);
      let W = D;
      D >= 65536 ? (L += 8, W = 127) : D > 125 && (L += 2, W = 126);
      const q = Buffer.allocUnsafe(j ? D + L : L);
      return q[0] = y.fin ? y.opcode | 128 : y.opcode, y.rsv1 && (q[0] |= 64), q[1] = W, W === 126 ? q.writeUInt16BE(D, 2) : W === 127 && (q[2] = q[3] = 0, q.writeUIntBE(D, 4, 6)), y.mask ? (q[1] |= 128, q[L - 4] = S[0], q[L - 3] = S[1], q[L - 2] = S[2], q[L - 1] = S[3], I ? [q, m] : j ? (c(m, S, q, L, D), [q]) : (c(m, S, m, 0, D), [q, m])) : [q, m];
    }
    /**
     * Sends a close message to the other peer.
     *
     * @param {Number} [code] The status code component of the body
     * @param {(String|Buffer)} [data] The message component of the body
     * @param {Boolean} [mask=false] Specifies whether or not to mask the message
     * @param {Function} [cb] Callback
     * @public
     */
    close(m, y, S, j) {
      let L;
      if (m === void 0)
        L = n;
      else {
        if (typeof m != "number" || !r(m))
          throw new TypeError("First argument must be a valid error code number");
        if (y === void 0 || !y.length)
          L = Buffer.allocUnsafe(2), L.writeUInt16BE(m, 0);
        else {
          const D = Buffer.byteLength(y);
          if (D > 123)
            throw new RangeError("The message must not be greater than 123 bytes");
          L = Buffer.allocUnsafe(2 + D), L.writeUInt16BE(m, 0), typeof y == "string" ? L.write(y, 2) : L.set(y, 2);
        }
      }
      const I = {
        [p]: L.length,
        fin: !0,
        generateMask: this._generateMask,
        mask: S,
        maskBuffer: this._maskBuffer,
        opcode: 8,
        readOnly: !1,
        rsv1: !1
      };
      this._state !== f ? this.enqueue([this.dispatch, L, !1, I, j]) : this.sendFrame(w.frame(L, I), j);
    }
    /**
     * Sends a ping message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback
     * @public
     */
    ping(m, y, S) {
      let j, L;
      if (typeof m == "string" ? (j = Buffer.byteLength(m), L = !1) : s(m) ? (j = m.size, L = !1) : (m = u(m), j = m.length, L = u.readOnly), j > 125)
        throw new RangeError("The data size must not be greater than 125 bytes");
      const I = {
        [p]: j,
        fin: !0,
        generateMask: this._generateMask,
        mask: y,
        maskBuffer: this._maskBuffer,
        opcode: 9,
        readOnly: L,
        rsv1: !1
      };
      s(m) ? this._state !== f ? this.enqueue([this.getBlobData, m, !1, I, S]) : this.getBlobData(m, !1, I, S) : this._state !== f ? this.enqueue([this.dispatch, m, !1, I, S]) : this.sendFrame(w.frame(m, I), S);
    }
    /**
     * Sends a pong message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback
     * @public
     */
    pong(m, y, S) {
      let j, L;
      if (typeof m == "string" ? (j = Buffer.byteLength(m), L = !1) : s(m) ? (j = m.size, L = !1) : (m = u(m), j = m.length, L = u.readOnly), j > 125)
        throw new RangeError("The data size must not be greater than 125 bytes");
      const I = {
        [p]: j,
        fin: !0,
        generateMask: this._generateMask,
        mask: y,
        maskBuffer: this._maskBuffer,
        opcode: 10,
        readOnly: L,
        rsv1: !1
      };
      s(m) ? this._state !== f ? this.enqueue([this.getBlobData, m, !1, I, S]) : this.getBlobData(m, !1, I, S) : this._state !== f ? this.enqueue([this.dispatch, m, !1, I, S]) : this.sendFrame(w.frame(m, I), S);
    }
    /**
     * Sends a data message to the other peer.
     *
     * @param {*} data The message to send
     * @param {Object} options Options object
     * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
     *     or text
     * @param {Boolean} [options.compress=false] Specifies whether or not to
     *     compress `data`
     * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
     *     last one
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Function} [cb] Callback
     * @public
     */
    send(m, y, S) {
      const j = this._extensions[a.extensionName];
      let L = y.binary ? 2 : 1, I = y.compress, D, W;
      typeof m == "string" ? (D = Buffer.byteLength(m), W = !1) : s(m) ? (D = m.size, W = !1) : (m = u(m), D = m.length, W = u.readOnly), this._firstFragment ? (this._firstFragment = !1, I && j && j.params[j._isServer ? "server_no_context_takeover" : "client_no_context_takeover"] && (I = D >= j._threshold), this._compress = I) : (I = !1, L = 0), y.fin && (this._firstFragment = !0);
      const q = {
        [p]: D,
        fin: y.fin,
        generateMask: this._generateMask,
        mask: y.mask,
        maskBuffer: this._maskBuffer,
        opcode: L,
        readOnly: W,
        rsv1: I
      };
      s(m) ? this._state !== f ? this.enqueue([this.getBlobData, m, this._compress, q, S]) : this.getBlobData(m, this._compress, q, S) : this._state !== f ? this.enqueue([this.dispatch, m, this._compress, q, S]) : this.dispatch(m, this._compress, q, S);
    }
    /**
     * Gets the contents of a blob as binary data.
     *
     * @param {Blob} blob The blob
     * @param {Boolean} [compress=false] Specifies whether or not to compress
     *     the data
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @param {Function} [cb] Callback
     * @private
     */
    getBlobData(m, y, S, j) {
      this._bufferedBytes += S[p], this._state = v, m.arrayBuffer().then((L) => {
        if (this._socket.destroyed) {
          const D = new Error(
            "The socket was closed while the blob was being read"
          );
          process.nextTick(k, this, D, j);
          return;
        }
        this._bufferedBytes -= S[p];
        const I = u(L);
        y ? this.dispatch(I, y, S, j) : (this._state = f, this.sendFrame(w.frame(I, S), j), this.dequeue());
      }).catch((L) => {
        process.nextTick(A, this, L, j);
      });
    }
    /**
     * Dispatches a message.
     *
     * @param {(Buffer|String)} data The message to send
     * @param {Boolean} [compress=false] Specifies whether or not to compress
     *     `data`
     * @param {Object} options Options object
     * @param {Boolean} [options.fin=false] Specifies whether or not to set the
     *     FIN bit
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Boolean} [options.mask=false] Specifies whether or not to mask
     *     `data`
     * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
     *     key
     * @param {Number} options.opcode The opcode
     * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
     *     modified
     * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
     *     RSV1 bit
     * @param {Function} [cb] Callback
     * @private
     */
    dispatch(m, y, S, j) {
      if (!y) {
        this.sendFrame(w.frame(m, S), j);
        return;
      }
      const L = this._extensions[a.extensionName];
      this._bufferedBytes += S[p], this._state = h, L.compress(m, S.fin, (I, D) => {
        if (this._socket.destroyed) {
          const W = new Error(
            "The socket was closed while data was being compressed"
          );
          k(this, W, j);
          return;
        }
        this._bufferedBytes -= S[p], this._state = f, S.readOnly = !1, this.sendFrame(w.frame(D, S), j), this.dequeue();
      });
    }
    /**
     * Executes queued send operations.
     *
     * @private
     */
    dequeue() {
      for (; this._state === f && this._queue.length; ) {
        const m = this._queue.shift();
        this._bufferedBytes -= m[3][p], Reflect.apply(m[0], this, m.slice(1));
      }
    }
    /**
     * Enqueues a send operation.
     *
     * @param {Array} params Send operation parameters.
     * @private
     */
    enqueue(m) {
      this._bufferedBytes += m[3][p], this._queue.push(m);
    }
    /**
     * Sends a frame.
     *
     * @param {(Buffer | String)[]} list The frame to send
     * @param {Function} [cb] Callback
     * @private
     */
    sendFrame(m, y) {
      m.length === 2 ? (this._socket.cork(), this._socket.write(m[0]), this._socket.write(m[1], y), this._socket.uncork()) : this._socket.write(m[0], y);
    }
  }
  sa = w;
  function k(g, m, y) {
    typeof y == "function" && y(m);
    for (let S = 0; S < g._queue.length; S++) {
      const j = g._queue[S], L = j[j.length - 1];
      typeof L == "function" && L(m);
    }
  }
  function A(g, m, y) {
    k(g, m, y), g.onerror(m);
  }
  return sa;
}
var oa, Ss;
function Xp() {
  if (Ss) return oa;
  Ss = 1;
  const { kForOnEventAttribute: t, kListener: e } = Le(), a = Symbol("kCode"), n = Symbol("kData"), i = Symbol("kError"), o = Symbol("kMessage"), s = Symbol("kReason"), r = Symbol("kTarget"), c = Symbol("kType"), u = Symbol("kWasClean");
  class p {
    /**
     * Create a new `Event`.
     *
     * @param {String} type The name of the event
     * @throws {TypeError} If the `type` argument is not specified
     */
    constructor(v) {
      this[r] = null, this[c] = v;
    }
    /**
     * @type {*}
     */
    get target() {
      return this[r];
    }
    /**
     * @type {String}
     */
    get type() {
      return this[c];
    }
  }
  Object.defineProperty(p.prototype, "target", { enumerable: !0 }), Object.defineProperty(p.prototype, "type", { enumerable: !0 });
  class d extends p {
    /**
     * Create a new `CloseEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {Number} [options.code=0] The status code explaining why the
     *     connection was closed
     * @param {String} [options.reason=''] A human-readable string explaining why
     *     the connection was closed
     * @param {Boolean} [options.wasClean=false] Indicates whether or not the
     *     connection was cleanly closed
     */
    constructor(v, w = {}) {
      super(v), this[a] = w.code === void 0 ? 0 : w.code, this[s] = w.reason === void 0 ? "" : w.reason, this[u] = w.wasClean === void 0 ? !1 : w.wasClean;
    }
    /**
     * @type {Number}
     */
    get code() {
      return this[a];
    }
    /**
     * @type {String}
     */
    get reason() {
      return this[s];
    }
    /**
     * @type {Boolean}
     */
    get wasClean() {
      return this[u];
    }
  }
  Object.defineProperty(d.prototype, "code", { enumerable: !0 }), Object.defineProperty(d.prototype, "reason", { enumerable: !0 }), Object.defineProperty(d.prototype, "wasClean", { enumerable: !0 });
  class l extends p {
    /**
     * Create a new `ErrorEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {*} [options.error=null] The error that generated this event
     * @param {String} [options.message=''] The error message
     */
    constructor(v, w = {}) {
      super(v), this[i] = w.error === void 0 ? null : w.error, this[o] = w.message === void 0 ? "" : w.message;
    }
    /**
     * @type {*}
     */
    get error() {
      return this[i];
    }
    /**
     * @type {String}
     */
    get message() {
      return this[o];
    }
  }
  Object.defineProperty(l.prototype, "error", { enumerable: !0 }), Object.defineProperty(l.prototype, "message", { enumerable: !0 });
  class E extends p {
    /**
     * Create a new `MessageEvent`.
     *
     * @param {String} type The name of the event
     * @param {Object} [options] A dictionary object that allows for setting
     *     attributes via object members of the same name
     * @param {*} [options.data=null] The message content
     */
    constructor(v, w = {}) {
      super(v), this[n] = w.data === void 0 ? null : w.data;
    }
    /**
     * @type {*}
     */
    get data() {
      return this[n];
    }
  }
  Object.defineProperty(E.prototype, "data", { enumerable: !0 }), oa = {
    CloseEvent: d,
    ErrorEvent: l,
    Event: p,
    EventTarget: {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(h, v, w = {}) {
        for (const A of this.listeners(h))
          if (!w[t] && A[e] === v && !A[t])
            return;
        let k;
        if (h === "message")
          k = function(g, m) {
            const y = new E("message", {
              data: m ? g : g.toString()
            });
            y[r] = this, f(v, this, y);
          };
        else if (h === "close")
          k = function(g, m) {
            const y = new d("close", {
              code: g,
              reason: m.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            y[r] = this, f(v, this, y);
          };
        else if (h === "error")
          k = function(g) {
            const m = new l("error", {
              error: g,
              message: g.message
            });
            m[r] = this, f(v, this, m);
          };
        else if (h === "open")
          k = function() {
            const g = new p("open");
            g[r] = this, f(v, this, g);
          };
        else
          return;
        k[t] = !!w[t], k[e] = v, w.once ? this.once(h, k) : this.on(h, k);
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(h, v) {
        for (const w of this.listeners(h))
          if (w[e] === v && !w[t]) {
            this.removeListener(h, w);
            break;
          }
      }
    },
    MessageEvent: E
  };
  function f(h, v, w) {
    typeof h == "object" && h.handleEvent ? h.handleEvent.call(h, w) : h.call(v, w);
  }
  return oa;
}
var ra, Rs;
function Oo() {
  if (Rs) return ra;
  Rs = 1;
  const { tokenChars: t } = ht();
  function e(i, o, s) {
    i[o] === void 0 ? i[o] = [s] : i[o].push(s);
  }
  function a(i) {
    const o = /* @__PURE__ */ Object.create(null);
    let s = /* @__PURE__ */ Object.create(null), r = !1, c = !1, u = !1, p, d, l = -1, E = -1, x = -1, f = 0;
    for (; f < i.length; f++)
      if (E = i.charCodeAt(f), p === void 0)
        if (x === -1 && t[E] === 1)
          l === -1 && (l = f);
        else if (f !== 0 && (E === 32 || E === 9))
          x === -1 && l !== -1 && (x = f);
        else if (E === 59 || E === 44) {
          if (l === -1)
            throw new SyntaxError(`Unexpected character at index ${f}`);
          x === -1 && (x = f);
          const v = i.slice(l, x);
          E === 44 ? (e(o, v, s), s = /* @__PURE__ */ Object.create(null)) : p = v, l = x = -1;
        } else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (d === void 0)
        if (x === -1 && t[E] === 1)
          l === -1 && (l = f);
        else if (E === 32 || E === 9)
          x === -1 && l !== -1 && (x = f);
        else if (E === 59 || E === 44) {
          if (l === -1)
            throw new SyntaxError(`Unexpected character at index ${f}`);
          x === -1 && (x = f), e(s, i.slice(l, x), !0), E === 44 && (e(o, p, s), s = /* @__PURE__ */ Object.create(null), p = void 0), l = x = -1;
        } else if (E === 61 && l !== -1 && x === -1)
          d = i.slice(l, f), l = x = -1;
        else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (c) {
        if (t[E] !== 1)
          throw new SyntaxError(`Unexpected character at index ${f}`);
        l === -1 ? l = f : r || (r = !0), c = !1;
      } else if (u)
        if (t[E] === 1)
          l === -1 && (l = f);
        else if (E === 34 && l !== -1)
          u = !1, x = f;
        else if (E === 92)
          c = !0;
        else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (E === 34 && i.charCodeAt(f - 1) === 61)
        u = !0;
      else if (x === -1 && t[E] === 1)
        l === -1 && (l = f);
      else if (l !== -1 && (E === 32 || E === 9))
        x === -1 && (x = f);
      else if (E === 59 || E === 44) {
        if (l === -1)
          throw new SyntaxError(`Unexpected character at index ${f}`);
        x === -1 && (x = f);
        let v = i.slice(l, x);
        r && (v = v.replace(/\\/g, ""), r = !1), e(s, d, v), E === 44 && (e(o, p, s), s = /* @__PURE__ */ Object.create(null), p = void 0), d = void 0, l = x = -1;
      } else
        throw new SyntaxError(`Unexpected character at index ${f}`);
    if (l === -1 || u || E === 32 || E === 9)
      throw new SyntaxError("Unexpected end of input");
    x === -1 && (x = f);
    const h = i.slice(l, x);
    return p === void 0 ? e(o, h, s) : (d === void 0 ? e(s, h, !0) : r ? e(s, d, h.replace(/\\/g, "")) : e(s, d, h), e(o, p, s)), o;
  }
  function n(i) {
    return Object.keys(i).map((o) => {
      let s = i[o];
      return Array.isArray(s) || (s = [s]), s.map((r) => [o].concat(
        Object.keys(r).map((c) => {
          let u = r[c];
          return Array.isArray(u) || (u = [u]), u.map((p) => p === !0 ? c : `${c}=${p}`).join("; ");
        })
      ).join("; ")).join(", ");
    }).join(", ");
  }
  return ra = { format: n, parse: a }, ra;
}
var ca, ks;
function Aa() {
  if (ks) return ca;
  ks = 1;
  const t = Ns, e = At, a = lt, n = Io, i = zo, { randomBytes: o, createHash: s } = pt, { Duplex: r, Readable: c } = oe, { URL: u } = ct, p = Dt(), d = Ro(), l = ko(), { isBlob: E } = ht(), {
    BINARY_TYPES: x,
    CLOSE_TIMEOUT: f,
    EMPTY_BUFFER: h,
    GUID: v,
    kForOnEventAttribute: w,
    kListener: k,
    kStatusCode: A,
    kWebSocket: g,
    NOOP: m
  } = Le(), {
    EventTarget: { addEventListener: y, removeEventListener: S }
  } = Xp(), { format: j, parse: L } = Oo(), { toBuffer: I } = qt(), D = Symbol("kAborted"), W = [8, 13], q = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"], ne = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
  class b extends t {
    /**
     * Create a new `WebSocket`.
     *
     * @param {(String|URL)} address The URL to which to connect
     * @param {(String|String[])} [protocols] The subprotocols
     * @param {Object} [options] Connection options
     */
    constructor(T, U, $) {
      super(), this._binaryType = x[0], this._closeCode = 1006, this._closeFrameReceived = !1, this._closeFrameSent = !1, this._closeMessage = h, this._closeTimer = null, this._errorEmitted = !1, this._extensions = {}, this._paused = !1, this._protocol = "", this._readyState = b.CONNECTING, this._receiver = null, this._sender = null, this._socket = null, T !== null ? (this._bufferedAmount = 0, this._isServer = !1, this._redirects = 0, U === void 0 ? U = [] : Array.isArray(U) || (typeof U == "object" && U !== null ? ($ = U, U = []) : U = [U]), O(this, T, U, $)) : (this._autoPong = $.autoPong, this._closeTimeout = $.closeTimeout, this._isServer = !0);
    }
    /**
     * For historical reasons, the custom "nodebuffer" type is used by the default
     * instead of "blob".
     *
     * @type {String}
     */
    get binaryType() {
      return this._binaryType;
    }
    set binaryType(T) {
      x.includes(T) && (this._binaryType = T, this._receiver && (this._receiver._binaryType = T));
    }
    /**
     * @type {Number}
     */
    get bufferedAmount() {
      return this._socket ? this._socket._writableState.length + this._sender._bufferedBytes : this._bufferedAmount;
    }
    /**
     * @type {String}
     */
    get extensions() {
      return Object.keys(this._extensions).join();
    }
    /**
     * @type {Boolean}
     */
    get isPaused() {
      return this._paused;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onclose() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onerror() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onopen() {
      return null;
    }
    /**
     * @type {Function}
     */
    /* istanbul ignore next */
    get onmessage() {
      return null;
    }
    /**
     * @type {String}
     */
    get protocol() {
      return this._protocol;
    }
    /**
     * @type {Number}
     */
    get readyState() {
      return this._readyState;
    }
    /**
     * @type {String}
     */
    get url() {
      return this._url;
    }
    /**
     * Set up the socket and the internal resources.
     *
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Object} options Options object
     * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {Function} [options.generateMask] The function used to generate the
     *     masking key
     * @param {Number} [options.maxPayload=0] The maximum allowed message size
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     * @private
     */
    setSocket(T, U, $) {
      const B = new d({
        allowSynchronousEvents: $.allowSynchronousEvents,
        binaryType: this.binaryType,
        extensions: this._extensions,
        isServer: this._isServer,
        maxPayload: $.maxPayload,
        skipUTF8Validation: $.skipUTF8Validation
      }), J = new l(T, this._extensions, $.generateMask);
      this._receiver = B, this._sender = J, this._socket = T, B[g] = this, J[g] = this, T[g] = this, B.on("conclude", Q), B.on("drain", K), B.on("error", Y), B.on("message", te), B.on("ping", ye), B.on("pong", fe), J.onerror = ce, T.setTimeout && T.setTimeout(0), T.setNoDelay && T.setNoDelay(), U.length > 0 && T.unshift(U), T.on("close", pe), T.on("data", he), T.on("end", Pe), T.on("error", ue), this._readyState = b.OPEN, this.emit("open");
    }
    /**
     * Emit the `'close'` event.
     *
     * @private
     */
    emitClose() {
      if (!this._socket) {
        this._readyState = b.CLOSED, this.emit("close", this._closeCode, this._closeMessage);
        return;
      }
      this._extensions[p.extensionName] && this._extensions[p.extensionName].cleanup(), this._receiver.removeAllListeners(), this._readyState = b.CLOSED, this.emit("close", this._closeCode, this._closeMessage);
    }
    /**
     * Start a closing handshake.
     *
     *          +----------+   +-----------+   +----------+
     *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
     *    |     +----------+   +-----------+   +----------+     |
     *          +----------+   +-----------+         |
     * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
     *          +----------+   +-----------+   |
     *    |           |                        |   +---+        |
     *                +------------------------+-->|fin| - - - -
     *    |         +---+                      |   +---+
     *     - - - - -|fin|<---------------------+
     *              +---+
     *
     * @param {Number} [code] Status code explaining why the connection is closing
     * @param {(String|Buffer)} [data] The reason why the connection is
     *     closing
     * @public
     */
    close(T, U) {
      if (this.readyState !== b.CLOSED) {
        if (this.readyState === b.CONNECTING) {
          P(this, this._req, "WebSocket was closed before the connection was established");
          return;
        }
        if (this.readyState === b.CLOSING) {
          this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end();
          return;
        }
        this._readyState = b.CLOSING, this._sender.close(T, U, !this._isServer, ($) => {
          $ || (this._closeFrameSent = !0, (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end());
        }), ae(this);
      }
    }
    /**
     * Pause the socket.
     *
     * @public
     */
    pause() {
      this.readyState === b.CONNECTING || this.readyState === b.CLOSED || (this._paused = !0, this._socket.pause());
    }
    /**
     * Send a ping.
     *
     * @param {*} [data] The data to send
     * @param {Boolean} [mask] Indicates whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when the ping is sent
     * @public
     */
    ping(T, U, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof T == "function" ? ($ = T, T = U = void 0) : typeof U == "function" && ($ = U, U = void 0), typeof T == "number" && (T = T.toString()), this.readyState !== b.OPEN) {
        M(this, T, $);
        return;
      }
      U === void 0 && (U = !this._isServer), this._sender.ping(T || h, U, $);
    }
    /**
     * Send a pong.
     *
     * @param {*} [data] The data to send
     * @param {Boolean} [mask] Indicates whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when the pong is sent
     * @public
     */
    pong(T, U, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof T == "function" ? ($ = T, T = U = void 0) : typeof U == "function" && ($ = U, U = void 0), typeof T == "number" && (T = T.toString()), this.readyState !== b.OPEN) {
        M(this, T, $);
        return;
      }
      U === void 0 && (U = !this._isServer), this._sender.pong(T || h, U, $);
    }
    /**
     * Resume the socket.
     *
     * @public
     */
    resume() {
      this.readyState === b.CONNECTING || this.readyState === b.CLOSED || (this._paused = !1, this._receiver._writableState.needDrain || this._socket.resume());
    }
    /**
     * Send a data message.
     *
     * @param {*} data The message to send
     * @param {Object} [options] Options object
     * @param {Boolean} [options.binary] Specifies whether `data` is binary or
     *     text
     * @param {Boolean} [options.compress] Specifies whether or not to compress
     *     `data`
     * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
     *     last one
     * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when data is written out
     * @public
     */
    send(T, U, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof U == "function" && ($ = U, U = {}), typeof T == "number" && (T = T.toString()), this.readyState !== b.OPEN) {
        M(this, T, $);
        return;
      }
      const B = {
        binary: typeof T != "string",
        mask: !this._isServer,
        compress: !0,
        fin: !0,
        ...U
      };
      this._extensions[p.extensionName] || (B.compress = !1), this._sender.send(T || h, B, $);
    }
    /**
     * Forcibly close the connection.
     *
     * @public
     */
    terminate() {
      if (this.readyState !== b.CLOSED) {
        if (this.readyState === b.CONNECTING) {
          P(this, this._req, "WebSocket was closed before the connection was established");
          return;
        }
        this._socket && (this._readyState = b.CLOSING, this._socket.destroy());
      }
    }
  }
  Object.defineProperty(b, "CONNECTING", {
    enumerable: !0,
    value: q.indexOf("CONNECTING")
  }), Object.defineProperty(b.prototype, "CONNECTING", {
    enumerable: !0,
    value: q.indexOf("CONNECTING")
  }), Object.defineProperty(b, "OPEN", {
    enumerable: !0,
    value: q.indexOf("OPEN")
  }), Object.defineProperty(b.prototype, "OPEN", {
    enumerable: !0,
    value: q.indexOf("OPEN")
  }), Object.defineProperty(b, "CLOSING", {
    enumerable: !0,
    value: q.indexOf("CLOSING")
  }), Object.defineProperty(b.prototype, "CLOSING", {
    enumerable: !0,
    value: q.indexOf("CLOSING")
  }), Object.defineProperty(b, "CLOSED", {
    enumerable: !0,
    value: q.indexOf("CLOSED")
  }), Object.defineProperty(b.prototype, "CLOSED", {
    enumerable: !0,
    value: q.indexOf("CLOSED")
  }), [
    "binaryType",
    "bufferedAmount",
    "extensions",
    "isPaused",
    "protocol",
    "readyState",
    "url"
  ].forEach((R) => {
    Object.defineProperty(b.prototype, R, { enumerable: !0 });
  }), ["open", "error", "close", "message"].forEach((R) => {
    Object.defineProperty(b.prototype, `on${R}`, {
      enumerable: !0,
      get() {
        for (const T of this.listeners(R))
          if (T[w]) return T[k];
        return null;
      },
      set(T) {
        for (const U of this.listeners(R))
          if (U[w]) {
            this.removeListener(R, U);
            break;
          }
        typeof T == "function" && this.addEventListener(R, T, {
          [w]: !0
        });
      }
    });
  }), b.prototype.addEventListener = y, b.prototype.removeEventListener = S, ca = b;
  function O(R, T, U, $) {
    const B = {
      allowSynchronousEvents: !0,
      autoPong: !0,
      closeTimeout: f,
      protocolVersion: W[1],
      maxPayload: 104857600,
      skipUTF8Validation: !1,
      perMessageDeflate: !0,
      followRedirects: !1,
      maxRedirects: 10,
      ...$,
      socketPath: void 0,
      hostname: void 0,
      protocol: void 0,
      timeout: void 0,
      method: "GET",
      host: void 0,
      path: void 0,
      port: void 0
    };
    if (R._autoPong = B.autoPong, R._closeTimeout = B.closeTimeout, !W.includes(B.protocolVersion))
      throw new RangeError(
        `Unsupported protocol version: ${B.protocolVersion} (supported versions: ${W.join(", ")})`
      );
    let J;
    if (T instanceof u)
      J = T;
    else
      try {
        J = new u(T);
      } catch {
        throw new SyntaxError(`Invalid URL: ${T}`);
      }
    J.protocol === "http:" ? J.protocol = "ws:" : J.protocol === "https:" && (J.protocol = "wss:"), R._url = J.href;
    const Re = J.protocol === "wss:", ke = J.protocol === "ws+unix:";
    let Ye;
    if (J.protocol !== "ws:" && !Re && !ke ? Ye = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"` : ke && !J.pathname ? Ye = "The URL's pathname is empty" : J.hash && (Ye = "The URL contains a fragment identifier"), Ye) {
      const Z = new SyntaxError(Ye);
      if (R._redirects === 0)
        throw Z;
      C(R, Z);
      return;
    }
    const ja = Re ? 443 : 80, La = o(16).toString("base64"), Na = Re ? e.request : a.request, Je = /* @__PURE__ */ new Set();
    let Xe;
    if (B.createConnection = B.createConnection || (Re ? F : z), B.defaultPort = B.defaultPort || ja, B.port = J.port || ja, B.host = J.hostname.startsWith("[") ? J.hostname.slice(1, -1) : J.hostname, B.headers = {
      ...B.headers,
      "Sec-WebSocket-Version": B.protocolVersion,
      "Sec-WebSocket-Key": La,
      Connection: "Upgrade",
      Upgrade: "websocket"
    }, B.path = J.pathname + J.search, B.timeout = B.handshakeTimeout, B.perMessageDeflate && (Xe = new p(
      B.perMessageDeflate !== !0 ? B.perMessageDeflate : {},
      !1,
      B.maxPayload
    ), B.headers["Sec-WebSocket-Extensions"] = j({
      [p.extensionName]: Xe.offer()
    })), U.length) {
      for (const Z of U) {
        if (typeof Z != "string" || !ne.test(Z) || Je.has(Z))
          throw new SyntaxError(
            "An invalid or duplicated subprotocol was specified"
          );
        Je.add(Z);
      }
      B.headers["Sec-WebSocket-Protocol"] = U.join(",");
    }
    if (B.origin && (B.protocolVersion < 13 ? B.headers["Sec-WebSocket-Origin"] = B.origin : B.headers.Origin = B.origin), (J.username || J.password) && (B.auth = `${J.username}:${J.password}`), ke) {
      const Z = B.path.split(":");
      B.socketPath = Z[0], B.path = Z[1];
    }
    let le;
    if (B.followRedirects) {
      if (R._redirects === 0) {
        R._originalIpc = ke, R._originalSecure = Re, R._originalHostOrSocketPath = ke ? B.socketPath : J.host;
        const Z = $ && $.headers;
        if ($ = { ...$, headers: {} }, Z)
          for (const [ve, Ie] of Object.entries(Z))
            $.headers[ve.toLowerCase()] = Ie;
      } else if (R.listenerCount("redirect") === 0) {
        const Z = ke ? R._originalIpc ? B.socketPath === R._originalHostOrSocketPath : !1 : R._originalIpc ? !1 : J.host === R._originalHostOrSocketPath;
        (!Z || R._originalSecure && !Re) && (delete B.headers.authorization, delete B.headers.cookie, Z || delete B.headers.host, B.auth = void 0);
      }
      B.auth && !$.headers.authorization && ($.headers.authorization = "Basic " + Buffer.from(B.auth).toString("base64")), le = R._req = Na(B), R._redirects && R.emit("redirect", R.url, le);
    } else
      le = R._req = Na(B);
    B.timeout && le.on("timeout", () => {
      P(R, le, "Opening handshake has timed out");
    }), le.on("error", (Z) => {
      le === null || le[D] || (le = R._req = null, C(R, Z));
    }), le.on("response", (Z) => {
      const ve = Z.headers.location, Ie = Z.statusCode;
      if (ve && B.followRedirects && Ie >= 300 && Ie < 400) {
        if (++R._redirects > B.maxRedirects) {
          P(R, le, "Maximum redirects exceeded");
          return;
        }
        le.abort();
        let Ze;
        try {
          Ze = new u(ve, T);
        } catch {
          const ze = new SyntaxError(`Invalid URL: ${ve}`);
          C(R, ze);
          return;
        }
        O(R, Ze, U, $);
      } else R.emit("unexpected-response", le, Z) || P(
        R,
        le,
        `Unexpected server response: ${Z.statusCode}`
      );
    }), le.on("upgrade", (Z, ve, Ie) => {
      if (R.emit("upgrade", Z), R.readyState !== b.CONNECTING) return;
      le = R._req = null;
      const Ze = Z.headers.upgrade;
      if (Ze === void 0 || Ze.toLowerCase() !== "websocket") {
        P(R, ve, "Invalid Upgrade header");
        return;
      }
      const Ba = s("sha1").update(La + v).digest("base64");
      if (Z.headers["sec-websocket-accept"] !== Ba) {
        P(R, ve, "Invalid Sec-WebSocket-Accept header");
        return;
      }
      const ze = Z.headers["sec-websocket-protocol"];
      let Qe;
      if (ze !== void 0 ? Je.size ? Je.has(ze) || (Qe = "Server sent an invalid subprotocol") : Qe = "Server sent a subprotocol but none was requested" : Je.size && (Qe = "Server sent no subprotocol"), Qe) {
        P(R, ve, Qe);
        return;
      }
      ze && (R._protocol = ze);
      const Fa = Z.headers["sec-websocket-extensions"];
      if (Fa !== void 0) {
        if (!Xe) {
          P(R, ve, "Server sent a Sec-WebSocket-Extensions header but no extension was requested");
          return;
        }
        let Ht;
        try {
          Ht = L(Fa);
        } catch {
          P(R, ve, "Invalid Sec-WebSocket-Extensions header");
          return;
        }
        const Ua = Object.keys(Ht);
        if (Ua.length !== 1 || Ua[0] !== p.extensionName) {
          P(R, ve, "Server indicated an extension that was not requested");
          return;
        }
        try {
          Xe.accept(Ht[p.extensionName]);
        } catch {
          P(R, ve, "Invalid Sec-WebSocket-Extensions header");
          return;
        }
        R._extensions[p.extensionName] = Xe;
      }
      R.setSocket(ve, Ie, {
        allowSynchronousEvents: B.allowSynchronousEvents,
        generateMask: B.generateMask,
        maxPayload: B.maxPayload,
        skipUTF8Validation: B.skipUTF8Validation
      });
    }), B.finishRequest ? B.finishRequest(le, R) : le.end();
  }
  function C(R, T) {
    R._readyState = b.CLOSING, R._errorEmitted = !0, R.emit("error", T), R.emitClose();
  }
  function z(R) {
    return R.path = R.socketPath, n.connect(R);
  }
  function F(R) {
    return R.path = void 0, !R.servername && R.servername !== "" && (R.servername = n.isIP(R.host) ? "" : R.host), i.connect(R);
  }
  function P(R, T, U) {
    R._readyState = b.CLOSING;
    const $ = new Error(U);
    Error.captureStackTrace($, P), T.setHeader ? (T[D] = !0, T.abort(), T.socket && !T.socket.destroyed && T.socket.destroy(), process.nextTick(C, R, $)) : (T.destroy($), T.once("error", R.emit.bind(R, "error")), T.once("close", R.emitClose.bind(R)));
  }
  function M(R, T, U) {
    if (T) {
      const $ = E(T) ? T.size : I(T).length;
      R._socket ? R._sender._bufferedBytes += $ : R._bufferedAmount += $;
    }
    if (U) {
      const $ = new Error(
        `WebSocket is not open: readyState ${R.readyState} (${q[R.readyState]})`
      );
      process.nextTick(U, $);
    }
  }
  function Q(R, T) {
    const U = this[g];
    U._closeFrameReceived = !0, U._closeMessage = T, U._closeCode = R, U._socket[g] !== void 0 && (U._socket.removeListener("data", he), process.nextTick(G, U._socket), R === 1005 ? U.close() : U.close(R, T));
  }
  function K() {
    const R = this[g];
    R.isPaused || R._socket.resume();
  }
  function Y(R) {
    const T = this[g];
    T._socket[g] !== void 0 && (T._socket.removeListener("data", he), process.nextTick(G, T._socket), T.close(R[A])), T._errorEmitted || (T._errorEmitted = !0, T.emit("error", R));
  }
  function V() {
    this[g].emitClose();
  }
  function te(R, T) {
    this[g].emit("message", R, T);
  }
  function ye(R) {
    const T = this[g];
    T._autoPong && T.pong(R, !this._isServer, m), T.emit("ping", R);
  }
  function fe(R) {
    this[g].emit("pong", R);
  }
  function G(R) {
    R.resume();
  }
  function ce(R) {
    const T = this[g];
    T.readyState !== b.CLOSED && (T.readyState === b.OPEN && (T._readyState = b.CLOSING, ae(T)), this._socket.end(), T._errorEmitted || (T._errorEmitted = !0, T.emit("error", R)));
  }
  function ae(R) {
    R._closeTimer = setTimeout(
      R._socket.destroy.bind(R._socket),
      R._closeTimeout
    );
  }
  function pe() {
    const R = this[g];
    if (this.removeListener("close", pe), this.removeListener("data", he), this.removeListener("end", Pe), R._readyState = b.CLOSING, !this._readableState.endEmitted && !R._closeFrameReceived && !R._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
      const T = this.read(this._readableState.length);
      R._receiver.write(T);
    }
    R._receiver.end(), this[g] = void 0, clearTimeout(R._closeTimer), R._receiver._writableState.finished || R._receiver._writableState.errorEmitted ? R.emitClose() : (R._receiver.on("error", V), R._receiver.on("finish", V));
  }
  function he(R) {
    this[g]._receiver.write(R) || this.pause();
  }
  function Pe() {
    const R = this[g];
    R._readyState = b.CLOSING, R._receiver.end(), this.end();
  }
  function ue() {
    const R = this[g];
    this.removeListener("error", ue), this.on("error", m), R && (R._readyState = b.CLOSING, this.destroy());
  }
  return ca;
}
var pa, Os;
function Zp() {
  if (Os) return pa;
  Os = 1, Aa();
  const { Duplex: t } = oe;
  function e(o) {
    o.emit("close");
  }
  function a() {
    !this.destroyed && this._writableState.finished && this.destroy();
  }
  function n(o) {
    this.removeListener("error", n), this.destroy(), this.listenerCount("error") === 0 && this.emit("error", o);
  }
  function i(o, s) {
    let r = !0;
    const c = new t({
      ...s,
      autoDestroy: !1,
      emitClose: !1,
      objectMode: !1,
      writableObjectMode: !1
    });
    return o.on("message", function(p, d) {
      const l = !d && c._readableState.objectMode ? p.toString() : p;
      c.push(l) || o.pause();
    }), o.once("error", function(p) {
      c.destroyed || (r = !1, c.destroy(p));
    }), o.once("close", function() {
      c.destroyed || c.push(null);
    }), c._destroy = function(u, p) {
      if (o.readyState === o.CLOSED) {
        p(u), process.nextTick(e, c);
        return;
      }
      let d = !1;
      o.once("error", function(E) {
        d = !0, p(E);
      }), o.once("close", function() {
        d || p(u), process.nextTick(e, c);
      }), r && o.terminate();
    }, c._final = function(u) {
      if (o.readyState === o.CONNECTING) {
        o.once("open", function() {
          c._final(u);
        });
        return;
      }
      o._socket !== null && (o._socket._writableState.finished ? (u(), c._readableState.endEmitted && c.destroy()) : (o._socket.once("finish", function() {
        u();
      }), o.close()));
    }, c._read = function() {
      o.isPaused && o.resume();
    }, c._write = function(u, p, d) {
      if (o.readyState === o.CONNECTING) {
        o.once("open", function() {
          c._write(u, p, d);
        });
        return;
      }
      o.send(u, d);
    }, c.on("end", a), c.on("error", n), c;
  }
  return pa = i, pa;
}
Zp();
Ro();
ko();
Aa();
var la, Ts;
function Qp() {
  if (Ts) return la;
  Ts = 1;
  const { tokenChars: t } = ht();
  function e(a) {
    const n = /* @__PURE__ */ new Set();
    let i = -1, o = -1, s = 0;
    for (s; s < a.length; s++) {
      const c = a.charCodeAt(s);
      if (o === -1 && t[c] === 1)
        i === -1 && (i = s);
      else if (s !== 0 && (c === 32 || c === 9))
        o === -1 && i !== -1 && (o = s);
      else if (c === 44) {
        if (i === -1)
          throw new SyntaxError(`Unexpected character at index ${s}`);
        o === -1 && (o = s);
        const u = a.slice(i, o);
        if (n.has(u))
          throw new SyntaxError(`The "${u}" subprotocol is duplicated`);
        n.add(u), i = o = -1;
      } else
        throw new SyntaxError(`Unexpected character at index ${s}`);
    }
    if (i === -1 || o !== -1)
      throw new SyntaxError("Unexpected end of input");
    const r = a.slice(i, s);
    if (n.has(r))
      throw new SyntaxError(`The "${r}" subprotocol is duplicated`);
    return n.add(r), n;
  }
  return la = { parse: e }, la;
}
var ua, Cs;
function el() {
  if (Cs) return ua;
  Cs = 1;
  const t = Ns, e = lt, { Duplex: a } = oe, { createHash: n } = pt, i = Oo(), o = Dt(), s = Qp(), r = Aa(), { CLOSE_TIMEOUT: c, GUID: u, kWebSocket: p } = Le(), d = /^[+/0-9A-Za-z]{22}==$/, l = 0, E = 1, x = 2;
  class f extends t {
    /**
     * Create a `WebSocketServer` instance.
     *
     * @param {Object} options Configuration options
     * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
     *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
     *     multiple times in the same tick
     * @param {Boolean} [options.autoPong=true] Specifies whether or not to
     *     automatically send a pong in response to a ping
     * @param {Number} [options.backlog=511] The maximum length of the queue of
     *     pending connections
     * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
     *     track clients
     * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
     *     wait for the closing handshake to finish after `websocket.close()` is
     *     called
     * @param {Function} [options.handleProtocols] A hook to handle protocols
     * @param {String} [options.host] The hostname where to bind the server
     * @param {Number} [options.maxPayload=104857600] The maximum allowed message
     *     size
     * @param {Boolean} [options.noServer=false] Enable no server mode
     * @param {String} [options.path] Accept only connections matching this path
     * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
     *     permessage-deflate
     * @param {Number} [options.port] The port where to bind the server
     * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
     *     server to use
     * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
     *     not to skip UTF-8 validation for text and close messages
     * @param {Function} [options.verifyClient] A hook to reject connections
     * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
     *     class to use. It must be the `WebSocket` class or class that extends it
     * @param {Function} [callback] A listener for the `listening` event
     */
    constructor(m, y) {
      if (super(), m = {
        allowSynchronousEvents: !0,
        autoPong: !0,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: !1,
        perMessageDeflate: !1,
        handleProtocols: null,
        clientTracking: !0,
        closeTimeout: c,
        verifyClient: null,
        noServer: !1,
        backlog: null,
        // use default (511 as implemented in net.js)
        server: null,
        host: null,
        path: null,
        port: null,
        WebSocket: r,
        ...m
      }, m.port == null && !m.server && !m.noServer || m.port != null && (m.server || m.noServer) || m.server && m.noServer)
        throw new TypeError(
          'One and only one of the "port", "server", or "noServer" options must be specified'
        );
      if (m.port != null ? (this._server = e.createServer((S, j) => {
        const L = e.STATUS_CODES[426];
        j.writeHead(426, {
          "Content-Length": L.length,
          "Content-Type": "text/plain"
        }), j.end(L);
      }), this._server.listen(
        m.port,
        m.host,
        m.backlog,
        y
      )) : m.server && (this._server = m.server), this._server) {
        const S = this.emit.bind(this, "connection");
        this._removeListeners = h(this._server, {
          listening: this.emit.bind(this, "listening"),
          error: this.emit.bind(this, "error"),
          upgrade: (j, L, I) => {
            this.handleUpgrade(j, L, I, S);
          }
        });
      }
      m.perMessageDeflate === !0 && (m.perMessageDeflate = {}), m.clientTracking && (this.clients = /* @__PURE__ */ new Set(), this._shouldEmitClose = !1), this.options = m, this._state = l;
    }
    /**
     * Returns the bound address, the address family name, and port of the server
     * as reported by the operating system if listening on an IP socket.
     * If the server is listening on a pipe or UNIX domain socket, the name is
     * returned as a string.
     *
     * @return {(Object|String|null)} The address of the server
     * @public
     */
    address() {
      if (this.options.noServer)
        throw new Error('The server is operating in "noServer" mode');
      return this._server ? this._server.address() : null;
    }
    /**
     * Stop the server from accepting new connections and emit the `'close'` event
     * when all existing connections are closed.
     *
     * @param {Function} [cb] A one-time listener for the `'close'` event
     * @public
     */
    close(m) {
      if (this._state === x) {
        m && this.once("close", () => {
          m(new Error("The server is not running"));
        }), process.nextTick(v, this);
        return;
      }
      if (m && this.once("close", m), this._state !== E)
        if (this._state = E, this.options.noServer || this.options.server)
          this._server && (this._removeListeners(), this._removeListeners = this._server = null), this.clients ? this.clients.size ? this._shouldEmitClose = !0 : process.nextTick(v, this) : process.nextTick(v, this);
        else {
          const y = this._server;
          this._removeListeners(), this._removeListeners = this._server = null, y.close(() => {
            v(this);
          });
        }
    }
    /**
     * See if a given request should be handled by this server instance.
     *
     * @param {http.IncomingMessage} req Request object to inspect
     * @return {Boolean} `true` if the request is valid, else `false`
     * @public
     */
    shouldHandle(m) {
      if (this.options.path) {
        const y = m.url.indexOf("?");
        if ((y !== -1 ? m.url.slice(0, y) : m.url) !== this.options.path) return !1;
      }
      return !0;
    }
    /**
     * Handle a HTTP Upgrade request.
     *
     * @param {http.IncomingMessage} req The request object
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Function} cb Callback
     * @public
     */
    handleUpgrade(m, y, S, j) {
      y.on("error", w);
      const L = m.headers["sec-websocket-key"], I = m.headers.upgrade, D = +m.headers["sec-websocket-version"];
      if (m.method !== "GET") {
        A(this, m, y, 405, "Invalid HTTP method");
        return;
      }
      if (I === void 0 || I.toLowerCase() !== "websocket") {
        A(this, m, y, 400, "Invalid Upgrade header");
        return;
      }
      if (L === void 0 || !d.test(L)) {
        A(this, m, y, 400, "Missing or invalid Sec-WebSocket-Key header");
        return;
      }
      if (D !== 13 && D !== 8) {
        A(this, m, y, 400, "Missing or invalid Sec-WebSocket-Version header", {
          "Sec-WebSocket-Version": "13, 8"
        });
        return;
      }
      if (!this.shouldHandle(m)) {
        k(y, 400);
        return;
      }
      const W = m.headers["sec-websocket-protocol"];
      let q = /* @__PURE__ */ new Set();
      if (W !== void 0)
        try {
          q = s.parse(W);
        } catch {
          A(this, m, y, 400, "Invalid Sec-WebSocket-Protocol header");
          return;
        }
      const ne = m.headers["sec-websocket-extensions"], b = {};
      if (this.options.perMessageDeflate && ne !== void 0) {
        const O = new o(
          this.options.perMessageDeflate,
          !0,
          this.options.maxPayload
        );
        try {
          const C = i.parse(ne);
          C[o.extensionName] && (O.accept(C[o.extensionName]), b[o.extensionName] = O);
        } catch {
          A(this, m, y, 400, "Invalid or unacceptable Sec-WebSocket-Extensions header");
          return;
        }
      }
      if (this.options.verifyClient) {
        const O = {
          origin: m.headers[`${D === 8 ? "sec-websocket-origin" : "origin"}`],
          secure: !!(m.socket.authorized || m.socket.encrypted),
          req: m
        };
        if (this.options.verifyClient.length === 2) {
          this.options.verifyClient(O, (C, z, F, P) => {
            if (!C)
              return k(y, z || 401, F, P);
            this.completeUpgrade(
              b,
              L,
              q,
              m,
              y,
              S,
              j
            );
          });
          return;
        }
        if (!this.options.verifyClient(O)) return k(y, 401);
      }
      this.completeUpgrade(b, L, q, m, y, S, j);
    }
    /**
     * Upgrade the connection to WebSocket.
     *
     * @param {Object} extensions The accepted extensions
     * @param {String} key The value of the `Sec-WebSocket-Key` header
     * @param {Set} protocols The subprotocols
     * @param {http.IncomingMessage} req The request object
     * @param {Duplex} socket The network socket between the server and client
     * @param {Buffer} head The first packet of the upgraded stream
     * @param {Function} cb Callback
     * @throws {Error} If called more than once with the same socket
     * @private
     */
    completeUpgrade(m, y, S, j, L, I, D) {
      if (!L.readable || !L.writable) return L.destroy();
      if (L[p])
        throw new Error(
          "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
        );
      if (this._state > l) return k(L, 503);
      const q = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${n("sha1").update(y + u).digest("base64")}`
      ], ne = new this.options.WebSocket(null, void 0, this.options);
      if (S.size) {
        const b = this.options.handleProtocols ? this.options.handleProtocols(S, j) : S.values().next().value;
        b && (q.push(`Sec-WebSocket-Protocol: ${b}`), ne._protocol = b);
      }
      if (m[o.extensionName]) {
        const b = m[o.extensionName].params, O = i.format({
          [o.extensionName]: [b]
        });
        q.push(`Sec-WebSocket-Extensions: ${O}`), ne._extensions = m;
      }
      this.emit("headers", q, j), L.write(q.concat(`\r
`).join(`\r
`)), L.removeListener("error", w), ne.setSocket(L, I, {
        allowSynchronousEvents: this.options.allowSynchronousEvents,
        maxPayload: this.options.maxPayload,
        skipUTF8Validation: this.options.skipUTF8Validation
      }), this.clients && (this.clients.add(ne), ne.on("close", () => {
        this.clients.delete(ne), this._shouldEmitClose && !this.clients.size && process.nextTick(v, this);
      })), D(ne, j);
    }
  }
  ua = f;
  function h(g, m) {
    for (const y of Object.keys(m)) g.on(y, m[y]);
    return function() {
      for (const S of Object.keys(m))
        g.removeListener(S, m[S]);
    };
  }
  function v(g) {
    g._state = x, g.emit("close");
  }
  function w() {
    this.destroy();
  }
  function k(g, m, y, S) {
    y = y || e.STATUS_CODES[m], S = {
      Connection: "close",
      "Content-Type": "text/html",
      "Content-Length": Buffer.byteLength(y),
      ...S
    }, g.once("finish", g.destroy), g.end(
      `HTTP/1.1 ${m} ${e.STATUS_CODES[m]}\r
` + Object.keys(S).map((j) => `${j}: ${S[j]}`).join(`\r
`) + `\r
\r
` + y
    );
  }
  function A(g, m, y, S, j, L) {
    if (g.listenerCount("wsClientError")) {
      const I = new Error(j);
      Error.captureStackTrace(I, A), g.emit("wsClientError", I, y, m);
    } else
      k(y, S, j, L);
  }
  return ua;
}
el();
const we = "http://127.0.0.1:8000";
function tl(t) {
  return (typeof (t == null ? void 0 : t.message) == "string" ? t.message : "").includes("ECONNREFUSED") || (t == null ? void 0 : t.code) === "ECONNREFUSED";
}
const nl = "The AI backend is not running. Please restart the app or start the backend manually from Settings.";
async function Ee(t, e = 3, a = 1e3) {
  let n;
  for (let i = 1; i <= e; i += 1)
    try {
      return await t();
    } catch (o) {
      if (n = o, tl(o)) {
        const s = new Error(nl);
        throw s.code = "BACKEND_DOWN", s;
      }
      if (i === e)
        throw o;
      await new Promise((s) => setTimeout(s, a));
    }
  throw n;
}
H.handle("generation:generate-image", async (t, e) => {
  try {
    return {
      success: !0,
      jobId: (await Ee(() => X.post(`${we}/api/generate/image`, e, { headers: ge() }))).data.job_id
    };
  } catch (a) {
    return console.error("Image generation error:", a), {
      success: !1,
      error: Te(a, "Image generation failed")
    };
  }
});
H.handle("generation:generate-video", async (t, e) => {
  try {
    return {
      success: !0,
      jobId: (await Ee(() => X.post(`${we}/api/generate/video`, e, { headers: ge() }))).data.job_id
    };
  } catch (a) {
    return console.error("Video generation error:", a), {
      success: !1,
      error: Te(a, "Video generation failed")
    };
  }
});
H.handle("generation:enhance-prompt", async (t, e) => {
  try {
    return (await Ee(() => X.post(`${we}/api/prompts/enhance`, e, { headers: ge() }))).data;
  } catch (a) {
    return {
      success: !1,
      error: Te(a, "Prompt enhancement failed")
    };
  }
});
H.handle("generation:crop-image", async (t, e) => {
  try {
    return (await Ee(() => X.post(`${we}/api/images/crop`, e, { headers: ge() }))).data;
  } catch (a) {
    return {
      success: !1,
      error: Te(a, "Image crop failed")
    };
  }
});
H.handle("generation:upscale-image", async (t, e) => {
  try {
    return (await Ee(() => X.post(`${we}/api/images/upscale`, e, { headers: ge() }))).data;
  } catch (a) {
    return {
      success: !1,
      error: Te(a, "Image upscale failed")
    };
  }
});
H.handle("generation:batch", async (t, e) => {
  try {
    const { prompts: a, ...n } = e, i = [];
    for (const o of a) {
      const s = await Ee(() => X.post(`${we}/api/generate/image`, {
        ...n,
        prompt: o
      }, { headers: ge() }));
      i.push(s.data.job_id);
    }
    return {
      success: !0,
      jobIds: i
    };
  } catch (a) {
    return console.error("Batch generation error:", a), {
      success: !1,
      error: Te(a, "Batch generation failed")
    };
  }
});
H.handle("generation:get-status", async (t, e) => {
  try {
    return (await Ee(() => X.get(`${we}/api/jobs/${e}`, { headers: ge() }))).data;
  } catch (a) {
    return console.error("Get status error:", a), {
      success: !1,
      error: Te(a, "Could not get generation status")
    };
  }
});
H.handle("generation:cancel", async (t, e) => {
  try {
    return (await Ee(() => X.post(`${we}/api/jobs/${e}/cancel`, void 0, { headers: ge() }))).data;
  } catch (a) {
    return console.error("Cancel job error:", a), {
      success: !1,
      error: Te(a, "Could not cancel generation")
    };
  }
});
H.handle("generation:list-jobs", async (t, e = {}) => {
  try {
    const { status: a, limit: n = 50 } = e;
    let i = `${we}/api/jobs?limit=${n}`;
    return a && (i += `&status=${a}`), (await Ee(() => X.get(i, { headers: ge() }))).data;
  } catch (a) {
    return console.error("List jobs error:", a), {
      success: !1,
      error: Te(a, "Could not list jobs")
    };
  }
});
H.handle("models:list", async () => {
  try {
    return (await Ee(() => X.get(`${we}/api/models`, { headers: ge() }))).data;
  } catch (t) {
    return console.error("List models error:", t), [];
  }
});
H.handle("models:download", async (t, e) => {
  try {
    return (await Ee(() => X.post(`${we}/api/models/${e}/download`, void 0, { headers: ge() }))).data;
  } catch (a) {
    return console.error("Download model error:", a), {
      success: !1,
      error: Te(a, "Model download failed")
    };
  }
});
H.handle("models:get-status", async (t, e) => {
  try {
    return (await Ee(() => X.get(`${we}/api/models/${e}/status`, { headers: ge() }))).data;
  } catch (a) {
    return console.error("Get model status error:", a), null;
  }
});
H.handle("models:delete", async (t, e) => {
  try {
    return (await Ee(() => X.delete(`${we}/api/models/${e}`, { headers: ge() }))).data;
  } catch (a) {
    return console.error("Delete model error:", a), {
      success: !1,
      error: Te(a, "Model delete failed")
    };
  }
});
const al = Lo(import.meta.url), ot = Ps(al), Tt = {
  theme: "dark",
  autoSave: !0,
  defaultOutputPath: "",
  backendAutostart: !0,
  notifyOnGenerationComplete: !0,
  notifyOnGenerationFailed: !0,
  notifyOnModelDownloads: !0
}, _e = new No({
  defaults: {
    recentProjects: [],
    settings: Tt,
    firstRun: !0,
    modelsDownloaded: [],
    managedOutputRoots: []
  }
});
let ie = null, ee = null, Ae = !1;
const il = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "media-src 'self' blob:"
].join("; ");
function Ve() {
  return {
    ...Tt,
    ..._e.get("settings")
  };
}
function It() {
  return ga(Ve(), re.getPath("userData"));
}
function zt() {
  return ga({ defaultOutputPath: "" }, re.getPath("userData"));
}
function As() {
  return Array.from(
    /* @__PURE__ */ new Set([
      zt(),
      It(),
      ..._e.get("managedOutputRoots")
    ])
  );
}
function rt(t) {
  const e = t.replace(/\\/g, "/").replace(/\/$/, ""), a = Array.from(
    /* @__PURE__ */ new Set([..._e.get("managedOutputRoots"), e])
  );
  _e.set("managedOutputRoots", a);
}
async function Pa() {
  if (!ee)
    return Ct();
  const t = ee, e = new Promise((a) => {
    const n = setTimeout(a, 5e3);
    t.once("close", () => {
      clearTimeout(n), a();
    });
  });
  return $t(), await e, Ct();
}
function xt(t) {
  const e = Ko(
    t,
    It(),
    As(),
    (a) => de.existsSync(a)
  );
  if (!Vo(e, As()))
    throw new Error("Asset path is outside managed output directories");
  return e;
}
function To() {
  return [
    re.getPath("home"),
    re.getPath("desktop"),
    re.getPath("documents"),
    re.getPath("downloads"),
    re.getPath("pictures"),
    re.getPath("videos")
  ];
}
function Mt() {
  const t = !!process.env.VITE_DEV_SERVER_URL, a = process.platform === "win32" ? "VisionStudio-Backend.exe" : "VisionStudio-Backend";
  if (t) {
    const n = Oe(ot, "../backend/dist", a);
    if (de.existsSync(n))
      return n;
    const i = Oe(ot, "../resources", a);
    return de.existsSync(i) ? i : null;
  } else {
    const n = Oe(process.resourcesPath, a);
    return console.log(`🔍 Looking for backend at: ${n} (exists: ${de.existsSync(n)})`), de.existsSync(n) ? n : null;
  }
}
function sl() {
  const t = Mt();
  if (t)
    return console.log("📦 Using bundled Python backend:", t), {
      command: t,
      args: [],
      cwd: Ps(t)
    };
  const a = !!process.env.VITE_DEV_SERVER_URL ? Oe(ot, "../backend") : Oe(process.resourcesPath, "backend-source"), n = _e.get("settings").pythonPath || "python";
  if (!ir(n))
    return console.error(`❌ Invalid pythonPath rejected: ${n}`), null;
  const i = n, o = Oe(a, "main.py");
  return console.log(`🐍 Fallback to system Python: ${i}, main.py at: ${o} (exists: ${de.existsSync(o)})`), de.existsSync(o) ? {
    command: i,
    args: ["main.py"],
    cwd: a
  } : (console.error("❌ Neither bundled backend nor backend source found"), null);
}
function Ct() {
  return new Promise((t) => {
    var o, s;
    const e = sl();
    if (!e) {
      console.error("❌ No backend found!"), He.showErrorBox(
        "Backend Not Found",
        "Could not find the Python backend. Please reinstall the application."
      ), t(!1);
      return;
    }
    console.log("🚀 Starting Python backend..."), console.log(`   Command: ${e.command}`), console.log(`   Args: ${e.args.join(" ")}`), console.log(`   CWD: ${e.cwd}`);
    const a = It();
    de.mkdirSync(a, { recursive: !0 }), rt(a), ee = ba(e.command, e.args, {
      cwd: e.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        // Set models directory to app data
        MODELS_DIR: Oe(re.getPath("userData"), "models"),
        OUTPUT_DIR: a,
        // Persist database in app data (not PyInstaller temp dir)
        DATABASE_PATH: Oe(re.getPath("userData"), "data", "vision_studio.db"),
        // Write backend logs to app data for diagnostics
        LOG_FILE: Oe(re.getPath("userData"), "logs", "backend.log"),
        // Per-launch token that prevents unrelated local processes from using the backend API.
        VISION_STUDIO_BACKEND_AUTH_TOKEN: qs
      },
      detached: !1
    });
    let n = !1;
    Ae = !1;
    const i = (r) => {
      n || (n = !0, Ae = r, ie == null || ie.webContents.send("backend:status", da(ee, Ae)), t(r));
    };
    ya({
      timeoutMs: 3e5,
      intervalMs: 1e3
    }).then((r) => {
      r.ready && (console.log(`✅ Backend health check passed via ${r.origin}`), i(!0));
    }).catch((r) => {
      console.error("❌ Backend health check failed:", r), i(!1);
    }), (o = ee.stdout) == null || o.on("data", (r) => {
      const c = r.toString().trim();
      console.log(`[Python] ${c}`);
    }), (s = ee.stderr) == null || s.on("data", (r) => {
      const c = r.toString().trim();
      console.error(`[Python Error] ${c}`);
    }), ee.on("error", (r) => {
      console.error("❌ Failed to start Python backend:", r), Ae = !1, He.showErrorBox(
        "Backend Error",
        `Failed to start Python backend:
${r.message}

Please ensure you have the required dependencies installed.`
      ), i(!1);
    }), ee.on("close", (r) => {
      console.log(`Python backend exited with code ${r}`), ee = null, Ae = !1, ie == null || ie.webContents.send("backend:status", da(null, !1)), n || i(!1);
    });
  });
}
function $t() {
  var t;
  if (ee) {
    if (console.log("🛑 Stopping Python backend..."), process.platform === "win32")
      try {
        ba("taskkill", ["/pid", ((t = ee.pid) == null ? void 0 : t.toString()) || "", "/f", "/t"]);
      } catch {
        ee.kill("SIGTERM");
      }
    else
      ee.kill("SIGTERM");
    ee = null, Ae = !1;
  }
}
async function ol() {
  _e.get("firstRun") && (console.log("🎉 First run detected!"), (await He.showMessageBox(ie, {
    type: "info",
    title: "Welcome to Vision Studio",
    message: "Welcome to Vision Studio!",
    detail: `This is your first time running the app. AI models will be downloaded on first use.

GPU detected: ` + (await rl() ? "Yes" : "No"),
    buttons: ["Get Started", "Open Settings"],
    defaultId: 0
  })).response === 1 && (ie == null || ie.webContents.send("navigate", "settings")), _e.set("firstRun", !1));
}
async function rl() {
  return new Promise((t) => {
    var n;
    const e = ba("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
    let a = !1;
    (n = e.stdout) == null || n.on("data", (i) => {
      i.toString().trim() && (a = !0, console.log("✅ GPU detected:", i.toString().trim()));
    }), e.on("close", () => {
      t(a);
    }), e.on("error", () => {
      t(!1);
    });
  });
}
function Co() {
  ie = new jo({
    width: 1600,
    height: 1e3,
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0a",
      symbolColor: "#e5e5e5",
      height: 40
    },
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: Oe(ot, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    show: !0
  }), process.env.VITE_DEV_SERVER_URL ? (ie.loadURL(process.env.VITE_DEV_SERVER_URL), ie.webContents.openDevTools()) : ie.loadFile(Oe(ot, "../dist/index.html")), ie.webContents.on("will-navigate", (t) => {
    t.preventDefault();
  }), ie.webContents.setWindowOpenHandler(() => ({ action: "deny" })), ie.once("ready-to-show", () => {
    ol();
  }), ie.on("closed", () => {
    ie = null;
  });
}
function cl() {
  Po.defaultSession.webRequest.onHeadersReceived((t, e) => {
    e({
      responseHeaders: {
        ...t.responseHeaders,
        "Content-Security-Policy": [il]
      }
    });
  });
}
re.whenReady().then(async () => {
  if (cl(), rt(zt()), rt(It()), Co(), _e.get("settings").backendAutostart && !process.env.VISION_STUDIO_SKIP_BACKEND && !await Ct()) {
    const e = Mt(), a = e ? `The backend was found at:
${e}

but failed to start within the timeout. On first launch, the backend may need several minutes to extract. Try restarting the app.

You can also try starting it manually from Settings.` : "No backend executable was found. Please reinstall the application or configure a Python path in Settings.";
    He.showMessageBox(ie, {
      type: "warning",
      title: "Backend Not Started",
      message: "Could not start the AI backend",
      detail: a,
      buttons: ["OK"]
    });
  }
});
re.on("window-all-closed", () => {
  $t(), process.platform !== "darwin" && re.quit();
});
re.on("activate", () => {
  ie === null && Co();
});
re.on("before-quit", () => {
  $t();
});
H.handle("app:get-version", () => re.getVersion());
H.handle("app:open-external", (t, e) => {
  if (!ar(e)) {
    console.warn("Blocked open-external for unsafe URL:", e);
    return;
  }
  va.openExternal(e);
});
H.handle("app:open-path", async (t, e) => {
  const a = await va.openPath(xt(e));
  return a ? { success: !1, error: a } : { success: !0 };
});
H.handle("dialog:select-folder", async () => (await He.showOpenDialog(ie, {
  properties: ["openDirectory"]
})).filePaths[0] || null);
H.handle("dialog:save-file", async (t, e) => (await He.showSaveDialog(ie, {
  defaultPath: e.defaultPath,
  filters: e.filters
})).filePath || null);
H.handle("store:get", (t, e) => {
  if (!Ds(e)) {
    console.warn(`Blocked store:get for unknown key: ${e}`);
    return;
  }
  return _e.get(e);
});
H.handle("store:set", (t, e, a) => {
  if (!Ds(e)) {
    console.warn(`Blocked store:set for unknown key: ${e}`);
    return;
  }
  _e.set(e, a);
});
H.handle("store:reset", () => {
  _e.clear();
});
H.handle("settings:get", () => Ve());
H.handle("settings:update", async (t, e) => {
  const a = Ve(), n = {
    ...a,
    ...e
  };
  if (_e.set("settings", n), rt(ga(n, re.getPath("userData"))), ee && Us(a, n) && !await Pa() && !(ee && ee.exitCode === null))
    throw new Error("Backend restart failed after settings update");
  return n;
});
H.handle("settings:reset", async () => {
  const t = Ve();
  if (_e.set("settings", Tt), rt(zt()), ee && Us(t, Tt) && !await Pa() && !(ee && ee.exitCode === null))
    throw new Error("Backend restart failed after settings reset");
  return Ve();
});
H.handle("assets:export", async (t, e, a) => {
  try {
    const n = xt(e), i = Is(a, To());
    return i ? (await de.promises.mkdir(xe.dirname(i), { recursive: !0 }), await de.promises.copyFile(n, i), { success: !0, destinationPath: i }) : { success: !1, error: "Invalid destination path" };
  } catch (n) {
    return {
      success: !1,
      error: n.message
    };
  }
});
H.handle("assets:export-many", async (t, e, a) => {
  try {
    const n = Is(a, To());
    if (!n)
      return { success: !1, error: "Invalid destination directory" };
    await de.promises.mkdir(n, { recursive: !0 });
    const i = /* @__PURE__ */ new Set();
    for (const o of e) {
      const s = xt(o), r = xe.parse(s);
      let c = `${r.name}${r.ext}`, u = 1;
      for (; i.has(c) || de.existsSync(xe.join(a, c)); )
        c = `${r.name}-${u}${r.ext}`, u += 1;
      i.add(c), await de.promises.copyFile(s, xe.join(n, c));
    }
    return { success: !0, exportedCount: e.length };
  } catch (n) {
    return {
      success: !1,
      error: n.message
    };
  }
});
H.handle("assets:delete", async (t, e) => {
  try {
    const a = xt(e);
    return await de.promises.rm(a, { force: !0 }), { success: !0 };
  } catch (a) {
    return {
      success: !1,
      error: a.message
    };
  }
});
H.handle("assets:reveal", async (t, e) => {
  try {
    return va.showItemInFolder(xt(e)), { success: !0 };
  } catch (a) {
    return {
      success: !1,
      error: a.message
    };
  }
});
H.handle("assets:clear-cache", async () => {
  try {
    const t = zt();
    return await de.promises.rm(t, { recursive: !0, force: !0 }), await de.promises.mkdir(t, { recursive: !0 }), { success: !0 };
  } catch (t) {
    return {
      success: !1,
      error: t.message
    };
  }
});
H.handle(
  "notifications:notify",
  async (t, e, a) => {
    const n = Ve();
    return e === "generation_complete" && n.notifyOnGenerationComplete || e === "generation_failed" && n.notifyOnGenerationFailed || e === "model_download" && n.notifyOnModelDownloads ? (qa.isSupported() && new qa({
      title: a.title,
      body: a.body
    }).show(), { success: !0 }) : { success: !0, skipped: !0 };
  }
);
H.handle("system:get-info", async () => {
  if (ee && ee.exitCode === null)
    try {
      const t = await fetch("http://127.0.0.1:8000/api/system/info", {
        headers: ge(),
        signal: AbortSignal.timeout(3e3)
      });
      if (t.ok)
        return { ...await t.json(), backendConnected: !0 };
    } catch {
    }
  return {
    backendConnected: !1,
    gpu_available: !1,
    gpu_name: void 0,
    gpu_vram: void 0,
    cuda_version: void 0,
    comfyui_connected: !1,
    models_count: 0
  };
});
H.handle("backend:start", async () => {
  if (!ee || ee.exitCode !== null)
    return ee = null, { success: await Ct() };
  const t = await ya({
    timeoutMs: 0,
    intervalMs: 0,
    requestTimeoutMs: 1e3
  });
  return Ae = t.ready, t.ready ? { success: !1, error: "Backend already running" } : { success: await Pa(), restarted: !0 };
});
H.handle("backend:stop", () => ($t(), { success: !0 }));
H.handle("backend:status", async () => (ee && ee.exitCode === null ? Ae = (await ya({
  timeoutMs: 0,
  intervalMs: 0,
  requestTimeoutMs: 1e3
})).ready : Ae = !1, {
  ...da(ee, Ae),
  bundled: Mt() !== null
}));
H.handle("backend:check-bundled", () => {
  const t = Mt();
  return {
    exists: t !== null,
    path: t
  };
});
H.handle("app:get-path", (t, e) => re.getPath(e));
