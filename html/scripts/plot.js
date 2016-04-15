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

// Keep track of most recent data points which have been selected by the
// user.
var tooltip_data_1 = null;
var tooltip_data_2 = null;

function TooltipData(timestamp, product, phone, revision_url) {
  this.timestamp = timestamp;
  this.product = product;
  this.phone = phone;
  this.revision_url = revision_url;
  var re = new RegExp('(https?://hg.mozilla.org/(releases/|integration/)?)([^/]*)/rev/(.*)');
  var captures = re.exec(revision_url);
  if (captures) {
    this.repo_prefix = captures[1] + captures[3];
    this.revisionId = captures[3] + '/' + captures[4];
    this.repo = captures[3];
    this.revision = captures[4];
  }
  else {
    this.repo_prefix = null;
    this.revisionId = null;
    this.repo = null;
    this.revision = null;
  }
}
TooltipData.prototype = {
  is_later: function(tooltip_data) {
    // Return true if tooltip_data is not null and is from the same
    // product, phone, repository and has a later date than the
    // current tooltip.
    if (!tooltip_data ||
        this.product != tooltip_data.product ||
        this.phone != tooltip_data.phone ||
        this.repo_prefix != tooltip_data.repo_prefix) {
      return false;
    }
    if (this.timestamp > tooltip_data.timestamp) {
      return true;
    }
    return false;
  },
};

function updateRevisionRange() {
  var rev1 = '';
  var rev2 = '';
  var pushlog = '';

  if (tooltip_data_1) {
    rev1 = tooltip_data_1.revision_url;
    $("#rev1").html('From: <a href="' + rev1 + '" target="rev1">' + rev1 + '</a>');
  }
  else {
    $("#rev1").html('');
  }
  if (tooltip_data_2) {
    rev2 = tooltip_data_2.revision_url;
    $("#rev2").html('To: <a href="' + rev2 + '" target="rev2">' + rev2 + '</a>');
  }
  else {
    $("#rev2").html('');
  }

  if (tooltip_data_1 && tooltip_data_2) {
    pushlog = tooltip_data_1.repo_prefix + '/pushloghtml?fromchange=' +
      tooltip_data_1.revision + '&tochange=' + tooltip_data_2.revision;
    $("#pushlog").html('Pushlog: <a href="' + pushlog + '" target="pushlog">' +
                       pushlog + '</a>');
  }
  else {
    $("#pushlog").html('');
  }

}

function showLineTooltip(x, y, timestamp, product, phone, revision, value, valueerr, count) {
  var tooltip_data = new TooltipData(timestamp, product, phone, revision);
  if (tooltip_data.is_later(tooltip_data_1)) {
    tooltip_data_2 = tooltip_data;
  }
  else {
    tooltip_data_1 = tooltip_data;
    tooltip_data_2 = null;
  }
  updateRevisionRange();
  var params = {
    date: dateStr(new Date(Math.floor(timestamp))),
    value: Math.floor(value),
    valueerr: '&plusmn;' + Math.floor(valueerr),
    phone: phone,
    revision: tooltip_data.revisionId,
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
