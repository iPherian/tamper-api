/**
 * TamperApi
 *
 * An extension to provide page-side javascript the ability to modify requests
 * and responses, in particular the headers.
 *
 */

/**
 * TamperSpec notes:
 *
 * Interally, the property 'requestId' is sometimes set on a TamperSpec obj,
 * when it is neccessary to track which response corresponds to what request.
 */

/**
 * The log level. If 'error' only errors are printed to console. If 'warn',
 * errors and warnings are printed. If 'debug' everything is printed.
 * @type {String}
 */
const logLevel = 'error';
var tamperState = new TamperStore();

/**
 * Constructs a new TamperStore
 * @classdesc A class for the management and retrieval of modification
 * instructions, and the requests / responses they should be applied to.
 * @constructor
 */
function TamperStore() {
  this._data = {};
  this._patternMods = [];
}

TamperStore.prototype.addPattern = function(params) {
  if (typeof params.regexes === "undefined" &&
      typeof params.urls === "undefined") {
    throw new Error("neither params.regexes nor params.urls specified.");
  }
  if (typeof params.tamper === "undefined") {
    throw new Error("params.tamper not specified.");
  }
  /**
   We tend to clone everything stored / retrieved as doing otherwise may cause
   behavior the client does not expect, e.g. if the client overwrites some of
   the properties of 'params' after storing.
  */
  params = deepClone(params);
  params.tamper = this._normalizeTamperSpec(params.tamper);
  this._patternMods.unshift(params);
};

/**
 * Retrieves the TamperSpec which should modify the given request url in the
 * given environment.
 * @param  {Number} tabId Chrome's tabId
 * @param  {Number} frameId Chrome's frameId
 * @param  {String} url request url
 * @return {TamperSpec|null} A TamperSpec if one applies, or null.
 */
TamperStore.prototype.get = function(tabId, frameId, url) {
  var key = this.makeKey(tabId, frameId, url),
      tamperSpec = tamperState.getDirect(key);
  if (tamperSpec !== null) {
    return tamperSpec;
  }
  tamperSpec = this._scanPatternMods(url);
  return tamperSpec;
};

/**
 * Stores a TamperSpec for given url and chrome environment.
 * @param  {String} url
 * @param  {TamperSpec} modifyOpts
 */
TamperStore.prototype.set = function(tabId, frameId, url, modifyOpts) {
  var key = tamperState.makeKey(tabId, frameId, url);
  return tamperState.setDirect(key, modifyOpts);
};

TamperStore.prototype.remove = function(tabId, frameId, url) {
  var key = tamperState.makeKey(tabId, frameId, url);
  return tamperState.removeDirect(key);
};

TamperStore.prototype.makeKey = function(tabId, frameId, url) {
  return tabId + "::" + frameId + "::" + url;
};

/**
 * Stores a TamperSpec for given key, which is returned by
 * TamperStore#makeKey(...)
 * @param  {String} key
 * @param  {TamperSpec} value
 */
TamperStore.prototype.setDirect = function(key, value) {
  value = deepClone(value);
  value = this._normalizeTamperSpec(value);
  value.key = key;
  this._data[key] = value;
};

TamperStore.prototype.getDirect = function(key) {
  var value = tamperState._data[key];
  if (typeof value === "undefined" || value === null) {
    return null;
  }
  return deepClone(value);
};

TamperStore.prototype.removeDirect = function(key) {
  delete tamperState._data[key];
};

TamperStore.prototype.getByRequestId = function(requestId) {
  for (var key in this._data) {
    var modifyOpts = this._data[key];
    if (modifyOpts.requestId === requestId) {
      return deepClone(modifyOpts);
    }
  }
  return null;
};

TamperStore.prototype.getData = function() { return tamperState._data; };

/**
 * Scans the registered regex based tamper entries for a match.
 * @private
 * @param  {String} url the url to match against
 * @return {TamperSpec|null} The matched tamper entry, or null if none
 * matched.
 */
TamperStore.prototype._scanPatternMods = function(url) {
  var tamperSpec = null;
  tamperState._patternMods.some((patternEntry) => {
    var matched;
    if (patternEntry.regexes) {
      matched =
          patternEntry.regexes.some((regex) => url.match(makeRegex(regex)));
    } else {
      matched = patternEntry.urls.some((allowedUrl) => url === allowedUrl);
    }
    if (matched) {
      tamperSpec = patternEntry.tamper;
      return true;
    }
  });
  return deepClone(tamperSpec);
};

TamperStore.prototype._normalizeTamperSpec = function(tamperSpec = {}) {
  defaults(tamperSpec, {
    headers : {},
    remove : [],
    response : {},
    opts : {},
  });
  defaults(tamperSpec.response, {
    headers : {},
    remove : [],
  });
  var doNormalize = function(obj) {
    for (var name in obj.headers) {
      if (obj.headers[name] === null) {
        delete obj.headers[name];
        obj.remove.push(name);
      }
    }
  };
  doNormalize(tamperSpec);
  doNormalize(tamperSpec.response);
  return tamperSpec;
};

var dconsole;
dconsole = {
  log : function() {
    if (!dconsole._shouldPrint('log')) {
      return;
    }
    console.log.apply(console.log, arguments);
  },
  error : function() {
    if (!dconsole._shouldPrint('error')) {
      return;
    }
    console.error.apply(console.error, arguments);
  },
  debug : function() {
    if (!dconsole._shouldPrint('debug')) {
      return;
    }
    console.log.apply(console.log, arguments);
  },
  _shouldPrint : function(msgType) {
    return (dconsole._typeToNumber(msgType) >=
            dconsole._typeToNumber(logLevel));
  },
  _typeToNumber : function(msgType) {
    var lookup = {
      'debug' : 1,
      'log' : 2,
      'error' : 3,
    };
    return lookup[msgType];
  }
};

/**
  The client must send us a url which ends in $TamperApi:b64
  here b64 represents a base 64 encoded string (see b64EncodeUnicode func)
  of a JSON string, the object which produced the JSON being like {TamperSpec}
  (described elsewhere). Usually handled transparently by the page-side api.
*/
chrome.webRequest.onBeforeRequest.addListener(function(details) {
  dconsole.debug("tamperApi: onBeforeRequest: details: ", details);
  var match = details.url.match(/^(.*)(\$TamperApi:)([^\/]*)$/);
  if (match === null) {
    return;
  }
  var origUrl = match[1];
  dconsole.debug(
      "tamperApi::onBeforeRequest: tamperApi url syntax detected. orig url was: ",
      origUrl, " tamperApi query (pre decode) was: ", match[2] + match[3]);
  var altRequestId =
      tamperState.makeKey(details.tabId, details.frameId, origUrl);
  dconsole.debug(
      "tamperApi::onBeforeRequest: scheduling request for modification where alternate id was: ",
      altRequestId);
  var reqModifyOpts = decodeReqModifyOpts(match[3]);
  reqModifyOpts.requestId = null;
  dconsole.debug("tamperApi::onBeforeRequest: modifyOpts given was: ",
                 reqModifyOpts);
  tamperState.set(details.tabId, details.frameId, origUrl, reqModifyOpts);

  return {redirectUrl : origUrl};
}, {urls : [ "<all_urls>" ]}, [ "blocking" ]);

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
  var altRequestId =
      tamperState.makeKey(details.tabId, details.frameId, details.url);
  dconsole.debug("tamperApi: onBeforeSendHeaders: saw request with alt id: ",
                 altRequestId);
  var reqModifyOpts =
      tamperState.get(details.tabId, details.frameId, details.url);
  if (reqModifyOpts === null) {
    return;
  }
  dconsole.debug(
      "tamperApi: onBeforeSendHeaders: detected request scheduled for modification:",
      altRequestId);
  dconsole.debug("tamperApi: onBeforeSendHeaders: modifyOpts was: ",
                 reqModifyOpts);
  var requestHeaders = details.requestHeaders;
  if (reqModifyOpts.headers) {
    requestHeaders = setHeaders(requestHeaders, reqModifyOpts.headers);
  }
  if (reqModifyOpts.remove) {
    requestHeaders = removeHeaders(requestHeaders, reqModifyOpts.remove);
  }
  reqModifyOpts.requestId = details.requestId;
  tamperState.set(details.tabId, details.frameId, details.url, reqModifyOpts);

  return {requestHeaders : requestHeaders};
}, {urls : [ "<all_urls>" ]}, [ "blocking", "requestHeaders" ]);

chrome.webRequest.onHeadersReceived.addListener(function(details) {
  dconsole.debug("tamperApi: onHeadersReceived: details: ", details);
  var reqModifyOpts = tamperState.getByRequestId(details.requestId);
  if (reqModifyOpts === null) {
    return;
  }
  var responseHeaders = null;
  if (reqModifyOpts.response) {
    responseHeaders = details.responseHeaders;
    if (reqModifyOpts.response.headers) {
      responseHeaders =
          setHeaders(responseHeaders, reqModifyOpts.response.headers);
    }
    if (reqModifyOpts.response.remove) {
      responseHeaders =
          removeHeaders(responseHeaders, reqModifyOpts.response.remove);
    }
  }
  var redirectTarget = checkIfRedirect(details);
  if (redirectTarget === null) {
    dconsole.debug(
        "tamperApi: onHeadersReceived: request received which seems to be done (no redirects): ",
        details);
    /**
     * By default, we don't remove the tamper spec for a url.
     *
     * This is for e.g. partial content (Range header), or other instances where
     * the browser will continually re-request an url. It would be nice if the
     * browser used the original (including tamper spec string) url, but chrome
     * seems to use the url *after* we strip out the tamper spec and internally
     * redirect, which is useless to us.
     *
     * The user may specify to remove after one match, however, by setting
     * <TamperSpec.opts.once> to true.
     */
    if (reqModifyOpts.opts.once) {
      tamperState.removeDirect(reqModifyOpts.key);
    }
  } else {
    dconsole.debug(
        "tamperApi: onHeadersReceived: request received and is redirecting to: ",
        redirectTarget, " details was: ", details);
    tamperState.removeDirect(reqModifyOpts.key);
    tamperState.set(details.tabId, details.frameId, redirectTarget,
                    reqModifyOpts);
  }
  dconsole.debug(
      "tamperApi: onHeadersReceived: at end of handler tamperState data: ",
      tamperState.getData());
  if (responseHeaders !== null) {
    dconsole.debug("modifying response headers to: ", responseHeaders);
    return {responseHeaders : responseHeaders};
  }
}, {urls : [ "<all_urls>" ]}, [ "blocking", "responseHeaders" ]);

/**
 * This might have been used to fix some broken redirect chains, but doesn't
 * fire for some reason.
 */
chrome.webRequest.onBeforeRedirect.addListener(function(details) {
  dconsole.debug("tamperApi: onBeforeRedirect: details: ", details);
}, {urls : [ "<all_urls>" ]}, [ "responseHeaders" ]);

chrome.webRequest.onCompleted.addListener(function(details) {
  // unused at the moment.
}, {urls : [ "<all_urls>" ]}, [ "responseHeaders" ]);

/**
 * A message from the client side.
 * @typedef {Object} TamperApiMsg
 * @property {TamperCmd} command
 * @property {Object} options user provided object. Req'd properties depend on
 * 'command'.
 */

/**
 * :String
 * @typedef TamperCmd
 * @property {String} sendBackground Prompts an echo response from extension.
 * @property {String} RegisterCb Registers a callback for request/response.
 * Requires that TamperApiMsg.cb be set to a stringified function. Not
 * implemented as of now.
 * @property {String} MetaTamper Provides for normal tampering on requests whose
 * urls match one of the provides regexes. Either TamperApiMsg.options.regexes
 * or TamperApiMsg.options.urls must be set. For 'regexes', it is an array of
 * RegexSpec. If using the page-size tamperApi.add(), you may specify the
 * regexes as actual js RegExp objs. For 'urls' it is an array of url strings.
 * In either case, any one particular url / regex which matches will trigger
 * the tampering. TamperApiMsg.options.tamper must be set a TamperSpec.
 */

/**
 * A regex specification (array). Property names are the indexes.
 * @typedef RegexSpec
 * @type {Array}
 * @property {String} 0 a regex string.
 * @property {String} [1] a list of modifiers to the regex. E.g. 'gi' sets it to
 * global case-insensitive.
 */

/**
 * @param  {TamperApiMsg} msg
 */
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (!msg.command) {
    sendResponse({
      success : false,
      msg : "msg did not have 'command' property, which is required."
    });
    return;
  }
  var cmd = msg.command;
  if (cmd === "sendBackground") {
    dconsole.debug(
        "TamperApi: background: received sendBackground command. full msg was: ",
        msg);
    sendResponse(
        "this is a response from background script to content script via sendResponse callback.");
  } else if (cmd === "RegisterCb") {
    throw new Error("not implemented.");
  } else if (cmd === "MetaTamper") {
    dconsole.debug(
        "TamperApi: background: received MetaTamper cmd. full msg was: ", msg);
    addMetaTamper(msg.options);
    sendResponse(
        {success : true, msg : "MetaTamper entry created successfully."});
  } else {
    dconsole.error(
        "TamperApi: background: received message with unknown command from content script: ",
        msg);
  }
});

// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
function b64EncodeUnicode(str) {
  // first we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which
  // can be fed into btoa.
  return btoa(encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
        return String.fromCharCode('0x' + p1);
      }));
}

// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
function b64DecodeUnicode(str) {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(
      atob(str)
          .split('')
          .map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(''));
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); };

function decodeReqModifyOpts(str) { return JSON.parse(b64DecodeUnicode(str)); }

/**
 *
 * @param {Object} params
 * @param {Array.<RegexSpec>} params.regexes
 * @param {Array.<String>} params.urls
 * @param {TamperSpec} params.tamper
 */
function addMetaTamper(params) { tamperState.addPattern(params); }

/**
 * Converts RegexSpec to an actual regex.
 * @param  {RegexSpec} regexSpec
 * @return {RegExp}
 */
function makeRegex(regexSpec) { return new RegExp(regexSpec[0], regexSpec[1]); }

/**
 * Initializes properties of 'obj' according to 'dict', if they do not already
 * exist.
 * @param  {Object} obj
 * @param  {Object} dict
 * @return {Object} the parameter 'obj' with defaults set
 */
function defaults(obj = {}, dict = {}) {
  for (var key in dict) {
    if (typeof obj[key] === 'undefined') {
      obj[key] = dict[key];
    }
  }
  return obj;
}

function getKeyCaseInsensitive(obj, key) {
  for (var findKey in obj) {
    if (!obj.hasOwnProperty(findKey)) {
      continue;
    }
    if (findKey.toLowerCase() === key.toLowerCase()) {
      return obj[findKey];
    }
  }
  return null;
}

// if given in webRequest details.*headers format
function getHeader(headers, key) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() === key.toLowerCase()) {
      return headers[i].value;
    }
  }
  return null;
}

// returns null if server sent no redirect, otherwise the redirect target url
function checkIfRedirect(details) {
  if (details.statusCode === 301 || details.statusCode === 302) {
    var redirectTarget = getHeader(details.responseHeaders, "Location");
    if (redirectTarget === null) {
      throw new Error(
          "tamperApi::checkIfRedirect: found 301 status but no location header.");
    }
    return redirectTarget;
  }
  return null;
};

function setHeaders(headers, toSet) {
  for (var toSetKey in toSet) {
    if (!toSet.hasOwnProperty(toSetKey)) {
      continue;
    }
    var setHeaderTo = toSet[toSetKey];
    var foundHeaderToSet = false;
    for (var headersInd = 0; headersInd < headers.length; headersInd++) {
      var currHeaderName = headers[headersInd].name;
      if (toSetKey.toLowerCase() !== currHeaderName.toLowerCase()) {
        continue;
      }
      foundHeaderToSet = true;
      headers[headersInd] = {
        name : currHeaderName,
        value : setHeaderTo,
      };
    }
    if (foundHeaderToSet) {
      continue;
    }
    headers.push({
      name : toSetKey,
      value : setHeaderTo,
    });
  }
  return headers;
}

function removeHeaders(headers, toRemove) {
  toRemove = toRemove.map((str) => { return str.toLowerCase(); });
  for (var headerInd = 0; headerInd < headers.length; headerInd++) {
    if (!toRemove.includes(headers[headerInd].name.toLowerCase())) {
      continue;
    }
    headers.splice(headerInd, 1);
    headerInd--;
  }
  return headers;
}
