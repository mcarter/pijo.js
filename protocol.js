jsio('import Class, bind');
jsio('import jsio.logging');
jsio('import jsio.interfaces');
jsio('from jsio.protocols.rtjp import RTJPProtocol');
jsio('from jsio.later import Later');
jsio('import .parser');

var logger = jsio.logging.getLogger("pijo.protocol");


exports.Handler = Class(function() {

	this.init = function(protocol) {
		this.protcol = protocol;
	}
}


function getDefinition(args) {
	if (!args.handler) {
		args.handler = {};
	}
	if (args.definition) {
		return args.definition;
	}
	else if (args.protocolName) {
		var file = parser.parse(args.filename, args.src);
		var definition = file.protocols[args.protocolName];
		if (!definition) {
			throw new Error('Protocol "' + args.protocolName + '" not found in "' + args.filename + '"');
		}
		return definition;
	}
	else {
		throw new Error("Invalid arguments");
	}
}


exports.createClient = function(args) {
	var definition = getDefinition(args);
	return new exports.PijoClient(definition, args.handler);
}

exports.createServer = function(args) {
	var definition = getDefinition(args);
	return new exports.PijoServer(definition, args.handler);
}




exports.PijoClient = Class(exports.PijoProtocol, function(supr) {

	this.init = function(definition, handler) {
		supr(this, 'init', [this, 'client', handler]);
		
	}
	
	this._dispatch = function() {
		
	}
	
}

exports.PijoServer = Class(exports.PijoServer, function(supr) {
	this.init = function(definition, handler) {
	
	}
	
	this.buildProtocol = function() {
		return new exports.PijoProtocol(this.definition, this);
	}
	
	this._dispatch = function() {
		try {
			logger.debug('constructedArgs', constructedArgs);
			result = handler(function)
			logger.debug('result is', result);
		} catch(e) {
			if (e.constructor === exports.ExpectedException) {
				self.error_response(conn, id, e)
			}
			except ExpectedException, e:
				# TODO: Send Error
			except Exception, e:
				# TODO: log it
				self.error_response(conn, id, e)
		}
				else:
					conn.send_frame('RESPONSE', {
						'requestId': id, 
						'success': True,
						'result': result,
					})		
	}

}
exports.ExpectedException = function(message, code) {
	this.message = message;
	this.code = code;
}
exports.ExpectedException.prototype.name = "ExpectedException";

exports.PijoProtocol = Class(RTJPProtocol, function(supr) {
	
	this.init = function(dispatcher, direction, handler) {
		supr([this, 'init']);
		if (direction != "client" && direction != "server") {
			throw new Error("'client' or 'server' required for direction");
		}
		this._definition = definition;
		this._direction = direction;
		this._requests = {};
	}
	
	this.errorResponse = function(id, msg) {

		
	}
	
	this.frameReceived = function(id, name, args) {
		switch(name) {
			case 'RESPONSE':
				var l = this._requests[args.requestId];
				if (!l) {
					break;
				}
				if (args.success)
					l.callback(args.args);
				else
					l.errback(args.args);
				if (!l.args.more)
					delete this._requests[args.requestId];
				break;
			case 'EVENT':
				
				this.onEvent(args.name, args.args);
				break;
			case 'REQUEST':
				var methodName = args.name;
				var methodArgs = args.args;
				if (!methodName) {
					this.errorResponse(id, "Missing method name");
					break;
				}
				if (!methodArgs) {
					this.errorResponse(id, "Missing args");
					break;
				}
				var rpc = self.protocol.rpcs[method_name];
				if (!rpc) {
					this.errorResponse(id, "Invalid Method")
					break;
				}
				if (rpc.direction && rpc.direction != this._direction) {
					this.errorResponse(id, "Invalid Method (check direction)");
					break;
				}
				var constructedArgs = {}
				for (name in rpc.request.args.args) {
					var arg = rpc.request.args.args[name];
					if (name in methodArgs) {
						constructedArgs[name] = methodArgs[name];
						delete methodArgs[name];
					}
					// TODO: constraints/conditions checking
				if (methodArgs) {
					// TODO: extra arguments. error? default: throw them out?
				}
				var handler = self[methodName];
				if (!handler) {
					this.errorResponse(id, "Method not implemented");
					break
				}
				this.dispatcher.dispatch(methodName, methodArgs)
				
				try {
					logger.debug('constructedArgs', constructedArgs);
					result = handler(function)
					logger.debug('result is', result);
				} catch(e) {
					except ExpectedException, e:
						self.error_response(conn, id, e)
						# TODO: Send Error
					except Exception, e:
						# TODO: log it
						self.error_response(conn, id, e)
				}
				else:
					conn.send_frame('RESPONSE', {
						'requestId': id, 
						'success': True,
						'result': result,
					})
			}
	}
	this.sendResponse = function(id, success, result) {
		this.sendFrame('RESPONSE', {
						'requestId': id, 
						'success': true,
						'result': result
		}
	}
	this.sendRequest = function(name, args) {
		var id = this.sendFrame('REQUEST', {
			name: name,
			args: args
		})
		return this._requests[id] = new Later();
	}
	
	this.sendEvent = function(name, args) {
		this.sendFrame('EVENT', {
			name: name,
			args: args
		})
	}
})
