require('../jsio/jsio');

jsio('from ..parser import parse as pijoParse');
jsio('from ..server import *');
jsio('import logging');
jsio('import net');
jsio('from base import *');

var log = logging.getLogger('mainTest');
var protocol = pijoParse(null, "protocol Echo {rpc->server echo {request {arg msg;}response {arg msg;}}rpc echo2 {request {arg msg;}response {arg msg;}}}").protocols.Echo;

var server = new PijoServer(protocol, {
	echo2: function(caller, args) {
		var i = 0,
			timer = $setInterval(function() {
				++i;
				if(i >= 5) { $clearInterval(timer); }
				caller.send({msg: 'echo 2 responding with ' + i}, i < 5);
			}, 500);
	},
	echo: function(caller, args) {
		caller.send({msg: 'got that message!'});
		this.remote.echo2(args);
	}
});

net.listen(server, 'csp', {port: 5555});
