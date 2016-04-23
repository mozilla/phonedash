/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var META = {
  phones: {},
  tests: {},
  repos: {},
  trimming: {trim: false},
  cached: {first: true, second: true},
  metrics: {throbberstart: true, throbberstop: true, throbbertime: true},
};

var INITIALIZING = true;
var QUERY_VALUES = {};
var MOUNTAIN_VIEW = 'America/Los_Angeles';
var NO_SERIES_BINNING = 'repo-phonetype-phoneid-test_name-cached_label-metric';
var STARTDATE = null;
var ENDDATE = null;
var ALL_DATA = null;
var PLOT;
var CURRENT_SELECTION;

function getStatistics(values) {
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
  return new timezoneJS.Date(s, MOUNTAIN_VIEW);
}

function togglePhones(phone_class_checkbox) {
  // Set the phones of this class to match the phone class.
  var phone_class_checked = phone_class_checkbox.prop('checked');
  $('[phone_class="' + phone_class_checkbox.prop('name') + '"]').each(function(index) {
    $(this).prop('checked', phone_class_checked);
  });
}

function loadOptions() {
  var i;
  var prev_phone_class;
  var phone_class;
  var phone_class_checked;
  var checked;

  for (var option in META) {
    var values = Object.keys(META[option]);
    if (values.length == 0) {
      $('#' + option).html('No data');
      continue;
    }
    values.sort();

    var html = '';
    for (i = 0; i < values.length; i++) {
      var value = values[i];
      // set the checkbox to checked by default if there is no query
      // or if the query specifies it explicitly.
      if (option == 'phones') {
        phone_class = value.replace(/-[0-9]+$/, '');
        if (phone_class != prev_phone_class) {
          prev_phone_class = phone_class;
          html += ('<input type="checkbox" checked class="noload" ' +
                   'id="' + phone_class + '" ' +
                   'name="' + phone_class + '" ' +
                   'onclick="togglePhones($(this))"/>' +
                   phone_class + '<br/>');
        }
        html += ('&nbsp;&nbsp;&nbsp&nbsp;' +
                 '<input type="checkbox" checked class="noload" ' +
                 'id="' + value + '" ' +
                 'phone_class="' + phone_class + '" ' +
                 'name="' + value + '"/>' +
                 value + '<br/>');
      } else {
        // do not automatically display try results
        checked = (option != 'repos' || option == 'repos' && value != 'try') ? 'checked="checked"' : '';
        html += ('<input type="checkbox" class="noload" ' + checked + ' ' +
                 'id="' + value + '" ' +
                 'name="' + value + '" />' +
                 value + '<br />');
      }
    }
    $('#' + option).html(html);
  }
}

function getSeriesKey(binning, vars) {
  // get a key/label for the data.
  var bins = binning.split('-');
  var key = '';
  for (var i = 0; i < bins.length; i++) {
    key += vars[bins[i]] + '-';
  }
  return key.substring(0, key.length-1);
}

function isChecked(name) {
  return $('#' + name).prop('checked')
}

function getDataPoints(params) {
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
  var no_binning = (NO_SERIES_BINNING == params.binning);
  var build_time_key;
  var data_hash_list;

  if (INITIALIZING) {
    // We are creating the plot control checkboxes. They
    // will be checked initially.
    for (revision in ALL_DATA) {
      revision_object = ALL_DATA[revision];

      repoCaptures = reRepo.exec(revision);
      if (repoCaptures) {
        repo = repoCaptures[1];
      } else {
        repo = 'unknown';
      }

      if (!(repo in META.repos)) {
        META.repos[repo] = true;
      }

      for (run_key in revision_object.runs) {
        run_object = revision_object.runs[run_key];

        if (!(run_object.phoneid in META.phones)) {
          META.phones[run_object.phoneid] = true;
        }

        for (var test_name in run_object.tests) {
          if (!(test_name in META.tests)) {
            META.tests[test_name] = true;
          }
        }
      }
    }
    loadOptions();
  }

  // We've already added the checkbox controls, so all we have to
  // do now is sync them with the query.
  var have_query_values = Object.keys(QUERY_VALUES).length > 0;
  if (have_query_values) {
    $('#plot-controls input[type="checkbox"]').each(function(i) {
      $(this).prop('checked', this.name in QUERY_VALUES );
    });
  }

  if (INITIALIZING) {
    // Now we can sync our hash with the loaded values.
    var querystring = $('#plot-controls').serialize();
    QUERY_VALUES = parseQueryString(querystring);
    var hash = ('#/' +
                $('#startdate').attr('value') + '/' +
                $('#enddate').attr('value') + '/' +
                $('#plot-controls').serialize());
    document.location.hash = hash;
    INITIALIZING = false;
  }

  for (revision in ALL_DATA) {
    revision_object = ALL_DATA[revision];

    repoCaptures = reRepo.exec(revision);
    if (repoCaptures) {
      repo = repoCaptures[1];
    } else {
      repo = 'unknown';
    }

    if (!isChecked(repo)) {
      continue;
    }

    for (run_key in revision_object.runs) {
      run_object = revision_object.runs[run_key];

      if (!isChecked(run_object.phoneid)) {
        continue;
      }

      if (run_object.rejected == 1 && params.rejected == 'norejected') {
        continue;
      }

      // The blddate stored in phonedash is in UTC.  Force blddate to
      // be parsed as UTC then convert to Mountain View time.
      build_time = makeMountainViewDate(run_object.blddate + '+00:00').getTime();
      if (CURRENT_SELECTION &&
          (build_time < CURRENT_SELECTION.xaxis.from ||
           build_time > CURRENT_SELECTION.xaxis.to))  {
        continue;
      }
      // return a mapping of repo + build_time to revision for use in the tooltip.
      revisions[repo + build_time] = revision;

      for (var test_name in run_object.tests) {
        if (!isChecked(test_name)) {
          continue;
        }

        var test = run_object.tests[test_name];
        for (var cached in test) {
          // use first, second instead of cached, uncached to easily get
          // order right during sorting of labels.
          var cached_label = (cached == '0') ? 'first' : 'second';
          if (!isChecked(cached_label)) {
            continue;
          }
          for (metric in test[cached]) {
            if (!isChecked(metric)) {
              continue;
            }
            values = test[cached][metric];
            if (values.length > 2 && $('#trim').prop('checked')) {
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
            series_key = getSeriesKey(NO_SERIES_BINNING, vars);

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
              stats = getStatistics(values);
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

  var plot_all_series;
  var plot_series;
  var plot_series_key;
  var plot_data_hash_list;

  plot_all_series = {};
  for (series_key in all_series) {
    series = all_series[series_key];
    plot_series_key = getSeriesKey(params.binning, series.vars);
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
        stats = getStatistics(values);
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

function setClearButton(from, to) {
  var clear_button = $("#clear-button");
  var button_text = ("Clear selection " +
                     makeMountainViewDate(from).toString() +
                     " to " +
                     makeMountainViewDate(to).toString()
                    ).replace(/ /g, '&nbsp;');

  clear_button.html(button_text);
  clear_button.show();
}

function appSetSelection(event, ranges) {

  setClearButton(ranges.xaxis.from, ranges.xaxis.to);

  $.each(PLOT.getXAxes(), function(_, axis) {
    var opts = axis.options;
    opts.min = ranges.xaxis.from;
    opts.max = ranges.xaxis.to;
  });
  CURRENT_SELECTION = PLOT.getSelection();
  PLOT.clearSelection();
  PLOT.setupGrid();
  PLOT.draw();
  $("#clear-button").show();
}

function appClearSelection() {
  $("#clear-button").hide();
  $("#tooltip").hide();
  clearRevisionRange();
  CURRENT_SELECTION = null;
  if (!PLOT) {
    return;
  }
  $.each(PLOT.getXAxes(), function(_, axis) {
    var opts = axis.options;
    opts.min = axis.datamin;
    opts.max = axis.datamax;
  });
  PLOT.setupGrid();
  PLOT.draw();
}

function setPlotHeight() {
  var height_adjustment = ($("#progressbar").height() +
                           $("#button-container").height() +
                           $("#revisions").height() +
                           18
                          );
  $("#plot").height(window.innerHeight - height_adjustment);
  $("#legend").height(window.innerHeight - height_adjustment);
}

function makePlot(params) {
  $("#progressbar").progressbar({ value: false });
  $(".progresslabel").text( "Plotting..." );
  $("#progressbar").show();
  setTimeout(_makePlot, 100, params);
}

function _makePlot(params) {
  var plot = $('#plot')
  plot.off();
  plot.html();
  $("#clear-button").hide();

  var points = getDataPoints(params);
  if (!points.data.length) {
    plot.html(ich.nodata());
    $("#progressbar").hide();
    return;
  }

  var no_binning = (NO_SERIES_BINNING == params.binning);

  var xaxis = {
    mode: 'time',
    timezone: MOUNTAIN_VIEW,
    axisLabel: 'build date',
    timeformat: '%b %d',
    minTickSize: [1, 'day']
  };

  if (CURRENT_SELECTION) {
    xaxis.min = CURRENT_SELECTION.xaxis.from;
    xaxis.max = CURRENT_SELECTION.xaxis.to;
    setClearButton(xaxis.min, xaxis.max);
  }

  setPlotHeight();

  PLOT = $.plot(plot, points.data, {
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
      lines: {show: true},
    },
    xaxis: xaxis,
    yaxis: { min: 0, axisLabel: 'time (ms)' },
    legend: { container: $('#legend'), hideable: true },
    selection: {
      mode: "x",
    },
  });

  $("#progressbar").hide();

  plot.on('plotselected', appSetSelection);

  plot.on('plotclick',
          plotClick(plot, function (item) {
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
            return false;
          }));
}

function nextDay(d) {
  var p = d.split('-');
  return ISODateString(new Date(+p[0], +p[1]-1, +p[2]+1));
}

function getData(start, end, params, day) {
  $("#progressbar").progressbar("option", {value: day});
  $.getJSON('api/s1s2/alldata/?start=' + start + '&end=' + start,
            function(data) {
              for (var key in data) {
                ALL_DATA[key] = data[key];
              }
              start = nextDay(start);
              if (start < end) {
                getData(start, end, params, day+1);
              } else {
                INITIALIZING = true;
                makePlot(params);
              }
            }
           );
}

function displayGraph(load) {
  function pad(n) { return n < 10 ? '0' + n : n; }
  var params = {};
  $.makeArray($('#date-controls select').each(function(i, e) { params[e.name] = e.value; }));
  $.makeArray($('#plot-controls select').each(function(i, e) { params[e.name] = e.value; }));
  var startdatestr = $('#startdate').attr('value');
  var enddatestr = $('#enddate').attr('value');
  var hash = '#/' + startdatestr + '/' + enddatestr + '/' + createQueryString(QUERY_VALUES);
  if (hash != document.location.hash) {
    document.location.hash = hash;
    return false;
  }

  if (load != "load") {
    makePlot(params);
  } else {
    ALL_DATA = {};

    var days = Math.floor((new Date(enddatestr) - new Date(startdatestr))/86400000);

    $("#progressbar").progressbar({ value: false });
    $(".progresslabel").text( "Loading..." );
    $("#progressbar").show();
    $("#progressbar").progressbar("option", "max", days);
    $("#progressbar").progressbar("option", {value: 1});
    getData(startdatestr, enddatestr, params, 1);
  }
  return false;
}

function loadGraph() {
  appClearSelection();
  return displayGraph("load");
}

function setControls(startdate, enddate, querystring) {
  var date_changed = false;
  if (!startdate) {
    $('#period option[value="1"]').attr('selected', true);
    periodChanged();
    date_changed = true;
  } else {
    if (startdate != STARTDATE) {
      $('#startdate').attr('value', startdate);
      date_changed = true;
    }
    if (enddate) {
      if (enddate != ENDDATE) {
        $('#enddate').attr('value', enddate);
        date_changed = true;
      }
    } else {
      $('#enddate').attr('value', ISODateString(makeMountainViewDate()));
      date_changed = true;
    }
    if (date_changed) {
      dateChanged();
    }
  }
  STARTDATE = $('#startdate').attr('value');
  ENDDATE = $('#enddate').attr('value');

  QUERY_VALUES = parseQueryString(querystring);
  $('#plot-controls select').each(function(i) {
    if (this.name in QUERY_VALUES) {
      $(this).val(QUERY_VALUES[this.name]);
    }
  });
  $('#plot-controls input[type="checkbox"]').each(function(i) {
    if (this.name in QUERY_VALUES) {
      $(this).prop('checked', QUERY_VALUES[this.name] == 'on');
    }
  });

  // Occasionally, clicking Apply then reloading
  // the page will result in an unchanged date but
  // even though the hasn't loaded. Work around it
  // by checking if we have loaded data for this
  // date range.
  if (date_changed || ALL_DATA === null) {
    setTimeout(loadGraph, 100);
  } else {
    setTimeout(displayGraph, 100);
  }
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

function parseQueryString(querystring) {
  var values = {};
  var name;
  var value;
  if (!querystring) {
    return values;
  }
  if (querystring.indexOf('?') == 0) {
    querystring = querystring.substring(1);
  }
  var parts = querystring.split('&');
  for (var ipart = 0; ipart < parts.length; ipart++) {
    var namevalue = parts[ipart].split('=');
    name = decodeURIComponent(namevalue[0]);
    name = name.replace(/[+]/g, ' ');
    value = namevalue.length == 1 ? undefined : decodeURIComponent(namevalue[1]);
    value = value.replace(/[+]/g, ' ');
    if (name in values) {
      values[name] = values[name].concat(value);
    }
    else {
      values[name] = [value];
    }
  }
  for (name in values) {
    if (values[name].length == 1) {
      values[name] = values[name][0];
    }
  }
  return values;
}

function createQueryString(obj) {
  var a = [];
  for (var key in obj) {
    a.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]).replace(/%2B/g, '+'));
  }
  return a.join('&');
}

function main() {
  $("#container").height(window.innerHeight);
  $("#plot-area").height(window.innerHeight);
  setPlotHeight();
  $("#legend").height(window.innerHeight);
  $("#progressbar").width($("#plot").width() - 18);

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

  $('#apply').on('click', function (event) {
    var hash = ('#/' +
                $('#startdate').attr('value') + '/' +
                $('#enddate').attr('value') + '/' +
                $('#plot-controls').serialize());
    if (hash != document.location.hash) {
      document.location.hash = hash;
    }
  });
  $('#reset').on('click', function (event) {
    $('#plot-controls input[type="checkbox"]').each(function(i) {
      if ('try,trim'.indexOf(this.name) == -1) {
        $(this).prop('checked', true);
      }
    });
    var hash = ('#/' +
                $('#startdate').attr('value') + '/' +
                $('#enddate').attr('value') + '/' +
                $('#plot-controls').serialize());
    if (hash != document.location.hash) {
      document.location.hash = hash;
    }
  });
  $("#clear-button").click(appClearSelection);
  $('#date-controls .date').on('change', loadGraph);
  $('#period').on('change', loadGraph);
  $('#date-controls').on('submit', function(event) { return false; });
  $('#plot-controls').on('submit', function(event) { return false; });
  $('body').on('click', function (event) {
    if (event.target.nodeName != 'CANVAS') {
      $('#tooltip').remove();
    }
  });
  // FIXME: is there a better way to set up routes with generic arguments?
  var router = Router(
    {
      '/([^/]*)': {
        '/([^/]*)': {
          '/([^/]*)': {
            on: setControls
          },
          on: setControls
        },
        on: setControls
      }
    }).init('/');
  //  });
}