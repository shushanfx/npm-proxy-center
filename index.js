var config = require("config");
var url = require("url");
var koa = require("koa");
var merge = require("merge");
var debug = require("debug")("npm-proxy-center");
var RequestMiddle = require("koa2-request-middle");

var app = new koa();

const registryList = config.get("registry");
const remoteRegistry = config.get("remoteRegistry.url");
const remoteRegistrySearch = config.get("remoteRegistry.search");
const remoteRegistrySURL = url.parse(remoteRegistrySearch);
const PORT = config.get("port");

if(registryList && registryList.length > 0){
	registryList.push(remoteRegistry);
	const registryLength = registryList.length;
	registryList.forEach((item, index) => {
		const itemURL = url.parse(item);
		debug(`Registry ${item}`);
		app.use(new RequestMiddle({
			ext: ["bin", false],
			onBefore: function(proxy, ctx){
				proxy.protocol = itemURL.protocol;
				proxy.host = itemURL.host;
				proxy.port = itemURL.port || "80";
				let requestURI = proxy.path;
				if(typeof requestURI === "string"){
					switch (requestURI){
						case "/registry/_design/app/_rewrite/-/v1/search":
						case "/center/search":
							proxy._URIName = "search";
							break;
						case "/registry/_design/app/_rewrite/-/all/since":
							proxy._URIName = "allSince";
							break;
						case "/registry/_design/app/_rewrite/-/all":
							proxy._URIName = "all";
							break;
					}
				}
				debug("Fetch path %s", requestURI);
				if(proxy._URIName === "search"){
					if(registryLength - 1 === index){
						// last
						proxy.protocol = remoteRegistrySURL.protocol;
						proxy.host = remoteRegistrySURL.host;
						proxy.port = remoteRegistrySURL.port || "80";
						proxy.path = remoteRegistrySURL.path;
					}
					else{
						proxy.path = "/registry/_design/app/_rewrite/-/all";
					}
				}
				delete ctx.headers.authorization;
				
				if(index < registryLength - 1){
					// 不是最后一个，标识还可以继续抓取
					ctx.headers["x-come-from"] = "None";
				}
				else{
					if((proxy._URIName === "all" || proxy._URIName == "allSince" )){
						// 禁止向remote registry请求全量数据
						return false;
					}
				}
				debug("Fetch from %O", proxy);
			},
			onAfter: function(proxy, ctx){
				// after处理
				var URIName = proxy._URIName;
				if(URIName === "search"){
					let text = proxy.query.text;
					let result = proxy.result;
					let list = null;
					let getVersion = function(item){
						let version = "";
						if(item && item.versions){
							let keys = Object.keys(item.versions);
							for(let i =0 ; i < keys.length; i ++){
								let key = keys[i];
								let value = item.versions[key];
								if(value === "latest"){
									version = key;
									break;
								}
							}
						}
						return version;
					};
					let buildObject = function(item){
						let obj = {
							"package": {
								"name": item.name,
								"scope": "unscoped",
								"version": getVersion(item),
								"description": item.description,
								"date": item.time.modified || new Date(),
								"publisher": item.author,
								"author": item.author,
								"keywords": item.keywords,
								"bugs": item.bugs,
								"license": item.license,
								"maintainers": item.maintainers.map(maintainer => {
									maintainer.username = maintainer.name;
									return maintainer
								})
							},
							"score": {
								"final": 1,
								"detail": {
									"quality": 1,
									"popularity": 1,
									"maintenance": 1
								}
							}
						};
						return obj;
					}
					let parseObject = function(result){
						if(typeof result === "string"){
							try{
								return JSON.parse(result);
							} catch(e){}
						}
						else if(typeof result === "object"){
							return result;
						}
						return {};
					}
					// search
					// 分析search 行为
					result = parseObject(result);
					// debug("Return body %O", result);
					if(!ctx.state._result){
						ctx.state._result = {"objects": []};
					}
					if(index === registryLength - 1){
						list = result.objects
					}
					else{
						list = [];
						let keys = Object.keys(result);
						keys.forEach(key => {
							if(key !== "_updated"){
								let oneValue = result[key];
								let found = false;
								if(oneValue && typeof oneValue.name === "string"){
									if(key.indexOf(text) !== -1){
										found = true;
									}
									else if(oneValue.maintainers){
										oneValue.maintainers.forEach(maintainer => {
											if(typeof maintainer.name === "string" && maintainer.name.indexOf(text) != -1){
												found = true;
											}
										});
									}
								}	
								if(found){
									let resultItem = buildObject(oneValue);
									list.push(resultItem);
								}
							}
						});
						debug("Result list %O ", list);
					}
					proxy.result = null;
					if(list && list.length > 0){
						debug("Result list %O ", list);
						Array.prototype.push.apply(ctx.state._result.objects, list);
					}
				}
				else if(URIName === "all" || URIName === "allSince"){
					// if(!ctx.state._result){
					// 	ctx.state._result = [];
					// }
					// ctx.state._result.push(proxy.result);
					// debug("merge object of all.");
					// if(index == registryLength - 1){
					// 	// 最后一个
					// 	let result = ctx.state._result.reverse();
					// 	result.splice(0, 0, true, {});
					// 	proxy.result = merge.apply(proxy, result);
					// }
					// else{
					// 	proxy.result = null;
					// }
					// discast
					
				}
			}
		}));
	});
	app.use(async function(ctx, next){
		if(ctx.state._result){
			ctx.type = "json";
			ctx.body = ctx.state._result;
			ctx.status = 200;
		}
		else{
			ctx.body = `{
				"error": "not_found",
				"reason": "missing"
			}`;			
			ctx.status = 404;
		}
	});
}
else{
	console.error("registry.local or registry.remote must be set.");
	process.exit(1);
}
app.listen(PORT, function(err, server){
	console.info(`Server listen on ${PORT}`);
});
