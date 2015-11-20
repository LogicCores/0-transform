
exports.forLib = function (LIB) {
    
    var exports = {};

    exports.app = function (options) {
        
        var context = options.context();

        return function (req, res, next) {

            return context.getAdapterAPI("page").then(function (page) {
                    
                function uriToPaths (uri, requestedFormat) {
                    if (!options.usePageContext) {
                        if (requestedFormat) {
                            uri = uri.replace(/\.htm$/, "");
                        }
                        return LIB.Promise.resolve({
                            sourcePath: LIB.path.join(options.basePath, uri),
                            distPath: LIB.path.join(options.distPath, uri)
                        });
                    }
                    return page.contextForUri(
                        (
                            req.state.page &&
                            req.state.page.lookup &&
                            req.state.page.lookup.path
                        ) || uri
                    ).then(function (pageContext) {
                        return {
                            sourcePath: pageContext.page.data.realpath,
                            distPath: LIB.path.join(options.distPath, LIB.path.relative(
                                pageContext.page.data.basePath,
                                pageContext.page.data.realpath
                            ))
                        };
                    });
                }

                function postprocess (uri, format, data) {
                    if (
                        !options.postprocess ||
                        !options.postprocess.htm
                    ) {
                        return LIB.Promise.resolve(data);
                    }
                    var done = LIB.Promise.resolve();
                    done = done.then(function () {
                        return LIB.Promise.try(function () {
                            if (options.postprocess.htm) {
//console.log("POSTPROCESS", uri);                                
                                return page.contextForUri(uri).then(function (pageContext) {
                                    // TODO: Relocate to page helper and register as postprocessor so it
                                    //       gets called above.
                                    // Re-base all style and script paths.
                                    var re = /(<script.+?src="|<img.+?src="|<link.+?href="|<a.+?href=")\//g;
                                    var m = null;
                                    var replace = {};
                                    while ( (m = re.exec(data)) ) {
                                        replace[m[1]] = m;
                                    }
                                    var baseSubPath = LIB.url.parse(pageContext.page.host.baseUrl).pathname;
                                    if (!/\/$/.test(baseSubPath)) baseSubPath += "/";
                                    Object.keys(replace).forEach(function (key) {
                                        data = data.replace(
                                            new RegExp(LIB.RegExp_Escape(replace[key][0]), "g"),
                                            replace[key][1] + baseSubPath
                                        );
                                    });
                                });
                            }
                        });
                    });
                    Object.keys(options.postprocess.htm).forEach(function (alias) {
                        done = done.then(function () {
    
                            if (
                                // TODO: Add accept request header to bypass vdom compilation if not requested.
                                //       We force no-compile for some URIs to maintain working test cases
                                //       for bare-bones DOM-based component lifting code.
                                alias === "vdom-compile" && 
                                uri === "/Tests/Component/MarkdownInheritedFirewidget-DOM.md.htm"
                            ) return;
    
                            return options.postprocess.htm[alias](data).then(function (_data) {
                                data = _data
                            });
                        });
                    });
                    return done.then(function () {
                        return data;
                    });
                }

                var uri = req.params[0];

                // TODO: Allow various ways to request format. e.g. via accept request header.
                var requestedFormat = (/\.htm$/.test(uri) && 'htm') || null;

//console.log("requestedFormat", requestedFormat);

                return uriToPaths(uri, requestedFormat).then(function (paths) {

                    if (!paths.sourcePath) {
                        var err = new Error("File for uri '" + uri + "' not found!");
                        err.code = 404;
                        return next(err);
                    }

                    return LIB.fs.exists(paths.sourcePath, function (exists) {

                        if (!exists) {
                            var err = new Error("File '" + paths.sourcePath + "' not found!");
                            err.code = 404;
                            return next(err);
                        }

                        // Adjust the dist path based on the requested format.
                        var distPath = paths.distPath;
                        if (requestedFormat) {
                            distPath += "." + requestedFormat;
                        }

                        return LIB.fs.exists(distPath, function (exists) {
                            
                            function serveDistPath () {
                                return LIB.send(req, LIB.path.basename(distPath), {
                            		root: LIB.path.dirname(distPath),
                            		maxAge: options.clientCacheTTL || 0
                            	}).on("error", next).pipe(res);
                            }

                            if (
                                exists &&
                                options.alwaysRebuild === false
                            ) {
                                if (LIB.VERBOSE) console.log("Using cached processed markdown for uri '" + uri + "' from distPath '" + distPath + "'");

                                return serveDistPath();
/*
                                return LIB.fs.readFileAsync(distPath, "utf8").then(function (data) {
                                    if (requestedFormat === "htm") {
                                		res.writeHead(200, {
                                			"Content-Type": "text/html"
                                		});
                                		return res.end(data);
                                    } else {
                                		res.writeHead(200, {
                                			"Content-Type": "text/x-markdown; charset=UTF-8"
                                		});
                                		return res.end(data);
                                    }
                                });
*/
                            }

                            function cacheResponse (data) {
                                if (LIB.VERBOSE) console.log("Writing processed markdown for uri '" + uri + "' to distPath '" + distPath + "'");
                                return LIB.fs.outputFileAsync(distPath, data, "utf8");
                            }

                            if (LIB.VERBOSE) console.log("Process markdown for uri '" + uri + "' and sourcePath '" + paths.sourcePath + "'");
                            
                            return LIB.fs.readFile(paths.sourcePath, "utf8", function (err, markdown) {
                                if (err) return next(err);
    
                                if (requestedFormat === "htm") {
    
                                    // Remove all double newlines between HTML tags
    /*
    // NOTE: Use `<script language="html">` tags instead.
                                    var inMarkup = false;
                                    var lines = [];
                                    markdown.split("\n").forEach(function (line) {
    //console.log(inMarkup, "line >>", line, "<<")
                                        if (/^</.test(line)) {
                                            inMarkup = !inMarkup;
                                            lines.push(line);
                                        } else
                                        if (
                                            !inMarkup &&
                                            /^\s*$/.test(line)
                                        ) {
                                            // ignore
                                        } else {
                                            lines.push(line);
                                        }
                                    });
                                    markdown = lines.join("\n");
    */
    //console.log("IN >>>", markdown, "<<<");    
    
                                    function parseCode (language, code, callback) {
    //console.log("PARSE CODE", language, ">>> "+code +" <<<");
    
                                        const MARKED = require('../../../../lib/marked');
    
                                        // Make a tree out of the nested scripts.
                                        var scripts = code.split(/(<script\s([^>]+)>|<\/script>)/);
                                        function makeNode (parent, language) {
                                            var node = Object.create({
                                                parent: parent
                                            });
                                            return LIB._.assign(node, {
                                                language: language,
                                                tag: null,
                                                code: [],
                                                children: []
                                            });
                                        }
                                        var node = makeNode(null, language);
                                        var currentNode = node;
                                        for (var i=0 ; i<scripts.length ; i++) {
                                            if (scripts[i].match(/<script\s/)) {
                                                currentNode.code.push(";;;SEGMENT;;;" + currentNode.children.length + ";;;");
                                                var language = "javascript";
                                                var m = scripts[i].match(/\slanguage="([^"]+)"/);
                                                if (m) {
                                                    language = m[1];
                                                }
                                                var subNode = makeNode(currentNode, language);
                                                subNode.tag = scripts[i];
                                                currentNode.children.push(subNode);
                                                currentNode = subNode;
                                                i += 1;
                                            } else
                                            if (scripts[i].match(/<\/script>/)) {
                                                currentNode = currentNode.parent;
                                                i += 1;
                                            } else {
                                                currentNode.code.push(scripts[i]);
                                            }
                                        }
                                        if (currentNode !== node) {
                                            return callback(new Error("There is a missing closing script tag!"));
                                        }
    
                                        // Parse tree with deepest nodes first.
                                        function parseNode (node, callback) {
                                            var waitfor = LIB.waitfor.serial(function (err) {
                                                if (err) return callback(err);
    
                                                function finalize (html, callback) {
                                                    if (node.children.length > 0) {
                                                        node.children.forEach(function (child, i) {
                                                            var re = new RegExp(";;;SEGMENT;;;" + i + ";;;");
                                                            html = html.replace(re, child.html);                                                        
                                                        });
                                                    }
                                                    node.html = html;
                                                    return callback(null, node);
                                                }
    
                                                if (node.language === "markdown") {
                                                    if (
                                                        node.code.length === 3 &&
                                                        /^;;;SEGMENT;;;/.test(node.code[1]) &&
                                                        /^[\s]*$/.test(node.code[0]) &&
                                                        /^[\s]*$/.test(node.code[2])
                                                    ) {
                                                        // We only have a sub-section so we return it as
                                                        // HTML directly instead of parsing it with markdown.
                                                        // This will prevent it from being wrapped in a paragraph tag
                                                        // which may likely mess up the intended HTML tag nesting on the rendered page.
                                                        return finalize(node.code[1], callback);
                                                    }
    
                                                    return MARKED(node.code.join("\n"), {
                                                        rawHtml: true,
                                                        highlight: function (code) {
                                                            return require("highlight.js").highlightAuto(code).value;
                                                        }
                                                    }, function (err, html) {
                                                        if (err) return callback(err);
                                                        return finalize(html, callback);
                                                    });
                                                } else
                                                if (node.language === "html") {
                                                    return finalize(node.code.join("\n"), callback);
                                                } else
                                                if (node.language === "javascript") {
                                                    node.code.unshift(node.tag);
                                                    node.code.push("</script>");
                                                    return finalize(node.code.join("\n"), callback);
                                                } else {
                                                    return callback(new Error("Language '" + node.language + "' not supported"));
                                                }
                                                return callback(null);
                                            });
                                            if (node.children) {
                                                node.children.forEach(function (child) {
                                                    return waitfor(child, parseNode);
                                                });
                                            }
                                            return waitfor();
                                        }
                                        
                                        return parseNode(node, function (err, node) {
                                            if (err) return callback(err);
                                            return callback(null, node.html);
                                        });
    
    /*
                                        var lines = code.split("\n");
                                        while (/^[\s\t]*$/.test(lines[0])) {
                                            lines.shift();
                                        }
                                        while (/^[\s\t]*$/.test(lines[lines.length-1])) {
                                            lines.pop();
                                        }
    */
                                    }
                                    
                                    try {
                                        return parseCode("markdown", markdown, function (err, html) {
                                            if (err) return next(err);
        
    //console.log("html", html);
                                            // We wrap the html to ensure we have only one top-level element.
                                            html = '<div>' + html + '</div>';
                                            //html = '<div data-container="component-parts">' + html + '</div>';
            
                                            return postprocess(uri, "htm", html).then(function (html) {
                                                
                                                return cacheResponse(html).then(function () {
                                                    
                                                    return serveDistPath();
/*                                                    
                                            		res.writeHead(200, {
                                            			"Content-Type": "text/html"
                                            		});
                                            		return res.end(html);
*/
                                                });
                                            });
                                        });
                                    } catch (err) {
                                        return next(err);
                                    }
                                } else {
        
                                    return postprocess(uri, "md", markdown).then(function (markdown) {

                                        return cacheResponse(markdown).then(function () {

                                            return serveDistPath();
/*
                                    		res.writeHead(200, {
                                    			"Content-Type": "text/x-markdown; charset=UTF-8"
                                    		});
                                    		return res.end(markdown);
*/
                                        });
                                    });
                                }
                            });
                        });
                    });
                });
            }).catch(next);
        };
    }

    return exports;
}
