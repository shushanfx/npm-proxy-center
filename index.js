var config = require("config");
var url = require("url");
var koa = require("koa");
var debug = require("debug")("npm-proxy-center");
var RequestMiddle = require("koa2-request-middle");

var app = new koa();
const registryLocal = config.get("registry.local");
const registryRomote = config.get("registry.remote");
const PORT = config.get("port");

debug(`Registry ${registryLocal} and ${registryRomote}`)

if(registryLocal || registryRomote){
	const registryLocalUrl = url.parse(registryLocal);
	const registerRemoteUrl = url.parse(registryRomote);
	app.use(new RequestMiddle({
		onBefore: async function(proxy, ctx){
			proxy.protocol = registryLocalUrl.protocol;
			proxy.host = registryLocalUrl.host;
			proxy.port = registryLocalUrl.port || "80";
			ctx.headers["x-come-from"] = "None";
			debug("Fetch from %O", proxy);
		}
	}));
	app.use(new RequestMiddle({
		onBefore: async function(proxy, ctx){
			proxy.protocol = registerRemoteUrl.protocol;
			proxy.host = registerRemoteUrl.host;
			proxy.port = registerRemoteUrl.port || "80";

			debug("Fetch from %O", proxy);
		}
	}));
}
else{
	console.error("registry.local or registry.remote must be set.");
	process.exit(1);
}
app.listen(PORT);
