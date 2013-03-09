/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var allPhones = [];

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

function getDataPoints(data) {
  var revisions = {}, plotdata = [], series = {}, phones = [];
  var i, phone, test, metric, builddate, buildtime;
  for (phone in data) {
    phones.push(phone);
    series = {};
    series.label = phone;
    series.data = [];
    for (test in data[phone]) {
      for (metric in data[phone][test]) {
        for (builddate in data[phone][test][metric]) {
          buildtime = new Date(builddate).getTime();
          revisions[buildtime] = data[phone][test][metric][builddate].revision;
          series.data.push([buildtime,
                            data[phone][test][metric][builddate].value,
                            data[phone][test][metric][builddate].stddev]);
        }
      }
    }
    series.data.sort(function(a, b) { return a[0] - b[0]; });
    plotdata.push(series);
  }

  // Include phones with no data in legend and mark them appropriately.
  for (i = 0; i < allPhones.length; i++) {
    if (phones.indexOf(allPhones[i]) == -1) {
      plotdata.push({ label: allPhones[i] + ' (no data)',
                      data: [],
                      color: '#dddddd',
                      noData: true /* tmp variable */});
    }
  }

  plotdata.sort(function (a, b) {
    return String.localeCompare(a.label, b.label);
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
  var points = getDataPoints(data);
  if (!points.data.length) {
    $('#plot').html(ich.nodata());
    return;
  }
  
  $.plot($('#plot'), points.data, {
    grid: { hoverable: true },
    series: {
      points: {
          show: true,
          errorbars: 'y',
          yerr: {show: $('#errorbars')[0].checked, upperCap: '-', lowerCap: '-'}
      },
      lines: { show: true }
    },
    xaxis: { mode: 'time', axisLabel: 'build date', timeformat: '%b %d',
             tickSize: [1, 'day'] },
    yaxis: { min: 0, axisLabel: 'time (ms)' },
    legend: { container: $('#legend'), hideable: true }
  });

  $('#plot').bind('plothover',
    plotHover($('#plot'), function (item) {
      var y = item.datapoint[1];
      var yerr = item.datapoint[2];
      showLineTooltip(item.pageX,
                      item.pageY,
                      item.datapoint[0],
                      params.product,
                      points.revisions[item.datapoint[0]],
                      y,
                      yerr);
    })
  );
}

function loadGraph() {
  var params = {};
  $.makeArray($('#controls select').each(function(i, e) { params[e.name] = e.value; }));
  var hash = '#/' + params.product + '/' + params.metric + '/' + params.test +
        '/' + $('#startdate').attr('value') +
        '/' + $('#enddate').attr('value') +
        '/' + ($('#errorbars').attr('checked')?'errorbars':'noerrorbars') +
        '/' + ($('#initialonly').attr('checked')?'initialonly':'notinitialonly');
  if (hash != document.location.hash) {
    document.location.hash = hash;
    return false;
  }
  $.getJSON('api/s1s2/data/?product=' + params.product + '&metric=' + params.metric + '&test=' + params.test + '&start=' + $('#startdate').attr('value') + '&end=' + $('#enddate').attr('value') + '&errorbars=' + ($('#errorbars').attr('checked')?'errorbars':'noerrorbars') + '&initialonly=' + ($('#initialonly').attr('checked')?'initialonly':'notinitialonly'), function(data) {
    makePlot(params, data);
  });
  return false;
}

function setControls(product, metric, test, startdate, enddate, errorbars, initialonly) {
  if (product) {
    $('#product option[value="' + product + '"]').attr('selected', true);
  }
  if (metric) {
    $('#metric option[value="' + metric + '"]').attr('selected', true);
  }
  if (test) {
    $('#test option[value="' + test + '"]').attr('selected', true);
  }
  if (!startdate) {
    $('#period option[value="7"]').attr('selected', true);
    periodChanged();
  } else {
    $('#startdate').attr('value', startdate);
    if (enddate) {
      $('#enddate').attr('value', enddate);
    } else {
      $('#enddate').attr('value', ISODateString(new Date()));
    }
    dateChanged();
  }
  if (errorbars) {
    $('#errorbars').attr('checked', errorbars == 'errorbars');
  }
  if (initialonly) {
    $('#initialonly').attr('checked', initialonly == 'initialonly');
  }
}

function ISODateString(d) {
  function pad(n) { return n < 10 ? '0' + n : n; }
  return d.getUTCFullYear() + '-'
         + pad(d.getUTCMonth() + 1) + '-'
         + pad(d.getUTCDate());
}

function periodChanged() {
  var period = parseInt($('#period').attr('value'));
  if (!period) {
    return false;
  }
  var endDate = new Date();
  $('#enddate').attr('value', ISODateString(endDate));
  var startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - period);
  $('#startdate').attr('value', ISODateString(startDate));
  loadGraph();
  return false;
}

function dateChanged() {
  $('#period option[value="0"]').attr('selected', true);
  if (ISODateString(new Date()) == $('#enddate').attr('value')) {
    var period = $('#period option[value="' + (new Date($('#enddate').attr('value')) - new Date($('#startdate').attr('value')))/(24*60*60*1000) + '"]');
    if (period.length) {
      period.attr('selected', true);
    }
  }
  loadGraph();
  return false;
}

function main() {
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
  $('#startdate').on('change', dateChanged);
  $('#enddate').on('change', dateChanged);

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
