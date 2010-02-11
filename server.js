	// function echo(args, req) {
	// 	req.err()
	// 	req.response({}, true)
	// 	req.response({})
	// 	db.write().addErrBack(req.err).addCallback(req.response)
	// 	req.setTimeout()
	// }
	// 
	// Later - 1 callback, 1 errback, 1 cancel
	// 	- can fire multiple times
	// 

jsio('from net.protocols.rtjp import RTJPProtocol');
jsio('import net.interfaces');
jsio('import logging');
jsio('from net.later import Later');
jsio('from util.underscore import _');

var logger=logging.getLogger('pijoserver');

var Request = Class(function() {
	this.init = function(conn, requestId) {
		this._conn = conn;
		this._requestId = requestId;
	}

	this.send = function(result, hasMore) {
		var response = {
			requestId: this._requestId, 
			isSuccess: true,
			result: result
		};
		
		if(hasMore) { response.hasMore = true; }
		
		this._conn.sendFrame('RESPONSE', response);
	}
	
	this.error = function() {
		this._conn.sendFrame('RESPONSE', {
			requestId: this._requestId,
			isSuccess: false
		});
	}
})

exports.PijoConn = Class(RTJPProtocol, function(supr) {

	this.init = function(protocol, Interface, impl, isClient) {
		supr(this, 'init');
		
		this._protocol = protocol;
		this._impl = impl;
		this._isClient = isClient;
		this._requestDirection = isClient ? 'client' : 'server';
		this._inFlight = {};
		
		this.remote = new Interface(this);
	}
	
	this.request = function(name, args) {
		if(!this._protocol.rpcs.hasOwnProperty(name)) { return; }
		
		var id = this.sendFrame('REQUEST', {
				name: name,
				args: args
			}),
			req = this._inFlight[id] = {
				id: id,
				later: new Later()
			};
		
		if('timeout' in this._protocol.rpcs[name]) {
			req.timeout = $setTimeout(bind(this, 'onTimeout', id), this._protocol.rpcs[name].timeout);
		}
		
		return req.later;
	}
	
	this.frameReceived = function(id, name, args) {
		switch (name) {
			case 'REQUEST':
				try {
					this.handleRequest(id, args);
				} catch(result) {
					this.sendFrame('RESPONSE', {
						requestId: id,
						isSuccess: false,
						result: result
					});
				}
				break;
			case 'RESPONSE':
				try {
					this.handleResponse(args);
				} catch(e) {
					throw e;
				}
				break;
			case 'EVENT':
				break;
		}
	}
	
	this.onTimeout = function(id) {
		this._inFlight[id].timeout = null;
		
		this.handleResponse({
			requestId: id,
			isSuccess: false,
			result: 'TIMEOUT'
		});
	}
	
	this.handleResponse = function(response) {
		var id = response.requestId,
			req = this._inFlight[id];
		
		if(!response.hasMore) {
			delete this._inFlight[id];
		}
		
		if (req.timeout) { $clearTimeout(req.timeout); }
		
		if (!response.isSuccess) {
			req.later.errback(response.result);
		} else {
			req.later.callback(response.result);
		}
	}
	
	this.handleRequest = function(id, args) {
		var method_name = args['name'],
			method_args = args['args'];
		
		if (!method_name) { throw {msg: 'missing method name'}; }
		if (!method_args) { throw {msg: 'missing args'}; }
		
		var rpc = this._protocol.rpcs[method_name];
		if (!rpc) { throw {msg: 'invalid method'}; } // TODO: error
		if (rpc.direction && rpc.direction != this._requestDirection) { throw {msg: 'invalid method (wrong direction)'}; }
		
		var constructed_args = {};
		
		_.each(method_args, function(value, arg) {
			if(rpc.request.args.args.hasOwnProperty(arg)) {
				logger.log(' arg found');
				constructed_args[arg] = method_args[arg];
			}
		});
		
		if(typeof this._impl[method_name] != 'function') { throw {msg: 'method not implemented'}; }

		try {
			this._impl[method_name].call(this, new Request(this, id), constructed_args);
		} catch(e) {
			// if(!(e instanceof ExpectedError)) {
				// log unexpected errors
			// }
			
			// send error back
			throw e;
		}
	}
});

/**
 * Adds a c
 */
exports.buildRequestInterface = function(protocol) {
	var reqInterface = function(conn) { this._conn = conn; },
		proto = reqInterface.prototype;
	
	for (var rpc in protocol.rpcs) {
		if (protocol.rpcs.hasOwnProperty(rpc)) {
			proto[rpc] = (function(rpc) { return function(args) { return this._conn.request(rpc, args); }; })(rpc);
		}
	}
	
	return reqInterface;
}

exports.PijoServer = Class(net.interfaces.Server, function(supr) {
	
	this.init = function(protocol, impl) {
		supr(this, 'init', [PijoConn]);
		
		this._ProtocolInterface = exports.buildRequestInterface(protocol);
		this._protocol = protocol;
		this._impl = impl;
	}
	
	/* override -- the PijoProtocol works on the server and client, so it doesn't know about this.server._protocol -- we could, however, check for this.server instead... */
	this.buildProtocol = function() {
		return new this._protocolClass(this._protocol, this._ProtocolInterface, this._impl);
	}
	
	this.run = function() {
		
	}
});
