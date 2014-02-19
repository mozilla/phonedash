/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

$(function() {
  timezoneJS.timezone.zoneFileBasePath = "scripts/flot/tz";
  timezoneJS.timezone.defaultZoneFile = [];
  timezoneJS.timezone.init({async: false});
});

function dateStr(d) {
  function pad(n) { return n < 10 ? '0' + n : n; }
  d = new timezoneJS.Date(d, 'America/Los_Angeles');
  return d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) +
    ':' + pad(d.getMinutes()) +
    ':' + pad(d.getSeconds());
}


function showLineTooltip(x, y, timestamp, product, phone, revision, value, valueerr, count) {
  var revisionId = null;
  var revisionCaptures =  /.*\/([^\/]+\/rev\/.*)/.exec(revision);
  if (revisionCaptures) {
    revisionId = revisionCaptures[1];
  }

  var params = {
    date: dateStr(new Date(Math.floor(timestamp))),
    value: Math.floor(value),
    valueerr: '&plusmn;' + Math.floor(valueerr),
    phone: phone,
    revision: revisionId,
    url: '',
    count: count
  };
  params.url = revision;
  var content = ich.flot_tooltip(params);

  $(content).css({
    top: y + 5,
    left: x + 5
  }).appendTo('body');
}


// calls toolTipFn when we detect that the current selection has changed
function plotClick(selector, toolTipFn) {
  var previousPoint = null;
  var prevX = 0;
  var prevY = 0;
  return function(event, pos, item) {
    if (item) {
      if (previousPoint != item.datapoint) {
        previousPoint = item.datapoint;
        prevX = pos.pageX;
        prevY = pos.pageY;
        $('.tooltip').remove();
        toolTipFn(item);
      }
    } else {
      if (previousPoint &&
          (pos.pageX < (prevX - 5) ||
           pos.pageX > (prevX + 10 + $('.tooltip').width()) ||
           pos.pageY < (prevY - 5) ||
           pos.pageY > (prevY + 10 + $('.tooltip').height()))) {
        $('.tooltip').remove();
        previousPoint = null;
      }
    }
  };
}
