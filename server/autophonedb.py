# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import ConfigParser
import web

db = None

config = ConfigParser.ConfigParser()
config.read('settings.cfg')

# FIXME: Move to test config.
SQL_TABLE = 'rawfennecstart'

try:
    SQL_TYPE = config.get('database', 'SQL_TYPE')
except ConfigParser.NoOptionError:
    SQL_TYPE = 'mysql'

if SQL_TYPE == 'sqlite':
    SQL_DB = config.get('database', 'SQL_DB')
    db = web.database(dbn=SQL_TYPE, db=SQL_DB)
    DATETIME = 'TEXT'
    table_exists_query = db.select('sqlite_master', what='name',
                                   where='type="table" and name=$name',
                                   vars={'name': SQL_TABLE})
elif SQL_TYPE == 'mysql':
    SQL_SERVER = config.get('database', 'SQL_SERVER')
    SQL_PASSWD = config.get('database', 'SQL_PASSWD')
    SQL_USER = config.get('database', 'SQL_USER')
    SQL_DB = config.get('database', 'SQL_DB')
    db = web.database(dbn=SQL_TYPE, user=SQL_USER, pw=SQL_PASSWD, db=SQL_DB)
    DATETIME = 'datetime'
    table_exists_query = db.select('information_schema.tables',
                                   what='table_name',
                                   where='table_schema=$db and table_name=$name',
                                   vars={'db': SQL_DB, 'name': SQL_TABLE})


if not table_exists_query:
    s1s2query = 'CREATE TABLE ' + SQL_TABLE + '(phoneid CHAR(80),\
            testname CHAR(80), \
            starttime INT UNSIGNED, \
            throbberstart INT UNSIGNED, \
            throbberstop INT UNSIGNED, \
            cached BOOLEAN, \
            blddate ' + DATETIME + ' NOT NULL, \
            revision VARCHAR(255),\
            bldtype CHAR(10),\
            productname CHAR(80),\
            productversion CHAR(25),\
            osver CHAR(25),\
            machineID CHAR(25),\
            runstamp ' + DATETIME

    if SQL_TYPE == 'mysql':
        s1s2query += ',\
            INDEX idx_date_phone_test(blddate,phoneid,testname,productversion)'

    s1s2query += ')'

    db.query(s1s2query)
