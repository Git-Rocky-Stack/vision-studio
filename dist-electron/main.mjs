import { ipcMain as ae, app as Se, dialog as qe, shell as ao, BrowserWindow as io } from "electron";
import Xe, { fileURLToPath as so } from "url";
import cs, { dirname as ps, join as Ce } from "path";
import oo from "electron-store";
import { spawn as ea } from "child_process";
import Jn from "fs";
import Le from "util";
import se, { Readable as ro } from "stream";
import Ze from "http";
import vt from "https";
import Qe from "crypto";
import ls from "http2";
import co from "assert";
import us from "tty";
import po from "os";
import Ee from "zlib";
import ds, { EventEmitter as lo } from "events";
import uo from "net";
import mo from "tls";
import fo from "buffer";
function ms(t, e) {
  return function() {
    return t.apply(e, arguments);
  };
}
const { toString: ho } = Object.prototype, { getPrototypeOf: ta } = Object, { iterator: bt, toStringTag: fs } = Symbol, gt = /* @__PURE__ */ ((t) => (e) => {
  const a = ho.call(e);
  return t[a] || (t[a] = a.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null)), ye = (t) => (t = t.toLowerCase(), (e) => gt(e) === t), yt = (t) => (e) => typeof e === t, { isArray: Ie } = Array, Ue = yt("undefined");
function et(t) {
  return t !== null && !Ue(t) && t.constructor !== null && !Ue(t.constructor) && he(t.constructor.isBuffer) && t.constructor.isBuffer(t);
}
const hs = ye("ArrayBuffer");
function xo(t) {
  let e;
  return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? e = ArrayBuffer.isView(t) : e = t && t.buffer && hs(t.buffer), e;
}
const vo = yt("string"), he = yt("function"), xs = yt("number"), tt = (t) => t !== null && typeof t == "object", bo = (t) => t === !0 || t === !1, lt = (t) => {
  if (gt(t) !== "object")
    return !1;
  const e = ta(t);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(fs in t) && !(bt in t);
}, go = (t) => {
  if (!tt(t) || et(t))
    return !1;
  try {
    return Object.keys(t).length === 0 && Object.getPrototypeOf(t) === Object.prototype;
  } catch {
    return !1;
  }
}, yo = ye("Date"), _o = ye("File"), wo = ye("Blob"), Eo = ye("FileList"), So = (t) => tt(t) && he(t.pipe), Ro = (t) => {
  let e;
  return t && (typeof FormData == "function" && t instanceof FormData || he(t.append) && ((e = gt(t)) === "formdata" || // detect form-data instance
  e === "object" && he(t.toString) && t.toString() === "[object FormData]"));
}, ko = ye("URLSearchParams"), [To, Oo, Co, Ao] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers"
].map(ye), jo = (t) => t.trim ? t.trim() : t.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function nt(t, e, { allOwnKeys: a = !1 } = {}) {
  if (t === null || typeof t > "u")
    return;
  let n, i;
  if (typeof t != "object" && (t = [t]), Ie(t))
    for (n = 0, i = t.length; n < i; n++)
      e.call(null, t[n], n, t);
  else {
    if (et(t))
      return;
    const o = a ? Object.getOwnPropertyNames(t) : Object.keys(t), s = o.length;
    let r;
    for (n = 0; n < s; n++)
      r = o[n], e.call(null, t[r], r, t);
  }
}
function vs(t, e) {
  if (et(t))
    return null;
  e = e.toLowerCase();
  const a = Object.keys(t);
  let n = a.length, i;
  for (; n-- > 0; )
    if (i = a[n], e === i.toLowerCase())
      return i;
  return null;
}
const ke = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global, bs = (t) => !Ue(t) && t !== ke;
function Yn() {
  const { caseless: t, skipUndefined: e } = bs(this) && this || {}, a = {}, n = (i, o) => {
    if (o === "__proto__" || o === "constructor" || o === "prototype")
      return;
    const s = t && vs(a, o) || o;
    lt(a[s]) && lt(i) ? a[s] = Yn(a[s], i) : lt(i) ? a[s] = Yn({}, i) : Ie(i) ? a[s] = i.slice() : (!e || !Ue(i)) && (a[s] = i);
  };
  for (let i = 0, o = arguments.length; i < o; i++)
    arguments[i] && nt(arguments[i], n);
  return a;
}
const Po = (t, e, a, { allOwnKeys: n } = {}) => (nt(
  e,
  (i, o) => {
    a && he(i) ? Object.defineProperty(t, o, {
      value: ms(i, a),
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
), t), Lo = (t) => (t.charCodeAt(0) === 65279 && (t = t.slice(1)), t), Fo = (t, e, a, n) => {
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
}, Bo = (t, e, a, n) => {
  let i, o, s;
  const r = {};
  if (e = e || {}, t == null) return e;
  do {
    for (i = Object.getOwnPropertyNames(t), o = i.length; o-- > 0; )
      s = i[o], (!n || n(s, t, e)) && !r[s] && (e[s] = t[s], r[s] = !0);
    t = a !== !1 && ta(t);
  } while (t && (!a || a(t, e)) && t !== Object.prototype);
  return e;
}, No = (t, e, a) => {
  t = String(t), (a === void 0 || a > t.length) && (a = t.length), a -= e.length;
  const n = t.indexOf(e, a);
  return n !== -1 && n === a;
}, qo = (t) => {
  if (!t) return null;
  if (Ie(t)) return t;
  let e = t.length;
  if (!xs(e)) return null;
  const a = new Array(e);
  for (; e-- > 0; )
    a[e] = t[e];
  return a;
}, Uo = /* @__PURE__ */ ((t) => (e) => t && e instanceof t)(typeof Uint8Array < "u" && ta(Uint8Array)), Do = (t, e) => {
  const n = (t && t[bt]).call(t);
  let i;
  for (; (i = n.next()) && !i.done; ) {
    const o = i.value;
    e.call(t, o[0], o[1]);
  }
}, Io = (t, e) => {
  let a;
  const n = [];
  for (; (a = t.exec(e)) !== null; )
    n.push(a);
  return n;
}, zo = ye("HTMLFormElement"), Mo = (t) => t.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function(a, n, i) {
  return n.toUpperCase() + i;
}), ga = (({ hasOwnProperty: t }) => (e, a) => t.call(e, a))(Object.prototype), $o = ye("RegExp"), gs = (t, e) => {
  const a = Object.getOwnPropertyDescriptors(t), n = {};
  nt(a, (i, o) => {
    let s;
    (s = e(i, o, t)) !== !1 && (n[o] = s || i);
  }), Object.defineProperties(t, n);
}, Ho = (t) => {
  gs(t, (e, a) => {
    if (he(t) && ["arguments", "caller", "callee"].indexOf(a) !== -1)
      return !1;
    const n = t[a];
    if (he(n)) {
      if (e.enumerable = !1, "writable" in e) {
        e.writable = !1;
        return;
      }
      e.set || (e.set = () => {
        throw Error("Can not rewrite read-only method '" + a + "'");
      });
    }
  });
}, Go = (t, e) => {
  const a = {}, n = (i) => {
    i.forEach((o) => {
      a[o] = !0;
    });
  };
  return Ie(t) ? n(t) : n(String(t).split(e)), a;
}, Wo = () => {
}, Vo = (t, e) => t != null && Number.isFinite(t = +t) ? t : e;
function Ko(t) {
  return !!(t && he(t.append) && t[fs] === "FormData" && t[bt]);
}
const Jo = (t) => {
  const e = new Array(10), a = (n, i) => {
    if (tt(n)) {
      if (e.indexOf(n) >= 0)
        return;
      if (et(n))
        return n;
      if (!("toJSON" in n)) {
        e[i] = n;
        const o = Ie(n) ? [] : {};
        return nt(n, (s, r) => {
          const p = a(s, i + 1);
          !Ue(p) && (o[r] = p);
        }), e[i] = void 0, o;
      }
    }
    return n;
  };
  return a(t, 0);
}, Yo = ye("AsyncFunction"), Xo = (t) => t && (tt(t) || he(t)) && he(t.then) && he(t.catch), ys = ((t, e) => t ? setImmediate : e ? ((a, n) => (ke.addEventListener(
  "message",
  ({ source: i, data: o }) => {
    i === ke && o === a && n.length && n.shift()();
  },
  !1
), (i) => {
  n.push(i), ke.postMessage(a, "*");
}))(`axios@${Math.random()}`, []) : (a) => setTimeout(a))(typeof setImmediate == "function", he(ke.postMessage)), Zo = typeof queueMicrotask < "u" ? queueMicrotask.bind(ke) : typeof process < "u" && process.nextTick || ys, Qo = (t) => t != null && he(t[bt]), _ = {
  isArray: Ie,
  isArrayBuffer: hs,
  isBuffer: et,
  isFormData: Ro,
  isArrayBufferView: xo,
  isString: vo,
  isNumber: xs,
  isBoolean: bo,
  isObject: tt,
  isPlainObject: lt,
  isEmptyObject: go,
  isReadableStream: To,
  isRequest: Oo,
  isResponse: Co,
  isHeaders: Ao,
  isUndefined: Ue,
  isDate: yo,
  isFile: _o,
  isBlob: wo,
  isRegExp: $o,
  isFunction: he,
  isStream: So,
  isURLSearchParams: ko,
  isTypedArray: Uo,
  isFileList: Eo,
  forEach: nt,
  merge: Yn,
  extend: Po,
  trim: jo,
  stripBOM: Lo,
  inherits: Fo,
  toFlatObject: Bo,
  kindOf: gt,
  kindOfTest: ye,
  endsWith: No,
  toArray: qo,
  forEachEntry: Do,
  matchAll: Io,
  isHTMLForm: zo,
  hasOwnProperty: ga,
  hasOwnProp: ga,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors: gs,
  freezeMethods: Ho,
  toObjectSet: Go,
  toCamelCase: Mo,
  noop: Wo,
  toFiniteNumber: Vo,
  findKey: vs,
  global: ke,
  isContextDefined: bs,
  isSpecCompliantForm: Ko,
  toJSONObject: Jo,
  isAsyncFn: Yo,
  isThenable: Xo,
  setImmediate: ys,
  asap: Zo,
  isIterable: Qo
};
let F = class _s extends Error {
  static from(e, a, n, i, o, s) {
    const r = new _s(e.message, a || e.code, n, i, o);
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
F.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
F.ERR_BAD_OPTION = "ERR_BAD_OPTION";
F.ECONNABORTED = "ECONNABORTED";
F.ETIMEDOUT = "ETIMEDOUT";
F.ERR_NETWORK = "ERR_NETWORK";
F.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
F.ERR_DEPRECATED = "ERR_DEPRECATED";
F.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
F.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
F.ERR_CANCELED = "ERR_CANCELED";
F.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
F.ERR_INVALID_URL = "ERR_INVALID_URL";
function na(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
function ws(t) {
  if (Object.prototype.hasOwnProperty.call(t, "__esModule")) return t;
  var e = t.default;
  if (typeof e == "function") {
    var a = function n() {
      return this instanceof n ? Reflect.construct(e, arguments, this.constructor) : e.apply(this, arguments);
    };
    a.prototype = e.prototype;
  } else a = {};
  return Object.defineProperty(a, "__esModule", { value: !0 }), Object.keys(t).forEach(function(n) {
    var i = Object.getOwnPropertyDescriptor(t, n);
    Object.defineProperty(a, n, i.get ? i : {
      enumerable: !0,
      get: function() {
        return t[n];
      }
    });
  }), a;
}
var Ct, ya;
function er() {
  if (ya) return Ct;
  ya = 1;
  var t = se.Stream, e = Le;
  Ct = a;
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
  }, Ct;
}
var At, _a;
function tr() {
  if (_a) return At;
  _a = 1;
  var t = Le, e = se.Stream, a = er();
  At = n;
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
  }, At;
}
var jt = {};
const nr = {
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
var Pt, wa;
function ar() {
  return wa || (wa = 1, Pt = nr), Pt;
}
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var Ea;
function ir() {
  return Ea || (Ea = 1, (function(t) {
    var e = ar(), a = cs.extname, n = /^\s*([^;\s]*)(?:;|\s|$)/, i = /^text\//i;
    t.charset = o, t.charsets = { lookup: o }, t.contentType = s, t.extension = r, t.extensions = /* @__PURE__ */ Object.create(null), t.lookup = p, t.types = /* @__PURE__ */ Object.create(null), d(t.extensions, t.types);
    function o(c) {
      if (!c || typeof c != "string")
        return !1;
      var u = n.exec(c), l = u && e[u[1].toLowerCase()];
      return l && l.charset ? l.charset : u && i.test(u[1]) ? "UTF-8" : !1;
    }
    function s(c) {
      if (!c || typeof c != "string")
        return !1;
      var u = c.indexOf("/") === -1 ? t.lookup(c) : c;
      if (!u)
        return !1;
      if (u.indexOf("charset") === -1) {
        var l = t.charset(u);
        l && (u += "; charset=" + l.toLowerCase());
      }
      return u;
    }
    function r(c) {
      if (!c || typeof c != "string")
        return !1;
      var u = n.exec(c), l = u && t.extensions[u[1].toLowerCase()];
      return !l || !l.length ? !1 : l[0];
    }
    function p(c) {
      if (!c || typeof c != "string")
        return !1;
      var u = a("x." + c).toLowerCase().substr(1);
      return u && t.types[u] || !1;
    }
    function d(c, u) {
      var l = ["nginx", "apache", void 0, "iana"];
      Object.keys(e).forEach(function(x) {
        var f = e[x], h = f.extensions;
        if (!(!h || !h.length)) {
          c[x] = h;
          for (var v = 0; v < h.length; v++) {
            var w = h[v];
            if (u[w]) {
              var k = l.indexOf(e[u[w]].source), A = l.indexOf(f.source);
              if (u[w] !== "application/octet-stream" && (k > A || k === A && u[w].substr(0, 12) === "application/"))
                continue;
            }
            u[w] = x;
          }
        }
      });
    }
  })(jt)), jt;
}
var Lt, Sa;
function sr() {
  if (Sa) return Lt;
  Sa = 1, Lt = t;
  function t(e) {
    var a = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
    a ? a(e) : setTimeout(e, 0);
  }
  return Lt;
}
var Ft, Ra;
function Es() {
  if (Ra) return Ft;
  Ra = 1;
  var t = sr();
  Ft = e;
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
  return Ft;
}
var Bt, ka;
function Ss() {
  if (ka) return Bt;
  ka = 1, Bt = t;
  function t(a) {
    Object.keys(a.jobs).forEach(e.bind(a)), a.jobs = {};
  }
  function e(a) {
    typeof this.jobs[a] == "function" && this.jobs[a]();
  }
  return Bt;
}
var Nt, Ta;
function Rs() {
  if (Ta) return Nt;
  Ta = 1;
  var t = Es(), e = Ss();
  Nt = a;
  function a(i, o, s, r) {
    var p = s.keyedList ? s.keyedList[s.index] : s.index;
    s.jobs[p] = n(o, p, i[p], function(d, c) {
      p in s.jobs && (delete s.jobs[p], d ? e(s) : s.results[p] = c, r(d, s.results));
    });
  }
  function n(i, o, s, r) {
    var p;
    return i.length == 2 ? p = i(s, t(r)) : p = i(s, o, t(r)), p;
  }
  return Nt;
}
var qt, Oa;
function ks() {
  if (Oa) return qt;
  Oa = 1, qt = t;
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
  return qt;
}
var Ut, Ca;
function Ts() {
  if (Ca) return Ut;
  Ca = 1;
  var t = Ss(), e = Es();
  Ut = a;
  function a(n) {
    Object.keys(this.jobs).length && (this.index = this.size, t(this), e(n)(null, this.results));
  }
  return Ut;
}
var Dt, Aa;
function or() {
  if (Aa) return Dt;
  Aa = 1;
  var t = Rs(), e = ks(), a = Ts();
  Dt = n;
  function n(i, o, s) {
    for (var r = e(i); r.index < (r.keyedList || i).length; )
      t(i, o, r, function(p, d) {
        if (p) {
          s(p, d);
          return;
        }
        if (Object.keys(r.jobs).length === 0) {
          s(null, r.results);
          return;
        }
      }), r.index++;
    return a.bind(r, s);
  }
  return Dt;
}
var We = { exports: {} }, ja;
function Os() {
  if (ja) return We.exports;
  ja = 1;
  var t = Rs(), e = ks(), a = Ts();
  We.exports = n, We.exports.ascending = i, We.exports.descending = o;
  function n(s, r, p, d) {
    var c = e(s, p);
    return t(s, r, c, function u(l, E) {
      if (l) {
        d(l, E);
        return;
      }
      if (c.index++, c.index < (c.keyedList || s).length) {
        t(s, r, c, u);
        return;
      }
      d(null, c.results);
    }), a.bind(c, d);
  }
  function i(s, r) {
    return s < r ? -1 : s > r ? 1 : 0;
  }
  function o(s, r) {
    return -1 * i(s, r);
  }
  return We.exports;
}
var It, Pa;
function rr() {
  if (Pa) return It;
  Pa = 1;
  var t = Os();
  It = e;
  function e(a, n, i) {
    return t(a, n, null, i);
  }
  return It;
}
var zt, La;
function cr() {
  return La || (La = 1, zt = {
    parallel: or(),
    serial: rr(),
    serialOrdered: Os()
  }), zt;
}
var Mt, Fa;
function Cs() {
  return Fa || (Fa = 1, Mt = Object), Mt;
}
var $t, Ba;
function pr() {
  return Ba || (Ba = 1, $t = Error), $t;
}
var Ht, Na;
function lr() {
  return Na || (Na = 1, Ht = EvalError), Ht;
}
var Gt, qa;
function ur() {
  return qa || (qa = 1, Gt = RangeError), Gt;
}
var Wt, Ua;
function dr() {
  return Ua || (Ua = 1, Wt = ReferenceError), Wt;
}
var Vt, Da;
function mr() {
  return Da || (Da = 1, Vt = SyntaxError), Vt;
}
var Kt, Ia;
function aa() {
  return Ia || (Ia = 1, Kt = TypeError), Kt;
}
var Jt, za;
function fr() {
  return za || (za = 1, Jt = URIError), Jt;
}
var Yt, Ma;
function hr() {
  return Ma || (Ma = 1, Yt = Math.abs), Yt;
}
var Xt, $a;
function xr() {
  return $a || ($a = 1, Xt = Math.floor), Xt;
}
var Zt, Ha;
function vr() {
  return Ha || (Ha = 1, Zt = Math.max), Zt;
}
var Qt, Ga;
function br() {
  return Ga || (Ga = 1, Qt = Math.min), Qt;
}
var en, Wa;
function gr() {
  return Wa || (Wa = 1, en = Math.pow), en;
}
var tn, Va;
function yr() {
  return Va || (Va = 1, tn = Math.round), tn;
}
var nn, Ka;
function _r() {
  return Ka || (Ka = 1, nn = Number.isNaN || function(e) {
    return e !== e;
  }), nn;
}
var an, Ja;
function wr() {
  if (Ja) return an;
  Ja = 1;
  var t = /* @__PURE__ */ _r();
  return an = function(a) {
    return t(a) || a === 0 ? a : a < 0 ? -1 : 1;
  }, an;
}
var sn, Ya;
function Er() {
  return Ya || (Ya = 1, sn = Object.getOwnPropertyDescriptor), sn;
}
var on, Xa;
function As() {
  if (Xa) return on;
  Xa = 1;
  var t = /* @__PURE__ */ Er();
  if (t)
    try {
      t([], "length");
    } catch {
      t = null;
    }
  return on = t, on;
}
var rn, Za;
function Sr() {
  if (Za) return rn;
  Za = 1;
  var t = Object.defineProperty || !1;
  if (t)
    try {
      t({}, "a", { value: 1 });
    } catch {
      t = !1;
    }
  return rn = t, rn;
}
var cn, Qa;
function js() {
  return Qa || (Qa = 1, cn = function() {
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
  }), cn;
}
var pn, ei;
function Rr() {
  if (ei) return pn;
  ei = 1;
  var t = typeof Symbol < "u" && Symbol, e = js();
  return pn = function() {
    return typeof t != "function" || typeof Symbol != "function" || typeof t("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? !1 : e();
  }, pn;
}
var ln, ti;
function Ps() {
  return ti || (ti = 1, ln = typeof Reflect < "u" && Reflect.getPrototypeOf || null), ln;
}
var un, ni;
function Ls() {
  if (ni) return un;
  ni = 1;
  var t = /* @__PURE__ */ Cs();
  return un = t.getPrototypeOf || null, un;
}
var dn, ai;
function kr() {
  if (ai) return dn;
  ai = 1;
  var t = "Function.prototype.bind called on incompatible ", e = Object.prototype.toString, a = Math.max, n = "[object Function]", i = function(p, d) {
    for (var c = [], u = 0; u < p.length; u += 1)
      c[u] = p[u];
    for (var l = 0; l < d.length; l += 1)
      c[l + p.length] = d[l];
    return c;
  }, o = function(p, d) {
    for (var c = [], u = d, l = 0; u < p.length; u += 1, l += 1)
      c[l] = p[u];
    return c;
  }, s = function(r, p) {
    for (var d = "", c = 0; c < r.length; c += 1)
      d += r[c], c + 1 < r.length && (d += p);
    return d;
  };
  return dn = function(p) {
    var d = this;
    if (typeof d != "function" || e.apply(d) !== n)
      throw new TypeError(t + d);
    for (var c = o(arguments, 1), u, l = function() {
      if (this instanceof u) {
        var v = d.apply(
          this,
          i(c, arguments)
        );
        return Object(v) === v ? v : this;
      }
      return d.apply(
        p,
        i(c, arguments)
      );
    }, E = a(0, d.length - c.length), x = [], f = 0; f < E; f++)
      x[f] = "$" + f;
    if (u = Function("binder", "return function (" + s(x, ",") + "){ return binder.apply(this,arguments); }")(l), d.prototype) {
      var h = function() {
      };
      h.prototype = d.prototype, u.prototype = new h(), h.prototype = null;
    }
    return u;
  }, dn;
}
var mn, ii;
function _t() {
  if (ii) return mn;
  ii = 1;
  var t = kr();
  return mn = Function.prototype.bind || t, mn;
}
var fn, si;
function ia() {
  return si || (si = 1, fn = Function.prototype.call), fn;
}
var hn, oi;
function Fs() {
  return oi || (oi = 1, hn = Function.prototype.apply), hn;
}
var xn, ri;
function Tr() {
  return ri || (ri = 1, xn = typeof Reflect < "u" && Reflect && Reflect.apply), xn;
}
var vn, ci;
function Or() {
  if (ci) return vn;
  ci = 1;
  var t = _t(), e = Fs(), a = ia(), n = Tr();
  return vn = n || t.call(a, e), vn;
}
var bn, pi;
function Cr() {
  if (pi) return bn;
  pi = 1;
  var t = _t(), e = /* @__PURE__ */ aa(), a = ia(), n = Or();
  return bn = function(o) {
    if (o.length < 1 || typeof o[0] != "function")
      throw new e("a function is required");
    return n(t, a, o);
  }, bn;
}
var gn, li;
function Ar() {
  if (li) return gn;
  li = 1;
  var t = Cr(), e = /* @__PURE__ */ As(), a;
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
  return gn = n && typeof n.get == "function" ? t([n.get]) : typeof o == "function" ? (
    /** @type {import('./get')} */
    function(r) {
      return o(r == null ? r : i(r));
    }
  ) : !1, gn;
}
var yn, ui;
function jr() {
  if (ui) return yn;
  ui = 1;
  var t = Ps(), e = Ls(), a = /* @__PURE__ */ Ar();
  return yn = t ? function(i) {
    return t(i);
  } : e ? function(i) {
    if (!i || typeof i != "object" && typeof i != "function")
      throw new TypeError("getProto: not an object");
    return e(i);
  } : a ? function(i) {
    return a(i);
  } : null, yn;
}
var _n, di;
function sa() {
  if (di) return _n;
  di = 1;
  var t = Function.prototype.call, e = Object.prototype.hasOwnProperty, a = _t();
  return _n = a.call(t, e), _n;
}
var wn, mi;
function Pr() {
  if (mi) return wn;
  mi = 1;
  var t, e = /* @__PURE__ */ Cs(), a = /* @__PURE__ */ pr(), n = /* @__PURE__ */ lr(), i = /* @__PURE__ */ ur(), o = /* @__PURE__ */ dr(), s = /* @__PURE__ */ mr(), r = /* @__PURE__ */ aa(), p = /* @__PURE__ */ fr(), d = /* @__PURE__ */ hr(), c = /* @__PURE__ */ xr(), u = /* @__PURE__ */ vr(), l = /* @__PURE__ */ br(), E = /* @__PURE__ */ gr(), x = /* @__PURE__ */ yr(), f = /* @__PURE__ */ wr(), h = Function, v = function(de) {
    try {
      return h('"use strict"; return (' + de + ").constructor;")();
    } catch {
    }
  }, w = /* @__PURE__ */ As(), k = /* @__PURE__ */ Sr(), A = function() {
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
  })() : A, m = Rr()(), y = jr(), S = Ls(), P = Ps(), L = Fs(), I = ia(), D = {}, H = typeof Uint8Array > "u" || !y ? t : y(Uint8Array), U = {
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
    "%TypedArray%": H,
    "%TypeError%": r,
    "%Uint8Array%": typeof Uint8Array > "u" ? t : Uint8Array,
    "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? t : Uint8ClampedArray,
    "%Uint16Array%": typeof Uint16Array > "u" ? t : Uint16Array,
    "%Uint32Array%": typeof Uint32Array > "u" ? t : Uint32Array,
    "%URIError%": p,
    "%WeakMap%": typeof WeakMap > "u" ? t : WeakMap,
    "%WeakRef%": typeof WeakRef > "u" ? t : WeakRef,
    "%WeakSet%": typeof WeakSet > "u" ? t : WeakSet,
    "%Function.prototype.call%": I,
    "%Function.prototype.apply%": L,
    "%Object.defineProperty%": k,
    "%Object.getPrototypeOf%": S,
    "%Math.abs%": d,
    "%Math.floor%": c,
    "%Math.max%": u,
    "%Math.min%": l,
    "%Math.pow%": E,
    "%Math.round%": x,
    "%Math.sign%": f,
    "%Reflect.getPrototypeOf%": P
  };
  if (y)
    try {
      null.error;
    } catch (de) {
      var ee = y(y(de));
      U["%Error.prototype%"] = ee;
    }
  var b = function de(G) {
    var oe;
    if (G === "%AsyncFunction%")
      oe = v("async function () {}");
    else if (G === "%GeneratorFunction%")
      oe = v("function* () {}");
    else if (G === "%AsyncGeneratorFunction%")
      oe = v("async function* () {}");
    else if (G === "%AsyncGenerator%") {
      var te = de("%AsyncGeneratorFunction%");
      te && (oe = te.prototype);
    } else if (G === "%AsyncIteratorPrototype%") {
      var re = de("%AsyncGenerator%");
      re && y && (oe = y(re.prototype));
    }
    return U[G] = oe, oe;
  }, T = {
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
  }, C = _t(), z = /* @__PURE__ */ sa(), N = C.call(I, Array.prototype.concat), j = C.call(L, Array.prototype.splice), M = C.call(I, String.prototype.replace), Z = C.call(I, String.prototype.slice), V = C.call(I, RegExp.prototype.exec), K = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, W = /\\(\\)?/g, Q = function(G) {
    var oe = Z(G, 0, 1), te = Z(G, -1);
    if (oe === "%" && te !== "%")
      throw new s("invalid intrinsic syntax, expected closing `%`");
    if (te === "%" && oe !== "%")
      throw new s("invalid intrinsic syntax, expected opening `%`");
    var re = [];
    return M(G, K, function(me, we, pe, R) {
      re[re.length] = pe ? M(R, W, "$1") : we || me;
    }), re;
  }, xe = function(G, oe) {
    var te = G, re;
    if (z(T, te) && (re = T[te], te = "%" + re[0] + "%"), z(U, te)) {
      var me = U[te];
      if (me === D && (me = b(te)), typeof me > "u" && !oe)
        throw new r("intrinsic " + G + " exists, but is not available. Please file an issue!");
      return {
        alias: re,
        name: te,
        value: me
      };
    }
    throw new s("intrinsic " + G + " does not exist!");
  };
  return wn = function(G, oe) {
    if (typeof G != "string" || G.length === 0)
      throw new r("intrinsic name must be a non-empty string");
    if (arguments.length > 1 && typeof oe != "boolean")
      throw new r('"allowMissing" argument must be a boolean');
    if (V(/^%?[^%]*%?$/, G) === null)
      throw new s("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
    var te = Q(G), re = te.length > 0 ? te[0] : "", me = xe("%" + re + "%", oe), we = me.name, pe = me.value, R = !1, O = me.alias;
    O && (re = O[0], j(te, N([0, 1], O)));
    for (var q = 1, $ = !0; q < te.length; q += 1) {
      var B = te[q], J = Z(B, 0, 1), be = Z(B, -1);
      if ((J === '"' || J === "'" || J === "`" || be === '"' || be === "'" || be === "`") && J !== be)
        throw new s("property names with quotes must have matching quotes");
      if ((B === "constructor" || !$) && (R = !0), re += "." + B, we = "%" + re + "%", z(U, we))
        pe = U[we];
      else if (pe != null) {
        if (!(B in pe)) {
          if (!oe)
            throw new r("base intrinsic for " + G + " exists, but the property is not available.");
          return;
        }
        if (w && q + 1 >= te.length) {
          var ge = w(pe, B);
          $ = !!ge, $ && "get" in ge && !("originalValue" in ge.get) ? pe = ge.get : pe = pe[B];
        } else
          $ = z(pe, B), pe = pe[B];
        $ && !R && (U[we] = pe);
      }
    }
    return pe;
  }, wn;
}
var En, fi;
function Lr() {
  if (fi) return En;
  fi = 1;
  var t = js();
  return En = function() {
    return t() && !!Symbol.toStringTag;
  }, En;
}
var Sn, hi;
function Fr() {
  if (hi) return Sn;
  hi = 1;
  var t = /* @__PURE__ */ Pr(), e = t("%Object.defineProperty%", !0), a = Lr()(), n = /* @__PURE__ */ sa(), i = /* @__PURE__ */ aa(), o = a ? Symbol.toStringTag : null;
  return Sn = function(r, p) {
    var d = arguments.length > 2 && !!arguments[2] && arguments[2].force, c = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
    if (typeof d < "u" && typeof d != "boolean" || typeof c < "u" && typeof c != "boolean")
      throw new i("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
    o && (d || !n(r, o)) && (e ? e(r, o, {
      configurable: !c,
      enumerable: !1,
      value: p,
      writable: !1
    }) : r[o] = p);
  }, Sn;
}
var Rn, xi;
function Br() {
  return xi || (xi = 1, Rn = function(t, e) {
    return Object.keys(e).forEach(function(a) {
      t[a] = t[a] || e[a];
    }), t;
  }), Rn;
}
var kn, vi;
function Nr() {
  if (vi) return kn;
  vi = 1;
  var t = tr(), e = Le, a = cs, n = Ze, i = vt, o = Xe.parse, s = Jn, r = se.Stream, p = Qe, d = ir(), c = cr(), u = /* @__PURE__ */ Fr(), l = /* @__PURE__ */ sa(), E = Br();
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
    return !v && f && f.name && (v = d.lookup(f.name)), !v && f && f.path && (v = d.lookup(f.path)), !v && f && f.readable && l(f, "httpVersion") && (v = f.headers["content-type"]), !v && (h.filepath || h.filename) && (v = d.lookup(h.filepath || h.filename)), !v && f && typeof f == "object" && (v = x.DEFAULT_CONTENT_TYPE), v;
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
    this._boundary = "--------------------------" + p.randomBytes(12).toString("hex");
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
    c.parallel(this._valuesToMeasure, this._lengthRetriever, function(v, w) {
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
        var m, y = function(S, P) {
          return v.removeListener("error", y), v.removeListener("response", m), h.call(this, S, P);
        };
        m = y.bind(this, null), v.on("error", y), v.on("response", m);
      }
    }).bind(this)), v;
  }, x.prototype._error = function(f) {
    this.error || (this.error = f, this.pause(), this.emit("error", f));
  }, x.prototype.toString = function() {
    return "[object FormData]";
  }, u(x.prototype, "FormData"), kn = x, kn;
}
var qr = Nr();
const Bs = /* @__PURE__ */ na(qr);
function Xn(t) {
  return _.isPlainObject(t) || _.isArray(t);
}
function Ns(t) {
  return _.endsWith(t, "[]") ? t.slice(0, -2) : t;
}
function bi(t, e, a) {
  return t ? t.concat(e).map(function(i, o) {
    return i = Ns(i), !a && o ? "[" + i + "]" : i;
  }).join(a ? "." : "") : e;
}
function Ur(t) {
  return _.isArray(t) && !t.some(Xn);
}
const Dr = _.toFlatObject(_, {}, null, function(e) {
  return /^is[A-Z]/.test(e);
});
function wt(t, e, a) {
  if (!_.isObject(t))
    throw new TypeError("target must be an object");
  e = e || new (Bs || FormData)(), a = _.toFlatObject(a, {
    metaTokens: !0,
    dots: !1,
    indexes: !1
  }, !1, function(f, h) {
    return !_.isUndefined(h[f]);
  });
  const n = a.metaTokens, i = a.visitor || c, o = a.dots, s = a.indexes, p = (a.Blob || typeof Blob < "u" && Blob) && _.isSpecCompliantForm(e);
  if (!_.isFunction(i))
    throw new TypeError("visitor must be a function");
  function d(x) {
    if (x === null) return "";
    if (_.isDate(x))
      return x.toISOString();
    if (_.isBoolean(x))
      return x.toString();
    if (!p && _.isBlob(x))
      throw new F("Blob is not supported. Use a Buffer instead.");
    return _.isArrayBuffer(x) || _.isTypedArray(x) ? p && typeof Blob == "function" ? new Blob([x]) : Buffer.from(x) : x;
  }
  function c(x, f, h) {
    let v = x;
    if (x && !h && typeof x == "object") {
      if (_.endsWith(f, "{}"))
        f = n ? f : f.slice(0, -2), x = JSON.stringify(x);
      else if (_.isArray(x) && Ur(x) || (_.isFileList(x) || _.endsWith(f, "[]")) && (v = _.toArray(x)))
        return f = Ns(f), v.forEach(function(k, A) {
          !(_.isUndefined(k) || k === null) && e.append(
            // eslint-disable-next-line no-nested-ternary
            s === !0 ? bi([f], A, o) : s === null ? f : f + "[]",
            d(k)
          );
        }), !1;
    }
    return Xn(x) ? !0 : (e.append(bi(h, f, o), d(x)), !1);
  }
  const u = [], l = Object.assign(Dr, {
    defaultVisitor: c,
    convertValue: d,
    isVisitable: Xn
  });
  function E(x, f) {
    if (!_.isUndefined(x)) {
      if (u.indexOf(x) !== -1)
        throw Error("Circular reference detected in " + f.join("."));
      u.push(x), _.forEach(x, function(v, w) {
        (!(_.isUndefined(v) || v === null) && i.call(
          e,
          v,
          _.isString(w) ? w.trim() : w,
          f,
          l
        )) === !0 && E(v, f ? f.concat(w) : [w]);
      }), u.pop();
    }
  }
  if (!_.isObject(t))
    throw new TypeError("data must be an object");
  return E(t), e;
}
function gi(t) {
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
function qs(t, e) {
  this._pairs = [], t && wt(t, this, e);
}
const Us = qs.prototype;
Us.append = function(e, a) {
  this._pairs.push([e, a]);
};
Us.toString = function(e) {
  const a = e ? function(n) {
    return e.call(this, n, gi);
  } : gi;
  return this._pairs.map(function(i) {
    return a(i[0]) + "=" + a(i[1]);
  }, "").join("&");
};
function Ir(t) {
  return encodeURIComponent(t).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function oa(t, e, a) {
  if (!e)
    return t;
  const n = a && a.encode || Ir, i = _.isFunction(a) ? {
    serialize: a
  } : a, o = i && i.serialize;
  let s;
  if (o ? s = o(e, i) : s = _.isURLSearchParams(e) ? e.toString() : new qs(e, i).toString(n), s) {
    const r = t.indexOf("#");
    r !== -1 && (t = t.slice(0, r)), t += (t.indexOf("?") === -1 ? "?" : "&") + s;
  }
  return t;
}
class yi {
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
const Et = {
  silentJSONParsing: !0,
  forcedJSONParsing: !0,
  clarifyTimeoutError: !1,
  legacyInterceptorReqResOrdering: !0
}, zr = Xe.URLSearchParams, Tn = "abcdefghijklmnopqrstuvwxyz", _i = "0123456789", Ds = {
  DIGIT: _i,
  ALPHA: Tn,
  ALPHA_DIGIT: Tn + Tn.toUpperCase() + _i
}, Mr = (t = 16, e = Ds.ALPHA_DIGIT) => {
  let a = "";
  const { length: n } = e, i = new Uint32Array(t);
  Qe.randomFillSync(i);
  for (let o = 0; o < t; o++)
    a += e[i[o] % n];
  return a;
}, $r = {
  isNode: !0,
  classes: {
    URLSearchParams: zr,
    FormData: Bs,
    Blob: typeof Blob < "u" && Blob || null
  },
  ALPHABET: Ds,
  generateString: Mr,
  protocols: ["http", "https", "file", "data"]
}, ra = typeof window < "u" && typeof document < "u", Zn = typeof navigator == "object" && navigator || void 0, Hr = ra && (!Zn || ["ReactNative", "NativeScript", "NS"].indexOf(Zn.product) < 0), Gr = typeof WorkerGlobalScope < "u" && // eslint-disable-next-line no-undef
self instanceof WorkerGlobalScope && typeof self.importScripts == "function", Wr = ra && window.location.href || "http://localhost", Vr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv: ra,
  hasStandardBrowserEnv: Hr,
  hasStandardBrowserWebWorkerEnv: Gr,
  navigator: Zn,
  origin: Wr
}, Symbol.toStringTag, { value: "Module" })), ne = {
  ...Vr,
  ...$r
};
function Kr(t, e) {
  return wt(t, new ne.classes.URLSearchParams(), {
    visitor: function(a, n, i, o) {
      return ne.isNode && _.isBuffer(a) ? (this.append(n, a.toString("base64")), !1) : o.defaultVisitor.apply(this, arguments);
    },
    ...e
  });
}
function Jr(t) {
  return _.matchAll(/\w+|\[(\w*)]/g, t).map((e) => e[0] === "[]" ? "" : e[1] || e[0]);
}
function Yr(t) {
  const e = {}, a = Object.keys(t);
  let n;
  const i = a.length;
  let o;
  for (n = 0; n < i; n++)
    o = a[n], e[o] = t[o];
  return e;
}
function Is(t) {
  function e(a, n, i, o) {
    let s = a[o++];
    if (s === "__proto__") return !0;
    const r = Number.isFinite(+s), p = o >= a.length;
    return s = !s && _.isArray(i) ? i.length : s, p ? (_.hasOwnProp(i, s) ? i[s] = [i[s], n] : i[s] = n, !r) : ((!i[s] || !_.isObject(i[s])) && (i[s] = []), e(a, n, i[s], o) && _.isArray(i[s]) && (i[s] = Yr(i[s])), !r);
  }
  if (_.isFormData(t) && _.isFunction(t.entries)) {
    const a = {};
    return _.forEachEntry(t, (n, i) => {
      e(Jr(n), i, a, 0);
    }), a;
  }
  return null;
}
function Xr(t, e, a) {
  if (_.isString(t))
    try {
      return (e || JSON.parse)(t), _.trim(t);
    } catch (n) {
      if (n.name !== "SyntaxError")
        throw n;
    }
  return (a || JSON.stringify)(t);
}
const at = {
  transitional: Et,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function(e, a) {
    const n = a.getContentType() || "", i = n.indexOf("application/json") > -1, o = _.isObject(e);
    if (o && _.isHTMLForm(e) && (e = new FormData(e)), _.isFormData(e))
      return i ? JSON.stringify(Is(e)) : e;
    if (_.isArrayBuffer(e) || _.isBuffer(e) || _.isStream(e) || _.isFile(e) || _.isBlob(e) || _.isReadableStream(e))
      return e;
    if (_.isArrayBufferView(e))
      return e.buffer;
    if (_.isURLSearchParams(e))
      return a.setContentType("application/x-www-form-urlencoded;charset=utf-8", !1), e.toString();
    let r;
    if (o) {
      if (n.indexOf("application/x-www-form-urlencoded") > -1)
        return Kr(e, this.formSerializer).toString();
      if ((r = _.isFileList(e)) || n.indexOf("multipart/form-data") > -1) {
        const p = this.env && this.env.FormData;
        return wt(
          r ? { "files[]": e } : e,
          p && new p(),
          this.formSerializer
        );
      }
    }
    return o || i ? (a.setContentType("application/json", !1), Xr(e)) : e;
  }],
  transformResponse: [function(e) {
    const a = this.transitional || at.transitional, n = a && a.forcedJSONParsing, i = this.responseType === "json";
    if (_.isResponse(e) || _.isReadableStream(e))
      return e;
    if (e && _.isString(e) && (n && !this.responseType || i)) {
      const s = !(a && a.silentJSONParsing) && i;
      try {
        return JSON.parse(e, this.parseReviver);
      } catch (r) {
        if (s)
          throw r.name === "SyntaxError" ? F.from(r, F.ERR_BAD_RESPONSE, this, null, this.response) : r;
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
    FormData: ne.classes.FormData,
    Blob: ne.classes.Blob
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
  at.headers[t] = {};
});
const Zr = _.toObjectSet([
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
]), Qr = (t) => {
  const e = {};
  let a, n, i;
  return t && t.split(`
`).forEach(function(s) {
    i = s.indexOf(":"), a = s.substring(0, i).trim().toLowerCase(), n = s.substring(i + 1).trim(), !(!a || e[a] && Zr[a]) && (a === "set-cookie" ? e[a] ? e[a].push(n) : e[a] = [n] : e[a] = e[a] ? e[a] + ", " + n : n);
  }), e;
}, wi = Symbol("internals");
function Ve(t) {
  return t && String(t).trim().toLowerCase();
}
function ut(t) {
  return t === !1 || t == null ? t : _.isArray(t) ? t.map(ut) : String(t);
}
function ec(t) {
  const e = /* @__PURE__ */ Object.create(null), a = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let n;
  for (; n = a.exec(t); )
    e[n[1]] = n[2];
  return e;
}
const tc = (t) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(t.trim());
function On(t, e, a, n, i) {
  if (_.isFunction(n))
    return n.call(this, e, a);
  if (i && (e = a), !!_.isString(e)) {
    if (_.isString(n))
      return e.indexOf(n) !== -1;
    if (_.isRegExp(n))
      return n.test(e);
  }
}
function nc(t) {
  return t.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (e, a, n) => a.toUpperCase() + n);
}
function ac(t, e) {
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
let ue = class {
  constructor(e) {
    e && this.set(e);
  }
  set(e, a, n) {
    const i = this;
    function o(r, p, d) {
      const c = Ve(p);
      if (!c)
        throw new Error("header name must be a non-empty string");
      const u = _.findKey(i, c);
      (!u || i[u] === void 0 || d === !0 || d === void 0 && i[u] !== !1) && (i[u || p] = ut(r));
    }
    const s = (r, p) => _.forEach(r, (d, c) => o(d, c, p));
    if (_.isPlainObject(e) || e instanceof this.constructor)
      s(e, a);
    else if (_.isString(e) && (e = e.trim()) && !tc(e))
      s(Qr(e), a);
    else if (_.isObject(e) && _.isIterable(e)) {
      let r = {}, p, d;
      for (const c of e) {
        if (!_.isArray(c))
          throw TypeError("Object iterator must return a key-value pair");
        r[d = c[0]] = (p = r[d]) ? _.isArray(p) ? [...p, c[1]] : [p, c[1]] : c[1];
      }
      s(r, a);
    } else
      e != null && o(a, e, n);
    return this;
  }
  get(e, a) {
    if (e = Ve(e), e) {
      const n = _.findKey(this, e);
      if (n) {
        const i = this[n];
        if (!a)
          return i;
        if (a === !0)
          return ec(i);
        if (_.isFunction(a))
          return a.call(this, i, n);
        if (_.isRegExp(a))
          return a.exec(i);
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(e, a) {
    if (e = Ve(e), e) {
      const n = _.findKey(this, e);
      return !!(n && this[n] !== void 0 && (!a || On(this, this[n], n, a)));
    }
    return !1;
  }
  delete(e, a) {
    const n = this;
    let i = !1;
    function o(s) {
      if (s = Ve(s), s) {
        const r = _.findKey(n, s);
        r && (!a || On(n, n[r], r, a)) && (delete n[r], i = !0);
      }
    }
    return _.isArray(e) ? e.forEach(o) : o(e), i;
  }
  clear(e) {
    const a = Object.keys(this);
    let n = a.length, i = !1;
    for (; n--; ) {
      const o = a[n];
      (!e || On(this, this[o], o, e, !0)) && (delete this[o], i = !0);
    }
    return i;
  }
  normalize(e) {
    const a = this, n = {};
    return _.forEach(this, (i, o) => {
      const s = _.findKey(n, o);
      if (s) {
        a[s] = ut(i), delete a[o];
        return;
      }
      const r = e ? nc(o) : String(o).trim();
      r !== o && delete a[o], a[r] = ut(i), n[r] = !0;
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
    const n = (this[wi] = this[wi] = {
      accessors: {}
    }).accessors, i = this.prototype;
    function o(s) {
      const r = Ve(s);
      n[r] || (ac(i, s), n[r] = !0);
    }
    return _.isArray(e) ? e.forEach(o) : o(e), this;
  }
};
ue.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
_.reduceDescriptors(ue.prototype, ({ value: t }, e) => {
  let a = e[0].toUpperCase() + e.slice(1);
  return {
    get: () => t,
    set(n) {
      this[a] = n;
    }
  };
});
_.freezeMethods(ue);
function Cn(t, e) {
  const a = this || at, n = e || a, i = ue.from(n.headers);
  let o = n.data;
  return _.forEach(t, function(r) {
    o = r.call(a, o, i.normalize(), e ? e.status : void 0);
  }), i.normalize(), o;
}
function zs(t) {
  return !!(t && t.__CANCEL__);
}
let Ae = class extends F {
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
    super(e ?? "canceled", F.ERR_CANCELED, a, n), this.name = "CanceledError", this.__CANCEL__ = !0;
  }
};
function Ne(t, e, a) {
  const n = a.config.validateStatus;
  !a.status || !n || n(a.status) ? t(a) : e(new F(
    "Request failed with status code " + a.status,
    [F.ERR_BAD_REQUEST, F.ERR_BAD_RESPONSE][Math.floor(a.status / 100) - 4],
    a.config,
    a.request,
    a
  ));
}
function ic(t) {
  return typeof t != "string" ? !1 : /^([a-z][a-z\d+\-.]*:)?\/\//i.test(t);
}
function sc(t, e) {
  return e ? t.replace(/\/?\/$/, "") + "/" + e.replace(/^\/+/, "") : t;
}
function ca(t, e, a) {
  let n = !ic(e);
  return t && (n || a == !1) ? sc(t, e) : e;
}
var An = {}, Ei;
function oc() {
  if (Ei) return An;
  Ei = 1;
  var t = Xe.parse, e = {
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
    var r = typeof s == "string" ? t(s) : s || {}, p = r.protocol, d = r.host, c = r.port;
    if (typeof d != "string" || !d || typeof p != "string" || (p = p.split(":", 1)[0], d = d.replace(/:\d*$/, ""), c = parseInt(c) || e[p] || 0, !i(d, c)))
      return "";
    var u = o("npm_config_" + p + "_proxy") || o(p + "_proxy") || o("npm_config_proxy") || o("all_proxy");
    return u && u.indexOf("://") === -1 && (u = p + "://" + u), u;
  }
  function i(s, r) {
    var p = (o("npm_config_no_proxy") || o("no_proxy")).toLowerCase();
    return p ? p === "*" ? !1 : p.split(/[,\s]/).every(function(d) {
      if (!d)
        return !0;
      var c = d.match(/^(.+):(\d+)$/), u = c ? c[1] : d, l = c ? parseInt(c[2]) : 0;
      return l && l !== r ? !0 : /^[.*]/.test(u) ? (u.charAt(0) === "*" && (u = u.slice(1)), !a.call(s, u)) : s !== u;
    }) : !0;
  }
  function o(s) {
    return process.env[s.toLowerCase()] || process.env[s.toUpperCase()] || "";
  }
  return An.getProxyForUrl = n, An;
}
var rc = oc();
const cc = /* @__PURE__ */ na(rc);
var st = { exports: {} }, ot = { exports: {} }, rt = { exports: {} }, jn, Si;
function pc() {
  if (Si) return jn;
  Si = 1;
  var t = 1e3, e = t * 60, a = e * 60, n = a * 24, i = n * 7, o = n * 365.25;
  jn = function(c, u) {
    u = u || {};
    var l = typeof c;
    if (l === "string" && c.length > 0)
      return s(c);
    if (l === "number" && isFinite(c))
      return u.long ? p(c) : r(c);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(c)
    );
  };
  function s(c) {
    if (c = String(c), !(c.length > 100)) {
      var u = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        c
      );
      if (u) {
        var l = parseFloat(u[1]), E = (u[2] || "ms").toLowerCase();
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
  function r(c) {
    var u = Math.abs(c);
    return u >= n ? Math.round(c / n) + "d" : u >= a ? Math.round(c / a) + "h" : u >= e ? Math.round(c / e) + "m" : u >= t ? Math.round(c / t) + "s" : c + "ms";
  }
  function p(c) {
    var u = Math.abs(c);
    return u >= n ? d(c, u, n, "day") : u >= a ? d(c, u, a, "hour") : u >= e ? d(c, u, e, "minute") : u >= t ? d(c, u, t, "second") : c + " ms";
  }
  function d(c, u, l, E) {
    var x = u >= l * 1.5;
    return Math.round(c / l) + " " + E + (x ? "s" : "");
  }
  return jn;
}
var Pn, Ri;
function Ms() {
  if (Ri) return Pn;
  Ri = 1;
  function t(e) {
    n.debug = n, n.default = n, n.coerce = d, n.disable = r, n.enable = o, n.enabled = p, n.humanize = pc(), n.destroy = c, Object.keys(e).forEach((u) => {
      n[u] = e[u];
    }), n.names = [], n.skips = [], n.formatters = {};
    function a(u) {
      let l = 0;
      for (let E = 0; E < u.length; E++)
        l = (l << 5) - l + u.charCodeAt(E), l |= 0;
      return n.colors[Math.abs(l) % n.colors.length];
    }
    n.selectColor = a;
    function n(u) {
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
          const P = n.formatters[S];
          if (typeof P == "function") {
            const L = v[g];
            y = P.call(w, L), v.splice(g, 1), g--;
          }
          return y;
        }), n.formatArgs.call(w, v), (w.log || n.log).apply(w, v);
      }
      return h.namespace = u, h.useColors = n.useColors(), h.color = n.selectColor(u), h.extend = i, h.destroy = n.destroy, Object.defineProperty(h, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => E !== null ? E : (x !== n.namespaces && (x = n.namespaces, f = n.enabled(u)), f),
        set: (v) => {
          E = v;
        }
      }), typeof n.init == "function" && n.init(h), h;
    }
    function i(u, l) {
      const E = n(this.namespace + (typeof l > "u" ? ":" : l) + u);
      return E.log = this.log, E;
    }
    function o(u) {
      n.save(u), n.namespaces = u, n.names = [], n.skips = [];
      const l = (typeof u == "string" ? u : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const E of l)
        E[0] === "-" ? n.skips.push(E.slice(1)) : n.names.push(E);
    }
    function s(u, l) {
      let E = 0, x = 0, f = -1, h = 0;
      for (; E < u.length; )
        if (x < l.length && (l[x] === u[E] || l[x] === "*"))
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
      const u = [
        ...n.names,
        ...n.skips.map((l) => "-" + l)
      ].join(",");
      return n.enable(""), u;
    }
    function p(u) {
      for (const l of n.skips)
        if (s(u, l))
          return !1;
      for (const l of n.names)
        if (s(u, l))
          return !0;
      return !1;
    }
    function d(u) {
      return u instanceof Error ? u.stack || u.message : u;
    }
    function c() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return n.enable(n.load()), n;
  }
  return Pn = t, Pn;
}
var ki;
function lc() {
  return ki || (ki = 1, (function(t, e) {
    e.formatArgs = n, e.save = i, e.load = o, e.useColors = a, e.storage = s(), e.destroy = /* @__PURE__ */ (() => {
      let p = !1;
      return () => {
        p || (p = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
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
      let p;
      return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator < "u" && navigator.userAgent && (p = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(p[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function n(p) {
      if (p[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + p[0] + (this.useColors ? "%c " : " ") + "+" + t.exports.humanize(this.diff), !this.useColors)
        return;
      const d = "color: " + this.color;
      p.splice(1, 0, d, "color: inherit");
      let c = 0, u = 0;
      p[0].replace(/%[a-zA-Z%]/g, (l) => {
        l !== "%%" && (c++, l === "%c" && (u = c));
      }), p.splice(u, 0, d);
    }
    e.log = console.debug || console.log || (() => {
    });
    function i(p) {
      try {
        p ? e.storage.setItem("debug", p) : e.storage.removeItem("debug");
      } catch {
      }
    }
    function o() {
      let p;
      try {
        p = e.storage.getItem("debug") || e.storage.getItem("DEBUG");
      } catch {
      }
      return !p && typeof process < "u" && "env" in process && (p = process.env.DEBUG), p;
    }
    function s() {
      try {
        return localStorage;
      } catch {
      }
    }
    t.exports = Ms()(e);
    const { formatters: r } = t.exports;
    r.j = function(p) {
      try {
        return JSON.stringify(p);
      } catch (d) {
        return "[UnexpectedJSONParseError]: " + d.message;
      }
    };
  })(rt, rt.exports)), rt.exports;
}
var ct = { exports: {} }, Ln, Ti;
function uc() {
  return Ti || (Ti = 1, Ln = (t, e = process.argv) => {
    const a = t.startsWith("-") ? "" : t.length === 1 ? "-" : "--", n = e.indexOf(a + t), i = e.indexOf("--");
    return n !== -1 && (i === -1 || n < i);
  }), Ln;
}
var Fn, Oi;
function dc() {
  if (Oi) return Fn;
  Oi = 1;
  const t = po, e = us, a = uc(), { env: n } = process;
  let i;
  a("no-color") || a("no-colors") || a("color=false") || a("color=never") ? i = 0 : (a("color") || a("colors") || a("color=true") || a("color=always")) && (i = 1), "FORCE_COLOR" in n && (n.FORCE_COLOR === "true" ? i = 1 : n.FORCE_COLOR === "false" ? i = 0 : i = n.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(n.FORCE_COLOR, 10), 3));
  function o(p) {
    return p === 0 ? !1 : {
      level: p,
      hasBasic: !0,
      has256: p >= 2,
      has16m: p >= 3
    };
  }
  function s(p, d) {
    if (i === 0)
      return 0;
    if (a("color=16m") || a("color=full") || a("color=truecolor"))
      return 3;
    if (a("color=256"))
      return 2;
    if (p && !d && i === void 0)
      return 0;
    const c = i || 0;
    if (n.TERM === "dumb")
      return c;
    if (process.platform === "win32") {
      const u = t.release().split(".");
      return Number(u[0]) >= 10 && Number(u[2]) >= 10586 ? Number(u[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in n)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((u) => u in n) || n.CI_NAME === "codeship" ? 1 : c;
    if ("TEAMCITY_VERSION" in n)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(n.TEAMCITY_VERSION) ? 1 : 0;
    if (n.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in n) {
      const u = parseInt((n.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (n.TERM_PROGRAM) {
        case "iTerm.app":
          return u >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(n.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(n.TERM) || "COLORTERM" in n ? 1 : c;
  }
  function r(p) {
    const d = s(p, p && p.isTTY);
    return o(d);
  }
  return Fn = {
    supportsColor: r,
    stdout: o(s(!0, e.isatty(1))),
    stderr: o(s(!0, e.isatty(2)))
  }, Fn;
}
var Ci;
function mc() {
  return Ci || (Ci = 1, (function(t, e) {
    const a = us, n = Le;
    e.init = c, e.log = r, e.formatArgs = o, e.save = p, e.load = d, e.useColors = i, e.destroy = n.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), e.colors = [6, 2, 3, 4, 5, 1];
    try {
      const l = dc();
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
    function p(l) {
      l ? process.env.DEBUG = l : delete process.env.DEBUG;
    }
    function d() {
      return process.env.DEBUG;
    }
    function c(l) {
      l.inspectOpts = {};
      const E = Object.keys(e.inspectOpts);
      for (let x = 0; x < E.length; x++)
        l.inspectOpts[E[x]] = e.inspectOpts[E[x]];
    }
    t.exports = Ms()(e);
    const { formatters: u } = t.exports;
    u.o = function(l) {
      return this.inspectOpts.colors = this.useColors, n.inspect(l, this.inspectOpts).split(`
`).map((E) => E.trim()).join(" ");
    }, u.O = function(l) {
      return this.inspectOpts.colors = this.useColors, n.inspect(l, this.inspectOpts);
    };
  })(ct, ct.exports)), ct.exports;
}
var Ai;
function fc() {
  return Ai || (Ai = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? ot.exports = lc() : ot.exports = mc()), ot.exports;
}
var Bn, ji;
function hc() {
  if (ji) return Bn;
  ji = 1;
  var t;
  return Bn = function() {
    if (!t) {
      try {
        t = fc()("follow-redirects");
      } catch {
      }
      typeof t != "function" && (t = function() {
      });
    }
    t.apply(null, arguments);
  }, Bn;
}
var Pi;
function xc() {
  if (Pi) return st.exports;
  Pi = 1;
  var t = Xe, e = t.URL, a = Ze, n = vt, i = se.Writable, o = co, s = hc();
  (function() {
    var T = typeof process < "u", C = typeof window < "u" && typeof document < "u", z = H(Error.captureStackTrace);
    !T && (C || !z) && console.warn("The follow-redirects package should be excluded from browser builds.");
  })();
  var r = !1;
  try {
    o(new e(""));
  } catch (b) {
    r = b.code === "ERR_INVALID_URL";
  }
  var p = [
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
  ], d = ["abort", "aborted", "connect", "error", "socket", "timeout"], c = /* @__PURE__ */ Object.create(null);
  d.forEach(function(b) {
    c[b] = function(T, C, z) {
      this._redirectable.emit(b, T, C, z);
    };
  });
  var u = P(
    "ERR_INVALID_URL",
    "Invalid URL",
    TypeError
  ), l = P(
    "ERR_FR_REDIRECTION_FAILURE",
    "Redirected request failed"
  ), E = P(
    "ERR_FR_TOO_MANY_REDIRECTS",
    "Maximum number of redirects exceeded",
    l
  ), x = P(
    "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
    "Request body larger than maxBodyLength limit"
  ), f = P(
    "ERR_STREAM_WRITE_AFTER_END",
    "write after end"
  ), h = i.prototype.destroy || k;
  function v(b, T) {
    i.call(this), this._sanitizeOptions(b), this._options = b, this._ended = !1, this._ending = !1, this._redirectCount = 0, this._redirects = [], this._requestBodyLength = 0, this._requestBodyBuffers = [], T && this.on("response", T);
    var C = this;
    this._onNativeResponse = function(z) {
      try {
        C._processResponse(z);
      } catch (N) {
        C.emit("error", N instanceof l ? N : new l({ cause: N }));
      }
    }, this._performRequest();
  }
  v.prototype = Object.create(i.prototype), v.prototype.abort = function() {
    L(this._currentRequest), this._currentRequest.abort(), this.emit("abort");
  }, v.prototype.destroy = function(b) {
    return L(this._currentRequest, b), h.call(this, b), this;
  }, v.prototype.write = function(b, T, C) {
    if (this._ending)
      throw new f();
    if (!D(b) && !U(b))
      throw new TypeError("data should be a string, Buffer or Uint8Array");
    if (H(T) && (C = T, T = null), b.length === 0) {
      C && C();
      return;
    }
    this._requestBodyLength + b.length <= this._options.maxBodyLength ? (this._requestBodyLength += b.length, this._requestBodyBuffers.push({ data: b, encoding: T }), this._currentRequest.write(b, T, C)) : (this.emit("error", new x()), this.abort());
  }, v.prototype.end = function(b, T, C) {
    if (H(b) ? (C = b, b = T = null) : H(T) && (C = T, T = null), !b)
      this._ended = this._ending = !0, this._currentRequest.end(null, null, C);
    else {
      var z = this, N = this._currentRequest;
      this.write(b, T, function() {
        z._ended = !0, N.end(null, null, C);
      }), this._ending = !0;
    }
  }, v.prototype.setHeader = function(b, T) {
    this._options.headers[b] = T, this._currentRequest.setHeader(b, T);
  }, v.prototype.removeHeader = function(b) {
    delete this._options.headers[b], this._currentRequest.removeHeader(b);
  }, v.prototype.setTimeout = function(b, T) {
    var C = this;
    function z(M) {
      M.setTimeout(b), M.removeListener("timeout", M.destroy), M.addListener("timeout", M.destroy);
    }
    function N(M) {
      C._timeout && clearTimeout(C._timeout), C._timeout = setTimeout(function() {
        C.emit("timeout"), j();
      }, b), z(M);
    }
    function j() {
      C._timeout && (clearTimeout(C._timeout), C._timeout = null), C.removeListener("abort", j), C.removeListener("error", j), C.removeListener("response", j), C.removeListener("close", j), T && C.removeListener("timeout", T), C.socket || C._currentRequest.removeListener("socket", N);
    }
    return T && this.on("timeout", T), this.socket ? N(this.socket) : this._currentRequest.once("socket", N), this.on("socket", z), this.on("abort", j), this.on("error", j), this.on("response", j), this.on("close", j), this;
  }, [
    "flushHeaders",
    "getHeader",
    "setNoDelay",
    "setSocketKeepAlive"
  ].forEach(function(b) {
    v.prototype[b] = function(T, C) {
      return this._currentRequest[b](T, C);
    };
  }), ["aborted", "connection", "socket"].forEach(function(b) {
    Object.defineProperty(v.prototype, b, {
      get: function() {
        return this._currentRequest[b];
      }
    });
  }), v.prototype._sanitizeOptions = function(b) {
    if (b.headers || (b.headers = {}), b.host && (b.hostname || (b.hostname = b.host), delete b.host), !b.pathname && b.path) {
      var T = b.path.indexOf("?");
      T < 0 ? b.pathname = b.path : (b.pathname = b.path.substring(0, T), b.search = b.path.substring(T));
    }
  }, v.prototype._performRequest = function() {
    var b = this._options.protocol, T = this._options.nativeProtocols[b];
    if (!T)
      throw new TypeError("Unsupported protocol " + b);
    if (this._options.agents) {
      var C = b.slice(0, -1);
      this._options.agent = this._options.agents[C];
    }
    var z = this._currentRequest = T.request(this._options, this._onNativeResponse);
    z._redirectable = this;
    for (var N of d)
      z.on(N, c[N]);
    if (this._currentUrl = /^\//.test(this._options.path) ? t.format(this._options) : (
      // When making a request to a proxy, […]
      // a client MUST send the target URI in absolute-form […].
      this._options.path
    ), this._isRedirect) {
      var j = 0, M = this, Z = this._requestBodyBuffers;
      (function V(K) {
        if (z === M._currentRequest)
          if (K)
            M.emit("error", K);
          else if (j < Z.length) {
            var W = Z[j++];
            z.finished || z.write(W.data, W.encoding, V);
          } else M._ended && z.end();
      })();
    }
  }, v.prototype._processResponse = function(b) {
    var T = b.statusCode;
    this._options.trackRedirects && this._redirects.push({
      url: this._currentUrl,
      headers: b.headers,
      statusCode: T
    });
    var C = b.headers.location;
    if (!C || this._options.followRedirects === !1 || T < 300 || T >= 400) {
      b.responseUrl = this._currentUrl, b.redirects = this._redirects, this.emit("response", b), this._requestBodyBuffers = [];
      return;
    }
    if (L(this._currentRequest), b.destroy(), ++this._redirectCount > this._options.maxRedirects)
      throw new E();
    var z, N = this._options.beforeRedirect;
    N && (z = Object.assign({
      // The Host header was set by nativeProtocol.request
      Host: b.req.getHeader("host")
    }, this._options.headers));
    var j = this._options.method;
    ((T === 301 || T === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
    // the server is redirecting the user agent to a different resource […]
    // A user agent can perform a retrieval request targeting that URI
    // (a GET or HEAD request if using HTTP) […]
    T === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) && (this._options.method = "GET", this._requestBodyBuffers = [], S(/^content-/i, this._options.headers));
    var M = S(/^host$/i, this._options.headers), Z = A(this._currentUrl), V = M || Z.host, K = /^\w+:/.test(C) ? this._currentUrl : t.format(Object.assign(Z, { host: V })), W = g(C, K);
    if (s("redirecting to", W.href), this._isRedirect = !0, y(W, this._options), (W.protocol !== Z.protocol && W.protocol !== "https:" || W.host !== V && !I(W.host, V)) && S(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers), H(N)) {
      var Q = {
        headers: b.headers,
        statusCode: T
      }, xe = {
        url: K,
        method: j,
        headers: z
      };
      N(this._options, Q, xe), this._sanitizeOptions(this._options);
    }
    this._performRequest();
  };
  function w(b) {
    var T = {
      maxRedirects: 21,
      maxBodyLength: 10485760
    }, C = {};
    return Object.keys(b).forEach(function(z) {
      var N = z + ":", j = C[N] = b[z], M = T[z] = Object.create(j);
      function Z(K, W, Q) {
        return ee(K) ? K = y(K) : D(K) ? K = y(A(K)) : (Q = W, W = m(K), K = { protocol: N }), H(W) && (Q = W, W = null), W = Object.assign({
          maxRedirects: T.maxRedirects,
          maxBodyLength: T.maxBodyLength
        }, K, W), W.nativeProtocols = C, !D(W.host) && !D(W.hostname) && (W.hostname = "::1"), o.equal(W.protocol, N, "protocol mismatch"), s("options", W), new v(W, Q);
      }
      function V(K, W, Q) {
        var xe = M.request(K, W, Q);
        return xe.end(), xe;
      }
      Object.defineProperties(M, {
        request: { value: Z, configurable: !0, enumerable: !0, writable: !0 },
        get: { value: V, configurable: !0, enumerable: !0, writable: !0 }
      });
    }), T;
  }
  function k() {
  }
  function A(b) {
    var T;
    if (r)
      T = new e(b);
    else if (T = m(t.parse(b)), !D(T.protocol))
      throw new u({ input: b });
    return T;
  }
  function g(b, T) {
    return r ? new e(b, T) : A(t.resolve(T, b));
  }
  function m(b) {
    if (/^\[/.test(b.hostname) && !/^\[[:0-9a-f]+\]$/i.test(b.hostname))
      throw new u({ input: b.href || b });
    if (/^\[/.test(b.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(b.host))
      throw new u({ input: b.href || b });
    return b;
  }
  function y(b, T) {
    var C = T || {};
    for (var z of p)
      C[z] = b[z];
    return C.hostname.startsWith("[") && (C.hostname = C.hostname.slice(1, -1)), C.port !== "" && (C.port = Number(C.port)), C.path = C.search ? C.pathname + C.search : C.pathname, C;
  }
  function S(b, T) {
    var C;
    for (var z in T)
      b.test(z) && (C = T[z], delete T[z]);
    return C === null || typeof C > "u" ? void 0 : String(C).trim();
  }
  function P(b, T, C) {
    function z(N) {
      H(Error.captureStackTrace) && Error.captureStackTrace(this, this.constructor), Object.assign(this, N || {}), this.code = b, this.message = this.cause ? T + ": " + this.cause.message : T;
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
  function L(b, T) {
    for (var C of d)
      b.removeListener(C, c[C]);
    b.on("error", k), b.destroy(T);
  }
  function I(b, T) {
    o(D(b) && D(T));
    var C = b.length - T.length - 1;
    return C > 0 && b[C] === "." && b.endsWith(T);
  }
  function D(b) {
    return typeof b == "string" || b instanceof String;
  }
  function H(b) {
    return typeof b == "function";
  }
  function U(b) {
    return typeof b == "object" && "length" in b;
  }
  function ee(b) {
    return e && b instanceof e;
  }
  return st.exports = w({ http: a, https: n }), st.exports.wrap = w, st.exports;
}
var vc = xc();
const bc = /* @__PURE__ */ na(vc), mt = "1.13.5";
function $s(t) {
  const e = /^([-+\w]{1,25})(:?\/\/|:)/.exec(t);
  return e && e[1] || "";
}
const gc = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function yc(t, e, a) {
  const n = a && a.Blob || ne.classes.Blob, i = $s(t);
  if (e === void 0 && n && (e = !0), i === "data") {
    t = i.length ? t.slice(i.length + 1) : t;
    const o = gc.exec(t);
    if (!o)
      throw new F("Invalid URL", F.ERR_INVALID_URL);
    const s = o[1], r = o[2], p = o[3], d = Buffer.from(decodeURIComponent(p), r ? "base64" : "utf8");
    if (e) {
      if (!n)
        throw new F("Blob is not supported", F.ERR_NOT_SUPPORT);
      return new n([d], { type: s });
    }
    return d;
  }
  throw new F("Unsupported protocol " + i, F.ERR_NOT_SUPPORT);
}
const Nn = Symbol("internals");
class Li extends se.Transform {
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
    const a = this[Nn] = {
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
    const a = this[Nn];
    return a.onReadCallback && a.onReadCallback(), super._read(e);
  }
  _transform(e, a, n) {
    const i = this[Nn], o = i.maxRate, s = this.readableHighWaterMark, r = i.timeWindow, p = 1e3 / r, d = o / p, c = i.minChunkSize !== !1 ? Math.max(i.minChunkSize, d * 0.01) : 0, u = (E, x) => {
      const f = Buffer.byteLength(E);
      i.bytesSeen += f, i.bytes += f, i.isCaptured && this.emit("progress", i.bytesSeen), this.push(E) ? process.nextTick(x) : i.onReadCallback = () => {
        i.onReadCallback = null, process.nextTick(x);
      };
    }, l = (E, x) => {
      const f = Buffer.byteLength(E);
      let h = null, v = s, w, k = 0;
      if (o) {
        const A = Date.now();
        (!i.ts || (k = A - i.ts) >= r) && (i.ts = A, w = d - i.bytes, i.bytes = w < 0 ? -w : 0, k = 0), w = d - i.bytes;
      }
      if (o) {
        if (w <= 0)
          return setTimeout(() => {
            x(null, E);
          }, r - k);
        w < v && (v = w);
      }
      v && f > v && f - v > c && (h = E.subarray(v), E = E.subarray(0, v)), u(E, h ? () => {
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
const { asyncIterator: Fi } = Symbol, Hs = async function* (t) {
  t.stream ? yield* t.stream() : t.arrayBuffer ? yield await t.arrayBuffer() : t[Fi] ? yield* t[Fi]() : yield t;
}, _c = ne.ALPHABET.ALPHA_DIGIT + "-_", Ye = typeof TextEncoder == "function" ? new TextEncoder() : new Le.TextEncoder(), Te = `\r
`, wc = Ye.encode(Te), Ec = 2;
class Sc {
  constructor(e, a) {
    const { escapeName: n } = this.constructor, i = _.isString(a);
    let o = `Content-Disposition: form-data; name="${n(e)}"${!i && a.name ? `; filename="${n(a.name)}"` : ""}${Te}`;
    i ? a = Ye.encode(String(a).replace(/\r?\n|\r\n?/g, Te)) : o += `Content-Type: ${a.type || "application/octet-stream"}${Te}`, this.headers = Ye.encode(o + Te), this.contentLength = i ? a.byteLength : a.size, this.size = this.headers.byteLength + this.contentLength + Ec, this.name = e, this.value = a;
  }
  async *encode() {
    yield this.headers;
    const { value: e } = this;
    _.isTypedArray(e) ? yield e : yield* Hs(e), yield wc;
  }
  static escapeName(e) {
    return String(e).replace(/[\r\n"]/g, (a) => ({
      "\r": "%0D",
      "\n": "%0A",
      '"': "%22"
    })[a]);
  }
}
const Rc = (t, e, a) => {
  const {
    tag: n = "form-data-boundary",
    size: i = 25,
    boundary: o = n + "-" + ne.generateString(i, _c)
  } = a || {};
  if (!_.isFormData(t))
    throw TypeError("FormData instance required");
  if (o.length < 1 || o.length > 70)
    throw Error("boundary must be 10-70 characters long");
  const s = Ye.encode("--" + o + Te), r = Ye.encode("--" + o + "--" + Te);
  let p = r.byteLength;
  const d = Array.from(t.entries()).map(([u, l]) => {
    const E = new Sc(u, l);
    return p += E.size, E;
  });
  p += s.byteLength * d.length, p = _.toFiniteNumber(p);
  const c = {
    "Content-Type": `multipart/form-data; boundary=${o}`
  };
  return Number.isFinite(p) && (c["Content-Length"] = p), e && e(c), ro.from((async function* () {
    for (const u of d)
      yield s, yield* u.encode();
    yield r;
  })());
};
class kc extends se.Transform {
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
const Tc = (t, e) => _.isAsyncFn(t) ? function(...a) {
  const n = a.pop();
  t.apply(this, a).then((i) => {
    try {
      e ? n(null, ...e(i)) : n(null, i);
    } catch (o) {
      n(o);
    }
  }, n);
} : t;
function Oc(t, e) {
  t = t || 10;
  const a = new Array(t), n = new Array(t);
  let i = 0, o = 0, s;
  return e = e !== void 0 ? e : 1e3, function(p) {
    const d = Date.now(), c = n[o];
    s || (s = d), a[i] = p, n[i] = d;
    let u = o, l = 0;
    for (; u !== i; )
      l += a[u++], u = u % t;
    if (i = (i + 1) % t, i === o && (o = (o + 1) % t), d - s < e)
      return;
    const E = c && d - c;
    return E ? Math.round(l * 1e3 / E) : void 0;
  };
}
function Cc(t, e) {
  let a = 0, n = 1e3 / e, i, o;
  const s = (d, c = Date.now()) => {
    a = c, i = null, o && (clearTimeout(o), o = null), t(...d);
  };
  return [(...d) => {
    const c = Date.now(), u = c - a;
    u >= n ? s(d, c) : (i = d, o || (o = setTimeout(() => {
      o = null, s(i);
    }, n - u)));
  }, () => i && s(i)];
}
const De = (t, e, a = 3) => {
  let n = 0;
  const i = Oc(50, 250);
  return Cc((o) => {
    const s = o.loaded, r = o.lengthComputable ? o.total : void 0, p = s - n, d = i(p), c = s <= r;
    n = s;
    const u = {
      loaded: s,
      total: r,
      progress: r ? s / r : void 0,
      bytes: p,
      rate: d || void 0,
      estimated: d && r && c ? (r - s) / d : void 0,
      event: o,
      lengthComputable: r != null,
      [e ? "download" : "upload"]: !0
    };
    t(u);
  }, a);
}, ft = (t, e) => {
  const a = t != null;
  return [(n) => e[0]({
    lengthComputable: a,
    total: t,
    loaded: n
  }), e[1]];
}, ht = (t) => (...e) => _.asap(() => t(...e));
function Ac(t) {
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
    let r = 0, p = s - 1;
    const d = (l) => l >= 2 && n.charCodeAt(l - 2) === 37 && // '%'
    n.charCodeAt(l - 1) === 51 && // '3'
    (n.charCodeAt(l) === 68 || n.charCodeAt(l) === 100);
    p >= 0 && (n.charCodeAt(p) === 61 ? (r++, p--) : d(p) && (r++, p -= 3)), r === 1 && p >= 0 && (n.charCodeAt(p) === 61 || d(p)) && r++;
    const u = Math.floor(o / 4) * 3 - (r || 0);
    return u > 0 ? u : 0;
  }
  return Buffer.byteLength(n, "utf8");
}
const Bi = {
  flush: Ee.constants.Z_SYNC_FLUSH,
  finishFlush: Ee.constants.Z_SYNC_FLUSH
}, jc = {
  flush: Ee.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: Ee.constants.BROTLI_OPERATION_FLUSH
}, Ni = _.isFunction(Ee.createBrotliDecompress), { http: Pc, https: Lc } = bc, Fc = /https:?/, qi = ne.protocols.map((t) => t + ":"), Ui = (t, [e, a]) => (t.on("end", a).on("error", a), e);
class Bc {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(e, a) {
    a = Object.assign({
      sessionTimeout: 1e3
    }, a);
    let n = this.sessions[e];
    if (n) {
      let c = n.length;
      for (let u = 0; u < c; u++) {
        const [l, E] = n[u];
        if (!l.destroyed && !l.closed && Le.isDeepStrictEqual(E, a))
          return l;
      }
    }
    const i = ls.connect(e, a);
    let o;
    const s = () => {
      if (o)
        return;
      o = !0;
      let c = n, u = c.length, l = u;
      for (; l--; )
        if (c[l][0] === i) {
          u === 1 ? delete this.sessions[e] : c.splice(l, 1);
          return;
        }
    }, r = i.request, { sessionTimeout: p } = a;
    if (p != null) {
      let c, u = 0;
      i.request = function() {
        const l = r.apply(this, arguments);
        return u++, c && (clearTimeout(c), c = null), l.once("close", () => {
          --u || (c = setTimeout(() => {
            c = null, s();
          }, p));
        }), l;
      };
    }
    i.once("close", s);
    let d = [
      i,
      a
    ];
    return n ? n.push(d) : n = this.sessions[e] = [d], i;
  }
}
const Nc = new Bc();
function qc(t, e) {
  t.beforeRedirects.proxy && t.beforeRedirects.proxy(t), t.beforeRedirects.config && t.beforeRedirects.config(t, e);
}
function Gs(t, e, a) {
  let n = e;
  if (!n && n !== !1) {
    const i = cc.getProxyForUrl(a);
    i && (n = new URL(i));
  }
  if (n) {
    if (n.username && (n.auth = (n.username || "") + ":" + (n.password || "")), n.auth) {
      if (!!(n.auth.username || n.auth.password))
        n.auth = (n.auth.username || "") + ":" + (n.auth.password || "");
      else if (typeof n.auth == "object")
        throw new F("Invalid proxy authorization", F.ERR_BAD_OPTION, { proxy: n });
      const s = Buffer.from(n.auth, "utf8").toString("base64");
      t.headers["Proxy-Authorization"] = "Basic " + s;
    }
    t.headers.host = t.hostname + (t.port ? ":" + t.port : "");
    const i = n.hostname || n.host;
    t.hostname = i, t.host = i, t.port = n.port, t.path = a, n.protocol && (t.protocol = n.protocol.includes(":") ? n.protocol : `${n.protocol}:`);
  }
  t.beforeRedirects.proxy = function(o) {
    Gs(o, e, o.href);
  };
}
const Uc = typeof process < "u" && _.kindOf(process) === "process", Dc = (t) => new Promise((e, a) => {
  let n, i;
  const o = (p, d) => {
    i || (i = !0, n && n(p, d));
  }, s = (p) => {
    o(p), e(p);
  }, r = (p) => {
    o(p, !0), a(p);
  };
  t(s, r, (p) => n = p).catch(r);
}), Ic = ({ address: t, family: e }) => {
  if (!_.isString(t))
    throw TypeError("address must be a string");
  return {
    address: t,
    family: e || (t.indexOf(".") < 0 ? 6 : 4)
  };
}, Di = (t, e) => Ic(_.isObject(t) ? t : { address: t, family: e }), zc = {
  request(t, e) {
    const a = t.protocol + "//" + t.hostname + ":" + (t.port || (t.protocol === "https:" ? 443 : 80)), { http2Options: n, headers: i } = t, o = Nc.getSession(a, n), {
      HTTP2_HEADER_SCHEME: s,
      HTTP2_HEADER_METHOD: r,
      HTTP2_HEADER_PATH: p,
      HTTP2_HEADER_STATUS: d
    } = ls.constants, c = {
      [s]: t.protocol.replace(":", ""),
      [r]: t.method,
      [p]: t.path
    };
    _.forEach(i, (l, E) => {
      E.charAt(0) !== ":" && (c[E] = l);
    });
    const u = o.request(c);
    return u.once("response", (l) => {
      const E = u;
      l = Object.assign({}, l);
      const x = l[d];
      delete l[d], E.headers = l, E.statusCode = +x, e(E);
    }), u;
  }
}, Mc = Uc && function(e) {
  return Dc(async function(n, i, o) {
    let { data: s, lookup: r, family: p, httpVersion: d = 1, http2Options: c } = e;
    const { responseType: u, responseEncoding: l } = e, E = e.method.toUpperCase();
    let x, f = !1, h;
    if (d = +d, Number.isNaN(d))
      throw TypeError(`Invalid protocol version: '${e.httpVersion}' is not a number`);
    if (d !== 1 && d !== 2)
      throw TypeError(`Unsupported protocol version '${d}'`);
    const v = d === 2;
    if (r) {
      const N = Tc(r, (j) => _.isArray(j) ? j : [j]);
      r = (j, M, Z) => {
        N(j, M, (V, K, W) => {
          if (V)
            return Z(V);
          const Q = _.isArray(K) ? K.map((xe) => Di(xe)) : [Di(K, W)];
          M.all ? Z(V, Q) : Z(V, Q[0].address, Q[0].family);
        });
      };
    }
    const w = new lo();
    function k(N) {
      try {
        w.emit("abort", !N || N.type ? new Ae(null, e, h) : N);
      } catch (j) {
        console.warn("emit error", j);
      }
    }
    w.once("abort", i);
    const A = () => {
      e.cancelToken && e.cancelToken.unsubscribe(k), e.signal && e.signal.removeEventListener("abort", k), w.removeAllListeners();
    };
    (e.cancelToken || e.signal) && (e.cancelToken && e.cancelToken.subscribe(k), e.signal && (e.signal.aborted ? k() : e.signal.addEventListener("abort", k))), o((N, j) => {
      if (x = !0, j) {
        f = !0, A();
        return;
      }
      const { data: M } = N;
      if (M instanceof se.Readable || M instanceof se.Duplex) {
        const Z = se.finished(M, () => {
          Z(), A();
        });
      } else
        A();
    });
    const g = ca(e.baseURL, e.url, e.allowAbsoluteUrls), m = new URL(g, ne.hasBrowserEnv ? ne.origin : void 0), y = m.protocol || qi[0];
    if (y === "data:") {
      if (e.maxContentLength > -1) {
        const j = String(e.url || g || "");
        if (Ac(j) > e.maxContentLength)
          return i(new F(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            F.ERR_BAD_RESPONSE,
            e
          ));
      }
      let N;
      if (E !== "GET")
        return Ne(n, i, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config: e
        });
      try {
        N = yc(e.url, u === "blob", {
          Blob: e.env && e.env.Blob
        });
      } catch (j) {
        throw F.from(j, F.ERR_BAD_REQUEST, e);
      }
      return u === "text" ? (N = N.toString(l), (!l || l === "utf8") && (N = _.stripBOM(N))) : u === "stream" && (N = se.Readable.from(N)), Ne(n, i, {
        data: N,
        status: 200,
        statusText: "OK",
        headers: new ue(),
        config: e
      });
    }
    if (qi.indexOf(y) === -1)
      return i(new F(
        "Unsupported protocol " + y,
        F.ERR_BAD_REQUEST,
        e
      ));
    const S = ue.from(e.headers).normalize();
    S.set("User-Agent", "axios/" + mt, !1);
    const { onUploadProgress: P, onDownloadProgress: L } = e, I = e.maxRate;
    let D, H;
    if (_.isSpecCompliantForm(s)) {
      const N = S.getContentType(/boundary=([-_\w\d]{10,70})/i);
      s = Rc(s, (j) => {
        S.set(j);
      }, {
        tag: `axios-${mt}-boundary`,
        boundary: N && N[1] || void 0
      });
    } else if (_.isFormData(s) && _.isFunction(s.getHeaders)) {
      if (S.set(s.getHeaders()), !S.hasContentLength())
        try {
          const N = await Le.promisify(s.getLength).call(s);
          Number.isFinite(N) && N >= 0 && S.setContentLength(N);
        } catch {
        }
    } else if (_.isBlob(s) || _.isFile(s))
      s.size && S.setContentType(s.type || "application/octet-stream"), S.setContentLength(s.size || 0), s = se.Readable.from(Hs(s));
    else if (s && !_.isStream(s)) {
      if (!Buffer.isBuffer(s)) if (_.isArrayBuffer(s))
        s = Buffer.from(new Uint8Array(s));
      else if (_.isString(s))
        s = Buffer.from(s, "utf-8");
      else
        return i(new F(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          F.ERR_BAD_REQUEST,
          e
        ));
      if (S.setContentLength(s.length, !1), e.maxBodyLength > -1 && s.length > e.maxBodyLength)
        return i(new F(
          "Request body larger than maxBodyLength limit",
          F.ERR_BAD_REQUEST,
          e
        ));
    }
    const U = _.toFiniteNumber(S.getContentLength());
    _.isArray(I) ? (D = I[0], H = I[1]) : D = H = I, s && (P || D) && (_.isStream(s) || (s = se.Readable.from(s, { objectMode: !1 })), s = se.pipeline([s, new Li({
      maxRate: _.toFiniteNumber(D)
    })], _.noop), P && s.on("progress", Ui(
      s,
      ft(
        U,
        De(ht(P), !1, 3)
      )
    )));
    let ee;
    if (e.auth) {
      const N = e.auth.username || "", j = e.auth.password || "";
      ee = N + ":" + j;
    }
    if (!ee && m.username) {
      const N = m.username, j = m.password;
      ee = N + ":" + j;
    }
    ee && S.delete("authorization");
    let b;
    try {
      b = oa(
        m.pathname + m.search,
        e.params,
        e.paramsSerializer
      ).replace(/^\?/, "");
    } catch (N) {
      const j = new Error(N.message);
      return j.config = e, j.url = e.url, j.exists = !0, i(j);
    }
    S.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (Ni ? ", br" : ""),
      !1
    );
    const T = {
      path: b,
      method: E,
      headers: S.toJSON(),
      agents: { http: e.httpAgent, https: e.httpsAgent },
      auth: ee,
      protocol: y,
      family: p,
      beforeRedirect: qc,
      beforeRedirects: {},
      http2Options: c
    };
    !_.isUndefined(r) && (T.lookup = r), e.socketPath ? T.socketPath = e.socketPath : (T.hostname = m.hostname.startsWith("[") ? m.hostname.slice(1, -1) : m.hostname, T.port = m.port, Gs(T, e.proxy, y + "//" + m.hostname + (m.port ? ":" + m.port : "") + T.path));
    let C;
    const z = Fc.test(T.protocol);
    if (T.agent = z ? e.httpsAgent : e.httpAgent, v ? C = zc : e.transport ? C = e.transport : e.maxRedirects === 0 ? C = z ? vt : Ze : (e.maxRedirects && (T.maxRedirects = e.maxRedirects), e.beforeRedirect && (T.beforeRedirects.config = e.beforeRedirect), C = z ? Lc : Pc), e.maxBodyLength > -1 ? T.maxBodyLength = e.maxBodyLength : T.maxBodyLength = 1 / 0, e.insecureHTTPParser && (T.insecureHTTPParser = e.insecureHTTPParser), h = C.request(T, function(j) {
      if (h.destroyed) return;
      const M = [j], Z = _.toFiniteNumber(j.headers["content-length"]);
      if (L || H) {
        const Q = new Li({
          maxRate: _.toFiniteNumber(H)
        });
        L && Q.on("progress", Ui(
          Q,
          ft(
            Z,
            De(ht(L), !0, 3)
          )
        )), M.push(Q);
      }
      let V = j;
      const K = j.req || h;
      if (e.decompress !== !1 && j.headers["content-encoding"])
        switch ((E === "HEAD" || j.statusCode === 204) && delete j.headers["content-encoding"], (j.headers["content-encoding"] || "").toLowerCase()) {
          /*eslint default-case:0*/
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            M.push(Ee.createUnzip(Bi)), delete j.headers["content-encoding"];
            break;
          case "deflate":
            M.push(new kc()), M.push(Ee.createUnzip(Bi)), delete j.headers["content-encoding"];
            break;
          case "br":
            Ni && (M.push(Ee.createBrotliDecompress(jc)), delete j.headers["content-encoding"]);
        }
      V = M.length > 1 ? se.pipeline(M, _.noop) : M[0];
      const W = {
        status: j.statusCode,
        statusText: j.statusMessage,
        headers: new ue(j.headers),
        config: e,
        request: K
      };
      if (u === "stream")
        W.data = V, Ne(n, i, W);
      else {
        const Q = [];
        let xe = 0;
        V.on("data", function(G) {
          Q.push(G), xe += G.length, e.maxContentLength > -1 && xe > e.maxContentLength && (f = !0, V.destroy(), k(new F(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            F.ERR_BAD_RESPONSE,
            e,
            K
          )));
        }), V.on("aborted", function() {
          if (f)
            return;
          const G = new F(
            "stream has been aborted",
            F.ERR_BAD_RESPONSE,
            e,
            K
          );
          V.destroy(G), i(G);
        }), V.on("error", function(G) {
          h.destroyed || i(F.from(G, null, e, K));
        }), V.on("end", function() {
          try {
            let G = Q.length === 1 ? Q[0] : Buffer.concat(Q);
            u !== "arraybuffer" && (G = G.toString(l), (!l || l === "utf8") && (G = _.stripBOM(G))), W.data = G;
          } catch (G) {
            return i(F.from(G, null, e, W.request, W));
          }
          Ne(n, i, W);
        });
      }
      w.once("abort", (Q) => {
        V.destroyed || (V.emit("error", Q), V.destroy());
      });
    }), w.once("abort", (N) => {
      h.close ? h.close() : h.destroy(N);
    }), h.on("error", function(j) {
      i(F.from(j, null, e, h));
    }), h.on("socket", function(j) {
      j.setKeepAlive(!0, 1e3 * 60);
    }), e.timeout) {
      const N = parseInt(e.timeout, 10);
      if (Number.isNaN(N)) {
        k(new F(
          "error trying to parse `config.timeout` to int",
          F.ERR_BAD_OPTION_VALUE,
          e,
          h
        ));
        return;
      }
      h.setTimeout(N, function() {
        if (x) return;
        let M = e.timeout ? "timeout of " + e.timeout + "ms exceeded" : "timeout exceeded";
        const Z = e.transitional || Et;
        e.timeoutErrorMessage && (M = e.timeoutErrorMessage), k(new F(
          M,
          Z.clarifyTimeoutError ? F.ETIMEDOUT : F.ECONNABORTED,
          e,
          h
        ));
      });
    } else
      h.setTimeout(0);
    if (_.isStream(s)) {
      let N = !1, j = !1;
      s.on("end", () => {
        N = !0;
      }), s.once("error", (M) => {
        j = !0, h.destroy(M);
      }), s.on("close", () => {
        !N && !j && k(new Ae("Request stream has been aborted", e, h));
      }), s.pipe(h);
    } else
      s && h.write(s), h.end();
  });
}, $c = ne.hasStandardBrowserEnv ? /* @__PURE__ */ ((t, e) => (a) => (a = new URL(a, ne.origin), t.protocol === a.protocol && t.host === a.host && (e || t.port === a.port)))(
  new URL(ne.origin),
  ne.navigator && /(msie|trident)/i.test(ne.navigator.userAgent)
) : () => !0, Hc = ne.hasStandardBrowserEnv ? (
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
), Ii = (t) => t instanceof ue ? { ...t } : t;
function je(t, e) {
  e = e || {};
  const a = {};
  function n(d, c, u, l) {
    return _.isPlainObject(d) && _.isPlainObject(c) ? _.merge.call({ caseless: l }, d, c) : _.isPlainObject(c) ? _.merge({}, c) : _.isArray(c) ? c.slice() : c;
  }
  function i(d, c, u, l) {
    if (_.isUndefined(c)) {
      if (!_.isUndefined(d))
        return n(void 0, d, u, l);
    } else return n(d, c, u, l);
  }
  function o(d, c) {
    if (!_.isUndefined(c))
      return n(void 0, c);
  }
  function s(d, c) {
    if (_.isUndefined(c)) {
      if (!_.isUndefined(d))
        return n(void 0, d);
    } else return n(void 0, c);
  }
  function r(d, c, u) {
    if (u in e)
      return n(d, c);
    if (u in t)
      return n(void 0, d);
  }
  const p = {
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
    headers: (d, c, u) => i(Ii(d), Ii(c), u, !0)
  };
  return _.forEach(
    Object.keys({ ...t, ...e }),
    function(c) {
      if (c === "__proto__" || c === "constructor" || c === "prototype")
        return;
      const u = _.hasOwnProp(p, c) ? p[c] : i, l = u(t[c], e[c], c);
      _.isUndefined(l) && u !== r || (a[c] = l);
    }
  ), a;
}
const Ws = (t) => {
  const e = je({}, t);
  let { data: a, withXSRFToken: n, xsrfHeaderName: i, xsrfCookieName: o, headers: s, auth: r } = e;
  if (e.headers = s = ue.from(s), e.url = oa(ca(e.baseURL, e.url, e.allowAbsoluteUrls), t.params, t.paramsSerializer), r && s.set(
    "Authorization",
    "Basic " + btoa((r.username || "") + ":" + (r.password ? unescape(encodeURIComponent(r.password)) : ""))
  ), _.isFormData(a)) {
    if (ne.hasStandardBrowserEnv || ne.hasStandardBrowserWebWorkerEnv)
      s.setContentType(void 0);
    else if (_.isFunction(a.getHeaders)) {
      const p = a.getHeaders(), d = ["content-type", "content-length"];
      Object.entries(p).forEach(([c, u]) => {
        d.includes(c.toLowerCase()) && s.set(c, u);
      });
    }
  }
  if (ne.hasStandardBrowserEnv && (n && _.isFunction(n) && (n = n(e)), n || n !== !1 && $c(e.url))) {
    const p = i && o && Hc.read(o);
    p && s.set(i, p);
  }
  return e;
}, Gc = typeof XMLHttpRequest < "u", Wc = Gc && function(t) {
  return new Promise(function(a, n) {
    const i = Ws(t);
    let o = i.data;
    const s = ue.from(i.headers).normalize();
    let { responseType: r, onUploadProgress: p, onDownloadProgress: d } = i, c, u, l, E, x;
    function f() {
      E && E(), x && x(), i.cancelToken && i.cancelToken.unsubscribe(c), i.signal && i.signal.removeEventListener("abort", c);
    }
    let h = new XMLHttpRequest();
    h.open(i.method.toUpperCase(), i.url, !0), h.timeout = i.timeout;
    function v() {
      if (!h)
        return;
      const k = ue.from(
        "getAllResponseHeaders" in h && h.getAllResponseHeaders()
      ), g = {
        data: !r || r === "text" || r === "json" ? h.responseText : h.response,
        status: h.status,
        statusText: h.statusText,
        headers: k,
        config: t,
        request: h
      };
      Ne(function(y) {
        a(y), f();
      }, function(y) {
        n(y), f();
      }, g), h = null;
    }
    "onloadend" in h ? h.onloadend = v : h.onreadystatechange = function() {
      !h || h.readyState !== 4 || h.status === 0 && !(h.responseURL && h.responseURL.indexOf("file:") === 0) || setTimeout(v);
    }, h.onabort = function() {
      h && (n(new F("Request aborted", F.ECONNABORTED, t, h)), h = null);
    }, h.onerror = function(A) {
      const g = A && A.message ? A.message : "Network Error", m = new F(g, F.ERR_NETWORK, t, h);
      m.event = A || null, n(m), h = null;
    }, h.ontimeout = function() {
      let A = i.timeout ? "timeout of " + i.timeout + "ms exceeded" : "timeout exceeded";
      const g = i.transitional || Et;
      i.timeoutErrorMessage && (A = i.timeoutErrorMessage), n(new F(
        A,
        g.clarifyTimeoutError ? F.ETIMEDOUT : F.ECONNABORTED,
        t,
        h
      )), h = null;
    }, o === void 0 && s.setContentType(null), "setRequestHeader" in h && _.forEach(s.toJSON(), function(A, g) {
      h.setRequestHeader(g, A);
    }), _.isUndefined(i.withCredentials) || (h.withCredentials = !!i.withCredentials), r && r !== "json" && (h.responseType = i.responseType), d && ([l, x] = De(d, !0), h.addEventListener("progress", l)), p && h.upload && ([u, E] = De(p), h.upload.addEventListener("progress", u), h.upload.addEventListener("loadend", E)), (i.cancelToken || i.signal) && (c = (k) => {
      h && (n(!k || k.type ? new Ae(null, t, h) : k), h.abort(), h = null);
    }, i.cancelToken && i.cancelToken.subscribe(c), i.signal && (i.signal.aborted ? c() : i.signal.addEventListener("abort", c)));
    const w = $s(i.url);
    if (w && ne.protocols.indexOf(w) === -1) {
      n(new F("Unsupported protocol " + w + ":", F.ERR_BAD_REQUEST, t));
      return;
    }
    h.send(o || null);
  });
}, Vc = (t, e) => {
  const { length: a } = t = t ? t.filter(Boolean) : [];
  if (e || a) {
    let n = new AbortController(), i;
    const o = function(d) {
      if (!i) {
        i = !0, r();
        const c = d instanceof Error ? d : this.reason;
        n.abort(c instanceof F ? c : new Ae(c instanceof Error ? c.message : c));
      }
    };
    let s = e && setTimeout(() => {
      s = null, o(new F(`timeout of ${e}ms exceeded`, F.ETIMEDOUT));
    }, e);
    const r = () => {
      t && (s && clearTimeout(s), s = null, t.forEach((d) => {
        d.unsubscribe ? d.unsubscribe(o) : d.removeEventListener("abort", o);
      }), t = null);
    };
    t.forEach((d) => d.addEventListener("abort", o));
    const { signal: p } = n;
    return p.unsubscribe = () => _.asap(r), p;
  }
}, Kc = function* (t, e) {
  let a = t.byteLength;
  if (a < e) {
    yield t;
    return;
  }
  let n = 0, i;
  for (; n < a; )
    i = n + e, yield t.slice(n, i), n = i;
}, Jc = async function* (t, e) {
  for await (const a of Yc(t))
    yield* Kc(a, e);
}, Yc = async function* (t) {
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
}, zi = (t, e, a, n) => {
  const i = Jc(t, e);
  let o = 0, s, r = (p) => {
    s || (s = !0, n && n(p));
  };
  return new ReadableStream({
    async pull(p) {
      try {
        const { done: d, value: c } = await i.next();
        if (d) {
          r(), p.close();
          return;
        }
        let u = c.byteLength;
        if (a) {
          let l = o += u;
          a(l);
        }
        p.enqueue(new Uint8Array(c));
      } catch (d) {
        throw r(d), d;
      }
    },
    cancel(p) {
      return r(p), i.return();
    }
  }, {
    highWaterMark: 2
  });
}, Mi = 64 * 1024, { isFunction: pt } = _, Xc = (({ Request: t, Response: e }) => ({
  Request: t,
  Response: e
}))(_.global), {
  ReadableStream: $i,
  TextEncoder: Hi
} = _.global, Gi = (t, ...e) => {
  try {
    return !!t(...e);
  } catch {
    return !1;
  }
}, Zc = (t) => {
  t = _.merge.call({
    skipUndefined: !0
  }, Xc, t);
  const { fetch: e, Request: a, Response: n } = t, i = e ? pt(e) : typeof fetch == "function", o = pt(a), s = pt(n);
  if (!i)
    return !1;
  const r = i && pt($i), p = i && (typeof Hi == "function" ? /* @__PURE__ */ ((x) => (f) => x.encode(f))(new Hi()) : async (x) => new Uint8Array(await new a(x).arrayBuffer())), d = o && r && Gi(() => {
    let x = !1;
    const f = new a(ne.origin, {
      body: new $i(),
      method: "POST",
      get duplex() {
        return x = !0, "half";
      }
    }).headers.has("Content-Type");
    return x && !f;
  }), c = s && r && Gi(() => _.isReadableStream(new n("").body)), u = {
    stream: c && ((x) => x.body)
  };
  i && ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((x) => {
    !u[x] && (u[x] = (f, h) => {
      let v = f && f[x];
      if (v)
        return v.call(f);
      throw new F(`Response type '${x}' is not supported`, F.ERR_NOT_SUPPORT, h);
    });
  });
  const l = async (x) => {
    if (x == null)
      return 0;
    if (_.isBlob(x))
      return x.size;
    if (_.isSpecCompliantForm(x))
      return (await new a(ne.origin, {
        method: "POST",
        body: x
      }).arrayBuffer()).byteLength;
    if (_.isArrayBufferView(x) || _.isArrayBuffer(x))
      return x.byteLength;
    if (_.isURLSearchParams(x) && (x = x + ""), _.isString(x))
      return (await p(x)).byteLength;
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
      withCredentials: P = "same-origin",
      fetchOptions: L
    } = Ws(x), I = e || fetch;
    y = y ? (y + "").toLowerCase() : "text";
    let D = Vc([w, k && k.toAbortSignal()], A), H = null;
    const U = D && D.unsubscribe && (() => {
      D.unsubscribe();
    });
    let ee;
    try {
      if (m && d && h !== "get" && h !== "head" && (ee = await E(S, v)) !== 0) {
        let j = new a(f, {
          method: "POST",
          body: v,
          duplex: "half"
        }), M;
        if (_.isFormData(v) && (M = j.headers.get("content-type")) && S.setContentType(M), j.body) {
          const [Z, V] = ft(
            ee,
            De(ht(m))
          );
          v = zi(j.body, Mi, Z, V);
        }
      }
      _.isString(P) || (P = P ? "include" : "omit");
      const b = o && "credentials" in a.prototype, T = {
        ...L,
        signal: D,
        method: h.toUpperCase(),
        headers: S.normalize().toJSON(),
        body: v,
        duplex: "half",
        credentials: b ? P : void 0
      };
      H = o && new a(f, T);
      let C = await (o ? I(H, L) : I(f, T));
      const z = c && (y === "stream" || y === "response");
      if (c && (g || z && U)) {
        const j = {};
        ["status", "statusText", "headers"].forEach((K) => {
          j[K] = C[K];
        });
        const M = _.toFiniteNumber(C.headers.get("content-length")), [Z, V] = g && ft(
          M,
          De(ht(g), !0)
        ) || [];
        C = new n(
          zi(C.body, Mi, Z, () => {
            V && V(), U && U();
          }),
          j
        );
      }
      y = y || "text";
      let N = await u[_.findKey(u, y) || "text"](C, x);
      return !z && U && U(), await new Promise((j, M) => {
        Ne(j, M, {
          data: N,
          headers: ue.from(C.headers),
          status: C.status,
          statusText: C.statusText,
          config: x,
          request: H
        });
      });
    } catch (b) {
      throw U && U(), b && b.name === "TypeError" && /Load failed|fetch/i.test(b.message) ? Object.assign(
        new F("Network Error", F.ERR_NETWORK, x, H, b && b.response),
        {
          cause: b.cause || b
        }
      ) : F.from(b, b && b.code, x, H, b && b.response);
    }
  };
}, Qc = /* @__PURE__ */ new Map(), Vs = (t) => {
  let e = t && t.env || {};
  const { fetch: a, Request: n, Response: i } = e, o = [
    n,
    i,
    a
  ];
  let s = o.length, r = s, p, d, c = Qc;
  for (; r--; )
    p = o[r], d = c.get(p), d === void 0 && c.set(p, d = r ? /* @__PURE__ */ new Map() : Zc(e)), c = d;
  return d;
};
Vs();
const pa = {
  http: Mc,
  xhr: Wc,
  fetch: {
    get: Vs
  }
};
_.forEach(pa, (t, e) => {
  if (t) {
    try {
      Object.defineProperty(t, "name", { value: e });
    } catch {
    }
    Object.defineProperty(t, "adapterName", { value: e });
  }
});
const Wi = (t) => `- ${t}`, ep = (t) => _.isFunction(t) || t === null || t === !1;
function tp(t, e) {
  t = _.isArray(t) ? t : [t];
  const { length: a } = t;
  let n, i;
  const o = {};
  for (let s = 0; s < a; s++) {
    n = t[s];
    let r;
    if (i = n, !ep(n) && (i = pa[(r = String(n)).toLowerCase()], i === void 0))
      throw new F(`Unknown adapter '${r}'`);
    if (i && (_.isFunction(i) || (i = i.get(e))))
      break;
    o[r || "#" + s] = i;
  }
  if (!i) {
    const s = Object.entries(o).map(
      ([p, d]) => `adapter ${p} ` + (d === !1 ? "is not supported by the environment" : "is not available in the build")
    );
    let r = a ? s.length > 1 ? `since :
` + s.map(Wi).join(`
`) : " " + Wi(s[0]) : "as no adapter specified";
    throw new F(
      "There is no suitable adapter to dispatch the request " + r,
      "ERR_NOT_SUPPORT"
    );
  }
  return i;
}
const Ks = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter: tp,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: pa
};
function qn(t) {
  if (t.cancelToken && t.cancelToken.throwIfRequested(), t.signal && t.signal.aborted)
    throw new Ae(null, t);
}
function Vi(t) {
  return qn(t), t.headers = ue.from(t.headers), t.data = Cn.call(
    t,
    t.transformRequest
  ), ["post", "put", "patch"].indexOf(t.method) !== -1 && t.headers.setContentType("application/x-www-form-urlencoded", !1), Ks.getAdapter(t.adapter || at.adapter, t)(t).then(function(n) {
    return qn(t), n.data = Cn.call(
      t,
      t.transformResponse,
      n
    ), n.headers = ue.from(n.headers), n;
  }, function(n) {
    return zs(n) || (qn(t), n && n.response && (n.response.data = Cn.call(
      t,
      t.transformResponse,
      n.response
    ), n.response.headers = ue.from(n.response.headers))), Promise.reject(n);
  });
}
const St = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((t, e) => {
  St[t] = function(n) {
    return typeof n === t || "a" + (e < 1 ? "n " : " ") + t;
  };
});
const Ki = {};
St.transitional = function(e, a, n) {
  function i(o, s) {
    return "[Axios v" + mt + "] Transitional option '" + o + "'" + s + (n ? ". " + n : "");
  }
  return (o, s, r) => {
    if (e === !1)
      throw new F(
        i(s, " has been removed" + (a ? " in " + a : "")),
        F.ERR_DEPRECATED
      );
    return a && !Ki[s] && (Ki[s] = !0, console.warn(
      i(
        s,
        " has been deprecated since v" + a + " and will be removed in the near future"
      )
    )), e ? e(o, s, r) : !0;
  };
};
St.spelling = function(e) {
  return (a, n) => (console.warn(`${n} is likely a misspelling of ${e}`), !0);
};
function np(t, e, a) {
  if (typeof t != "object")
    throw new F("options must be an object", F.ERR_BAD_OPTION_VALUE);
  const n = Object.keys(t);
  let i = n.length;
  for (; i-- > 0; ) {
    const o = n[i], s = e[o];
    if (s) {
      const r = t[o], p = r === void 0 || s(r, o, t);
      if (p !== !0)
        throw new F("option " + o + " must be " + p, F.ERR_BAD_OPTION_VALUE);
      continue;
    }
    if (a !== !0)
      throw new F("Unknown option " + o, F.ERR_BAD_OPTION);
  }
}
const dt = {
  assertOptions: np,
  validators: St
}, ve = dt.validators;
let Oe = class {
  constructor(e) {
    this.defaults = e || {}, this.interceptors = {
      request: new yi(),
      response: new yi()
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
    typeof e == "string" ? (a = a || {}, a.url = e) : a = e || {}, a = je(this.defaults, a);
    const { transitional: n, paramsSerializer: i, headers: o } = a;
    n !== void 0 && dt.assertOptions(n, {
      silentJSONParsing: ve.transitional(ve.boolean),
      forcedJSONParsing: ve.transitional(ve.boolean),
      clarifyTimeoutError: ve.transitional(ve.boolean),
      legacyInterceptorReqResOrdering: ve.transitional(ve.boolean)
    }, !1), i != null && (_.isFunction(i) ? a.paramsSerializer = {
      serialize: i
    } : dt.assertOptions(i, {
      encode: ve.function,
      serialize: ve.function
    }, !0)), a.allowAbsoluteUrls !== void 0 || (this.defaults.allowAbsoluteUrls !== void 0 ? a.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls : a.allowAbsoluteUrls = !0), dt.assertOptions(a, {
      baseUrl: ve.spelling("baseURL"),
      withXsrfToken: ve.spelling("withXSRFToken")
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
    ), a.headers = ue.concat(s, o);
    const r = [];
    let p = !0;
    this.interceptors.request.forEach(function(f) {
      if (typeof f.runWhen == "function" && f.runWhen(a) === !1)
        return;
      p = p && f.synchronous;
      const h = a.transitional || Et;
      h && h.legacyInterceptorReqResOrdering ? r.unshift(f.fulfilled, f.rejected) : r.push(f.fulfilled, f.rejected);
    });
    const d = [];
    this.interceptors.response.forEach(function(f) {
      d.push(f.fulfilled, f.rejected);
    });
    let c, u = 0, l;
    if (!p) {
      const x = [Vi.bind(this), void 0];
      for (x.unshift(...r), x.push(...d), l = x.length, c = Promise.resolve(a); u < l; )
        c = c.then(x[u++], x[u++]);
      return c;
    }
    l = r.length;
    let E = a;
    for (; u < l; ) {
      const x = r[u++], f = r[u++];
      try {
        E = x(E);
      } catch (h) {
        f.call(this, h);
        break;
      }
    }
    try {
      c = Vi.call(this, E);
    } catch (x) {
      return Promise.reject(x);
    }
    for (u = 0, l = d.length; u < l; )
      c = c.then(d[u++], d[u++]);
    return c;
  }
  getUri(e) {
    e = je(this.defaults, e);
    const a = ca(e.baseURL, e.url, e.allowAbsoluteUrls);
    return oa(a, e.params, e.paramsSerializer);
  }
};
_.forEach(["delete", "get", "head", "options"], function(e) {
  Oe.prototype[e] = function(a, n) {
    return this.request(je(n || {}, {
      method: e,
      url: a,
      data: (n || {}).data
    }));
  };
});
_.forEach(["post", "put", "patch"], function(e) {
  function a(n) {
    return function(o, s, r) {
      return this.request(je(r || {}, {
        method: e,
        headers: n ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url: o,
        data: s
      }));
    };
  }
  Oe.prototype[e] = a(), Oe.prototype[e + "Form"] = a(!0);
});
let ap = class Js {
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
      n.reason || (n.reason = new Ae(o, s, r), a(n.reason));
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
      token: new Js(function(i) {
        e = i;
      }),
      cancel: e
    };
  }
};
function ip(t) {
  return function(a) {
    return t.apply(null, a);
  };
}
function sp(t) {
  return _.isObject(t) && t.isAxiosError === !0;
}
const Qn = {
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
Object.entries(Qn).forEach(([t, e]) => {
  Qn[e] = t;
});
function Ys(t) {
  const e = new Oe(t), a = ms(Oe.prototype.request, e);
  return _.extend(a, Oe.prototype, e, { allOwnKeys: !0 }), _.extend(a, e, null, { allOwnKeys: !0 }), a.create = function(i) {
    return Ys(je(t, i));
  }, a;
}
const X = Ys(at);
X.Axios = Oe;
X.CanceledError = Ae;
X.CancelToken = ap;
X.isCancel = zs;
X.VERSION = mt;
X.toFormData = wt;
X.AxiosError = F;
X.Cancel = X.CanceledError;
X.all = function(e) {
  return Promise.all(e);
};
X.spread = ip;
X.isAxiosError = sp;
X.mergeConfig = je;
X.AxiosHeaders = ue;
X.formToJSON = (t) => Is(_.isHTMLForm(t) ? new FormData(t) : t);
X.getAdapter = Ks.getAdapter;
X.HttpStatusCode = Qn;
X.default = X;
const {
  Axios: Hp,
  AxiosError: Gp,
  CanceledError: Wp,
  isCancel: Vp,
  CancelToken: Kp,
  VERSION: Jp,
  all: Yp,
  Cancel: Xp,
  isAxiosError: Zp,
  spread: Qp,
  toFormData: el,
  AxiosHeaders: tl,
  HttpStatusCode: nl,
  formToJSON: al,
  getAdapter: il,
  mergeConfig: sl
} = X;
var Ke = { exports: {} }, Un, Ji;
function Re() {
  if (Ji) return Un;
  Ji = 1;
  const t = ["nodebuffer", "arraybuffer", "fragments"], e = typeof Blob < "u";
  return e && t.push("blob"), Un = {
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
  }, Un;
}
const op = {}, rp = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: op
}, Symbol.toStringTag, { value: "Module" })), cp = /* @__PURE__ */ ws(rp);
var Yi;
function Rt() {
  if (Yi) return Ke.exports;
  Yi = 1;
  const { EMPTY_BUFFER: t } = Re(), e = Buffer[Symbol.species];
  function a(r, p) {
    if (r.length === 0) return t;
    if (r.length === 1) return r[0];
    const d = Buffer.allocUnsafe(p);
    let c = 0;
    for (let u = 0; u < r.length; u++) {
      const l = r[u];
      d.set(l, c), c += l.length;
    }
    return c < p ? new e(d.buffer, d.byteOffset, c) : d;
  }
  function n(r, p, d, c, u) {
    for (let l = 0; l < u; l++)
      d[c + l] = r[l] ^ p[l & 3];
  }
  function i(r, p) {
    for (let d = 0; d < r.length; d++)
      r[d] ^= p[d & 3];
  }
  function o(r) {
    return r.length === r.buffer.byteLength ? r.buffer : r.buffer.slice(r.byteOffset, r.byteOffset + r.length);
  }
  function s(r) {
    if (s.readOnly = !0, Buffer.isBuffer(r)) return r;
    let p;
    return r instanceof ArrayBuffer ? p = new e(r) : ArrayBuffer.isView(r) ? p = new e(r.buffer, r.byteOffset, r.byteLength) : (p = Buffer.from(r), s.readOnly = !1), p;
  }
  if (Ke.exports = {
    concat: a,
    mask: n,
    toArrayBuffer: o,
    toBuffer: s,
    unmask: i
  }, !process.env.WS_NO_BUFFER_UTIL)
    try {
      const r = cp;
      Ke.exports.mask = function(p, d, c, u, l) {
        l < 48 ? n(p, d, c, u, l) : r.mask(p, d, c, u, l);
      }, Ke.exports.unmask = function(p, d) {
        p.length < 32 ? i(p, d) : r.unmask(p, d);
      };
    } catch {
    }
  return Ke.exports;
}
var Dn, Xi;
function pp() {
  if (Xi) return Dn;
  Xi = 1;
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
  return Dn = a, Dn;
}
var In, Zi;
function kt() {
  if (Zi) return In;
  Zi = 1;
  const t = Ee, e = Rt(), a = pp(), { kStatusCode: n } = Re(), i = Buffer[Symbol.species], o = Buffer.from([0, 0, 255, 255]), s = Symbol("permessage-deflate"), r = Symbol("total-length"), p = Symbol("callback"), d = Symbol("buffers"), c = Symbol("error");
  let u;
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
      if (this._maxPayload = k | 0, this._options = v || {}, this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024, this._isServer = !!w, this._deflate = null, this._inflate = null, this.params = null, !u) {
        const A = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
        u = new a(A);
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
        const v = this._deflate[p];
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
      u.add((A) => {
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
      u.add((A) => {
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
        }), this._inflate[s] = this, this._inflate[r] = 0, this._inflate[d] = [], this._inflate.on("error", f), this._inflate.on("data", x);
      }
      this._inflate[p] = k, this._inflate.write(v), w && this._inflate.write(o), this._inflate.flush(() => {
        const g = this._inflate[c];
        if (g) {
          this._inflate.close(), this._inflate = null, k(g);
          return;
        }
        const m = e.concat(
          this._inflate[d],
          this._inflate[r]
        );
        this._inflate._readableState.endEmitted ? (this._inflate.close(), this._inflate = null) : (this._inflate[r] = 0, this._inflate[d] = [], w && this.params[`${A}_no_context_takeover`] && this._inflate.reset()), k(null, m);
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
        }), this._deflate[r] = 0, this._deflate[d] = [], this._deflate.on("data", E);
      }
      this._deflate[p] = k, this._deflate.write(v), this._deflate.flush(t.Z_SYNC_FLUSH, () => {
        if (!this._deflate)
          return;
        let g = e.concat(
          this._deflate[d],
          this._deflate[r]
        );
        w && (g = new i(g.buffer, g.byteOffset, g.length - 4)), this._deflate[p] = null, this._deflate[r] = 0, this._deflate[d] = [], w && this.params[`${A}_no_context_takeover`] && this._deflate.reset(), k(null, g);
      });
    }
  }
  In = l;
  function E(h) {
    this[d].push(h), this[r] += h.length;
  }
  function x(h) {
    if (this[r] += h.length, this[s]._maxPayload < 1 || this[r] <= this[s]._maxPayload) {
      this[d].push(h);
      return;
    }
    this[c] = new RangeError("Max payload size exceeded"), this[c].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH", this[c][n] = 1009, this.removeListener("data", x), this.reset();
  }
  function f(h) {
    if (this[s]._inflate = null, this[c]) {
      this[p](this[c]);
      return;
    }
    h[n] = 1007, this[p](h);
  }
  return In;
}
var Je = { exports: {} };
const lp = {}, up = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: lp
}, Symbol.toStringTag, { value: "Module" })), dp = /* @__PURE__ */ ws(up);
var Qi;
function it() {
  if (Qi) return Je.exports;
  Qi = 1;
  const { isUtf8: t } = fo, { hasBlob: e } = Re(), a = [
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
    let p = 0;
    for (; p < r; )
      if ((s[p] & 128) === 0)
        p++;
      else if ((s[p] & 224) === 192) {
        if (p + 1 === r || (s[p + 1] & 192) !== 128 || (s[p] & 254) === 192)
          return !1;
        p += 2;
      } else if ((s[p] & 240) === 224) {
        if (p + 2 >= r || (s[p + 1] & 192) !== 128 || (s[p + 2] & 192) !== 128 || s[p] === 224 && (s[p + 1] & 224) === 128 || // Overlong
        s[p] === 237 && (s[p + 1] & 224) === 160)
          return !1;
        p += 3;
      } else if ((s[p] & 248) === 240) {
        if (p + 3 >= r || (s[p + 1] & 192) !== 128 || (s[p + 2] & 192) !== 128 || (s[p + 3] & 192) !== 128 || s[p] === 240 && (s[p + 1] & 240) === 128 || // Overlong
        s[p] === 244 && s[p + 1] > 143 || s[p] > 244)
          return !1;
        p += 4;
      } else
        return !1;
    return !0;
  }
  function o(s) {
    return e && typeof s == "object" && typeof s.arrayBuffer == "function" && typeof s.type == "string" && typeof s.stream == "function" && (s[Symbol.toStringTag] === "Blob" || s[Symbol.toStringTag] === "File");
  }
  if (Je.exports = {
    isBlob: o,
    isValidStatusCode: n,
    isValidUTF8: i,
    tokenChars: a
  }, t)
    Je.exports.isValidUTF8 = function(s) {
      return s.length < 24 ? i(s) : t(s);
    };
  else if (!process.env.WS_NO_UTF_8_VALIDATE)
    try {
      const s = dp;
      Je.exports.isValidUTF8 = function(r) {
        return r.length < 32 ? i(r) : s(r);
      };
    } catch {
    }
  return Je.exports;
}
var zn, es;
function Xs() {
  if (es) return zn;
  es = 1;
  const { Writable: t } = se, e = kt(), {
    BINARY_TYPES: a,
    EMPTY_BUFFER: n,
    kStatusCode: i,
    kWebSocket: o
  } = Re(), { concat: s, toArrayBuffer: r, unmask: p } = Rt(), { isValidStatusCode: d, isValidUTF8: c } = it(), u = Buffer[Symbol.species], l = 0, E = 1, x = 2, f = 3, h = 4, v = 5, w = 6;
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
        return this._buffers[0] = new u(
          y.buffer,
          y.byteOffset + g,
          y.length - g
        ), new u(y.buffer, y.byteOffset, g);
      }
      const m = Buffer.allocUnsafe(g);
      do {
        const y = this._buffers[0], S = m.length - g;
        g >= y.length ? m.set(this._buffers.shift(), S) : (m.set(new Uint8Array(y.buffer, y.byteOffset, g), S), this._buffers[0] = new u(
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
        m = this.consume(this._payloadLength), this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0 && p(m, this._mask);
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
      this._extensions[e.extensionName].decompress(g, this._fin, (S, P) => {
        if (S) return m(S);
        if (P.length) {
          if (this._messageLength += P.length, this._messageLength > this._maxPayload && this._maxPayload > 0) {
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
          this._fragments.push(P);
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
        if (!this._skipUTF8Validation && !c(S)) {
          const P = this.createError(
            Error,
            "invalid UTF-8 sequence",
            !0,
            1007,
            "WS_ERR_INVALID_UTF8"
          );
          g(P);
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
          if (!d(y)) {
            const P = this.createError(
              RangeError,
              `invalid status code ${y}`,
              !0,
              1002,
              "WS_ERR_INVALID_CLOSE_CODE"
            );
            m(P);
            return;
          }
          const S = new u(
            g.buffer,
            g.byteOffset + 2,
            g.length - 2
          );
          if (!this._skipUTF8Validation && !c(S)) {
            const P = this.createError(
              Error,
              "invalid UTF-8 sequence",
              !0,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            m(P);
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
    createError(g, m, y, S, P) {
      this._loop = !1, this._errored = !0;
      const L = new g(
        y ? `Invalid WebSocket frame: ${m}` : m
      );
      return Error.captureStackTrace(L, this.createError), L.code = P, L[i] = S, L;
    }
  }
  return zn = k, zn;
}
var Mn, ts;
function Zs() {
  if (ts) return Mn;
  ts = 1;
  const { Duplex: t } = se, { randomFillSync: e } = Qe, a = kt(), { EMPTY_BUFFER: n, kWebSocket: i, NOOP: o } = Re(), { isBlob: s, isValidStatusCode: r } = it(), { mask: p, toBuffer: d } = Rt(), c = Symbol("kByteLength"), u = Buffer.alloc(4), l = 8 * 1024;
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
      let S, P = !1, L = 2, I = !1;
      y.mask && (S = y.maskBuffer || u, y.generateMask ? y.generateMask(S) : (x === l && (E === void 0 && (E = Buffer.alloc(l)), e(E, 0, l), x = 0), S[0] = E[x++], S[1] = E[x++], S[2] = E[x++], S[3] = E[x++]), I = (S[0] | S[1] | S[2] | S[3]) === 0, L = 6);
      let D;
      typeof m == "string" ? (!y.mask || I) && y[c] !== void 0 ? D = y[c] : (m = Buffer.from(m), D = m.length) : (D = m.length, P = y.mask && y.readOnly && !I);
      let H = D;
      D >= 65536 ? (L += 8, H = 127) : D > 125 && (L += 2, H = 126);
      const U = Buffer.allocUnsafe(P ? D + L : L);
      return U[0] = y.fin ? y.opcode | 128 : y.opcode, y.rsv1 && (U[0] |= 64), U[1] = H, H === 126 ? U.writeUInt16BE(D, 2) : H === 127 && (U[2] = U[3] = 0, U.writeUIntBE(D, 4, 6)), y.mask ? (U[1] |= 128, U[L - 4] = S[0], U[L - 3] = S[1], U[L - 2] = S[2], U[L - 1] = S[3], I ? [U, m] : P ? (p(m, S, U, L, D), [U]) : (p(m, S, m, 0, D), [U, m])) : [U, m];
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
    close(m, y, S, P) {
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
        [c]: L.length,
        fin: !0,
        generateMask: this._generateMask,
        mask: S,
        maskBuffer: this._maskBuffer,
        opcode: 8,
        readOnly: !1,
        rsv1: !1
      };
      this._state !== f ? this.enqueue([this.dispatch, L, !1, I, P]) : this.sendFrame(w.frame(L, I), P);
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
      let P, L;
      if (typeof m == "string" ? (P = Buffer.byteLength(m), L = !1) : s(m) ? (P = m.size, L = !1) : (m = d(m), P = m.length, L = d.readOnly), P > 125)
        throw new RangeError("The data size must not be greater than 125 bytes");
      const I = {
        [c]: P,
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
      let P, L;
      if (typeof m == "string" ? (P = Buffer.byteLength(m), L = !1) : s(m) ? (P = m.size, L = !1) : (m = d(m), P = m.length, L = d.readOnly), P > 125)
        throw new RangeError("The data size must not be greater than 125 bytes");
      const I = {
        [c]: P,
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
      const P = this._extensions[a.extensionName];
      let L = y.binary ? 2 : 1, I = y.compress, D, H;
      typeof m == "string" ? (D = Buffer.byteLength(m), H = !1) : s(m) ? (D = m.size, H = !1) : (m = d(m), D = m.length, H = d.readOnly), this._firstFragment ? (this._firstFragment = !1, I && P && P.params[P._isServer ? "server_no_context_takeover" : "client_no_context_takeover"] && (I = D >= P._threshold), this._compress = I) : (I = !1, L = 0), y.fin && (this._firstFragment = !0);
      const U = {
        [c]: D,
        fin: y.fin,
        generateMask: this._generateMask,
        mask: y.mask,
        maskBuffer: this._maskBuffer,
        opcode: L,
        readOnly: H,
        rsv1: I
      };
      s(m) ? this._state !== f ? this.enqueue([this.getBlobData, m, this._compress, U, S]) : this.getBlobData(m, this._compress, U, S) : this._state !== f ? this.enqueue([this.dispatch, m, this._compress, U, S]) : this.dispatch(m, this._compress, U, S);
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
    getBlobData(m, y, S, P) {
      this._bufferedBytes += S[c], this._state = v, m.arrayBuffer().then((L) => {
        if (this._socket.destroyed) {
          const D = new Error(
            "The socket was closed while the blob was being read"
          );
          process.nextTick(k, this, D, P);
          return;
        }
        this._bufferedBytes -= S[c];
        const I = d(L);
        y ? this.dispatch(I, y, S, P) : (this._state = f, this.sendFrame(w.frame(I, S), P), this.dequeue());
      }).catch((L) => {
        process.nextTick(A, this, L, P);
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
    dispatch(m, y, S, P) {
      if (!y) {
        this.sendFrame(w.frame(m, S), P);
        return;
      }
      const L = this._extensions[a.extensionName];
      this._bufferedBytes += S[c], this._state = h, L.compress(m, S.fin, (I, D) => {
        if (this._socket.destroyed) {
          const H = new Error(
            "The socket was closed while data was being compressed"
          );
          k(this, H, P);
          return;
        }
        this._bufferedBytes -= S[c], this._state = f, S.readOnly = !1, this.sendFrame(w.frame(D, S), P), this.dequeue();
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
        this._bufferedBytes -= m[3][c], Reflect.apply(m[0], this, m.slice(1));
      }
    }
    /**
     * Enqueues a send operation.
     *
     * @param {Array} params Send operation parameters.
     * @private
     */
    enqueue(m) {
      this._bufferedBytes += m[3][c], this._queue.push(m);
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
  Mn = w;
  function k(g, m, y) {
    typeof y == "function" && y(m);
    for (let S = 0; S < g._queue.length; S++) {
      const P = g._queue[S], L = P[P.length - 1];
      typeof L == "function" && L(m);
    }
  }
  function A(g, m, y) {
    k(g, m, y), g.onerror(m);
  }
  return Mn;
}
var $n, ns;
function mp() {
  if (ns) return $n;
  ns = 1;
  const { kForOnEventAttribute: t, kListener: e } = Re(), a = Symbol("kCode"), n = Symbol("kData"), i = Symbol("kError"), o = Symbol("kMessage"), s = Symbol("kReason"), r = Symbol("kTarget"), p = Symbol("kType"), d = Symbol("kWasClean");
  class c {
    /**
     * Create a new `Event`.
     *
     * @param {String} type The name of the event
     * @throws {TypeError} If the `type` argument is not specified
     */
    constructor(v) {
      this[r] = null, this[p] = v;
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
      return this[p];
    }
  }
  Object.defineProperty(c.prototype, "target", { enumerable: !0 }), Object.defineProperty(c.prototype, "type", { enumerable: !0 });
  class u extends c {
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
      super(v), this[a] = w.code === void 0 ? 0 : w.code, this[s] = w.reason === void 0 ? "" : w.reason, this[d] = w.wasClean === void 0 ? !1 : w.wasClean;
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
      return this[d];
    }
  }
  Object.defineProperty(u.prototype, "code", { enumerable: !0 }), Object.defineProperty(u.prototype, "reason", { enumerable: !0 }), Object.defineProperty(u.prototype, "wasClean", { enumerable: !0 });
  class l extends c {
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
  class E extends c {
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
  Object.defineProperty(E.prototype, "data", { enumerable: !0 }), $n = {
    CloseEvent: u,
    ErrorEvent: l,
    Event: c,
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
            const y = new u("close", {
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
            const g = new c("open");
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
  return $n;
}
var Hn, as;
function Qs() {
  if (as) return Hn;
  as = 1;
  const { tokenChars: t } = it();
  function e(i, o, s) {
    i[o] === void 0 ? i[o] = [s] : i[o].push(s);
  }
  function a(i) {
    const o = /* @__PURE__ */ Object.create(null);
    let s = /* @__PURE__ */ Object.create(null), r = !1, p = !1, d = !1, c, u, l = -1, E = -1, x = -1, f = 0;
    for (; f < i.length; f++)
      if (E = i.charCodeAt(f), c === void 0)
        if (x === -1 && t[E] === 1)
          l === -1 && (l = f);
        else if (f !== 0 && (E === 32 || E === 9))
          x === -1 && l !== -1 && (x = f);
        else if (E === 59 || E === 44) {
          if (l === -1)
            throw new SyntaxError(`Unexpected character at index ${f}`);
          x === -1 && (x = f);
          const v = i.slice(l, x);
          E === 44 ? (e(o, v, s), s = /* @__PURE__ */ Object.create(null)) : c = v, l = x = -1;
        } else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (u === void 0)
        if (x === -1 && t[E] === 1)
          l === -1 && (l = f);
        else if (E === 32 || E === 9)
          x === -1 && l !== -1 && (x = f);
        else if (E === 59 || E === 44) {
          if (l === -1)
            throw new SyntaxError(`Unexpected character at index ${f}`);
          x === -1 && (x = f), e(s, i.slice(l, x), !0), E === 44 && (e(o, c, s), s = /* @__PURE__ */ Object.create(null), c = void 0), l = x = -1;
        } else if (E === 61 && l !== -1 && x === -1)
          u = i.slice(l, f), l = x = -1;
        else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (p) {
        if (t[E] !== 1)
          throw new SyntaxError(`Unexpected character at index ${f}`);
        l === -1 ? l = f : r || (r = !0), p = !1;
      } else if (d)
        if (t[E] === 1)
          l === -1 && (l = f);
        else if (E === 34 && l !== -1)
          d = !1, x = f;
        else if (E === 92)
          p = !0;
        else
          throw new SyntaxError(`Unexpected character at index ${f}`);
      else if (E === 34 && i.charCodeAt(f - 1) === 61)
        d = !0;
      else if (x === -1 && t[E] === 1)
        l === -1 && (l = f);
      else if (l !== -1 && (E === 32 || E === 9))
        x === -1 && (x = f);
      else if (E === 59 || E === 44) {
        if (l === -1)
          throw new SyntaxError(`Unexpected character at index ${f}`);
        x === -1 && (x = f);
        let v = i.slice(l, x);
        r && (v = v.replace(/\\/g, ""), r = !1), e(s, u, v), E === 44 && (e(o, c, s), s = /* @__PURE__ */ Object.create(null), c = void 0), u = void 0, l = x = -1;
      } else
        throw new SyntaxError(`Unexpected character at index ${f}`);
    if (l === -1 || d || E === 32 || E === 9)
      throw new SyntaxError("Unexpected end of input");
    x === -1 && (x = f);
    const h = i.slice(l, x);
    return c === void 0 ? e(o, h, s) : (u === void 0 ? e(s, h, !0) : r ? e(s, u, h.replace(/\\/g, "")) : e(s, u, h), e(o, c, s)), o;
  }
  function n(i) {
    return Object.keys(i).map((o) => {
      let s = i[o];
      return Array.isArray(s) || (s = [s]), s.map((r) => [o].concat(
        Object.keys(r).map((p) => {
          let d = r[p];
          return Array.isArray(d) || (d = [d]), d.map((c) => c === !0 ? p : `${p}=${c}`).join("; ");
        })
      ).join("; ")).join(", ");
    }).join(", ");
  }
  return Hn = { format: n, parse: a }, Hn;
}
var Gn, is;
function la() {
  if (is) return Gn;
  is = 1;
  const t = ds, e = vt, a = Ze, n = uo, i = mo, { randomBytes: o, createHash: s } = Qe, { Duplex: r, Readable: p } = se, { URL: d } = Xe, c = kt(), u = Xs(), l = Zs(), { isBlob: E } = it(), {
    BINARY_TYPES: x,
    CLOSE_TIMEOUT: f,
    EMPTY_BUFFER: h,
    GUID: v,
    kForOnEventAttribute: w,
    kListener: k,
    kStatusCode: A,
    kWebSocket: g,
    NOOP: m
  } = Re(), {
    EventTarget: { addEventListener: y, removeEventListener: S }
  } = mp(), { format: P, parse: L } = Qs(), { toBuffer: I } = Rt(), D = Symbol("kAborted"), H = [8, 13], U = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"], ee = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
  class b extends t {
    /**
     * Create a new `WebSocket`.
     *
     * @param {(String|URL)} address The URL to which to connect
     * @param {(String|String[])} [protocols] The subprotocols
     * @param {Object} [options] Connection options
     */
    constructor(O, q, $) {
      super(), this._binaryType = x[0], this._closeCode = 1006, this._closeFrameReceived = !1, this._closeFrameSent = !1, this._closeMessage = h, this._closeTimer = null, this._errorEmitted = !1, this._extensions = {}, this._paused = !1, this._protocol = "", this._readyState = b.CONNECTING, this._receiver = null, this._sender = null, this._socket = null, O !== null ? (this._bufferedAmount = 0, this._isServer = !1, this._redirects = 0, q === void 0 ? q = [] : Array.isArray(q) || (typeof q == "object" && q !== null ? ($ = q, q = []) : q = [q]), T(this, O, q, $)) : (this._autoPong = $.autoPong, this._closeTimeout = $.closeTimeout, this._isServer = !0);
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
    set binaryType(O) {
      x.includes(O) && (this._binaryType = O, this._receiver && (this._receiver._binaryType = O));
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
    setSocket(O, q, $) {
      const B = new u({
        allowSynchronousEvents: $.allowSynchronousEvents,
        binaryType: this.binaryType,
        extensions: this._extensions,
        isServer: this._isServer,
        maxPayload: $.maxPayload,
        skipUTF8Validation: $.skipUTF8Validation
      }), J = new l(O, this._extensions, $.generateMask);
      this._receiver = B, this._sender = J, this._socket = O, B[g] = this, J[g] = this, O[g] = this, B.on("conclude", Z), B.on("drain", V), B.on("error", K), B.on("message", Q), B.on("ping", xe), B.on("pong", de), J.onerror = oe, O.setTimeout && O.setTimeout(0), O.setNoDelay && O.setNoDelay(), q.length > 0 && O.unshift(q), O.on("close", re), O.on("data", me), O.on("end", we), O.on("error", pe), this._readyState = b.OPEN, this.emit("open");
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
      this._extensions[c.extensionName] && this._extensions[c.extensionName].cleanup(), this._receiver.removeAllListeners(), this._readyState = b.CLOSED, this.emit("close", this._closeCode, this._closeMessage);
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
    close(O, q) {
      if (this.readyState !== b.CLOSED) {
        if (this.readyState === b.CONNECTING) {
          j(this, this._req, "WebSocket was closed before the connection was established");
          return;
        }
        if (this.readyState === b.CLOSING) {
          this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end();
          return;
        }
        this._readyState = b.CLOSING, this._sender.close(O, q, !this._isServer, ($) => {
          $ || (this._closeFrameSent = !0, (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end());
        }), te(this);
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
    ping(O, q, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof O == "function" ? ($ = O, O = q = void 0) : typeof q == "function" && ($ = q, q = void 0), typeof O == "number" && (O = O.toString()), this.readyState !== b.OPEN) {
        M(this, O, $);
        return;
      }
      q === void 0 && (q = !this._isServer), this._sender.ping(O || h, q, $);
    }
    /**
     * Send a pong.
     *
     * @param {*} [data] The data to send
     * @param {Boolean} [mask] Indicates whether or not to mask `data`
     * @param {Function} [cb] Callback which is executed when the pong is sent
     * @public
     */
    pong(O, q, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof O == "function" ? ($ = O, O = q = void 0) : typeof q == "function" && ($ = q, q = void 0), typeof O == "number" && (O = O.toString()), this.readyState !== b.OPEN) {
        M(this, O, $);
        return;
      }
      q === void 0 && (q = !this._isServer), this._sender.pong(O || h, q, $);
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
    send(O, q, $) {
      if (this.readyState === b.CONNECTING)
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      if (typeof q == "function" && ($ = q, q = {}), typeof O == "number" && (O = O.toString()), this.readyState !== b.OPEN) {
        M(this, O, $);
        return;
      }
      const B = {
        binary: typeof O != "string",
        mask: !this._isServer,
        compress: !0,
        fin: !0,
        ...q
      };
      this._extensions[c.extensionName] || (B.compress = !1), this._sender.send(O || h, B, $);
    }
    /**
     * Forcibly close the connection.
     *
     * @public
     */
    terminate() {
      if (this.readyState !== b.CLOSED) {
        if (this.readyState === b.CONNECTING) {
          j(this, this._req, "WebSocket was closed before the connection was established");
          return;
        }
        this._socket && (this._readyState = b.CLOSING, this._socket.destroy());
      }
    }
  }
  Object.defineProperty(b, "CONNECTING", {
    enumerable: !0,
    value: U.indexOf("CONNECTING")
  }), Object.defineProperty(b.prototype, "CONNECTING", {
    enumerable: !0,
    value: U.indexOf("CONNECTING")
  }), Object.defineProperty(b, "OPEN", {
    enumerable: !0,
    value: U.indexOf("OPEN")
  }), Object.defineProperty(b.prototype, "OPEN", {
    enumerable: !0,
    value: U.indexOf("OPEN")
  }), Object.defineProperty(b, "CLOSING", {
    enumerable: !0,
    value: U.indexOf("CLOSING")
  }), Object.defineProperty(b.prototype, "CLOSING", {
    enumerable: !0,
    value: U.indexOf("CLOSING")
  }), Object.defineProperty(b, "CLOSED", {
    enumerable: !0,
    value: U.indexOf("CLOSED")
  }), Object.defineProperty(b.prototype, "CLOSED", {
    enumerable: !0,
    value: U.indexOf("CLOSED")
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
        for (const O of this.listeners(R))
          if (O[w]) return O[k];
        return null;
      },
      set(O) {
        for (const q of this.listeners(R))
          if (q[w]) {
            this.removeListener(R, q);
            break;
          }
        typeof O == "function" && this.addEventListener(R, O, {
          [w]: !0
        });
      }
    });
  }), b.prototype.addEventListener = y, b.prototype.removeEventListener = S, Gn = b;
  function T(R, O, q, $) {
    const B = {
      allowSynchronousEvents: !0,
      autoPong: !0,
      closeTimeout: f,
      protocolVersion: H[1],
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
    if (R._autoPong = B.autoPong, R._closeTimeout = B.closeTimeout, !H.includes(B.protocolVersion))
      throw new RangeError(
        `Unsupported protocol version: ${B.protocolVersion} (supported versions: ${H.join(", ")})`
      );
    let J;
    if (O instanceof d)
      J = O;
    else
      try {
        J = new d(O);
      } catch {
        throw new SyntaxError(`Invalid URL: ${O}`);
      }
    J.protocol === "http:" ? J.protocol = "ws:" : J.protocol === "https:" && (J.protocol = "wss:"), R._url = J.href;
    const be = J.protocol === "wss:", ge = J.protocol === "ws+unix:";
    let ze;
    if (J.protocol !== "ws:" && !be && !ge ? ze = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"` : ge && !J.pathname ? ze = "The URL's pathname is empty" : J.hash && (ze = "The URL contains a fragment identifier"), ze) {
      const Y = new SyntaxError(ze);
      if (R._redirects === 0)
        throw Y;
      C(R, Y);
      return;
    }
    const ma = be ? 443 : 80, fa = o(16).toString("base64"), ha = be ? e.request : a.request, Me = /* @__PURE__ */ new Set();
    let $e;
    if (B.createConnection = B.createConnection || (be ? N : z), B.defaultPort = B.defaultPort || ma, B.port = J.port || ma, B.host = J.hostname.startsWith("[") ? J.hostname.slice(1, -1) : J.hostname, B.headers = {
      ...B.headers,
      "Sec-WebSocket-Version": B.protocolVersion,
      "Sec-WebSocket-Key": fa,
      Connection: "Upgrade",
      Upgrade: "websocket"
    }, B.path = J.pathname + J.search, B.timeout = B.handshakeTimeout, B.perMessageDeflate && ($e = new c(
      B.perMessageDeflate !== !0 ? B.perMessageDeflate : {},
      !1,
      B.maxPayload
    ), B.headers["Sec-WebSocket-Extensions"] = P({
      [c.extensionName]: $e.offer()
    })), q.length) {
      for (const Y of q) {
        if (typeof Y != "string" || !ee.test(Y) || Me.has(Y))
          throw new SyntaxError(
            "An invalid or duplicated subprotocol was specified"
          );
        Me.add(Y);
      }
      B.headers["Sec-WebSocket-Protocol"] = q.join(",");
    }
    if (B.origin && (B.protocolVersion < 13 ? B.headers["Sec-WebSocket-Origin"] = B.origin : B.headers.Origin = B.origin), (J.username || J.password) && (B.auth = `${J.username}:${J.password}`), ge) {
      const Y = B.path.split(":");
      B.socketPath = Y[0], B.path = Y[1];
    }
    let ce;
    if (B.followRedirects) {
      if (R._redirects === 0) {
        R._originalIpc = ge, R._originalSecure = be, R._originalHostOrSocketPath = ge ? B.socketPath : J.host;
        const Y = $ && $.headers;
        if ($ = { ...$, headers: {} }, Y)
          for (const [fe, Fe] of Object.entries(Y))
            $.headers[fe.toLowerCase()] = Fe;
      } else if (R.listenerCount("redirect") === 0) {
        const Y = ge ? R._originalIpc ? B.socketPath === R._originalHostOrSocketPath : !1 : R._originalIpc ? !1 : J.host === R._originalHostOrSocketPath;
        (!Y || R._originalSecure && !be) && (delete B.headers.authorization, delete B.headers.cookie, Y || delete B.headers.host, B.auth = void 0);
      }
      B.auth && !$.headers.authorization && ($.headers.authorization = "Basic " + Buffer.from(B.auth).toString("base64")), ce = R._req = ha(B), R._redirects && R.emit("redirect", R.url, ce);
    } else
      ce = R._req = ha(B);
    B.timeout && ce.on("timeout", () => {
      j(R, ce, "Opening handshake has timed out");
    }), ce.on("error", (Y) => {
      ce === null || ce[D] || (ce = R._req = null, C(R, Y));
    }), ce.on("response", (Y) => {
      const fe = Y.headers.location, Fe = Y.statusCode;
      if (fe && B.followRedirects && Fe >= 300 && Fe < 400) {
        if (++R._redirects > B.maxRedirects) {
          j(R, ce, "Maximum redirects exceeded");
          return;
        }
        ce.abort();
        let He;
        try {
          He = new d(fe, O);
        } catch {
          const Be = new SyntaxError(`Invalid URL: ${fe}`);
          C(R, Be);
          return;
        }
        T(R, He, q, $);
      } else R.emit("unexpected-response", ce, Y) || j(
        R,
        ce,
        `Unexpected server response: ${Y.statusCode}`
      );
    }), ce.on("upgrade", (Y, fe, Fe) => {
      if (R.emit("upgrade", Y), R.readyState !== b.CONNECTING) return;
      ce = R._req = null;
      const He = Y.headers.upgrade;
      if (He === void 0 || He.toLowerCase() !== "websocket") {
        j(R, fe, "Invalid Upgrade header");
        return;
      }
      const xa = s("sha1").update(fa + v).digest("base64");
      if (Y.headers["sec-websocket-accept"] !== xa) {
        j(R, fe, "Invalid Sec-WebSocket-Accept header");
        return;
      }
      const Be = Y.headers["sec-websocket-protocol"];
      let Ge;
      if (Be !== void 0 ? Me.size ? Me.has(Be) || (Ge = "Server sent an invalid subprotocol") : Ge = "Server sent a subprotocol but none was requested" : Me.size && (Ge = "Server sent no subprotocol"), Ge) {
        j(R, fe, Ge);
        return;
      }
      Be && (R._protocol = Be);
      const va = Y.headers["sec-websocket-extensions"];
      if (va !== void 0) {
        if (!$e) {
          j(R, fe, "Server sent a Sec-WebSocket-Extensions header but no extension was requested");
          return;
        }
        let Tt;
        try {
          Tt = L(va);
        } catch {
          j(R, fe, "Invalid Sec-WebSocket-Extensions header");
          return;
        }
        const ba = Object.keys(Tt);
        if (ba.length !== 1 || ba[0] !== c.extensionName) {
          j(R, fe, "Server indicated an extension that was not requested");
          return;
        }
        try {
          $e.accept(Tt[c.extensionName]);
        } catch {
          j(R, fe, "Invalid Sec-WebSocket-Extensions header");
          return;
        }
        R._extensions[c.extensionName] = $e;
      }
      R.setSocket(fe, Fe, {
        allowSynchronousEvents: B.allowSynchronousEvents,
        generateMask: B.generateMask,
        maxPayload: B.maxPayload,
        skipUTF8Validation: B.skipUTF8Validation
      });
    }), B.finishRequest ? B.finishRequest(ce, R) : ce.end();
  }
  function C(R, O) {
    R._readyState = b.CLOSING, R._errorEmitted = !0, R.emit("error", O), R.emitClose();
  }
  function z(R) {
    return R.path = R.socketPath, n.connect(R);
  }
  function N(R) {
    return R.path = void 0, !R.servername && R.servername !== "" && (R.servername = n.isIP(R.host) ? "" : R.host), i.connect(R);
  }
  function j(R, O, q) {
    R._readyState = b.CLOSING;
    const $ = new Error(q);
    Error.captureStackTrace($, j), O.setHeader ? (O[D] = !0, O.abort(), O.socket && !O.socket.destroyed && O.socket.destroy(), process.nextTick(C, R, $)) : (O.destroy($), O.once("error", R.emit.bind(R, "error")), O.once("close", R.emitClose.bind(R)));
  }
  function M(R, O, q) {
    if (O) {
      const $ = E(O) ? O.size : I(O).length;
      R._socket ? R._sender._bufferedBytes += $ : R._bufferedAmount += $;
    }
    if (q) {
      const $ = new Error(
        `WebSocket is not open: readyState ${R.readyState} (${U[R.readyState]})`
      );
      process.nextTick(q, $);
    }
  }
  function Z(R, O) {
    const q = this[g];
    q._closeFrameReceived = !0, q._closeMessage = O, q._closeCode = R, q._socket[g] !== void 0 && (q._socket.removeListener("data", me), process.nextTick(G, q._socket), R === 1005 ? q.close() : q.close(R, O));
  }
  function V() {
    const R = this[g];
    R.isPaused || R._socket.resume();
  }
  function K(R) {
    const O = this[g];
    O._socket[g] !== void 0 && (O._socket.removeListener("data", me), process.nextTick(G, O._socket), O.close(R[A])), O._errorEmitted || (O._errorEmitted = !0, O.emit("error", R));
  }
  function W() {
    this[g].emitClose();
  }
  function Q(R, O) {
    this[g].emit("message", R, O);
  }
  function xe(R) {
    const O = this[g];
    O._autoPong && O.pong(R, !this._isServer, m), O.emit("ping", R);
  }
  function de(R) {
    this[g].emit("pong", R);
  }
  function G(R) {
    R.resume();
  }
  function oe(R) {
    const O = this[g];
    O.readyState !== b.CLOSED && (O.readyState === b.OPEN && (O._readyState = b.CLOSING, te(O)), this._socket.end(), O._errorEmitted || (O._errorEmitted = !0, O.emit("error", R)));
  }
  function te(R) {
    R._closeTimer = setTimeout(
      R._socket.destroy.bind(R._socket),
      R._closeTimeout
    );
  }
  function re() {
    const R = this[g];
    if (this.removeListener("close", re), this.removeListener("data", me), this.removeListener("end", we), R._readyState = b.CLOSING, !this._readableState.endEmitted && !R._closeFrameReceived && !R._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
      const O = this.read(this._readableState.length);
      R._receiver.write(O);
    }
    R._receiver.end(), this[g] = void 0, clearTimeout(R._closeTimer), R._receiver._writableState.finished || R._receiver._writableState.errorEmitted ? R.emitClose() : (R._receiver.on("error", W), R._receiver.on("finish", W));
  }
  function me(R) {
    this[g]._receiver.write(R) || this.pause();
  }
  function we() {
    const R = this[g];
    R._readyState = b.CLOSING, R._receiver.end(), this.end();
  }
  function pe() {
    const R = this[g];
    this.removeListener("error", pe), this.on("error", m), R && (R._readyState = b.CLOSING, this.destroy());
  }
  return Gn;
}
var Wn, ss;
function fp() {
  if (ss) return Wn;
  ss = 1, la();
  const { Duplex: t } = se;
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
    const p = new t({
      ...s,
      autoDestroy: !1,
      emitClose: !1,
      objectMode: !1,
      writableObjectMode: !1
    });
    return o.on("message", function(c, u) {
      const l = !u && p._readableState.objectMode ? c.toString() : c;
      p.push(l) || o.pause();
    }), o.once("error", function(c) {
      p.destroyed || (r = !1, p.destroy(c));
    }), o.once("close", function() {
      p.destroyed || p.push(null);
    }), p._destroy = function(d, c) {
      if (o.readyState === o.CLOSED) {
        c(d), process.nextTick(e, p);
        return;
      }
      let u = !1;
      o.once("error", function(E) {
        u = !0, c(E);
      }), o.once("close", function() {
        u || c(d), process.nextTick(e, p);
      }), r && o.terminate();
    }, p._final = function(d) {
      if (o.readyState === o.CONNECTING) {
        o.once("open", function() {
          p._final(d);
        });
        return;
      }
      o._socket !== null && (o._socket._writableState.finished ? (d(), p._readableState.endEmitted && p.destroy()) : (o._socket.once("finish", function() {
        d();
      }), o.close()));
    }, p._read = function() {
      o.isPaused && o.resume();
    }, p._write = function(d, c, u) {
      if (o.readyState === o.CONNECTING) {
        o.once("open", function() {
          p._write(d, c, u);
        });
        return;
      }
      o.send(d, u);
    }, p.on("end", a), p.on("error", n), p;
  }
  return Wn = i, Wn;
}
fp();
Xs();
Zs();
la();
var Vn, os;
function hp() {
  if (os) return Vn;
  os = 1;
  const { tokenChars: t } = it();
  function e(a) {
    const n = /* @__PURE__ */ new Set();
    let i = -1, o = -1, s = 0;
    for (s; s < a.length; s++) {
      const p = a.charCodeAt(s);
      if (o === -1 && t[p] === 1)
        i === -1 && (i = s);
      else if (s !== 0 && (p === 32 || p === 9))
        o === -1 && i !== -1 && (o = s);
      else if (p === 44) {
        if (i === -1)
          throw new SyntaxError(`Unexpected character at index ${s}`);
        o === -1 && (o = s);
        const d = a.slice(i, o);
        if (n.has(d))
          throw new SyntaxError(`The "${d}" subprotocol is duplicated`);
        n.add(d), i = o = -1;
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
  return Vn = { parse: e }, Vn;
}
var Kn, rs;
function xp() {
  if (rs) return Kn;
  rs = 1;
  const t = ds, e = Ze, { Duplex: a } = se, { createHash: n } = Qe, i = Qs(), o = kt(), s = hp(), r = la(), { CLOSE_TIMEOUT: p, GUID: d, kWebSocket: c } = Re(), u = /^[+/0-9A-Za-z]{22}==$/, l = 0, E = 1, x = 2;
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
        closeTimeout: p,
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
      if (m.port != null ? (this._server = e.createServer((S, P) => {
        const L = e.STATUS_CODES[426];
        P.writeHead(426, {
          "Content-Length": L.length,
          "Content-Type": "text/plain"
        }), P.end(L);
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
          upgrade: (P, L, I) => {
            this.handleUpgrade(P, L, I, S);
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
    handleUpgrade(m, y, S, P) {
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
      if (L === void 0 || !u.test(L)) {
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
      const H = m.headers["sec-websocket-protocol"];
      let U = /* @__PURE__ */ new Set();
      if (H !== void 0)
        try {
          U = s.parse(H);
        } catch {
          A(this, m, y, 400, "Invalid Sec-WebSocket-Protocol header");
          return;
        }
      const ee = m.headers["sec-websocket-extensions"], b = {};
      if (this.options.perMessageDeflate && ee !== void 0) {
        const T = new o(
          this.options.perMessageDeflate,
          !0,
          this.options.maxPayload
        );
        try {
          const C = i.parse(ee);
          C[o.extensionName] && (T.accept(C[o.extensionName]), b[o.extensionName] = T);
        } catch {
          A(this, m, y, 400, "Invalid or unacceptable Sec-WebSocket-Extensions header");
          return;
        }
      }
      if (this.options.verifyClient) {
        const T = {
          origin: m.headers[`${D === 8 ? "sec-websocket-origin" : "origin"}`],
          secure: !!(m.socket.authorized || m.socket.encrypted),
          req: m
        };
        if (this.options.verifyClient.length === 2) {
          this.options.verifyClient(T, (C, z, N, j) => {
            if (!C)
              return k(y, z || 401, N, j);
            this.completeUpgrade(
              b,
              L,
              U,
              m,
              y,
              S,
              P
            );
          });
          return;
        }
        if (!this.options.verifyClient(T)) return k(y, 401);
      }
      this.completeUpgrade(b, L, U, m, y, S, P);
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
    completeUpgrade(m, y, S, P, L, I, D) {
      if (!L.readable || !L.writable) return L.destroy();
      if (L[c])
        throw new Error(
          "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
        );
      if (this._state > l) return k(L, 503);
      const U = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${n("sha1").update(y + d).digest("base64")}`
      ], ee = new this.options.WebSocket(null, void 0, this.options);
      if (S.size) {
        const b = this.options.handleProtocols ? this.options.handleProtocols(S, P) : S.values().next().value;
        b && (U.push(`Sec-WebSocket-Protocol: ${b}`), ee._protocol = b);
      }
      if (m[o.extensionName]) {
        const b = m[o.extensionName].params, T = i.format({
          [o.extensionName]: [b]
        });
        U.push(`Sec-WebSocket-Extensions: ${T}`), ee._extensions = m;
      }
      this.emit("headers", U, P), L.write(U.concat(`\r
`).join(`\r
`)), L.removeListener("error", w), ee.setSocket(L, I, {
        allowSynchronousEvents: this.options.allowSynchronousEvents,
        maxPayload: this.options.maxPayload,
        skipUTF8Validation: this.options.skipUTF8Validation
      }), this.clients && (this.clients.add(ee), ee.on("close", () => {
        this.clients.delete(ee), this._shouldEmitClose && !this.clients.size && process.nextTick(v, this);
      })), D(ee, P);
    }
  }
  Kn = f;
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
` + Object.keys(S).map((P) => `${P}: ${S[P]}`).join(`\r
`) + `\r
\r
` + y
    );
  }
  function A(g, m, y, S, P, L) {
    if (g.listenerCount("wsClientError")) {
      const I = new Error(P);
      Error.captureStackTrace(I, A), g.emit("wsClientError", I, y, m);
    } else
      k(y, S, P, L);
  }
  return Kn;
}
xp();
const _e = "http://localhost:8000";
ae.handle("generation:generate-image", async (t, e) => {
  var a, n;
  try {
    return (await X.post(`${_e}/api/generate/image`, e)).data;
  } catch (i) {
    return console.error("Image generation error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("generation:generate-video", async (t, e) => {
  var a, n;
  try {
    return (await X.post(`${_e}/api/generate/video`, e)).data;
  } catch (i) {
    return console.error("Video generation error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("generation:batch", async (t, e) => {
  var a, n;
  try {
    const { prompts: i, ...o } = e, s = [];
    for (const r of i) {
      const p = await X.post(`${_e}/api/generate/image`, {
        ...o,
        prompt: r
      });
      s.push(p.data.job_id);
    }
    return {
      success: !0,
      jobIds: s
    };
  } catch (i) {
    return console.error("Batch generation error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("generation:get-status", async (t, e) => {
  var a, n;
  try {
    return (await X.get(`${_e}/api/jobs/${e}`)).data;
  } catch (i) {
    return console.error("Get status error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("generation:cancel", async (t, e) => {
  var a, n;
  try {
    return (await X.post(`${_e}/api/jobs/${e}/cancel`)).data;
  } catch (i) {
    return console.error("Cancel job error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("generation:list-jobs", async (t, e = {}) => {
  var a, n;
  try {
    const { status: i, limit: o = 50 } = e;
    let s = `${_e}/api/jobs?limit=${o}`;
    return i && (s += `&status=${i}`), (await X.get(s)).data;
  } catch (i) {
    return console.error("List jobs error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("system:get-info", async () => {
  try {
    return (await X.get(`${_e}/api/system/info`)).data;
  } catch (t) {
    return console.error("Get system info error:", t), {
      gpu_available: !1,
      comfyui_connected: !1,
      models_count: 0
    };
  }
});
ae.handle("models:list", async () => {
  try {
    return (await X.get(`${_e}/api/models`)).data;
  } catch (t) {
    return console.error("List models error:", t), [];
  }
});
ae.handle("models:download", async (t, e) => {
  var a, n;
  try {
    return (await X.post(`${_e}/api/models/${e}/download`)).data;
  } catch (i) {
    return console.error("Download model error:", i), {
      success: !1,
      error: ((n = (a = i.response) == null ? void 0 : a.data) == null ? void 0 : n.detail) || i.message
    };
  }
});
ae.handle("models:get-status", async (t, e) => {
  try {
    return (await X.get(`${_e}/api/models/${e}/status`)).data;
  } catch (a) {
    return console.error("Get model status error:", a), null;
  }
});
const vp = so(import.meta.url), xt = ps(vp), Pe = new oo({
  defaults: {
    recentProjects: [],
    settings: {
      theme: "dark",
      autoSave: !0,
      defaultOutputPath: "",
      backendAutostart: !0
    },
    firstRun: !0,
    modelsDownloaded: []
  }
});
let ie = null, le = null;
function ua() {
  const t = !!process.env.VITE_DEV_SERVER_URL, a = process.platform === "win32" ? "VisionStudio-Backend.exe" : "VisionStudio-Backend";
  if (t) {
    const n = Ce(xt, "../../backend/dist", a);
    return Jn.existsSync(n) ? n : null;
  } else {
    const n = Ce(process.resourcesPath, a);
    return Jn.existsSync(n) ? n : null;
  }
}
function bp() {
  const t = ua();
  if (t)
    return console.log("📦 Using bundled Python backend:", t), {
      command: t,
      args: [],
      cwd: ps(t)
    };
  const e = Ce(xt, "../../backend"), a = Pe.get("settings").pythonPath || "python";
  return console.log("🐍 Using system Python:", a), {
    command: a,
    args: ["main.py"],
    cwd: e
  };
}
function eo() {
  return new Promise((t) => {
    var n, i;
    const e = bp();
    if (!e) {
      console.error("❌ No backend found!"), qe.showErrorBox(
        "Backend Not Found",
        "Could not find the Python backend. Please reinstall the application."
      ), t(!1);
      return;
    }
    console.log("🚀 Starting Python backend..."), console.log(`   Command: ${e.command}`), console.log(`   Args: ${e.args.join(" ")}`), console.log(`   CWD: ${e.cwd}`), le = ea(e.command, e.args, {
      cwd: e.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        // Set models directory to app data
        MODELS_DIR: Ce(Se.getPath("userData"), "models"),
        OUTPUT_DIR: Ce(Se.getPath("userData"), "outputs")
      },
      detached: !1
    });
    let a = !1;
    (n = le.stdout) == null || n.on("data", (o) => {
      const s = o.toString().trim();
      console.log(`[Python] ${s}`), (s.includes("Uvicorn running") || s.includes("Application startup complete")) && (a || (a = !0, console.log("✅ Backend started successfully"), t(!0)));
    }), (i = le.stderr) == null || i.on("data", (o) => {
      const s = o.toString().trim();
      console.error(`[Python Error] ${s}`), !a && s.includes("Error");
    }), le.on("error", (o) => {
      console.error("❌ Failed to start Python backend:", o), qe.showErrorBox(
        "Backend Error",
        `Failed to start Python backend:
${o.message}

Please ensure you have the required dependencies installed.`
      ), a || (a = !0, t(!1));
    }), le.on("close", (o) => {
      console.log(`Python backend exited with code ${o}`), le = null, ie == null || ie.webContents.send("backend:status", { running: !1 });
    }), setTimeout(() => {
      a || (console.error("❌ Backend startup timeout"), t(!1));
    }, 3e4);
  });
}
function da() {
  var t;
  if (le) {
    if (console.log("🛑 Stopping Python backend..."), process.platform === "win32")
      try {
        ea("taskkill", ["/pid", ((t = le.pid) == null ? void 0 : t.toString()) || "", "/f", "/t"]);
      } catch {
        le.kill("SIGTERM");
      }
    else
      le.kill("SIGTERM");
    le = null;
  }
}
async function gp() {
  Pe.get("firstRun") && (console.log("🎉 First run detected!"), (await qe.showMessageBox(ie, {
    type: "info",
    title: "Welcome to Vision Studio",
    message: "Welcome to Vision Studio!",
    detail: `This is your first time running the app. AI models will be downloaded on first use.

GPU detected: ` + (await yp() ? "Yes" : "No"),
    buttons: ["Get Started", "Open Settings"],
    defaultId: 0
  })).response === 1 && (ie == null || ie.webContents.send("navigate", "settings")), Pe.set("firstRun", !1));
}
async function yp() {
  return new Promise((t) => {
    var n;
    const e = ea("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
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
function to() {
  ie = new io({
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
      preload: Ce(xt, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    },
    show: !1
  }), process.env.VITE_DEV_SERVER_URL ? (ie.loadURL(process.env.VITE_DEV_SERVER_URL), ie.webContents.openDevTools()) : ie.loadFile(Ce(xt, "../dist/index.html")), ie.once("ready-to-show", () => {
    ie == null || ie.show(), gp();
  }), ie.on("closed", () => {
    ie = null;
  });
}
Se.whenReady().then(async () => {
  to(), Pe.get("settings").backendAutostart && (await eo() || qe.showMessageBox(ie, {
    type: "warning",
    title: "Backend Not Started",
    message: "Could not start the AI backend",
    detail: "Some features may not work. You can try starting it manually from Settings.",
    buttons: ["OK"]
  }));
});
Se.on("window-all-closed", () => {
  da(), process.platform !== "darwin" && Se.quit();
});
Se.on("activate", () => {
  ie === null && to();
});
Se.on("before-quit", () => {
  da();
});
ae.handle("app:get-version", () => Se.getVersion());
ae.handle("app:open-external", (t, e) => {
  ao.openExternal(e);
});
ae.handle("dialog:select-folder", async () => (await qe.showOpenDialog(ie, {
  properties: ["openDirectory"]
})).filePaths[0] || null);
ae.handle("dialog:save-file", async (t, e) => (await qe.showSaveDialog(ie, {
  defaultPath: e.defaultPath,
  filters: e.filters
})).filePath || null);
ae.handle("store:get", (t, e) => Pe.get(e));
ae.handle("store:set", (t, e, a) => {
  Pe.set(e, a);
});
ae.handle("store:reset", () => {
  Pe.clear();
});
ae.handle("backend:start", async () => le ? { success: !1, error: "Backend already running" } : { success: await eo() });
ae.handle("backend:stop", () => (da(), { success: !0 }));
ae.handle("backend:status", () => ({
  running: le !== null && le.exitCode === null,
  pid: le == null ? void 0 : le.pid,
  bundled: ua() !== null
}));
ae.handle("backend:check-bundled", () => {
  const t = ua();
  return {
    exists: t !== null,
    path: t
  };
});
ae.handle("app:get-path", (t, e) => Se.getPath(e));
