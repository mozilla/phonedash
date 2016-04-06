/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var meta = {
  init: true,
  phones: {},
  tests: {},
  repos: {},
  cached: {first: true, second: true},
  metrics: {throbberstart: true, throbberstop: true, throbbertime: true},
};

var MountainView = 'America/Los_Angeles';
var no_series_binning = 'repo phonetype phoneid test_name cached_label metric';

function get_statistics(values) {
  var statistics = {
    'count': values.length,
    'mean': 0,
    'median': 0,
    'geometric_mean': 0,
    'min': Infinity,
    'stddev': 0,
    'stderr': 0,
    'stderrp': 0,
  };

  if (values.length == 1) {
    statistics.mean = statistics.median = statistics.min = statistics.geometric_mean = values[0];
  } else {
    var i;
    var sum = 0;
    var gsum = 0;
    for (i = 0; i < values.length; i++) {
      if (values[i] < statistics.min) {
        statistics.min = values[i];
      }
      sum += values[i];
      gsum += Math.log(values[i] + 1); // handle zero values by adding 1 to prevent ln(0)
    }
    statistics.mean = sum / values.length;
    statistics.geometric_mean = Math.exp(gsum / values.length) - 1; // subtract 1 to remove 1 added above
    sum = 0;
    for (i = 0; i < values.length; i++) {
      sum += (values[i] - statistics.mean)**2;
    }
    statistics.stddev = Math.sqrt(sum/(values.length-1.5));
    statistics.stderr = statistics.stddev/Math.sqrt(values.length);
    statistics.stderrp = 100.0*statistics.stderr/statistics.mean;
  }

  values.sort();
  var middle = Math.floor(values.length/2);
  if (values.length % 2) {
    // odd
    statistics.median = values[middle];
  } else {
    // even
    statistics.median = (values[middle-1] + values[middle])/2.0;
  }
  return statistics;
}


function makeMountainViewDate(s) {
  if (!s) {
    s = new Date();
  }
  return new timezoneJS.Date(s, MountainView);
}

function togglePhones(phone_class_checkbox) {
  var phone_class = $(phone_class_checkbox).val();
  $('[phone_class=' + phone_class + ']').each(function(index) {
    this.checked = !this.checked;
  });
}

function loadOptions() {
  var i;
  var prev_phone_class;
  var phone_class;

  for (var option in meta) {
    if (option == 'init') {
      continue;
    }
    var values = Object.keys(meta[option]);
    if (values.length == 0) {
      $('#' + option).html('No data');
      continue;
    }
    values.sort();

    var html = '';
    for (i = 0; i < values.length; i++) {
      if (option == 'phones') {
        phone_class = values[i].replace(/-[0-9]+$/, '');
        if (phone_class != prev_phone_class) {
          prev_phone_class = phone_class;
          html += ('<input type="checkbox" ' +
                   'checked="checked" class="noload" ' +
                   'id="' + phone_class + '" value="' + phone_class + '" ' +
                   'onclick="togglePhones($(this))"/>' +
                   phone_class + '<br/>');
        }
        html += ('&nbsp;&nbsp;&nbsp&nbsp;<input type="checkbox" ' +
                 'checked="checked" class="noload" ' +
                 'phone_class="' + phone_class + '" ' +
                 'id="' + values[i] +
                 '" value="' + values[i] + '"/>' + values[i] + '<br/>');
      } else {
        html += '<input type="checkbox" ';
        if (option != 'repos' || option == 'repos' && values[i] != 'try') {
          // do not automatically display try results
          html += 'checked="checked" '
        }
        html += 'class="noload" id="' + values[i] + '" value="' + values[i] + '" />' + values[i] + '<br />';
      }
    }
    $('#' + option).html(html);
  }
}

function get_series_key(binning, vars) {
  // get a key/label for the data.
  var bins = binning.split(' ');
  var key = '';
  for (var i = 0; i < bins.length; i++) {
    key += vars[bins[i]] + ' ';
  }
  return key.trimRight();
}

function getDataPoints(params, data) {
  var revisions = {};
  var plotdata = [];
  var i;
  var metric;
  var build_time;
  var repo;
  var revision;
  var repoCaptures;
  var reRepo = new RegExp('.*/([^/]+)/rev/.*');
  var revision_object;
  var run_key;
  var run_object;
  var measurement;

  var all_series = {};
  var series_key;
  var series;
  var values;
  var stats;
  var data_item;
  var no_binning = (no_series_binning == params.binning);
  var build_time_key;
  var data_hash_list;

  for (revision in data) {
    revision_object = data[revision];

    repoCaptures = reRepo.exec(revision);
    if (repoCaptures) {
      repo = repoCaptures[1];
    } else {
      repo = 'unknown';
    }

    if (meta.init && !(repo in meta.repos)) {
      meta.repos[repo] = true;
    }
    if (!meta.init && $('#' + repo).attr('checked') != 'checked') {
      continue;
    }

    if (meta.init && repo == 'try') {
      // do not display try on first display
      continue
    }

    for (run_key in revision_object.runs) {
      run_object = revision_object.runs[run_key];

      if (meta.init && !(run_object.phoneid in meta.phones)) {
        meta.phones[run_object.phoneid] = true;
      }
      if (!meta.init && $('#' + run_object.phoneid).attr('checked') != 'checked') {
        continue;
      }

      if (run_object.rejected == 1 && params.rejected == 'norejected') {
        continue;
      }

      // The blddate stored in phonedash is in UTC.  Force blddate to
      // be parsed as UTC then convert to Mountain View time.
      build_time = makeMountainViewDate(run_object.blddate + '+00:00').getTime();

      // return a mapping of repo + build_time to revision for use in the tooltip.
      revisions[repo + build_time] = revision;

      for (var test_name in run_object.tests) {
        if (meta.init && !(test_name in meta.tests)) {
          meta.tests[test_name] = true;
        }
        if (!meta.init && $('#' + test_name).attr('checked') != 'checked') {
          continue;
        }

        var test = run_object.tests[test_name];
        for (var cached in test) {
          // use first, second instead of cached, uncached to easily get
          // order right during sorting of labels.
          var cached_label = (cached == '0') ? 'first' : 'second';
          if (!meta.init && $('#cached #' + cached_label).attr('checked') != 'checked') {
            continue;
          }
          for (metric in test[cached]) {
            if (!meta.init && $('#' + metric).attr('checked') != 'checked') {
              continue;
            }
            values = test[cached][metric];
            if (values.length > 2 && $('#trim').attr('checked') == 'checked') {
              values.sort();
              values = values.slice(1, values.length - 1);
            }
            if (values.length == 0) {
              continue;
            }
            var vars = {
              repo: repo,
              product: revision_object.productname,
              phonetype: run_object.phoneid.replace(/-[0-9]+$/, ''),
              phoneid: run_object.phoneid,
              test_name: test_name,
              cached_label: cached_label,
              metric: metric,
            };
            series_key = get_series_key(no_series_binning, vars);

            if (series_key in all_series) {
              series = all_series[series_key];
            } else {
              series = {
                vars: vars,
                label: series_key,
                data_hash: {}, // used to collect data by build time during binning
              };
              all_series[series_key] = series
            }
            /*
             * data_item is an array that contains differing values
             * depending on if the data contains an errorbar value
             * and whether the errorbar value is symmetric.
             *
             * no errorbar value: [build_time, value, count]
             * symmetric errorbar value: [build_time, value, errorbarvalue, count]
             * asymmetric errorbar value: [build_time, value, yminerrorbarvalue, ymaxerrorbarvalue, count]
             *
             * The count at the end of the data items' array keeps
             * the counts together with the measurement when sorting. We'll
             * remove the counts and add them to the counts array before sending
             * the series to be plotted.
             */
            build_time_key = build_time + '';
            if (build_time_key in series.data_hash) {
              data_hash_list = series.data_hash[build_time_key];
            } else {
              data_hash_list = [];
              series.data_hash[build_time_key] = data_hash_list;
            }
            if (params.valuetype == 'all') {
              for (i = 0; i < values.length; i++) {
                data_item = [values[i], 1];
                data_hash_list.push(data_item);
              }
            } else {
              var errorbarvalue;
              stats = get_statistics(values);
              if (params.errorbartype == 'standarderror') {
                errorbarvalue = stats.stderr;
              } else {
                errorbarvalue = stats.stddev;
              }
              switch(params.valuetype) {
              case 'mean':
                data_item = [stats.mean, errorbarvalue, values.length];
                break;
              case 'geometric_mean':
                data_item = [stats.geometric_mean, errorbarvalue, values.length];
                break;
              case 'median':
                data_item = [stats.median, errorbarvalue, values.length];
                break;
              case 'min':
                // Set the yerr_upper to be twice
                // the errorbar value so the errorbar length is the same
                // for mean and min.
                data_item = [stats.min, 1, 2*errorbarvalue, values.length];
                break;
              }
            }
            data_hash_list.push(data_item);
          }
        }
      }
    }
  }

  if (meta.init) {
    meta.init = false;
    loadOptions();
  }

  var plot_all_series;
  var plot_series;
  var plot_series_key;
  var plot_data_hash_list;

  plot_all_series = {};
  for (series_key in all_series) {
    series = all_series[series_key];
    plot_series_key = get_series_key(params.binning, series.vars);
    if (plot_series_key in plot_all_series) {
      plot_series = plot_all_series[plot_series_key];
      for (var vars_key in series.vars) {
        if (plot_series.vars[vars_key].indexOf(series.vars[vars_key]) == -1) {
          plot_series.vars[vars_key] += ',' + series.vars[vars_key];
        }
      }
    } else {
      plot_series = {
        vars: series.vars,
        label: plot_series_key,
        data: [],
        data_hash: {},
        counts: [],
      };
      plot_all_series[plot_series_key] = plot_series
    }

    var build_time_keys = Object.keys(series.data_hash);
    for (i = 0; i < build_time_keys.length; i++) {
      build_time_key = build_time_keys[i];
      data_hash_list = series.data_hash[build_time_key];
      if (!(build_time_key in plot_series.data_hash)) {
        plot_series.data_hash[build_time_key] = [];
      }
      plot_series.data_hash[build_time_key] = plot_series.data_hash[build_time_key].concat(data_hash_list);
    }
  }

  for (plot_series_key in plot_all_series) {
    plot_series = plot_all_series[plot_series_key];
    for (var vars_key in plot_series.vars) {
      var vars_parts = plot_series.vars[vars_key].split(',');
      vars_parts.sort();
      plot_series.vars[vars_key] = vars_parts.join(', ');
    }
    for (build_time_key in plot_series.data_hash) {
      plot_data_hash_list = plot_series.data_hash[build_time_key];
      if (no_binning) {
        for (i = 0; i < plot_data_hash_list.length; i++) {
          data_item = [parseInt(build_time_key)]
          data_item = data_item.concat(plot_data_hash_list[i]);
          plot_series.data.push(data_item);
        }
      } else {
        values = []
        var counts = 0;
        for (i = 0; i < plot_data_hash_list.length; i++) {
          var plot_data_hash_item = plot_data_hash_list[i];
          values.push(plot_data_hash_item[0]);
          counts += plot_data_hash_item[plot_data_hash_item.length - 1]
        }
        stats = get_statistics(values);
        data_item = [parseInt(build_time_key), stats.geometric_mean, 1, counts];
        plot_series.data.push(data_item);
      }
    }
  }

  for (plot_series_key in plot_all_series) {
    plot_series = plot_all_series[plot_series_key];
    plot_series.data.sort(function(a, b) { return a[0] - b[0]; });
    for (i = 0; i < plot_series.data.length; i++) {
      // remove the count from data[i] and push it onto counts.
      plot_series.counts.push(plot_series.data[i].pop());
    }
    plotdata.push(plot_series);
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

function makePlot(params, data) {
  $(".progresslabel").text( "Plotting..." );
  $("#progressbar").show();
  setTimeout(_makePlot, 100, params, data);
}

function _makePlot(params, data) {
  $('#plot').html();
  var points = getDataPoints(params, data);
  if (!points.data.length) {
    $('#plot').html(ich.nodata());
    $("#progressbar").hide();
    return;
  }

  var no_binning = (no_series_binning == params.binning);

  $.plot($('#plot'), points.data, {
    grid: { clickable: true },
    series: {
      points: {
        show: true,
        errorbars: (no_binning && params.valuetype != 'all')?'y':'n',
        yerr: {
          show: no_binning && params.valuetype != 'all' && params.errorbars == 'errorbars',
          asymmetric: no_binning && params.valuetype == 'min',
          upperCap: '-',
          lowerCap: '-'}
      },
      lines: {show: true} // { show: params.valuetype != 'all' }
    },
    xaxis: { mode: 'time', timezone: MountainView, axisLabel: 'build date', timeformat: '%b %d',
             minTickSize: [1, 'day'] },
    yaxis: { min: 0, axisLabel: 'time (ms)' },
    legend: { container: $('#legend'), hideable: true }
  });

  $("#progressbar").hide();

  $('#plot').bind('plotclick',
                  plotClick($('#plot'), function (item) {
                    var y = item.datapoint[1];
                    var yerr = params.valuetype == 'min' ? item.datapoint[3] : item.datapoint[2];
                    showAllLineTooltip(item.pageX,
                                       item.pageY,
                                       item.datapoint[0],
                                       item.series.vars.product,
                                       item.series.vars.phonetype,
                                       item.series.vars.phoneid,
                                       item.series.vars.test_name,
                                       item.series.vars.cached_label,
                                       item.series.vars.metric,
                                       points.revisions[item.series.vars.repo + item.datapoint[0]],
                                       y,
                                       yerr,
                                       item.series.counts[item.dataIndex]);
                  })
                 );
}

var all_data = null;

function next_day(d) {
  var p = d.split('-');
  return ISODateString(new Date(+p[0], +p[1]-1, +p[2]+1));
}

function getData(start, end, params, day) {
  $("#progressbar").progressbar("option", {value: day});
  $.getJSON('api/s1s2/alldata/?start=' + start + '&end=' + start,
            function(data) {
              for (var key in data) {
                all_data[key] = data[key];
              }
              start = next_day(start);
              if (start < end) {
                getData(start, end, params, day+1);
              } else {
                meta.init = true;
                makePlot(params, all_data);
              }
            }
           );
}

function displayGraph(load) {
  function pad(n) { return n < 10 ? '0' + n : n; }
  var params = {};
  $.makeArray($('#controls select').each(function(i, e) { params[e.name] = e.value; }));
  var startdatestr = $('#startdate').attr('value');
  var enddatestr = $('#enddate').attr('value');

  var hash = '#/' + startdatestr + '/' + enddatestr;
  if (hash != document.location.hash) {
    document.location.hash = hash;
    return false;
  }

  if (load != "load") {
    makePlot(params, all_data);
  } else {
    all_data = {};
    var days = Math.floor((new Date(enddatestr) - new Date(startdatestr))/86400000);
    $("#progressbar").progressbar({
      value: false
    });

    $(".progresslabel").text( "Loading..." );
    $("#progressbar").show();
    $("#progressbar").progressbar("option", "max", days);
    $("#progressbar").progressbar("option", {value: 1});
    getData(startdatestr, enddatestr, params, 1);
  }
  return false;
}

function loadGraph() {
  return displayGraph("load");
}

function setControls(startdate, enddate) {
  if (!startdate) {
    $('#period option[value="1"]').attr('selected', true);
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
  var forms_h = $("#forms").height();
  var legend_h = plot_h > forms_h ? (plot_h - forms_h) : 600;
  $("#plot").height(plot_h);
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
    $('#apply').on('click', displayGraph);
    $('#controls .date').on('change', loadGraph);
    $('#period').on('change', loadGraph);
    $('#controls').on('submit', function() { return false; });
    // FIXME: is there a better way to set up routes with generic arguments?
    var router = Router({
      '/([^/]*)': {
        '/([^/]*)': {
          on: setControls
        },
        on: setControls
      },
    }).init('/');
  });
}
