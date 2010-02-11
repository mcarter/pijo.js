require('./jsio/jsio');
jsio('import .parser');
jsio('import logging');
var logger = logging.getLogger("parser");
logger.info("Loading echo.pijo");
var posix = require('posix');
var src = posix.cat('echo.pijo').wait()
logger.debug("Loaded", src);
logger.info("Creating Parser");
result = parser.parse('echo.pijo', src);
logger.info("result:", JSON.stringify(result));

