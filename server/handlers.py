# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from collections import defaultdict
from datetime import date, datetime, timedelta
import time
from decimal import *
import ConfigParser
import csv
import dateutil.parser
import re
import templeton
import templeton.handlers
import web

try:
  import json
except:
  import simplejson as json

import autophonedb

# "/api/" is automatically prepended to each of these
urls = (
 '/s1s2_add/?', "S1S2RawFennecAddResult",
 '/s1s2/info/?',"S1S2RawFennecParameters",
 '/s1s2/data/?', 'S1S2RawFennecData'
)


class S1S2RawFennecAddResult():
    @templeton.handlers.json_response
    def POST(self):
        r = json.loads(web.data())
        print r
        # Get our dates correct
        blddate = datetime.fromtimestamp(float(r["data"]["blddate"]))
        now = datetime.now()
        autophonedb.db.insert(autophonedb.SQL_TABLE,
                           phoneid=r["data"]["phoneid"],
                           testname=r["data"]["testname"],
                           starttime=r["data"]["starttime"],
                           throbberstart=r["data"]["throbberstart"],
                           throbberstop=r["data"]["throbberstop"],
                           enddrawing=r["data"]["enddrawing"],
                           blddate=blddate.strftime("%Y-%m-%d %H:%M:%S"),
                           revision=r["data"]["revision"],
                           bldtype=r["data"]["bldtype"],
                           productname=r["data"]["productname"],
                           productversion=r["data"]["productversion"],
                           osver=r["data"]["osver"],
                           machineID=r["data"]["machineid"],
                           runstamp=now.strftime("%Y-%m-%d %H:%M:%S"))


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

    metrics = { 'throbberstart': 'AVG(throbberstart-starttime)',
                'throbberstop': 'AVG(throbberstop-starttime)',
                'totaldrawing': 'AVG(enddrawing-starttime)' }

    @templeton.handlers.json_response
    def GET(self):
        query, body = templeton.handlers.get_request_parms()
        test = query['test'][0]
        phoneids = query['phone']
        start = query['start'][0]
        # add one to the end date so we capture the full end day
        # e.g. if the user gives an end day of 2012-01-01, we want
        # everything on that day, so really we want everything before
        # 2012-01-02.
        end = (datetime.strptime(query['end'][0], '%Y-%m-%d').date() +
               timedelta(days=1)).strftime('%Y-%m-%d')

        metric = query['metric'][0]
        product = query['product'][0]

        # results[phone][test][metric][blddate] = value
        results = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))

        revisions = [x['revision'] for x in autophonedb.db.query(
            'select distinct revision from %s '
            'where blddate >= $start and blddate < $end' %
            autophonedb.SQL_TABLE,
            vars=dict(start=start, end=end))]

        data_validity_check = 'throbberstart>0'
        if metric == 'throbberstop':
          data_validity_check += ' and throbberstop>0'
        elif metric == 'totaldrawing':
          data_validity_check += ' and enddrawing>0'

        for phoneid in phoneids:
            for revision in revisions:
                data = autophonedb.db.select(
                  autophonedb.SQL_TABLE,
                  what=self.metrics[metric] + ',blddate',
                  where='phoneid=$phoneid and revision=$revision and testname=$test and productname=$product and ' + data_validity_check,
                  vars=dict(phoneid=phoneid, revision=revision,
                            test=test, product=product))[0]
                avg = data[self.metrics[metric]]
                blddate = data['blddate']
                if not isinstance(blddate, datetime):
                    blddate = datetime.strptime(blddate, '%Y-%m-%d %H:%M:%S')
                if avg is None:
                    continue
                results[phoneid][test][metric][blddate.isoformat()] = {
                  'value': float(avg),
                  'revision': revision }
        return results
