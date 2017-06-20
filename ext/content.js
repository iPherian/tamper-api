/**
 * TamperApi
 *
 * An extension to provide page-side javascript the ability to modify requests
 * and responses, in particular the headers.
 *
 */

if (document.readyState === "complete" ||
    document.readyState === "interactive") {
  load();
} else {
  document.addEventListener("DOMContentLoaded", load);
}

// load page.js
(function() {
  var s = document.createElement('script');
  s.src = chrome.extension.getURL('page.js');
  var under = (document.head || document.documentElement);
  under.insertBefore(s, under.firstChild);
  s.onload = function() { s.remove(); };
})();

/**
 *
 */
document.addEventListener('TamperApiMsg', function(e) {
  var evtId = e.detail.id;
  var responseHandler = function(resp) {
    var evt =
        new CustomEvent('TamperApiResp', {detail : {id : evtId, resp : resp}});
    document.dispatchEvent(evt);
  };
  var cmd = e.detail.command;
  if (cmd === "print") {
    console.log("TamperApi: content script: Print: ", e.detail.options);
    responseHandler({success : true, msg : "printed provided text."});
  } else {
    var msg = {
      command : cmd,
      options : e.detail.options,
    };
    chrome.runtime.sendMessage(msg, responseHandler);
  }
});

function load() {
  // nothing for now
}
