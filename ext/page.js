/**
 * TamperApi
 *
 * An extension to provide page-side javascript the ability to modify requests
 * and responses, in particular the headers.
 *
 */

/**
 * Details of how a request and/or it's response should be modified.
 * @typedef {Object} TamperSpec
 * @property {Object} headers A key-value map of header names and values to set
 * on the request. If a value is null, it means to remove that header.
 * @property {Object} remove An array of header names to remove from the
 * request. Overrides any values in the 'headers' property.
 * @property {Object} response May contain properties such as 'headers' or
 * 'remove'. They are interpreted the same way but instead apply to the
 * server response.
 * @property {Object} [opts] A dictionary of various options.
 * @property {Boolean} [opts.once=false] if true, the tamper spec is removed
 * after matching once.
 */

// 'id' must be the same for a TamperApiMsg and the corresponding TamperApiResp

/**
 * @typedef   {Object} TamperApiMsg
 * @property  {Number} id
 * @property  {String} command
 * @property  {Object} options User provided object. Specific per command.
 */

/**
 * @typedef   {Object} TamperApiResp
 * @property  {Number} id
 * @property  {Object} resp The response from the background
 * @property  {Boolean} resp.success Was the command successful.
 * @property  {String} [resp.msg] A description of the action completed.
 */

if (typeof window.TamperApi === "undefined" || window.TamperApi === null) {
  window.TamperApi = {

    /**
     * the command functions (e.g. print sendBackground addMetaTamper) return
     * a promise which resolves or rejects depending on whether the command is
     * successful, to an object like {TamperApiResp}
     */

    /**
     *
     */
    print : function(options) { return TamperApi._do("print", options); },

    sendBackground : function(options) {
      return TamperApi._do("sendBackground", options);
    },

    /**
     * @typedef  {Object} AddTamperCmd
     * @property {Array.<RegExp|RegexSpec>} regexes If any one of these should
     * match against a request, it is modified according to 'tamper'.
     * @property {Array.<String>} urls Any one of these may match against the
     * full string of the request url.
     * @property {TamperSpec} tamper a specification of how to modify a request
     * should it match.
     */

    /**
     * alias for addMetaTamper
     * @param {AddTamperCmd}
     */
    add : function(options) { return TamperApi.addMetaTamper(options); },

    /**
     * Adds a tamper spec which will activate under various conditions.
     * {@link AddTamperCmd}
     * @param  {AddTamperCmd} options
     */
    addMetaTamper : function(options) {
      options = TamperApi._serializeAddCmd(options);
      return TamperApi._do('MetaTamper', options);
    },

    /**
     * Makes a new url which when accessed from in any way (whether ajax or
     * by setting elem.src, etc), will be as to retrieve the provided 'url'
     * with the TamperSpec applied. This allows the setting of request and
     * response headers.
     *
     * @param  {String} url
     * @param  {TamperSpec} tamperSpec
     * @return {String} the finalized url
     */
    makeUrl : function(url, tamperSpec) {
      return url + "$TamperApi:" +
             TamperApi.b64EncodeUnicode(JSON.stringify(tamperSpec));
    },

    // util funcs

    isString : function(foo) {
      return (typeof foo === 'string' || foo instanceof String);
    },

    isRegExp : function(foo) { return (foo instanceof RegExp); },

    // https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
    b64EncodeUnicode : function(str) {
      // first we use encodeURIComponent to get percent-encoded UTF-8,
      // then we convert the percent encodings into raw bytes which
      // can be fed into btoa.
      return btoa(encodeURIComponent(str).replace(
          /%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
          }));
    },

    // end util funcs

    // private members:

    // command is obj
    _do : function(command, options) {
      return new Promise((resolve, reject) => {
        var evtId = TamperApi._makeEvtId();
        var respListen;
        respListen = (evt) => {
          if (evt.detail.id !== evtId) {
            return;
          }
          if (evt.detail.resp.success) {
            resolve(evt.detail.resp);
          } else {
            reject(evt.detail.resp);
          }
          // remove ourselves
          document.removeEventListener('TamperApiResp', respListen);
        };
        document.addEventListener('TamperApiResp', respListen);
        setTimeout(function() {
          document.dispatchEvent(new CustomEvent(
              'TamperApiMsg',
              {detail : {id : evtId, command : command, options : options}}));
        }, 0);
      });
    },

    /**
     * Prepares for serialization the properties of an {@link AddTamperCmd}
     * @param  {AddTamperCmd} options
     * @return {AddTamperCmd} an AddTamperCmd prepared for serialization
     */
    _serializeAddCmd : function(options) {
      if (options.regexes) {
        options.regexes.forEach((reg, ind, arr) => {
          arr[ind] = TamperApi._serializeRegex(arr[ind]);
        });
      }
      return options;
    },

    /**
     * Serializes the regex provided from a variety of forms.
     * @param  {String|RegExp|RegexSpec} reg a regex either as RegExp instance
     * or a string representing the pattern string without modifiers, or an
     * already serialized RegexSpec, which will be preserved.
     * @return {RegexSpec} the serialized regex
     */
    _serializeRegex : function(reg) {
      if (TamperApi.isString(reg)) {
        reg = [ reg ];
      } else if (TamperApi.isRegExp(reg)) {
        reg = [ reg.source, reg.flags || '' ];
      }
      return reg;
    },

    _evtIdAutoInc : 0,

    _makeEvtId : function() { return TamperApi._evtIdAutoInc++; },

    // end private members
  };
}
