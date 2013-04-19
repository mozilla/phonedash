import ConfigParser
import templeton.handlers
import templeton.middleware
import handlers
import web

try:
    web.config.debug = handlers.config.getboolean('server', 'debug')
except (ConfigParser.NoSectionError, ConfigParser.NoOptionError):
    web.config.debug = False

urls = templeton.handlers.load_urls(handlers.urls)

app = web.application(urls, handlers.__dict__)


if __name__ == '__main__':
    app.run()
