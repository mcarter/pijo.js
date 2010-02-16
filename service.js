jsio('import .parser ');
jsio('import .server ');
jsio('import net');
jsio('import logging');
jsio('from net.later import Later');
var logger = logging.getLogger('pijo.service');
var fs = jsio.__env.require('fs')

exports.ServiceClient = Class(function() {
	this.init = function(filename, protocolName, host, port) {
		this._filename = filename;
		this._protocolName = protocolName;
		this._host = host;
		this._port = port;
		this._queue = []
		this._connected = false;
		var protocolString = fs.cat(filename).wait();
		var protocol = parser.parse(filename, protocolString).protocols[protocolName];
		this._client = new server.PijoConn(protocol, server.buildRequestInterface(protocol), {});
	}
	
	this.connect = function() {
		net.connect(this._client, 'tcp', {host: this._host, port: this._port});
		logger.info('now connecting');
		this._client.connectionMade = bind(this, function() {
			logger.info('connectionMade! queue is', this._queue);
			this._connected = true;
			var item;
			while (item = this._queue.shift()) {
				var args = item[1];
				args.unshift(item[0]);
				var later = item[2];
				var newLater = this.remote.apply(this, args)
				newLater.setCallback(bind(later, later.callback)).setErrback(bind(later, later.errback));
				logger.info('executed...');
			}
		})
		this._client.connectionLost = bind(this, function() {
			logger.info('connectionLost');
			this._connected = false;
			net.connect(this._client, 'tcp', {host: this._host, port: this._port});
		})
		
		this._client.connectionFailed = bind(this, function() {
			logger.info('connectionFailed');
		})
	}

	this.remote = function(methodName) {
		var args = [].slice.call(arguments, 1);
		if (!this._connected) {
			logger.info('storing for later', methodName, args);
			var later = new Later();
			this._queue.push([methodName, args, later]);
			return later;
		}
		logger.info('executing now', methodName, args);
		var method = this._client.remote[methodName]
		if (!method) { throw new Error("Invalid remote method"); }
		return method.apply(this._client.remote, args);
	}

})
