# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import ConfigParser
import json
import pytz
import re
import templeton.handlers
import traceback
import web

from collections import defaultdict
from datetime import datetime, timedelta
from math import sqrt

from jot import jwt, jws

import autophonedb

tz_utc = pytz.timezone('UTC')
tz_pac = pytz.timezone('America/Los_Angeles')

# "/api/" is automatically prepended to each of these
urls = (
    '/s1s2/add/?', 'S1S2RawFennecAddResult',
    '/s1s2/check/?', 'S1S2RawFennecCheckResult',
    '/s1s2/info/?', 'S1S2RawFennecParameters',
    '/s1s2/data/?', 'S1S2RawFennecData',
    '/s1s2/alldata/?', 'S1S2RawAllFennecData',
    '/s1s2/delete/?', 'S1S2RawFennecDeleteResults',
    '/s1s2/reject/?', 'S1S2RawFennecRejectResults'
)

config = ConfigParser.ConfigParser()
config.read('settings.cfg')

try:
    REQUIRE_SIGNED = config.getboolean('server', 'require_signed')
except (ConfigParser.NoSectionError, ConfigParser.NoOptionError):
    REQUIRE_SIGNED = False

try:
    CLIENT_KEYS = dict(config.items('client keys'))
except ConfigParser.NoSectionError:
    CLIENT_KEYS = {}


def get_stats(values):
    """Calculate and return an object containing the count, mean,
    standard deviation, standard error of the mean and percentage
    standard error of the mean of the values list."""
    r = {'count': len(values)}
    if r['count'] == 1:
        r['mean'] = values[0]
        r['stddev'] = 0
        r['stderr'] = 0
        r['stderrp'] = 0
    else:
        r['mean'] = sum(values) / float(r['count'])
        r['stddev'] = sqrt(sum([(value - r['mean'])**2 for value in values])/float(r['count']-1.5))
        r['stderr'] = r['stddev']/sqrt(r['count'])
        r['stderrp'] = 100.0*r['stderr']/float(r['mean'])
    r['min'] = min(values)

    values.sort()
    middle = r['count']/2
    if r['count'] % 2:
        # odd
        r['median'] = values[middle]
    else:
        # even
        r['median'] = (values[middle-1] + values[middle])/2.0
    return r


def is_clean(s):
    return bool(re.match('(https?://)?[/\w\.\- ]*$', s))


class S1S2RawFennecAddResult():
    @templeton.handlers.json_response
    def POST(self):
        content_type = web.ctx.env.get('CONTENT_TYPE', '')
        if content_type == 'application/jwt':
            token = jwt.decode(web.data(),
                               signers=[jws.HmacSha(keydict=CLIENT_KEYS)])
            if not token['valid']:
                print >> web.webapi.debug, (
                    'Bad signature from %s!  Ignoring results.' %
                    token['headers'].get('kid', '(unknown)'))
                raise web.badrequest('bad signature')
            r = token['payload']
        elif REQUIRE_SIGNED:
            print >> web.webapi.debug, (
                'Signature required but plain JSON received.  '
                'Ignoring results.')
            raise web.badrequest('signature required')
        else:
            r = json.loads(web.data())

        # All dates/datetimes are stored in UTC
        result = {'runstamp': datetime.now(tz_utc).strftime("%Y-%m-%d %H:%M:%S")}

        try:
            result['starttime'] = int(r['data']['starttime'])
            result['throbberstart'] = int(r['data']['throbberstart'])
            result['throbberstop'] = int(r['data']['throbberstop'])
            result['cached'] = int(r['data']['cached'])
            result['blddate'] = datetime.utcfromtimestamp(
                float(r["data"]["blddate"])).strftime("%Y-%m-%d %H:%M:%S")
            result['rejected'] = int(r['data']['rejected'])
        except ValueError:
            print >> web.webapi.debug, 'Request: %s, %s' % (
                (r, traceback.format_exc()))
            raise web.badrequest()

        for key in ('phoneid', 'testname', 'revision', 'bldtype', 'productname',
                    'productversion', 'osver', 'machineid'):
            if not is_clean(r['data'][key]):
                print >> web.webapi.debug, (
                    'Request %s: %s %s is not clean' % (
                        r['data'], key, r['data'][key]))
                raise web.badrequest()
            result[key] = r['data'][key]

        autophonedb.db.insert(autophonedb.SQL_TABLE, **result)


class S1S2RawFennecCheckResult():
    @templeton.handlers.json_response
    def GET(self):
        query, body = templeton.handlers.get_request_parms()
        phoneid = query['phoneid'][0]
        testname = query['test'][0]
        revision = query['revision'][0]
        productname = query['product'][0]

        what = 'phoneid,testname,revision,productname,rejected'
        where = 'phoneid=$phoneid and testname=$testname and revision=$revision and productname=$productname and rejected=0'

        data = autophonedb.db.select(
            autophonedb.SQL_TABLE, what=what, where=where,
            vars=dict(phoneid=phoneid, testname=testname,
                      revision=revision, productname=productname))

        return {"result": bool(data)}


class S1S2RawFennecDeleteResults(object):

    def POST(self):
        r = json.loads(web.data())
        try:
            vars = dict(revision=r['revision'],
                        phoneid=r['phoneid'],
                        bldtype=r['bldtype'])
        except KeyError:
            print >> web.webapi.debug, (
                'Request: %s, %s' % (r, traceback.format_exc()))
            raise web.badrequest()
        autophonedb.db.delete(autophonedb.SQL_TABLE,
                              where='revision=$revision and phoneid=$phoneid '
                              'and bldtype=$bldtype', vars=vars)


class S1S2RawFennecRejectResults(object):

    def POST(self):
        r = json.loads(web.data())
        try:
            vars = dict(revision=r['revision'],
                        phoneid=r['phoneid'],
                        bldtype=r['bldtype'])
        except KeyError:
            print >> web.webapi.debug, (
                'Request: %s, %s' % (r, traceback.format_exc()))
            raise web.badrequest()
        autophonedb.db.update(autophonedb.SQL_TABLE,
                              where='revision=$revision and phoneid=$phoneid '
                              'and bldtype=$bldtype', vars=vars, rejected=True)


class S1S2RawFennecParameters(object):

    @templeton.handlers.json_response
    def GET(self):
        phones = [x['phoneid'] for x in autophonedb.db.query(
            'select distinct phoneid from %s' % autophonedb.SQL_TABLE)]
        tests = [x['testname'] for x in autophonedb.db.query(
            'select distinct testname from %s' % autophonedb.SQL_TABLE)]
        products = [x['productname'] for x in autophonedb.db.query(
            'select distinct productname from %s' % autophonedb.SQL_TABLE)]
        return {'phone': phones, 'test': tests, 'product': products}


class S1S2RawFennecData(object):

    metrics = { 'throbberstart': 'throbberstart',
                'throbberstop': 'throbberstop',
                'totalthrobber': 'throbberstop-throbberstart' }

    @templeton.handlers.json_response
    def GET(self):
        query, body = templeton.handlers.get_request_parms()
        test = query['test'][0]
        rejected = query['rejected'][0] == 'rejected'
        # query dates are in America/Los_Angeles timezone.
        # convert them to datetime values in tz_pac.
        startdate = datetime.strptime(query['start'][0], '%Y-%m-%d')
        enddate = datetime.strptime(query['end'][0], '%Y-%m-%d')
        startdate = tz_pac.localize(startdate)
        enddate = tz_pac.localize(enddate)
        # convert the datetimes to utc.
        startdate = startdate.astimezone(tz_utc)
        enddate = enddate.astimezone(tz_utc)
        # add one day to the end datedate so we capture the full end day.
        # e.g. if the user gives an end day of 2012-01-01, we want
        # everything on that day, so really we want everything before
        # 2012-01-02.
        enddate = enddate + timedelta(days=1)
        # get the isoformat of the full datetimes
        start = startdate.isoformat(' ')[0:-6]
        end = enddate.isoformat(' ')[0:-6]

        metric = query['metric'][0]
        metric_column = self.metrics[metric]
        product = query['product'][0]
        cached = query['cached'][0] == 'cached'

        # results[phone][test][metric][blddate] = value
        results = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))

        what = self.metrics[metric] + \
               ',starttime,blddate,revision,phoneid,cached,rejected'
        data_validity_check = 'throbberstart>0'
        if metric != 'throbberstart':
          data_validity_check += ' and %s>0' % metric_column
        where='testname=$test and productname=$product and \
            blddate >= $start and blddate < $end and cached=$cached and \
            ' + data_validity_check

        # If rejected, include both rejected and non rejected results
        if not rejected:
            where += ' and rejected=$rejected'

        data = autophonedb.db.select(
            autophonedb.SQL_TABLE, what=what, where=where,
            vars=dict(test=test, product=product, start=start, end=end,
                      cached=cached, rejected=rejected))

        for d in data:
            blddate = d['blddate']
            if not isinstance(blddate, datetime):
                blddate = datetime.strptime(blddate, '%Y-%m-%d %H:%M:%S')
            r = results[d['phoneid']][test][metric][blddate.isoformat()]
            if metric == 'totalthrobber':
                offsettime = 0
            else:
                offsettime = d['starttime']
            if 'values' in r:
                r['values'].append(d[self.metrics[metric]] - offsettime)
            else:
                r['values'] = [d[self.metrics[metric]] - offsettime]
            if not 'revision' in r:
                r['revision'] = d['revision']
        for d in results.values():
            for r in d[test][metric].values():
                count = len(r['values'])
                r['count'] = count
                if count == 1:
                    r['value'] = r['values'][0]
                    r['stddev'] = 0
                    r['stderr'] = 0
                else:
                    stats = get_stats(r['values'])
                    r['value'] = stats['mean']
                    r['stddev'] = stats['stddev']
                    r['stderr'] = stats['stderr']
                del r['values']
                r['min'] = stats['min']
                r['median'] = stats['median']
        return results


class S1S2RawAllFennecData(object):

    metrics = { 'throbberstart': 'throbberstart',
                'throbberstop': 'throbberstop',
                'totalthrobber': 'throbberstop-throbberstart' }

    @templeton.handlers.json_response
    def GET(self):
        query, body = templeton.handlers.get_request_parms()
        # query dates are in America/Los_Angeles timezone.
        # convert them to datetime values in tz_pac.
        startdate = datetime.strptime(query['start'][0], '%Y-%m-%d')
        enddate = datetime.strptime(query['end'][0], '%Y-%m-%d')
        startdate = tz_pac.localize(startdate)
        enddate = tz_pac.localize(enddate)
        # convert the datetimes to utc.
        startdate = startdate.astimezone(tz_utc)
        enddate = enddate.astimezone(tz_utc)
        # add one day to the end datedate so we capture the full end day.
        # e.g. if the user gives an end day of 2012-01-01, we want
        # everything on that day, so really we want everything before
        # 2012-01-02.
        enddate = enddate + timedelta(days=1)
        # get the isoformat of the full datetimes
        start = startdate.isoformat(' ')[0:-6]
        end = enddate.isoformat(' ')[0:-6]

        # results[phone][test][metric][blddate] = value

        what = ('phoneid,testname,starttime,throbberstart,throbberstop,cached,'
                'blddate,revision,bldtype,productname,productversion,osver,'
                'machineID,rejected,runstamp')

        where = 'blddate >= $start and blddate < $end and throbberstart>0 and throbberstop>0'

        order = 'revision, bldtype, blddate, phoneid, runstamp, testname'

        data = autophonedb.db.select(
            autophonedb.SQL_TABLE, what=what, where=where, order=order,
            vars=dict(start=start, end=end))

        """
        results = {
            '<revision>' : {
                'productname': '...',
                'productversion': '...',
                'runs': {
                    '<runstamp>:<bldtype>:<blddate>:<phoneid>': {
                        'runstamp': '...',
                        'bldtype': '...',
                        'blddate': '...',
                        'phoneid': '...',
                        'osver': '...',
                        'rejected': '...',
                        'tests': {
                            # tests[testname]['0'] is uncached
                            # tests[testname]['1'] is cached
                            # tests[testname]['0']['throbberstart'] = [throbberstart - starttime, ...]
                            # tests[testname]['0']['throbberstop] = [throbberstop - starttime, ....]
                            # tests[testname]['0']['throbbertime] = [throbberstop - throbberstart, ....]
                            '<testname>': {
                                '0': {'throbberstart': [], 'throbberstop': [], 'throbbertime': []},
                                '1': {'throbberstart': [], 'throbberstop': [], 'throbbertime': []},
                            },
                        },
                    },
                },
            },
        }
        """

        results = {}
        result = None
        runs = None
        run = None

        for row in data:
            if row['revision'] not in results:
                result = {
                    'productname': row['productname'],
                    'productversion': row['productversion'],
                    'runs': {},
                    }
                results[row['revision']] = result
                runs = result['runs']
            run_key = "%s:%s:%s:%s" % (row['runstamp'], row['bldtype'], row['blddate'], row['phoneid'])
            if run_key not in runs:
                run = {
                    'runstamp': row['runstamp'],
                    'bldtype': row['bldtype'],
                    'blddate': row['blddate'],
                    'phoneid': row['phoneid'],
                    'osver': row['osver'],
                    'rejected': row['rejected'],
                    'tests': {},
                    }
                tests = run['tests']
                runs[run_key] = run
            if row['testname'] not in tests:
                measurements = {
                    '0': {'throbberstart': [], 'throbberstop': [], 'throbbertime': []},
                    '1': {'throbberstart': [], 'throbberstop': [], 'throbbertime': []},
                }
                tests[row['testname']] = measurements

            cached = str(row['cached'])
            measurements[cached]['throbberstart'].append(row['throbberstart'] - row['starttime'])
            measurements[cached]['throbberstop'].append(row['throbberstop'] - row['starttime'])
            measurements[cached]['throbbertime'].append(row['throbberstop'] - row['throbberstart'])
        return results
