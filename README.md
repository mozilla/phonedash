Phonedash, a simple web application to save and serve Autophone s1s2 test results
=================================================================================

Phonedash is a templeton-based app
(https://github.com/markrcote/templeton) which is used to store and
present the results from the
[Autophone](https://github.com/mozilla/autophone) s1s2 tests.

It stores results in either a MySQL or a sqlite database.

Setting up phonedash
--------------------

Database configuration goes into server/settings.cfg. The file has one
section, [database], with the following options:

- SQL_TYPE: can be set to either "mysql" (default) or "sqlite".
- SQL_DB: database name (MySQL) or path (sqlite)
- SQL_SERVER: MySQL database server IP or hostname
- SQL_USER: MySQL username
- SQL_PASSWD: MySQL password

Starting phonedash
------------------

Change to the server directory and execute:

python server.py &lt;ip address&gt;:&lt;port&gt;

When phonedash is started, it will create the requisite table if not
found.

Viewing phonedash results
-------------------------

You can view the phonedash results by opening the ip address and port
which was used to start the server:

http://&lt;ip address&gt;:&lt;port&gt;

The left side of the page contains controls which allow you to select
the data to be displayed, while the right side of the page shows a
graph of the test results.

### Controls

*   The build being tested, usually a Nightly build.

*   The test page.

*   The measurement to be displayed:

    time to throbber start

    time to throbber stop

    total throbber time

*   Cached

    Check the _Cached_ checkbox to view the s1s2 test results with the
    Fennec cache enabled. Uncheck the checkbox to view the results
    with the Fennec cache disabled.

*   Show error bars

    Check the _Show error bars_ checkbox to display the standard
    deviation of the second through last values of the selected
    measurement.

*   Show initial only

    By default, the graph displays the mean of the second through last
    values of the selected measurement.  Check the _Show initial only_
    checkbox to display only the first measured value.

*   Date range

    Either enter the starting and ending dates in the text inputs or
    select the dates from the calendar widgets by clicking on the
    calendar icons.

*   Recent period

    Rather than entering the starting and ending dates explicitly, you
    can select a range of dates for the last 7, 14, 30 or 60 days from
    the select input.

*   Devices

    At the bottom of the left side of the page, is a legend of device
    names and their corresponding colors in the graph. You can
    selectively hide or show the graphs for specific devices by
    clicking on their name.
