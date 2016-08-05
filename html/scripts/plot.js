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
  d = new timezoneJS.Date(d, 'Etc/UTC');
  return d.getUTCFullYear() +
    '-' + pad(d.getUTCMonth() + 1) +
    '-' + pad(d.getUTCDate()) +
    ' ' + pad(d.getUTCHours()) +
    ':' + pad(d.getUTCMinutes()) +
    ':' + pad(d.getUTCSeconds()) +
    'Z';
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
    $("#rev1").html('&nbsp;');
  }
  if (tooltip_data_2) {
    rev2 = tooltip_data_2.revision_url;
    $("#rev2").html('To: <a href="' + rev2 + '" target="rev2">' + rev2 + '</a>');
  }
  else {
    $("#rev2").html('&nbsp;');
  }

  if (tooltip_data_1 && tooltip_data_2) {
    pushlog = tooltip_data_1.repo_prefix + '/pushloghtml?fromchange=' +
      tooltip_data_1.revision + '&tochange=' + tooltip_data_2.revision;
    $("#pushlog").html('Pushlog: <a href="' + pushlog + '" target="pushlog">' +
                       pushlog + '</a>');
  }
  else {
    $("#pushlog").html('&nbsp;');
  }
}

function clearRevisionRange() {
  tooltip_data_1 = null;
  tooltip_data_2 = null;
  updateRevisionRange();
}

function showLineTooltip(x, y, timestamp, product, phonetype, phone, test_name, cached_label, metric, revision, value, valueerr, count) {
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
    phonetype: phonetype,
    phone: phone,
    test_name: test_name,
    cached_label: cached_label,
    metric: metric,
    revision: tooltip_data.revisionId,
    url: '',
    count: count
  };
  if (typeof(valueerr) != 'undefined') {
    params.valueerr = '&plusmn;' + Math.floor(valueerr);
  }
  params.url = revision;
  var content = ich.flot_tooltip(params);

  var tooltip = $(content).css({
    display: "none",
  }).appendTo('body').draggable();

  var plot_offset = PLOT.offset();
  var tooltip_offset = tooltip.offset();
  var h = tooltip.height();
  var w = tooltip.width();

  x += 5;
  y += 5;

  if (x + w > plot_offset.left + PLOT.width()) {
    x = plot_offset.left + PLOT.width() - w;
  }
  if (y + h > plot_offset.top + PLOT.height()) {
    y = plot_offset.top + PLOT.height() - h;
  }

  tooltip.css({
    display: "block",
    top: y,
    left: x
  });
}


// calls toolTipFn when we detect that the current selection has changed
function plotClick(selector, toolTipFn) {
  var previousPoint = null;
  return function(event, pos, item) {
    if (item) {
      if (previousPoint != item.datapoint) {
        previousPoint = item.datapoint;
        $('#tooltip').remove();
        toolTipFn(item);
      }
    } else if (previousPoint) {
        $('#tooltip').remove();
        previousPoint = null;
        clearRevisionRange();
    }
  };
}
