/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var allPhones = [];
var MountainView = 'America/Los_Angeles';

function makeMountainViewDate(s) {
  if (!s) {
    s = new Date();
  }
  return new timezoneJS.Date(s, MountainView);
}

function loadOptions(data) {
  var i;
  for (var option in data) {
    data[option].sort();
    var ichcls, descrFunc;
    if (option == 'phone') {
      allPhones = data[option].slice(0);
      continue;
    } else if (option == 'test') {
      ichcls = ich.controlopt;
      descrFunc = testDescr;
    } else if (option == 'product') {
      ichcls = ich.controlopt;
      descrFunc = productDescr;
    }
    $('#' + option).html('');
    for (i = 0; i < data[option].length; i++) {
      $('#' + option).append(
        ichcls({ value: data[option][i], text: descrFunc(data[option][i]) }));
    }
  }
}

function getDataPoints(params, data) {
  var revisions = {}, plotdata = [], series = {}, phones = [];
  var i, phone, test, metric, builddate, buildtime, repo;
  var phoneData, testData, metricData, buildData, revision, repoCaptures;
  var reRepo = new RegExp('.*/([^/]+)/rev/.*');
  for (phone in data) {
    phoneData = data[phone];
    phones.push(phone);
    series = {};
    for (test in phoneData) {
      testData = phoneData[test];
      for (metric in testData) {
        metricData = testData[metric];
        for (builddate in metricData) {
          buildData = metricData[builddate];
          // The builddate stored in phonedash is in UTC.
          // Force it to be parsed as UTC.
          revision = buildData.revision;
          buildtime = makeMountainViewDate(builddate + '+00:00').getTime();
          repoCaptures = reRepo.exec(revision);
          if (repoCaptures) {
            repo = repoCaptures[1];
          } else {
            repo = 'unknown';
          }
          revisions[repo + buildtime] = buildData.revision;
          if (params.errorbartype == 'standarderror') {
            errorbarvalue = buildData.stderr;
          } else {
            errorbarvalue = buildData.stddev;
          }
          if (!(repo in series)) {
            series[repo] = {};
            series[repo].phone = phone;
            series[repo].repo = repo;
            series[repo].label = phone + ' ' + repo;
            series[repo].data = [];
            series[repo].counts = [];
          }
          count = buildData.count;
          series[repo].data.push([buildtime,
                                  buildData.value,
                                  errorbarvalue]);
          series[repo].counts.push(count);
        }
      }
    }
    for (repo in series) {
      series[repo].data.sort(function(a, b) { return a[0] - b[0]; });
      plotdata.push(series[repo]);
    }
  }

  plotdata.sort(function (a, b) {
    if ('localeCompare' in String) {
        return String.localeCompare(a.label, b.label);
    }
    if (a.label < b.label) {
       return -1;
    }
    if (a.label > b.label) {
        return +1;
    }
    return 0;
  });

  // Ensure each phone's colour stays the same when reloading data.
  plotdata.forEach(function(val, i) {
    if (val.noData) {
      delete(val.noData);
    } else {
      val.color = i;
    }
  });

  return { data: plotdata, revisions: revisions };
}

var testmap = {
  'remote-twitter': 'Remote Twitter Page',
  'local-twitter': 'Local Twitter Page',
  'remote-blank': 'Remote Blank Page',
  'local-blank': 'Local Blank Page'
};

var productmap = {
  'org.mozilla.fennec': 'Nightly',
  'org.mozilla.fennec_aurora': 'Aurora',
  'org.mozilla.firefox': 'Beta'
};

function testDescr(testname) {
  return (testname in testmap) ? testmap[testname] : testname;
}

function productDescr(productname) {
  return (productname in productmap) ? productmap[productname] : productname;
}

function makePlot(params, data) {
  $('#plot').html();
  var points = getDataPoints(params, data);
  if (!points.data.length) {
    $('#plot').html(ich.nodata());
    return;
  }

  $.plot($('#plot'), points.data, {
    grid: { clickable: true },
    series: {
      points: {
          show: true,
          errorbars: 'y',
          yerr: {show: $('#errorbars')[0].checked, upperCap: '-', lowerCap: '-'}
      },
      lines: { show: true }
    },
    xaxis: { mode: 'time', timezone: MountainView, axisLabel: 'build date', timeformat: '%b %d',
             minTickSize: [1, 'day'] },
    yaxis: { min: 0, axisLabel: 'time (ms)' },
    legend: { container: $('#legend'), hideable: true }
  });

  $('#plot').bind('plotclick',
    plotClick($('#plot'), function (item) {
      var y = item.datapoint[1];
      var yerr = item.datapoint[2];
      showLineTooltip(item.pageX,
                      item.pageY,
                      item.datapoint[0],
                      params.product,
                      item.series.phone,
                      points.revisions[item.series.repo + item.datapoint[0]],
                      y,
                      yerr,
                      item.series.counts[item.dataIndex]);
    })
  );
}

function loadGraph() {
  function pad(n) { return n < 10 ? '0' + n : n; }
  var params = {};
  $.makeArray($('#controls select').each(function(i, e) { params[e.name] = e.value; }));
  var startdatestr = $('#startdate').attr('value');
  var enddatestr = $('#enddate').attr('value');

  var hash = '#/' + params.product + '/' + params.metric + '/' + params.test +
        '/' + ($('#rejected').attr('checked')?'rejected':'norejected') +
        '/' + startdatestr +
        '/' + enddatestr +
        '/' + ($('#cached').attr('checked')?'cached':'notcached') +
        '/' + ($('#errorbars').attr('checked')?'errorbars':'noerrorbars') +
        '/' + params.errorbartype;
  if (hash != document.location.hash) {
    document.location.hash = hash;
    return false;
  }
  $.getJSON('api/s1s2/data/?product=' + params.product +
            '&metric=' + params.metric +
            '&test=' + params.test +
            '&rejected=' + ($('#rejected').attr('checked')?'rejected':'norejected') +
            '&start=' + startdatestr +
            '&end=' + enddatestr +
            '&cached=' + ($('#cached').attr('checked')?'cached':'notcached') +
            '&errorbars=' + ($('#errorbars').attr('checked')?'errorbars':'noerrorbars') +
            '&errorbartype=' + params.errorbartype,
            function(data) { makePlot(params, data); }
           );
  return false;
}

function setControls(product, metric, test, rejected, startdate, enddate, cached, errorbars, errorbartype) {
  if (product) {
    $('#product option[value="' + product + '"]').attr('selected', true);
  }
  if (metric) {
    $('#metric option[value="' + metric + '"]').attr('selected', true);
  }
  if (test) {
    $('#test option[value="' + test + '"]').attr('selected', true);
  }
  if (rejected) {
    $('#rejected').attr('checked', rejected == 'rejected');
  }
  if (!startdate) {
    $('#period option[value="7"]').attr('selected', true);
    periodChanged();
  } else {
    $('#startdate').attr('value', startdate);
    if (enddate) {
      $('#enddate').attr('value', enddate);
    } else {
      $('#enddate').attr('value', ISODateString(makeMountainViewDate()));
    }
    dateChanged();
  }
  if (cached) {
    $('#cached').attr('checked', cached == 'cached');
  }
  if (errorbars) {
    $('#errorbars').attr('checked', errorbars == 'errorbars');
  }
  if (errorbartype) {
    $('#errorbartype option[value="' + errorbartype + '"]').attr('selected', true);
  }
  loadGraph();
}

function ISODateString(d) {
  function pad(n) { return n < 10 ? '0' + n : n; }
  return d.getFullYear() + '-'
         + pad(d.getMonth() + 1) + '-'
         + pad(d.getDate());
}

function periodChanged() {
  var period = parseInt($('#period').attr('value'));
  if (!period) {
    return false;
  }
  var endDate = makeMountainViewDate();
  $('#enddate').attr('value', ISODateString(endDate));
  var startDate = makeMountainViewDate(endDate);
  startDate.setDate(startDate.getDate() - period);
  $('#startdate').attr('value', ISODateString(startDate));
  return true;
}

function dateChanged() {
  $('#period option[value="0"]').attr('selected', true);
  if (ISODateString(makeMountainViewDate()) == $('#enddate').attr('value')) {
    var period = $('#period option[value="' + (makeMountainViewDate($('#enddate').attr('value')) - makeMountainViewDate($('#startdate').attr('value')))/(24*60*60*1000) + '"]');
    if (period.length) {
      period.attr('selected', true);
    }
  }
}

function main() {
  var doc_h = $(document).height();
  var plot_h = Math.floor(doc_h * 0.90);
  var plot_w  = Math.floor($(document).width() * 0.90);
  var forms_h = $("#forms").height();
  var legend_h = plot_h > forms_h ? (plot_h - forms_h) : 600;
  $("#plot").height(plot_h);
  $("#plot").width($(document).width() * 0.75);
  $("#legend").height(legend_h);
  // Configure date controls.
  $.datepicker.setDefaults({
    showOn: "button",
    buttonImage: "images/calendar.png",
    buttonImageOnly: true,
    dateFormat: 'yy-mm-dd'
  });
  $('#startdate').datepicker();
  $('#enddate').datepicker();

  $('#period').on('change', periodChanged);

  $.getJSON('api/s1s2/info/', function(data) {
    loadOptions(data);
    $('#controls').on('change', loadGraph);
    $('#controls').on('submit', function() { return false; });
    // FIXME: is there a better way to set up routes with generic arguments?
    var router = Router({
      '/([^/]*)': {
        '/([^/]*)': {
          '/([^/]*)': {
            '/([^/]*)': {
              '/([^/]*)': {
                '/([^/]*)': {
                  '/([^/]*)': {
                    '/([^/]*)': {
                      '/([^/]*)': {
                        on: setControls
                      },
                    },
                    on: setControls
                  },
                  on: setControls
                },
                on: setControls
              },
              on: setControls
            },
            on: setControls
          },
          on: setControls
        },
        on: setControls
      },
      on: setControls
    }).init('/');
  });
}
