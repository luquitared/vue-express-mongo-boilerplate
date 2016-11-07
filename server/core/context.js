"use strict";

let logger 			= require("./logger");
let config 			= require("../config");

let Sockets   = require("./sockets");

let _ 				= require("lodash");

let Context = function(service) {
	this.service = service; // service instance
	this.app = null; // ExpressJS app
	this.req = null; // req from ExpressJS router
	this.res = null; // res from ExpressJS router
	this.user = null; // logged in user
	this.socket = null; // socket from socket.io session
	this.io = null; // namespace IO
	this.params = []; // params from ExpressJS REST or websocket or GraphQL args
	this.model = null; // model from `modelResolvers`
	this.provider = "direct" // `direct`, `rest`, `socket` or `graphql`
	/*this.actions = {} // actions from service (bind ctx parameter)

	if (service.actions) {
		_.forIn(service.actions, (action, name) => {
			this.actions[name] = () => {
				return action.apply(service, [].concat([this], arguments));
			}
		})
	}*/
}

// Initialize Context from a REST call
Context.CreateFromREST = function(service, app, req, res) {
	let ctx = new Context(service);
	ctx.provider = "rest";
	ctx.app = app;
	ctx.io = service.io;
	ctx.req = req;
	ctx.res = res;
	ctx.user = req.user;
	ctx.params = _.defaults({}, req.query, req.params);

	return ctx;
}

// Initialize Context from a socket call
Context.CreateFromSocket = function(service, app, socket, cmd, data) {
	let ctx = new Context(service);
	ctx.provider = "socket";
	ctx.app = app;
	ctx.io = service.io;
	ctx.socket = socket;
	ctx.user = socket.request.user
	ctx.params = data;

	return ctx;
}

// Initialize Context from a GraphQL query
Context.CreateFromGraphQL = function(service, root, args, context) {
	let ctx = new Context(service);
	ctx.provider = "graphql";
	ctx.params = args;
	ctx.user = context.user;
	ctx.io = service.io;

	return ctx;
}

// Initialize Context for Service.init
Context.CreateToServiceInit = function(service, app, db) {
	let ctx = new Context(service);
	ctx.provider = "";
	ctx.app = app;
	//ctx.io = app.io.IO;

	return ctx;
}

// Broadcast a message 
Context.prototype.broadcast = function(cmd, data) {
	if (this.io) {
		let path = "/" + this.service.namespace + "/" + cmd;
		logger.debug("Send WS broadcast message to '" + path + "':", data);
		this.io.emit(path, data);
	}
}

// Send a message back to socket
Context.prototype.emitUser = function(cmd, data) {
	if (!this.socket && this.user) {
		// If not socket (come from REST), but has user, we try to find it
		this.socket = _.find(Sockets.userSockets, (socket) => { 
			return socket.request.user._id == this.user._id
		});
	}
	if (this.socket) {
		let path = this.service.namespace + "/" + cmd;
		logger.debug("Send WS message to " + this.socket.request.user.username + " '" + path + "':", data);
		this.socket.emit(path, data);
	}
}

// Broadcast a message to a role If the `role` is not specified, we use the role of service
Context.prototype.emit = function(cmd, data, role) {
	if (!role)
		role = this.service.role;
	
	// If not definied we will send a broadcast
	if (!role) {
		return this.broadcast(cmd, data);
	}

	if (this.io) {
		let path = this.service.namespace + "/" + cmd;
		logger.debug("Send WS message to '" + role + "' role '" + path + "':", data);

		_.each(Sockets.userSockets, (socket) => { 
			let user = socket.request.user;
			if (user && user.roles && user.roles.indexOf(role) !== -1) 
				logger.debug("Send WS message to " + user.username + " '" + path + "':", data);
				socket.emit(path, data);
		});
	}

}

// Generate an error response
Context.prototype.errorBadRequest = function(msg) {
	let err = new Error(msg);
	err.status = 400;

	throw err;
}

module.exports = Context;