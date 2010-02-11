jsio('import logging');
jsio('from net.later import Later');


var TYPES = ['arg', 'string', 'date', 'int', 'decimal', 'struct'];

var logger = logging.getLogger("pijo.parser");
//logger.setLevel(0);

var posix = null;
var readSource = function(filename) {
	if (!posix) {
		posix = jsio.__env.require('posix');
	}
	logger.info('reading', filename);
	return posix.cat(filename).wait()
}

exports.parse = function(filename, src) {
	if (typeof(src) != 'string') {
		// Get the source
		src = readSource(filename);
	}
	p = new Parser(filename, src);
	p.parse();
	return p.file;
}

var commentRegex = /(.*)?\/\/.*?(\n|$)/g;
var tokenRegex = /(\".*?\"|\b\w+?\b|[,;(){}<>\[\]]|->|\n)/g;

var tokenize = function(raw) {
	// Remove comments
	raw = raw.replace(commentRegex, '$1$2');
	// tokenize
	return raw.match(tokenRegex);
}


var Parser = Class(function(supr) {
	this.init = function(filename, src) {
		this._src = src;
		this._filename = filename;
		this.file = new PijoFile(filename);
		this._protocols = {}
		this._structs = {}
		this._customs = {}
		this._tokens = tokenize(src);
		this._line = 0;
	}
	
	this.makeError = function(msg) {
		msg = !!msg ? msg : "Parse Error";
		var e =new Error("Error parsing Pijo file " + this._filename + ", line " + this._line + ": " + msg)
		e.tracked = true;
		e.name = 'PijoParseError';
		return e;
	}

	this._shiftExpected = function(expected, msg) {
		if (expected.constructor !== Array) {
			expected = [expected];
		}
		var token = this._shift();
		for (var i = 0, compare; compare = expected[i]; ++i) {
			if (compare == token) {
				return token;
			}
		}
		throw this.makeError(msg || 'Expected one of: "' + expected + '" not "' + token + '"');
	}
	this._shift = function() {
		var token = this._tokens.shift();
		logger.info('shifted', token);
		while (token == '\n') {
			logger.debug('LINE', this._line);
			this._line++;
			token = this._tokens.shift();
		}
		return token;
	}
	this._shiftWord = function(msg) {
		var token = this._shift();
		if (token.match(/\w*/)[0].length != token.length) {
			throw this.makeError(msg || 'Expected name, not "' + token + '"');
		}
		return token;
	}
	this._shiftInt = function(msg) {
		var token = this._shiftWord(msg);
		var value = this.parseInt(token);
		if (isNaN(value)) {
			throw this.makeError(msg || 'Expected int value, not "' + token + '"');
		}
	}
	this._peek = function() {
		var token = this._shift();
		if (token !== undefined) {
			this._tokens.unshift(token);
		}
		return token;
	}
	
	this._peekCompare = function(expected) {
		if (!expected || expected.constructor !== Array) {
			expected = [expected];
		}
		var token = this._peek();
		logger.debug('token is', token);
		for (var i = 0, compare; (compare = expected[i]) || i < expected.length; ++i) {
			logger.debug('compare', token, compare);
			if (compare == token) {
				return true;
			}
		}
		return false;
	}

	this.parse = function() {
		this.state = 'top';
		while (this.state != 'finished') {
//			try {
				this['state_' + this.state]();
//			} catch(e) {
//				if (!e.tracked) {
//					throw this.makeError(e.message);
//				}
//			}
		}
	}

	this._parseArgs = function(intoArgs, allowConditions) {
		while (true) {
			if (this._peekCompare('}')) {
				return
			}
			var type = this._shiftExpected(TYPES);
			var structName = null;
			if (type == 'struct') {
				this._shiftExpected('<')
				structName = this._shiftWord()
				this._shiftExpected('>')
			}
			var name = this._shiftWord();
			this._shiftExpected(';');
			conditions = [];
			if (allowConditions && this._peekCompare('[')) {
				this._shift()
				while (true) {
					var condition = [this._shiftWord()] // symbol
					if (this._peekCompare('(')) {
						this._shift();
						while (true) {
							condition.push(this._shiftWord()) // arg
							if (this._shiftExpected([',', ')']) == ')') {
								break;
							}
						}
					}
					conditions.push(condition);
					if (this._shiftExpected([']', ',']) == ']') {
						break
					}
				}
			}
			intoArgs.addArg(new PijoArg(name, type, conditions, structName))
		}
	}
	this.state_top = function() {
		if (this._peekCompare(undefined)) {
			this.state = 'finished'
			return;
		}
		var type = this._shiftExpected(['protocol', 'struct']);
		this.state = 'top_' + type;
	}
	
	this.state_top_struct = function() {
		this._shiftExpected('<');
		var name = this._shiftWord();
		this._shiftExpected('>');
		var struct = new PijoStruct(name);
		this.file.addStruct(struct);
		this._shiftExpected('{');
		this._parseArgs(struct.args);
		this._shiftExpected('}');
		this.state = 'top';
	}
	
	this.state_top_protocol = function() {
		var name = this._shiftWord();
		this._protocol = new PijoProtocol(name);
		this.file.addProtocol(this._protocol)
		this._shiftExpected('{')
		this.state = 'protocol_block'
		while (this.state.indexOf('protocol') == 0) {
			this['state_' + this.state]();
		}
		delete this._protocol;
		this._shiftExpected('}')
		this.state = 'top'
	}

	this.state_protocol_block = function() {
		if (this._peekCompare('}')) {
			this.state = 'done';
			return;
		}
		var type = this._shiftExpected(['rpc', 'event']);
		this._direction = null;
		if (this._peekCompare('->')) {
			this._shift();
			this._direction = this._shiftExpected(['server', 'client']);
		}
		this.state = 'protocol_' + type;
		this['state_' + this.state]();
		delete this._direction;
		this._shiftExpected('}');
		this.state = 'protocol_block'
//		this.state = 'done';
	}
	
	this.state_protocol_rpc = function() {
		var name = this._shiftWord();
		var rpc = new PijoRPC(name, this._direction);
		this._protocol.addRpc(rpc);
		this._shiftExpected('{');
		while (!this._peekCompare('}')) {
			var type = this._shiftExpected(['request', 'response']);
			if (rpc[type]) {
				throw this.makeError("Redefinition of RPC " + name + ' ' + type);
			}
			var item = null;
			if (type == 'request') {
				item = rpc.request = new PijoRPCRequest();
			}
			else {
				item = rpc.response = new PijoRPCResponse();
			}
			this._shiftExpected('{');
			this._parseArgs(item.args, true);
			this._shiftExpected('}');
		}
	}
	
	
	this.state_protocol_event = function() {
		var name = this._shiftWord();
		var event = new PijoEvent(name, this._direction);
		this._protocol.add_event(event);
		this._parseArgs(event.args, true);
	}
	

});




var PijoFile = Class(function() {

	this.init = function(name) {
		this.structs = {}
		this.protocols = {}
	}
	
	this.addStruct = function(struct) {
		if (struct.name in this.structs) {
			throw new Error("Redefinition of struct " + struct.name);
		}
		this.structs[struct.name] = struct;
	}
	this.addProtocol = function(protocol) {
		if (protocol.name in this.protocols) {
			throw new Error("Redefinition of protocol " + protocol.name);
		}
		this.protocols[protocol.name] = protocol;
	}
})

var PijoStruct = Class(function() {

	this.init = function(name) {
		this.args = new PijoArgGroup();
		this.name = name;
	}
})

var PijoProtocol = Class(function() {

	this.init = function(name) {
		this.name = name
		this.rpcs = {}
		this.events = {}
	}
	
	this.addRpc = function(rpc) {
		if (rpc.name in this.rpcs) {
			throw new Error("redefinition of rpc " + rpc.name);
		}
		if (rpc.name in this.events) {
			throw new Error("conficting event and rpc definitions of " + rpc.name);
		}
		this.rpcs[rpc.name] = rpc;
	}
	
	this.addEvent = function(event) {
		if (event.name in this.events) {
			throw new Error("redefinition of rpc " + event.name);
		}
		if (event.name in this.events) {
			throw new Error("conficting event and rpc definitions of " + event.name);
		}
		this.events[event.name] = event;
	}
});

var PijoRPC = Class(function() {

	this.init = function(name, direction) {
		this.name = name;
		this.direction = direction || null;
		this.request = null;
		this.response = null;
	}
});

var PijoArgGroup = Class(function() {
	this.init = function() {
		this.args = {};
	}
	this.addArg = function(arg) {
		if (arg.name in this.args) {
			throw new Error("redefinition of argument " + arg.name)
		}
		this.args[arg.name] = arg;
	}
});

var PijoArg = Class(function() {
	this.init = function(name, type, conditions, struct_name) {
		this.name = name
		this.type = type
		this.conditions = conditions
		this.struct_name = struct_name || null;
	}
});
var PijoRPCRequest = Class(function() {
	this.init = function() {
		this.args = new PijoArgGroup()
	}
});

var PijoRPCResponse = Class(function() {
	this.init = function() {
		this.args = new PijoArgGroup()
	}
});


var PijoEvent = Class(function() {
	this.init = function(name, direction) {
		this.name = name
		this.direction = direction || null;
		this.args = {}
	}
});

