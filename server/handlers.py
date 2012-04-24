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
import MySQLdb
import pdb

try:
  import json
except:
  import simplejson as json

config = ConfigParser.ConfigParser()
config.read("settings.cfg")
MYSQL_SERVER = config.get("database", "MYSQL_SERVER")
MYSQL_PASSWD = config.get("database", "MYSQL_PASSWD")
MYSQL_USER = config.get("database", "MYSQL_USER")
MYSQL_DB = config.get("database", "MYSQL_DB")
MYSQL_TABLE = config.get("database", "MYSQL_TABLE")

db = web.database(dbn='mysql', host=MYSQL_SERVER, db=MYSQL_DB, user=MYSQL_USER,
                  pw=MYSQL_PASSWD)

# "/api/" is automatically prepended to each of these
urls = (
 '/s1s2_add/?', "S1S2RawFennecAddResult",
 '/s1s2/info/?',"S1S2RawFennecParameters",
 '/s1s2/data/?', 'S1S2RawFennecData'
)


class S1S2RawFennecAddResult():
    @templeton.handlers.json_response
    def POST(self):
        conn = MySQLdb.connect(host = MYSQL_SERVER,
                               user = MYSQL_USER,
                               passwd = MYSQL_PASSWD,
                               db = MYSQL_DB)
        r = json.loads(web.data())
        print r
        # Get our dates correct
        blddate = datetime.fromtimestamp(float(r["data"]["blddate"]))
        now = datetime.now()
        c = conn.cursor()
        query = "INSERT INTO " + MYSQL_DB + "." + "rawfennecstart " + "VALUES(\
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, %s)"
        c.execute(query, (r["data"]["phoneid"],
                          r["data"]["testname"],
                          r["data"]["starttime"],
                          r["data"]["throbberstart"],
                          r["data"]["throbberstop"],
                          r["data"]["enddrawing"],
                          blddate.strftime("%Y-%m-%d %H:%M:%S"),
                          r["data"]["revision"],
                          r["data"]["bldtype"],
                          r["data"]["productname"],
                          r["data"]["productversion"],
                          r["data"]["osver"],
                          r["data"]["machineid"],
                          now.strftime("%Y-%m-%d %H:%M:%S")))

        conn.commit()


class S1S2RawFennecParameters(object):

    @templeton.handlers.json_response
    def GET(self):
        phones = [x['phoneid'] for x in db.query(
            'select distinct phoneid from rawfennecstart')]
        tests = [x['testname'] for x in db.query(
            'select distinct testname from rawfennecstart')]
        products = [x['productname'] for x in db.query(
            'select distinct productname from rawfennecstart')]
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

        revisions = [x['revision'] for x in db.query(
            'select distinct revision from rawfennecstart '
            'where blddate >= $start and blddate < $end',
            vars=dict(start=start, end=end))]

        data_validity_check = 'throbberstart>0'
        if metric == 'throbberstop':
          data_validity_check += ' and throbberstop>0'
        elif metric == 'totaldrawing':
          data_validity_check += ' and enddrawing>0'

        for phoneid in phoneids:
            for revision in revisions:
                data = db.select(
                  'rawfennecstart',
                  what=self.metrics[metric] + ',blddate',
                  where='phoneid=$phoneid and revision=$revision and testname=$test and productname=$product and ' + data_validity_check,
                  vars=dict(phoneid=phoneid, revision=revision,
                            test=test, product=product))[0]
                avg = data[self.metrics[metric]]
                blddate = data['blddate']
                if avg is None:
                    continue
                results[phoneid][test][metric][blddate.isoformat()] = {
                  'value': float(avg),
                  'revision': revision }
        return results
